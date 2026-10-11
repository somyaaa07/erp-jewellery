// controllers/productMasterController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { loadLocations, indexById, pathString, nearestOfType } from '../utils/locationTree.js';
import { computeBucketPricing, createItemInternal, resolveWholesaleHome, ensureDefaultBox } from './itemController.js';

const { sequelize, Location, DisplayTray, DisplayTrayItem, ProductMaster, Category, Item, MetalDetail, StoneDetail, BulkItem } = db;

// Creates the master design and ALSO places it in a wholesale box, so it is always traceable:
//   - box_location_id given  -> the design is stored in that box
//   - nothing given          -> the branch's "Unallocated" box is used (created on first use)
// The box holds a lot with an UNKNOWN quantity (not zero) until real stock arrives. The
// design itself never stores a location, so it can later be moved to any box, or exist in many.
export const createProductMaster = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const {
      category_id, design_code, product_name, item_subtype, gender_category,
      metal_type, default_purity, making_charge_type, making_charge_value,
      wastage_percent_override, default_image_url, description, branch_id,
      box_location_id, opening_pieces, opening_weight,
    } = req.body;

    if (!category_id || !design_code || !product_name || !metal_type || !default_purity) {
      throw new AppError('category_id, design_code, product_name, metal_type, default_purity are required', 400);
    }

    const category = await Category.findOne({ where: { id: category_id, tenant_id: req.scope.tenant_id }, transaction: t });
    if (!category) throw new AppError('Invalid category_id', 404);

    const product = await ProductMaster.create({
      tenant_id: req.scope.tenant_id,
      branch_id: branch_id || req.scope.branch_id || null,
      category_id, design_code, product_name, item_subtype: item_subtype || null,
      gender_category: gender_category || 'UNISEX', metal_type, default_purity,
      making_charge_type: making_charge_type || null,
      making_charge_value: making_charge_value || null,
      wastage_percent_override: wastage_percent_override || null,
      default_image_url: default_image_url || null,
      description: description || null,
    }, { transaction: t });

    // Place the design in a box when we know which branch it belongs to.
    const placeBranch = req.scope.branch_id || req.body.place_branch_id || null;
    let placement = null;
    if (placeBranch) {
      let boxId;
      if (box_location_id) {
        boxId = await resolveWholesaleHome({ tenant_id: req.scope.tenant_id, branch_id: placeBranch, product_master_id: product.id, preferred: box_location_id }, t);
      } else {
        boxId = (await ensureDefaultBox({ tenant_id: req.scope.tenant_id, branch_id: placeBranch }, t)).id;
      }
      const weight = Number(opening_weight || 0);
      const known = weight > 0;
      const item = await createItemInternal({
        tenant_id: req.scope.tenant_id, branch_id: placeBranch, location_id: boxId, product_master_id: product.id,
        mode: 'BULK', quantity_unknown: !known,
        total_pieces: known ? Number(opening_pieces || 0) : 0, total_gross_weight: known ? weight : 0,
        source_type: 'DIRECT_ENTRY', channel: 'WHOLESALE',
      }, { transaction: t, userId: req.user.id });
      placement = { item_id: item.id, location_id: boxId, quantity_status: known ? 'CONFIRMED' : 'UNKNOWN' };
    }

    await t.commit();
    res.status(201).json({ ...product.toJSON(), placement });
  } catch (err) { await t.rollback(); next(err); }
};

export const listProductMasters = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id, is_active: true };
    if (req.query.category_id) where.category_id = req.query.category_id;
    if (req.query.gender_category) where.gender_category = req.query.gender_category;

    const products = await ProductMaster.findAll({ where, include: [Category], order: [['product_name', 'ASC']] });
    res.json(products);
  } catch (err) { next(err); }
};

// This endpoint is what auto-fills the "Add Item" form:
// The frontend calls this API as soon as category + subtype + gender + metal + purity are chosen -
// if a match is found, the full design detail and current price come back, and the user only
// enters weight/quantity. If there is no match, the user is offered the option to create a new design.
export const lookupProductMaster = async (req, res, next) => {
  try {
    const { category_id, item_subtype, gender_category, metal_type, default_purity } = req.query;
    if (!category_id || !gender_category || !metal_type) {
      throw new AppError('category_id, gender_category, metal_type are required for lookup', 400);
    }

    const where = { tenant_id: req.scope.tenant_id, category_id, gender_category, metal_type, is_active: true };
    if (item_subtype) where.item_subtype = item_subtype;
    if (default_purity) where.default_purity = default_purity;

    const product = await ProductMaster.findOne({ where, include: [Category] });
    if (!product) {
      return res.json({ found: false });
    }

    // Find in-stock items of this design so the current live price can be shown too
    const existingItem = await Item.findOne({
      where: { tenant_id: req.scope.tenant_id, product_master_id: product.id, status: 'IN_STOCK' },
      include: [MetalDetail, StoneDetail, BulkItem, { model: ProductMaster, include: [Category] }],
      order: [['created_at', 'DESC']],
    });

    let pricing = null;
    if (existingItem) {
      // Wholesale-store stock is priced at the wholesale rate; if the whole lot is on the tray,
      // show the retail (tray) price instead.
      const bp = await computeBucketPricing(existingItem);
      const bucket = bp.wholesale || bp.tray;
      if (bucket?.error) pricing = { error: bucket.error };
      else if (bucket) pricing = { channel: bp.wholesale ? 'WHOLESALE' : 'RETAIL', price: bucket };
    }

    res.json({ found: true, product, existing_item: existingItem, pricing });
  } catch (err) { next(err); }
};

export const updateProductMaster = async (req, res, next) => {
  try {
    const product = await ProductMaster.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!product) throw new AppError('Product master not found', 404);

    ['product_name', 'item_subtype', 'making_charge_type', 'making_charge_value',
      'wastage_percent_override', 'default_image_url', 'description', 'is_active']
      .forEach((f) => { if (req.body[f] !== undefined) product[f] = req.body[f]; });

    await product.save();
    res.json(product);
  } catch (err) { next(err); }
};


// GET /products/:id/instances - the master design plus EVERY physical instance of it:
// each wholesale lot (per box) and each individual tray piece, with its current place.
// One design can be in many places, so nothing here is merged.
export const getDesignInstances = async (req, res, next) => {
  try {
    const tenant_id = req.scope.tenant_id;
    const product = await ProductMaster.findOne({ where: { id: req.params.id, tenant_id }, include: [Category] });
    if (!product) throw new AppError('Design not found', 404);
    const branch_id = req.query.branch_id || req.scope.branch_id || null;
    const branchWhere = branch_id ? { branch_id } : {};

    const byId = indexById(await loadLocations(tenant_id, branch_id));

    const lots = await Item.findAll({
      where: { tenant_id, ...branchWhere, product_master_id: product.id, status: 'IN_STOCK', is_tray_display: false },
      include: [BulkItem, MetalDetail],
    });
    const pieces = await DisplayTrayItem.findAll({
      where: { tenant_id, ...branchWhere, product_master_id: product.id, status: 'ON_DISPLAY' },
      include: [DisplayTray],
    });

    res.json({
      design: product,
      lots: lots.map((l) => ({
        item_id: l.id, branch_id: l.branch_id, location_id: l.location_id, location_path: pathString(l.location_id, byId),
        pieces: Number(l.BulkItem?.total_pieces || (l.mode === 'PIECE' ? 1 : 0)),
        weight: Number(l.BulkItem?.total_gross_weight || l.MetalDetail?.gross_weight || 0),
        quantity_status: l.BulkItem?.quantity_status || 'CONFIRMED',
      })),
      tray_pieces: pieces.map((p) => ({
        piece_id: p.id, branch_id: p.branch_id, item_code: p.item_code, huid_code: p.huid_code, weight: Number(p.weight), slot_no: p.slot_no,
        image_url: p.image_url || product.default_image_url || null,
        tray_id: p.tray_id, tray_name: p.DisplayTray?.name,
        location_id: p.DisplayTray?.location_id || null,
        location_path: p.DisplayTray?.location_id ? pathString(p.DisplayTray.location_id, byId) : 'Not placed',
        counter: p.DisplayTray?.location_id ? nearestOfType(p.DisplayTray.location_id, byId, 'COUNTER')?.name || null : null,
      })),
    });
  } catch (err) { next(err); }
};

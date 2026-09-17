// controllers/productMasterController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { computeChannelPrice } from '../utils/pricingEngine.js';

const { ProductMaster, Category, Item, MetalDetail, StoneDetail, BulkItem } = db;

export const createProductMaster = async (req, res, next) => {
  try {
    const {
      category_id, design_code, product_name, item_subtype, gender_category,
      metal_type, default_purity, making_charge_type, making_charge_value,
      wastage_percent_override, default_image_url, description, branch_id,
    } = req.body;

    if (!category_id || !design_code || !product_name || !metal_type || !default_purity) {
      throw new AppError('category_id, design_code, product_name, metal_type, default_purity are required', 400);
    }

    const category = await Category.findOne({ where: { id: category_id, tenant_id: req.scope.tenant_id } });
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
    });

    res.status(201).json(product);
  } catch (err) { next(err); }
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
// Frontend category+subtype+gender+metal+purity type karte hi is API ko hit karega -
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
      pricing = await computeChannelPrice(existingItem);
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

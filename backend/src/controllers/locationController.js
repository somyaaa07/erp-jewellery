// controllers/locationController.js
import { Op } from 'sequelize';
import { createItemInternal } from './itemController.js';
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import {
  MAX_DEPTH, loadLocations, indexById, pathString, nearestOfType, subtreeIds, subtreeHeight,
} from '../utils/locationTree.js';

const {
  sequelize, Location, Item, BulkItem, MetalDetail, ProductMaster, Category, DisplayTray, DisplayTrayItem, LocationMovement, User,
} = db;
const MAX_LEVEL = MAX_DEPTH;
const CONTAINER_TYPES = ['SAFE', 'BOX', 'TRAY', 'COUNTER', 'SHELF', 'OTHER'];

export const createLocation = async (req, res, next) => {
  try {
    const {
      name, parent_id, storage_type, container_type,
      empty_weight, capacity_weight, capacity_pieces,
    } = req.body;
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);

    let level = 1;
    if (parent_id) {
      const parent = await Location.findOne({ where: { id: parent_id, tenant_id: req.scope.tenant_id, branch_id } });
      if (!parent) throw new AppError('Parent location not found', 404);
      if (parent.level >= MAX_LEVEL) throw new AppError(`Cannot nest deeper than ${MAX_LEVEL} levels`, 400);
      level = parent.level + 1;
    }

    if (container_type && !CONTAINER_TYPES.includes(container_type)) {
      throw new AppError(`container_type must be one of ${CONTAINER_TYPES.join(', ')}`, 400);
    }
    if (storage_type && !['GENERAL', 'WHOLESALE_STORE', 'TRAY_DISPLAY'].includes(storage_type)) {
      throw new AppError('storage_type must be GENERAL, WHOLESALE_STORE or TRAY_DISPLAY', 400);
    }

    const location = await Location.create({
      tenant_id: req.scope.tenant_id, branch_id, parent_id: parent_id || null, name, level,
      storage_type: storage_type || 'GENERAL',
      container_type: container_type || (level === 1 ? 'SAFE' : 'BOX'),
      empty_weight: empty_weight || 0,
      capacity_weight: capacity_weight === '' ? null : (capacity_weight ?? null),
      capacity_pieces: capacity_pieces === '' ? null : (capacity_pieces ?? null),
    });
    res.status(201).json(location);
  } catch (err) { next(err); }
};

// Lets an existing location's fixed empty weight / capacity be corrected - useful right after
// the storage bug-fix, to set the real tare weight and capacity on each branch's Wholesale
// Store and Display Tray.
export const updateLocation = async (req, res, next) => {
  try {
    const location = await Location.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!location) throw new AppError('Location not found', 404);

    ['name', 'storage_type', 'container_type', 'empty_weight', 'capacity_weight', 'capacity_pieces'].forEach((field) => {
      if (req.body[field] !== undefined) {
        location[field] = req.body[field] === '' ? null : req.body[field];
      }
    });

    await location.save();
    res.json(location);
  } catch (err) { next(err); }
};

export const listLocations = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.query.branch_id) where.branch_id = req.query.branch_id;
    else if (req.scope.branch_id) where.branch_id = req.scope.branch_id;

    const locations = await Location.findAll({ where, order: [['level', 'ASC'], ['name', 'ASC']] });
    res.json(locations);
  } catch (err) { next(err); }
};

export const deleteLocation = async (req, res, next) => {
  try {
    const location = await Location.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!location) throw new AppError('Location not found', 404);

    const childCount = await Location.count({ where: { parent_id: location.id } });
    if (childCount > 0) throw new AppError('Cannot delete: this location has child locations inside it', 409);

    const itemCount = await Item.count({ where: { location_id: location.id } });
    if (itemCount > 0) throw new AppError('Cannot delete: this location still has items stored inside it', 409);

    const trayCount = await DisplayTray.count({ where: { location_id: location.id, is_active: true } });
    if (trayCount > 0) throw new AppError('Cannot delete: trays are placed here', 409);

    await location.destroy();
    res.status(204).send();
  } catch (err) { next(err); }
};

// ------------------------------------------------------------------------------------------
// Storage map: tree, contents, search and moves
// ------------------------------------------------------------------------------------------

function branchOf(req) {
  return req.query.branch_id || req.body?.branch_id || req.scope.branch_id || null;
}

const imageOf = (product, itemImage) => itemImage || product?.default_image_url || null;

// Stock lots stored directly inside one location (a design can be in many locations).
async function lotsIn(locationIds, tenant_id) {
  const items = await Item.findAll({
    where: { tenant_id, location_id: locationIds, status: 'IN_STOCK', is_tray_display: false },
    include: [
      { model: BulkItem },
      { model: MetalDetail },
      { model: ProductMaster, include: [Category] },
    ],
  });
  return items;
}

function lotJson(item, byId) {
  const bulk = item.BulkItem;
  const isBulk = item.mode === 'BULK';
  return {
    item_id: item.id,
    mode: item.mode,
    location_id: item.location_id,
    location_path: pathString(item.location_id, byId),
    product_master_id: item.product_master_id,
    design_code: item.ProductMaster?.design_code,
    design_name: item.ProductMaster?.product_name,
    category: item.ProductMaster?.Category?.name || null,
    image_url: imageOf(item.ProductMaster, null),
    pieces: isBulk ? Number(bulk?.total_pieces || 0) : 1,
    weight: isBulk ? Number(bulk?.total_gross_weight || 0) : Number(item.MetalDetail?.gross_weight || 0),
    // CONFIRMED / UNKNOWN / ISSUED_TO_KARIGAR. Unknown is NOT zero stock.
    quantity_status: isBulk ? bulk?.quantity_status : 'CONFIRMED',
    huid_code: item.huid_code || null,
  };
}

// GET /locations/tree?branch_id=  - the full nested hierarchy with stock counts per node.
export const getTree = async (req, res, next) => {
  try {
    const branch_id = branchOf(req);
    const locations = await loadLocations(req.scope.tenant_id, branch_id);
    const byId = indexById(locations);

    const items = await lotsIn(locations.map((l) => l.id), req.scope.tenant_id);
    const trays = await DisplayTray.findAll({
      where: { tenant_id: req.scope.tenant_id, is_active: true, ...(branch_id ? { branch_id } : {}) },
    });

    const own = {};
    const touch = (id) => { if (!own[id]) own[id] = { designs: new Set(), pieces: 0, weight: 0, unknown: 0, trays: 0 }; return own[id]; };
    items.forEach((i) => {
      const n = touch(i.location_id);
      n.designs.add(i.product_master_id);
      const lot = lotJson(i, byId);
      n.pieces += lot.pieces; n.weight += lot.weight;
      if (lot.quantity_status !== 'CONFIRMED') n.unknown += 1;
    });
    trays.forEach((t) => { if (t.location_id) touch(t.location_id).trays += 1; });

    // For the diagram: the designs and trays sitting directly in each container.
    const lotsByLocation = {};
    items.forEach((i) => {
      if (!lotsByLocation[i.location_id]) lotsByLocation[i.location_id] = [];
      const lot = lotJson(i, byId);
      lotsByLocation[i.location_id].push({
        item_id: lot.item_id, product_master_id: lot.product_master_id, design_code: lot.design_code,
        design_name: lot.design_name, image_url: lot.image_url, pieces: lot.pieces, quantity_status: lot.quantity_status,
      });
    });
    const trayPieces = trays.length
      ? await DisplayTrayItem.findAll({ where: { tray_id: trays.map((t) => t.id), status: 'ON_DISPLAY' }, include: [ProductMaster] })
      : [];
    const traysByLocation = {};
    trays.forEach((t) => {
      if (!t.location_id) return;
      const pcs = trayPieces.filter((p) => p.tray_id === t.id);
      const designs = [...new Map(pcs.map((p) => [p.product_master_id, {
        product_master_id: p.product_master_id, design_code: p.ProductMaster?.design_code, design_name: p.ProductMaster?.product_name,
        image_url: imageOf(p.ProductMaster, p.image_url), pieces: pcs.filter((x) => x.product_master_id === p.product_master_id).length,
      }])).values()];
      if (!traysByLocation[t.location_id]) traysByLocation[t.location_id] = [];
      traysByLocation[t.location_id].push({ id: t.id, name: t.name, total_slots: t.total_slots, present: pcs.length, designs });
    });

    const nodes = new Map();
    locations.forEach((l) => {
      const o = own[l.id];
      nodes.set(l.id, {
        lots: lotsByLocation[l.id] || [],
        trays: traysByLocation[l.id] || [],
        id: l.id, name: l.name, level: l.level, parent_id: l.parent_id,
        container_type: l.container_type, storage_type: l.storage_type, branch_id: l.branch_id,
        own: {
          designs: o ? o.designs.size : 0, pieces: o ? o.pieces : 0, weight: o ? Number(o.weight.toFixed(3)) : 0,
          unknown_lots: o ? o.unknown : 0, trays: o ? o.trays : 0,
        },
        children: [],
      });
    });
    const roots = [];
    nodes.forEach((n) => {
      if (n.parent_id && nodes.has(n.parent_id)) nodes.get(n.parent_id).children.push(n);
      else roots.push(n);
    });
    // Roll the totals up so a collapsed box still tells what is inside it.
    const roll = (n) => {
      const t = { ...n.own };
      n.children.forEach((c) => {
        const ct = roll(c);
        t.designs += ct.designs; t.pieces += ct.pieces; t.weight += ct.weight;
        t.unknown_lots += ct.unknown_lots; t.trays += ct.trays;
      });
      n.total = { ...t, weight: Number(t.weight.toFixed(3)) };
      return t;
    };
    roots.forEach(roll);

    res.json(roots);
  } catch (err) { next(err); }
};

// GET /locations/:id/contents - everything directly inside one container.
export const getContents = async (req, res, next) => {
  try {
    const location = await Location.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!location) throw new AppError('Location not found', 404);
    const locations = await loadLocations(req.scope.tenant_id, location.branch_id);
    const byId = indexById(locations);

    const items = await lotsIn([location.id], req.scope.tenant_id);
    const trays = await DisplayTray.findAll({
      where: { tenant_id: req.scope.tenant_id, location_id: location.id, is_active: true },
    });
    const trayCounts = trays.length
      ? await DisplayTrayItem.findAll({
        where: { tray_id: trays.map((t) => t.id), status: 'ON_DISPLAY' },
        include: [ProductMaster],
      })
      : [];

    const recent = await LocationMovement.findAll({
      where: {
        tenant_id: req.scope.tenant_id,
        [Op.or]: [{ entity_type: 'LOCATION', entity_id: location.id }, { from_location_id: location.id }, { to_location_id: location.id }],
      },
      order: [['id', 'DESC']], limit: 10,
    });

    res.json({
      history: recent,
      location: {
        id: location.id, name: location.name, level: location.level, container_type: location.container_type,
        storage_type: location.storage_type, parent_id: location.parent_id,
        path: pathString(location.id, byId),
        path_ids: (() => { const ids = []; let c = location; const seen = new Set(); while (c && !seen.has(c.id)) { seen.add(c.id); ids.unshift(c.id); c = c.parent_id ? byId.get(c.parent_id) : null; } return ids; })(),
        counter: nearestOfType(location.id, byId, 'COUNTER')?.name || null,
      },
      children: locations.filter((l) => l.parent_id === location.id).map((l) => ({
        id: l.id, name: l.name, container_type: l.container_type,
      })),
      lots: items.map((i) => lotJson(i, byId)),
      trays: trays.map((t) => {
        const pieces = trayCounts.filter((p) => p.tray_id === t.id);
        return {
          id: t.id, name: t.name, total_slots: t.total_slots, present: pieces.length,
          designs: [...new Map(pieces.map((p) => [p.product_master_id, {
            id: p.product_master_id, design_code: p.ProductMaster?.design_code, design_name: p.ProductMaster?.product_name,
            image_url: imageOf(p.ProductMaster, p.image_url),
          }])).values()],
        };
      }),
    });
  } catch (err) { next(err); }
};

// GET /locations/find?q=  - find a container by name and show where it sits in the hierarchy.
export const findLocations = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json([]);
    const locations = await loadLocations(req.scope.tenant_id, branchOf(req));
    const byId = indexById(locations);
    res.json(locations
      .filter((l) => l.name.toLowerCase().includes(q))
      .slice(0, 50)
      .map((l) => ({
        id: l.id, name: l.name, container_type: l.container_type, level: l.level,
        path: pathString(l.id, byId), counter: nearestOfType(l.id, byId, 'COUNTER')?.name || null,
      })));
  } catch (err) { next(err); }
};

// POST /locations/:id/move  { parent_id, reason }
// Moves a whole container (with everything inside it) under another container. Children and
// stock keep pointing at their own parent, so their effective location follows automatically.
export const moveLocation = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { parent_id, reason } = req.body;
    const node = await Location.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id }, transaction: t, lock: true });
    if (!node) throw new AppError('Location not found', 404);
    if (node.storage_type === 'WHOLESALE_STORE' || node.storage_type === 'TRAY_DISPLAY') {
      throw new AppError('The Wholesale Store and Display Tray root locations cannot be moved.', 409);
    }

    const all = await loadLocations(req.scope.tenant_id, node.branch_id, t);
    const byId = indexById(all);
    const before = pathString(node.id, byId);

    let newParent = null;
    if (parent_id !== null && parent_id !== undefined && parent_id !== '') {
      newParent = byId.get(Number(parent_id));
      if (!newParent) throw new AppError('Destination not found in this branch', 404);
      if (subtreeIds(node.id, all).includes(newParent.id)) {
        throw new AppError('A container cannot be moved inside itself or inside something it contains.', 400);
      }
    }
    if (node.parent_id === (newParent ? newParent.id : null)) throw new AppError('It is already there.', 400);

    const newLevel = newParent ? newParent.level + 1 : 1;
    const height = subtreeHeight(node.id, all);
    if (newLevel + height - 1 > MAX_LEVEL) throw new AppError(`That would nest deeper than ${MAX_LEVEL} levels.`, 400);

    // Re-level the moved subtree.
    const delta = newLevel - node.level;
    const ids = subtreeIds(node.id, all);
    node.parent_id = newParent ? newParent.id : null;
    await node.save({ transaction: t });
    await Location.increment('level', { by: delta, where: { id: ids }, transaction: t });

    const after = [...(newParent ? [pathString(newParent.id, byId)] : []), node.name].join(' > ');
    await LocationMovement.create({
      tenant_id: req.scope.tenant_id, branch_id: node.branch_id, entity_type: 'LOCATION', entity_id: node.id,
      entity_label: node.name, from_location_id: before === node.name ? null : (byId.get(node.id).parent_id),
      to_location_id: newParent ? newParent.id : null, from_path: before, to_path: after,
      reason: reason || null, moved_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    res.json({ id: node.id, path: after });
  } catch (err) { await t.rollback(); next(err); }
};

// POST /locations/items/:itemId/move  { location_id, reason }
// Moves a whole stock lot (a design's stock in one box) into another container.
export const moveStockLot = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { location_id, reason } = req.body;
    const item = await Item.findOne({
      where: { id: req.params.itemId, tenant_id: req.scope.tenant_id },
      include: [BulkItem, ProductMaster], transaction: t, lock: { level: t.LOCK.UPDATE, of: Item },
    });
    if (!item) throw new AppError('Stock not found', 404);
    if (item.is_tray_display) throw new AppError('Tray pieces move with their tray. Move the tray instead.', 409);
    const dest = await Location.findOne({ where: { id: location_id, tenant_id: req.scope.tenant_id, branch_id: item.branch_id }, transaction: t });
    if (!dest) throw new AppError('Destination not found in this branch', 404);
    if (dest.id === item.location_id) throw new AppError('It is already there.', 400);
    if (item.BulkItem?.quantity_status === 'ISSUED_TO_KARIGAR') throw new AppError('This stock is with a karigar. Receive it first.', 409);

    const all = await loadLocations(req.scope.tenant_id, item.branch_id, t);
    const byId = indexById(all);
    const from = item.location_id;

    // If the destination already holds a lot of the same design, merge into it (never two rows).
    const twin = await Item.findOne({
      where: { tenant_id: item.tenant_id, branch_id: item.branch_id, location_id: dest.id, product_master_id: item.product_master_id, mode: 'BULK', status: 'IN_STOCK', id: { [Op.ne]: item.id } },
      include: [BulkItem, MetalDetail], transaction: t,
    });
    if (twin && item.mode === 'BULK') {
      twin.BulkItem.total_pieces = Number(twin.BulkItem.total_pieces) + Number(item.BulkItem.total_pieces);
      twin.BulkItem.total_gross_weight = Number(twin.BulkItem.total_gross_weight) + Number(item.BulkItem.total_gross_weight);
      twin.BulkItem.total_net_weight = Number(twin.BulkItem.total_net_weight) + Number(item.BulkItem.total_net_weight);
      if (item.BulkItem.quantity_status === 'CONFIRMED') twin.BulkItem.quantity_status = 'CONFIRMED';
      await twin.BulkItem.save({ transaction: t });
      if (twin.MetalDetail) {
        twin.MetalDetail.gross_weight = Number(twin.MetalDetail.gross_weight) + Number(item.BulkItem.total_gross_weight);
        await twin.MetalDetail.save({ transaction: t });
      }
      item.BulkItem.total_pieces = 0; item.BulkItem.total_gross_weight = 0; item.BulkItem.total_net_weight = 0;
      await item.BulkItem.save({ transaction: t });
      item.status = 'TRANSFERRED';
    } else {
      item.location_id = dest.id;
    }
    item.last_moved_at = new Date();
    await item.save({ transaction: t });

    await LocationMovement.create({
      tenant_id: item.tenant_id, branch_id: item.branch_id, entity_type: 'STOCK_LOT', entity_id: item.id,
      entity_label: `${item.ProductMaster?.design_code || ''} ${item.ProductMaster?.product_name || ''}`.trim(),
      from_location_id: from, to_location_id: dest.id, from_path: pathString(from, byId), to_path: pathString(dest.id, byId),
      quantity: item.BulkItem ? Number(item.BulkItem.total_pieces) : 1, reason: reason || null, moved_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    res.json({ item_id: item.id, merged_into: twin ? twin.id : null, path: pathString(dest.id, byId) });
  } catch (err) { await t.rollback(); next(err); }
};

// GET /locations/movements?entity_type=&entity_id=&limit=  - movement history for auditing.
export const listMovements = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    const branch_id = branchOf(req);
    if (branch_id) where.branch_id = branch_id;
    if (req.query.entity_type) where.entity_type = req.query.entity_type;
    if (req.query.entity_id) where.entity_id = req.query.entity_id;
    const rows = await LocationMovement.findAll({ where, order: [['id', 'DESC']], limit: Math.min(Number(req.query.limit) || 100, 500) });
    const users = rows.length ? await User.findAll({ where: { id: [...new Set(rows.map((r) => r.moved_by).filter(Boolean))] }, attributes: ['id', 'name'] }) : [];
    const names = {};
    users.forEach((u) => { names[u.id] = u.name; });
    res.json(rows.map((r) => ({ ...r.toJSON(), moved_by_name: names[r.moved_by] || null })));
  } catch (err) { next(err); }
};


// GET /locations/summary?branch_id=  - counts for the top of the Storage Map, from real records.
// A physical instance is counted once: tray pieces are counted as tray pieces, never again as
// the inventory row behind them.
export const getSummary = async (req, res, next) => {
  try {
    const branch_id = branchOf(req);
    const tenant_id = req.scope.tenant_id;
    const branchWhere = branch_id ? { branch_id } : {};
    const locations = await loadLocations(tenant_id, branch_id);

    const lots = await Item.findAll({
      where: { tenant_id, ...branchWhere, status: 'IN_STOCK', is_tray_display: false },
      include: [BulkItem], attributes: ['id', 'mode'],
    });
    const trays = await DisplayTray.count({ where: { tenant_id, ...branchWhere, is_active: true } });
    const trayPieces = await DisplayTrayItem.count({ where: { tenant_id, ...branchWhere, status: 'ON_DISPLAY' } });
    const status = (l) => l.BulkItem?.quantity_status || 'CONFIRMED';

    res.json({
      root_locations: locations.filter((l) => !l.parent_id).length,
      safes: locations.filter((l) => l.container_type === 'SAFE').length,
      boxes: locations.filter((l) => l.container_type === 'BOX').length,
      counters: locations.filter((l) => l.container_type === 'COUNTER').length,
      trays,
      stock_lots: lots.length,
      tray_pieces: trayPieces,
      physical_instances: lots.length + trayPieces,
      with_karigar: lots.filter((l) => status(l) === 'ISSUED_TO_KARIGAR').length,
      quantity_unknown: lots.filter((l) => status(l) === 'UNKNOWN').length,
    });
  } catch (err) { next(err); }
};


// POST /locations/:id/place-design  { product_master_id, pieces?, weight? }
// Puts a design into a container. Without a weight the quantity stays "not final" (it is NOT
// stored as zero). If the design is already in this container, nothing is duplicated.
export const placeDesign = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const location = await Location.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id }, transaction: t });
    if (!location) throw new AppError('Location not found', 404);
    const { product_master_id } = req.body;
    if (!product_master_id) throw new AppError('Choose a design', 400);
    const product = await ProductMaster.findOne({ where: { id: product_master_id, tenant_id: req.scope.tenant_id }, transaction: t });
    if (!product) throw new AppError('Design not found', 404);

    const weight = Number(req.body.weight || 0);
    const pieces = Number(req.body.pieces || 0);
    if (!Number.isInteger(pieces) || pieces < 0) throw new AppError('Quantity must be a whole number (0 or more)', 400);
    const known = weight > 0;

    const item = await createItemInternal({
      tenant_id: req.scope.tenant_id, branch_id: location.branch_id, location_id: location.id, product_master_id: product.id,
      mode: 'BULK', quantity_unknown: !known, total_pieces: known ? pieces : 0, total_gross_weight: known ? weight : 0,
      source_type: 'DIRECT_ENTRY', channel: 'WHOLESALE',
    }, { transaction: t, userId: req.user.id });

    await t.commit();
    res.status(201).json({ item_id: item.id, quantity_status: known ? 'CONFIRMED' : 'UNKNOWN' });
  } catch (err) { await t.rollback(); next(err); }
};

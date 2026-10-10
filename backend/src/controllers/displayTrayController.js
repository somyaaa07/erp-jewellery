// controllers/displayTrayController.js
// Display trays hold INDIVIDUAL pieces: one piece per slot, each with its own item code,
// design, category, weight and (optional) HUID. Behind every slot sits a real inventory piece
// (Item, PIECE mode) so Billing, barcodes and pricing work on it like any other piece.
//
// A tray is identified by its name and the designs inside it, NOT by category (category is an
// optional label). One design can be on many trays, and trays sit at different counters.
//
// A piece is never deleted. When it is sold or taken off the tray the slot is freed and the
// release date is stored, so the full history stays available.
import { Op } from 'sequelize';
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { createItemInternal, findWholesaleLot } from './itemController.js';
import { loadLocations, indexById, pathString, nearestOfType } from '../utils/locationTree.js';

const {
  sequelize, DisplayTray, DisplayTrayItem, DisplayTrayAudit, Category, ProductMaster,
  Location, Item, StockMovement, BulkItem, MetalDetail, LocationMovement,
} = db;

const round3 = (n) => Number(Number(n || 0).toFixed(3));
const today = () => new Date().toISOString().slice(0, 10);

function resolveBranch(req) {
  const branch_id = req.scope.branch_id || req.body?.branch_id || req.query?.branch_id;
  if (!branch_id) throw new AppError('branch_id is required', 400);
  return Number(branch_id);
}

// Where a tray is now: full path (Main Counter > Showcase 2) and the counter it belongs to.
async function trayPlace(tray, byId) {
  if (!tray.location_id) return { location_path: null, counter: null, counter_id: null };
  const counter = nearestOfType(tray.location_id, byId, 'COUNTER');
  return { location_path: pathString(tray.location_id, byId), counter: counter?.name || null, counter_id: counter?.id || null };
}

async function assertTrayLocation(req, branch_id, location_id, transaction) {
  if (!location_id) return null;
  const loc = await Location.findOne({ where: { id: location_id, tenant_id: req.scope.tenant_id, branch_id }, transaction });
  if (!loc) throw new AppError('Location not found in this branch', 404);
  return loc;
}

async function loadTray(req, id, transaction) {
  const tray = await DisplayTray.findOne({
    where: { id, tenant_id: req.scope.tenant_id }, include: [Category], transaction,
  });
  if (!tray) throw new AppError('Tray not found', 404);
  if (req.scope.branch_id && tray.branch_id !== req.scope.branch_id) throw new AppError('Tray not found', 404);
  return tray;
}

async function findBranchLocation(tenant_id, branch_id, storage_type, transaction) {
  return Location.findOne({ where: { tenant_id, branch_id, storage_type }, transaction });
}

// Count, weight and empty slots for a set of trays, from the pieces currently on display.
async function trayStats(trays) {
  const ids = trays.map((t) => t.id);
  const rows = ids.length
    ? await DisplayTrayItem.findAll({ where: { tray_id: { [Op.in]: ids }, status: 'ON_DISPLAY' }, attributes: ['tray_id', 'weight'] })
    : [];
  const stats = {};
  trays.forEach((t) => { stats[t.id] = { present: 0, weight: 0 }; });
  rows.forEach((r) => {
    stats[r.tray_id].present += 1;
    stats[r.tray_id].weight = round3(stats[r.tray_id].weight + Number(r.weight));
  });
  return stats;
}

async function latestAudits(trays) {
  const ids = trays.map((t) => t.id);
  if (!ids.length) return {};
  const audits = await DisplayTrayAudit.findAll({
    where: { tray_id: { [Op.in]: ids } }, order: [['audited_on', 'DESC'], ['id', 'DESC']],
  });
  const latest = {};
  audits.forEach((a) => { if (!latest[a.tray_id]) latest[a.tray_id] = a; });
  return latest;
}

// ---------- Trays ----------

export const createTray = async (req, res, next) => {
  try {
    const branch_id = resolveBranch(req);
    const { name, category_id, total_slots, empty_weight, location_id } = req.body;
    if (!name || !name.trim()) throw new AppError('Tray name is required', 400);
    const slots = Number(total_slots);
    if (!Number.isInteger(slots) || slots < 1) throw new AppError('Number of slots must be a whole number of at least 1', 400);

    if (category_id) {
      const category = await Category.findOne({ where: { id: category_id, tenant_id: req.scope.tenant_id } });
      if (!category) throw new AppError('Category not found', 404);
    }
    await assertTrayLocation(req, branch_id, location_id);

    const duplicate = await DisplayTray.findOne({ where: { tenant_id: req.scope.tenant_id, branch_id, name: name.trim() } });
    if (duplicate) throw new AppError(`A tray named "${name.trim()}" already exists`, 409);

    const tray = await DisplayTray.create({
      tenant_id: req.scope.tenant_id, branch_id, category_id: category_id || null, location_id: location_id || null, name: name.trim(),
      total_slots: slots, empty_weight: empty_weight || 0,
    });
    res.status(201).json(tray);
  } catch (err) { next(err); }
};

export const updateTray = async (req, res, next) => {
  try {
    const tray = await loadTray(req, req.params.id);
    const { name, total_slots, empty_weight, is_active } = req.body;

    if (name !== undefined) {
      if (!String(name).trim()) throw new AppError('Tray name cannot be empty', 400);
      tray.name = String(name).trim();
    }
    if (total_slots !== undefined) {
      const slots = Number(total_slots);
      if (!Number.isInteger(slots) || slots < 1) throw new AppError('Number of slots must be a whole number of at least 1', 400);
      const highest = await DisplayTrayItem.max('slot_no', { where: { tray_id: tray.id, status: 'ON_DISPLAY' } });
      if (highest && slots < highest) throw new AppError(`Slot ${highest} is in use. Free it before reducing the tray to ${slots} slots.`, 409);
      tray.total_slots = slots;
    }
    if (empty_weight !== undefined) tray.empty_weight = empty_weight || 0;
    if (req.body.category_id !== undefined) tray.category_id = req.body.category_id || null;
    if (is_active !== undefined) tray.is_active = !!is_active;

    await tray.save();
    res.json(tray);
  } catch (err) { next(err); }
};

export const listTrays = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id, is_active: true };
    const branch_id = req.query.branch_id || req.scope.branch_id;
    if (branch_id) where.branch_id = branch_id;
    if (req.query.category_id) where.category_id = req.query.category_id;

    const trays = await DisplayTray.findAll({ where, include: [Category], order: [['name', 'ASC']] });
    const stats = await trayStats(trays);
    const audits = await latestAudits(trays);

    const byId = indexById(await loadLocations(req.scope.tenant_id, branch_id || null));
    res.json(await Promise.all(trays.map(async (t) => {
      const j = t.toJSON();
      Object.assign(j, await trayPlace(t, byId));
      j.present = stats[t.id].present;
      j.empty_slots = t.total_slots - stats[t.id].present;
      j.total_weight = stats[t.id].weight;
      j.last_audit = audits[t.id] || null;
      return j;
    })));
  } catch (err) { next(err); }
};

// One tray with every slot: the piece in it, or null when the slot is empty.
export const getTray = async (req, res, next) => {
  try {
    const tray = await loadTray(req, req.params.id);
    const onDisplay = await DisplayTrayItem.findAll({
      where: { tray_id: tray.id, status: 'ON_DISPLAY' },
      include: [{ model: ProductMaster, attributes: ['id', 'design_code', 'product_name', 'default_image_url'] }],
    });
    const bySlot = {};
    // The piece's own photo if it has one, otherwise the design's photo. May be null: the UI
    // shows a placeholder, never a broken image.
    onDisplay.forEach((i) => { const j = i.toJSON(); j.display_image = i.image_url || i.ProductMaster?.default_image_url || null; bySlot[i.slot_no] = j; });
    const byId = indexById(await loadLocations(req.scope.tenant_id, tray.branch_id));
    const place = await trayPlace(tray, byId);

    const slots = [];
    for (let n = 1; n <= tray.total_slots; n += 1) slots.push({ slot_no: n, item: bySlot[n] || null });

    const totalWeight = round3(onDisplay.reduce((sum, i) => sum + Number(i.weight), 0));
    res.json({
      tray: { ...tray.toJSON(), ...place }, slots,
      present: onDisplay.length,
      empty_slots: tray.total_slots - onDisplay.length,
      total_weight: totalWeight,
    });
  } catch (err) { next(err); }
};

// ---------- Summary: one row per category (the Complete Display view) ----------

export const getSummary = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id, is_active: true };
    const branch_id = req.query.branch_id || req.scope.branch_id;
    if (branch_id) where.branch_id = branch_id;

    const trays = await DisplayTray.findAll({ where, include: [Category] });
    const stats = await trayStats(trays);
    const audits = await latestAudits(trays);

    const byCategory = {};
    trays.forEach((t) => {
      const key = t.category_id || 0;
      if (!byCategory[key]) {
        byCategory[key] = {
          category_id: t.category_id, category_name: t.Category?.name || 'No category', trays: 0,
          total_slots: 0, present: 0, empty_slots: 0, total_weight: 0,
          last_audited: null, audit_weight: 0, audited_system_weight: 0,
        };
      }
      const row = byCategory[key];
      row.trays += 1;
      row.total_slots += t.total_slots;
      row.present += stats[t.id].present;
      row.total_weight = round3(row.total_weight + stats[t.id].weight);
      const a = audits[t.id];
      if (a) {
        if (!row.last_audited || a.audited_on > row.last_audited) row.last_audited = a.audited_on;
        row.audit_weight = round3(row.audit_weight + Number(a.physical_weight));
        row.audited_system_weight = round3(row.audited_system_weight + Number(a.system_weight));
      }
    });
    Object.values(byCategory).forEach((r) => { r.empty_slots = r.total_slots - r.present; });

    const rows = Object.values(byCategory).sort((a, b) => a.category_name.localeCompare(b.category_name));
    res.json({
      rows,
      totals: {
        trays: rows.reduce((s, r) => s + r.trays, 0),
        total_slots: rows.reduce((s, r) => s + r.total_slots, 0),
        present: rows.reduce((s, r) => s + r.present, 0),
        empty_slots: rows.reduce((s, r) => s + r.empty_slots, 0),
        total_weight: round3(rows.reduce((s, r) => s + r.total_weight, 0)),
      },
    });
  } catch (err) { next(err); }
};

// ---------- Pieces ----------

async function nextItemCode(tenant_id, category, transaction) {
  const prefix = (category.code || 'ITM').toUpperCase();
  const count = await DisplayTrayItem.count({ where: { tenant_id, category_id: category.id }, transaction });
  let n = count + 1;
  // Skip over codes that already exist (for example after manual codes were entered).
  for (;;) {
    const code = `${prefix}-${String(n).padStart(4, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const taken = await DisplayTrayItem.count({ where: { tenant_id, item_code: code }, transaction });
    if (!taken) return code;
    n += 1;
  }
}

// Moving a piece onto the tray takes it out of the wholesale lot of the same design:
// the lot loses the piece's weight and one piece (if the lot counts pieces).
async function takeFromWholesale({ tenant_id, branch_id, product_master_id, weight, pieceId, userId, transaction, sourceLocationId }) {
  const lot = await findWholesaleLot({
    tenant_id, branch_id, product_master_id, needWeight: weight, preferLocationId: sourceLocationId,
  }, transaction);
  const available = lot ? Number(lot.BulkItem.total_gross_weight) : 0;
  if (!lot) {
    throw new AppError('This design has no confirmed quantity in wholesale yet. Add stock (Purchase, Opening stock, or receive it from the karigar) first.', 409);
  }
  if (available + 0.0005 < weight) {
    throw new AppError(
      `Not enough wholesale stock for this design. Wholesale has ${available.toFixed(3)} g, this piece needs ${weight} g. Add stock (Purchase or Opening stock) first.`,
      409,
    );
  }
  const countsPieces = Number(lot.BulkItem.total_pieces) > 0;
  lot.BulkItem.total_gross_weight = round3(available - weight);
  lot.BulkItem.total_net_weight = round3(Math.max(0, Number(lot.BulkItem.total_net_weight) - weight));
  if (countsPieces) lot.BulkItem.total_pieces = Number(lot.BulkItem.total_pieces) - 1;
  await lot.BulkItem.save({ transaction });
  if (lot.MetalDetail) {
    lot.MetalDetail.gross_weight = round3(Math.max(0, Number(lot.MetalDetail.gross_weight) - weight));
    await lot.MetalDetail.save({ transaction });
  }
  await StockMovement.create({
    tenant_id, branch_id, item_id: lot.id, movement_type: 'TRAY_MOVE_OUT', bucket: 'WHOLESALE',
    quantity_change: countsPieces ? -1 : 0, weight_change: -weight,
    reference_type: 'DISPLAY_TRAY', reference_id: pieceId || null, notes: 'Moved to display tray', created_by: userId,
  }, { transaction });
}

// A piece taken off the tray goes back into the wholesale lot of its design.
async function returnToWholesale({ tenant_id, branch_id, product_master_id, weight, pieceId, userId, transaction }) {
  const lot = await findWholesaleLot({ tenant_id, branch_id, product_master_id }, transaction);
  if (!lot) {
    // The lot no longer exists, so start a fresh one.
    const store = await findBranchLocation(tenant_id, branch_id, 'WHOLESALE_STORE', transaction);
    if (!store) throw new AppError('This branch has no Wholesale Store', 409);
    await createItemInternal({
      tenant_id, branch_id, location_id: store.id, product_master_id, mode: 'BULK',
      total_pieces: 1, total_gross_weight: weight, total_net_weight: weight, source_type: 'DIRECT_ENTRY',
      movement_reference_type: 'DISPLAY_TRAY', channel: 'WHOLESALE',
    }, { transaction, userId });
    return;
  }
  const countsPieces = Number(lot.BulkItem.total_pieces) > 0;
  lot.BulkItem.total_gross_weight = round3(Number(lot.BulkItem.total_gross_weight) + weight);
  lot.BulkItem.total_net_weight = round3(Number(lot.BulkItem.total_net_weight) + weight);
  if (countsPieces) lot.BulkItem.total_pieces = Number(lot.BulkItem.total_pieces) + 1;
  await lot.BulkItem.save({ transaction });
  if (lot.MetalDetail) {
    lot.MetalDetail.gross_weight = round3(Number(lot.MetalDetail.gross_weight) + weight);
    await lot.MetalDetail.save({ transaction });
  }
  await StockMovement.create({
    tenant_id, branch_id, item_id: lot.id, movement_type: 'TRAY_MOVE_IN', bucket: 'WHOLESALE',
    quantity_change: countsPieces ? 1 : 0, weight_change: weight,
    reference_type: 'DISPLAY_TRAY', reference_id: pieceId || null, notes: 'Returned from display tray', created_by: userId,
  }, { transaction });
}

export const addPiece = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const tray = await loadTray(req, req.params.id, t);
    const { product_master_id, weight, huid_code, item_code, date_added, image_url, source_location_id } = req.body;
    let { slot_no } = req.body;

    if (!product_master_id) throw new AppError('Design is required', 400);
    const w = Number(weight);
    if (!(w > 0)) throw new AppError('Weight (grams) must be greater than 0', 400);

    const product = await ProductMaster.findOne({ where: { id: product_master_id, tenant_id: req.scope.tenant_id }, transaction: t });
    if (!product) throw new AppError('Design not found', 404);

    const occupied = await DisplayTrayItem.findAll({
      where: { tray_id: tray.id, status: 'ON_DISPLAY' }, attributes: ['slot_no'], transaction: t, lock: true,
    });
    const used = new Set(occupied.map((o) => o.slot_no));

    if (slot_no === undefined || slot_no === null || slot_no === '') {
      for (let n = 1; n <= tray.total_slots; n += 1) { if (!used.has(n)) { slot_no = n; break; } }
      if (!slot_no) throw new AppError('This tray is full', 409);
    }
    slot_no = Number(slot_no);
    if (!Number.isInteger(slot_no) || slot_no < 1 || slot_no > tray.total_slots) {
      throw new AppError(`Slot must be between 1 and ${tray.total_slots}`, 400);
    }
    if (used.has(slot_no)) throw new AppError(`Slot ${slot_no} already has a piece`, 409);

    // Item codes use the design's category as a prefix (the tray itself may have no category).
    const category = await Category.findByPk(product.category_id, { transaction: t });
    const code = (item_code && item_code.trim()) || await nextItemCode(req.scope.tenant_id, category, t);
    const codeTaken = await DisplayTrayItem.count({ where: { tenant_id: req.scope.tenant_id, item_code: code }, transaction: t });
    if (codeTaken) throw new AppError(`Item code ${code} is already used`, 409);

    const trayLocation = await findBranchLocation(req.scope.tenant_id, tray.branch_id, 'TRAY_DISPLAY', t)
      || (tray.location_id ? await Location.findByPk(tray.location_id, { transaction: t }) : null);
    if (!trayLocation) throw new AppError('This branch has no Display Tray storage location. Create one under Storage Locations first.', 409);

    // Take the piece out of wholesale first. This fails if wholesale does not have enough.
    await takeFromWholesale({
      tenant_id: req.scope.tenant_id, branch_id: tray.branch_id, product_master_id,
      weight: round3(w), userId: req.user.id, transaction: t, sourceLocationId: source_location_id || null,
    });

    // The inventory piece behind the slot - this is what Billing sells.
    const item = await createItemInternal({
      tenant_id: req.scope.tenant_id, branch_id: tray.branch_id, location_id: trayLocation.id,
      product_master_id, mode: 'PIECE', gross_weight: w, less_weight: 0,
      huid_code: huid_code ? String(huid_code).toUpperCase() : null,
      sku_override: code, is_tray_display: true, channel: 'RETAIL',
      source_type: 'DIRECT_ENTRY', movement_reference_type: 'DISPLAY_TRAY', movement_bucket: 'TRAY',
    }, { transaction: t, userId: req.user.id });

    const piece = await DisplayTrayItem.create({
      tenant_id: req.scope.tenant_id, branch_id: tray.branch_id, tray_id: tray.id, slot_no,
      item_id: item.id, item_code: code, product_master_id, category_id: product.category_id,
      weight: round3(w), huid_code: huid_code ? String(huid_code).toUpperCase() : null,
      image_url: image_url || null, status: 'ON_DISPLAY', date_added: date_added || today(), added_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    res.status(201).json(piece);
  } catch (err) { await t.rollback(); next(err); }
};

// Frees the slot and keeps the history. Used by "Remove" on the tray screen, and by Billing
// when the piece is sold (see releaseTrayPieceForSale).
async function releasePiece(piece, { status, date, reason, sale_id, userId, transaction }) {
  piece.status = status;
  piece.date_released = date || today();
  piece.release_reason = reason || null;
  piece.sale_id = sale_id || null;
  piece.released_by = userId || null;
  await piece.save({ transaction });
}

export const removePiece = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const piece = await DisplayTrayItem.findOne({
      where: { id: req.params.pieceId, tenant_id: req.scope.tenant_id }, transaction: t, lock: true,
    });
    if (!piece) throw new AppError('Piece not found', 404);
    if (req.scope.branch_id && piece.branch_id !== req.scope.branch_id) throw new AppError('Piece not found', 404);
    if (piece.status !== 'ON_DISPLAY') throw new AppError('This piece has already left the tray', 409);

    const outcome = String(req.body.outcome || '').toUpperCase();
    if (!['SOLD', 'REMOVED'].includes(outcome)) throw new AppError('Choose whether the piece was sold or taken off the tray', 400);

    const item = piece.item_id ? await Item.findOne({ where: { id: piece.item_id }, transaction: t, lock: true }) : null;

    if (item) {
      if (outcome === 'SOLD') {
        item.status = 'SOLD';
        item.is_tray_display = false;
      } else {
        // Taken off the tray: the weight and one piece go back into the wholesale lot.
        item.status = 'TRANSFERRED';
        item.is_tray_display = false;
        await returnToWholesale({
          tenant_id: item.tenant_id, branch_id: item.branch_id, product_master_id: piece.product_master_id,
          weight: Number(piece.weight), pieceId: piece.id, userId: req.user.id, transaction: t,
        });
      }
      item.last_moved_at = new Date();
      await item.save({ transaction: t, userId: req.user.id });

      if (outcome === 'SOLD') {
        await StockMovement.create({
          tenant_id: item.tenant_id, branch_id: item.branch_id, item_id: item.id,
          movement_type: 'SALE', bucket: 'TRAY', quantity_change: -1, weight_change: -Number(piece.weight),
          reference_type: 'DISPLAY_TRAY', reference_id: piece.id,
          notes: 'Sold without a bill (marked on the tray screen)', created_by: req.user.id,
        }, { transaction: t });
      }
    }

    await releasePiece(piece, {
      status: outcome, date: req.body.date, reason: req.body.reason, userId: req.user.id, transaction: t,
    });

    await t.commit();
    res.json(piece);
  } catch (err) { await t.rollback(); next(err); }
};

// Called from Billing when a tray piece is sold, so the slot is freed automatically.
export async function releaseTrayPieceForSale(itemId, saleId, userId, transaction) {
  const piece = await DisplayTrayItem.findOne({ where: { item_id: itemId, status: 'ON_DISPLAY' }, transaction, lock: true });
  if (!piece) return null;
  await releasePiece(piece, { status: 'SOLD', sale_id: saleId, reason: 'Sold on a bill', userId, transaction });
  return piece;
}

// History of every piece, including ones that already left the tray.
export const listPieces = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    const branch_id = req.query.branch_id || req.scope.branch_id;
    if (branch_id) where.branch_id = branch_id;
    if (req.query.tray_id) where.tray_id = req.query.tray_id;
    if (req.query.category_id) where.category_id = req.query.category_id;
    if (req.query.status) where.status = req.query.status;
    if (req.query.q) {
      where[Op.or] = [
        { item_code: { [Op.like]: `%${req.query.q}%` } },
        { huid_code: { [Op.like]: `%${req.query.q}%` } },
      ];
    }
    const pieces = await DisplayTrayItem.findAll({
      where,
      include: [
        { model: ProductMaster, attributes: ['id', 'design_code', 'product_name'] },
        { model: Category, attributes: ['id', 'name'] },
        { model: DisplayTray, attributes: ['id', 'name'] },
      ],
      order: [['id', 'DESC']],
      limit: Math.min(Number(req.query.limit) || 300, 1000),
    });
    res.json(pieces);
  } catch (err) { next(err); }
};

// ---------- Move a tray (counter to counter, counter to box, ...) ----------

export const moveTray = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const tray = await loadTray(req, req.params.id, t);
    const { location_id, reason } = req.body;
    if (!location_id) throw new AppError('Choose where to move the tray', 400);
    if (Number(location_id) === tray.location_id) throw new AppError('The tray is already there.', 400);
    await assertTrayLocation(req, tray.branch_id, location_id, t);

    const byId = indexById(await loadLocations(req.scope.tenant_id, tray.branch_id, t));
    const fromPath = tray.location_id ? pathString(tray.location_id, byId) : 'Not placed';
    const fromId = tray.location_id;
    tray.location_id = Number(location_id);
    await tray.save({ transaction: t });

    const place = await trayPlace(tray, byId);
    await LocationMovement.create({
      tenant_id: tray.tenant_id, branch_id: tray.branch_id, entity_type: 'TRAY', entity_id: tray.id, entity_label: tray.name,
      from_location_id: fromId, to_location_id: tray.location_id, from_path: fromPath, to_path: place.location_path,
      reason: reason || null, moved_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    res.json({ ...tray.toJSON(), ...place });
  } catch (err) { await t.rollback(); next(err); }
};

// Moves ONE piece to a slot of another tray. Other pieces of the same design stay where they are.
export const movePieceToTray = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const piece = await DisplayTrayItem.findOne({
      where: { id: req.params.pieceId, tenant_id: req.scope.tenant_id }, transaction: t, lock: true,
    });
    if (!piece) throw new AppError('Piece not found', 404);
    if (req.scope.branch_id && piece.branch_id !== req.scope.branch_id) throw new AppError('Piece not found', 404);
    if (piece.status !== 'ON_DISPLAY') throw new AppError('This piece is no longer on a tray', 409);

    const { tray_id, reason } = req.body;
    let { slot_no } = req.body;
    if (!tray_id) throw new AppError('Choose the tray to move it to', 400);
    if (Number(tray_id) === piece.tray_id) throw new AppError('It is already on that tray', 400);

    const target = await DisplayTray.findOne({ where: { id: tray_id, tenant_id: req.scope.tenant_id, branch_id: piece.branch_id }, transaction: t });
    if (!target) throw new AppError('Tray not found', 404);
    const source = await DisplayTray.findByPk(piece.tray_id, { transaction: t });

    const used = new Set((await DisplayTrayItem.findAll({
      where: { tray_id: target.id, status: 'ON_DISPLAY' }, attributes: ['slot_no'], transaction: t, lock: true,
    })).map((r) => r.slot_no));
    if (slot_no === undefined || slot_no === null || slot_no === '') {
      for (let n = 1; n <= target.total_slots; n += 1) { if (!used.has(n)) { slot_no = n; break; } }
      if (!slot_no) throw new AppError(`${target.name} is full`, 409);
    }
    slot_no = Number(slot_no);
    if (!Number.isInteger(slot_no) || slot_no < 1 || slot_no > target.total_slots) throw new AppError(`Slot must be between 1 and ${target.total_slots}`, 400);
    if (used.has(slot_no)) throw new AppError(`Slot ${slot_no} on ${target.name} already has a piece`, 409);

    const byId = indexById(await loadLocations(req.scope.tenant_id, piece.branch_id, t));
    const label = (tr, slot) => `${tr.name} / slot ${slot}${tr.location_id ? ` (${pathString(tr.location_id, byId)})` : ''}`;
    const fromText = label(source, piece.slot_no);

    const fromSlot = piece.slot_no;
    piece.tray_id = target.id;
    piece.slot_no = slot_no;
    await piece.save({ transaction: t });

    await LocationMovement.create({
      tenant_id: piece.tenant_id, branch_id: piece.branch_id, entity_type: 'TRAY_PIECE', entity_id: piece.id,
      entity_label: piece.item_code, from_location_id: source.location_id, to_location_id: target.location_id,
      from_path: fromText.slice(0, 500), to_path: label(target, slot_no).slice(0, 500),
      quantity: 1, weight: piece.weight, reason: reason || (fromSlot ? null : null), moved_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    res.json(piece);
  } catch (err) { await t.rollback(); next(err); }
};

// ---------- Audit ----------

export const createAudit = async (req, res, next) => {
  try {
    const tray = await loadTray(req, req.params.id);
    const { physical_count, physical_weight, audited_on, notes } = req.body;
    const pc = Number(physical_count);
    const pw = Number(physical_weight);
    if (!Number.isInteger(pc) || pc < 0) throw new AppError('Counted pieces must be a whole number', 400);
    if (!(pw >= 0) || physical_weight === '' || physical_weight === undefined) throw new AppError('Weighed total (grams) is required', 400);

    const stats = (await trayStats([tray]))[tray.id];
    const audit = await DisplayTrayAudit.create({
      tenant_id: req.scope.tenant_id, branch_id: tray.branch_id, tray_id: tray.id,
      audited_on: audited_on || today(),
      system_count: stats.present, physical_count: pc,
      system_weight: stats.weight, physical_weight: round3(pw),
      difference: round3(pw - stats.weight),
      notes: notes || null, audited_by: req.user.id,
    });
    res.status(201).json(audit);
  } catch (err) { next(err); }
};

export const listAudits = async (req, res, next) => {
  try {
    const tray = await loadTray(req, req.params.id);
    const audits = await DisplayTrayAudit.findAll({ where: { tray_id: tray.id }, order: [['audited_on', 'DESC'], ['id', 'DESC']], limit: 50 });
    res.json(audits);
  } catch (err) { next(err); }
};

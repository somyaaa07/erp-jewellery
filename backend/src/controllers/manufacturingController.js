// controllers/manufacturingController.js
// RawMaterial -> issued to a karigar -> finished goods come back into Inventory.
//
// Two ways to use it:
//   1. Plain order (no source_item_id): finished goods come back as a NEW stock row.
//   2. Issued from a wholesale lot whose quantity is not known yet (source_item_id): the lot is
//      marked ISSUED_TO_KARIGAR, and the finished quantity is received back INTO THAT SAME LOT,
//      which becomes CONFIRMED. No second stock row is created, so nothing is counted twice.
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { createItemInternal } from './itemController.js';
import { loadLocations, indexById, pathString } from '../utils/locationTree.js';

const {
  sequelize, ManufacturingOrder, RawMaterial, ProductMaster, Item, BulkItem, MetalDetail, StockMovement,
} = db;

function generateOrderNumber() {
  return `MO-${Date.now().toString().slice(-8)}`;
}

export const createManufacturingOrder = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);

    const { karigar_name, product_master_id, raw_material_id, issued_weight, expected_pieces, expected_finish_date, notes, source_item_id } = req.body;
    if (!karigar_name || !product_master_id || !issued_weight) {
      throw new AppError('karigar_name, product_master_id, issued_weight are required', 400);
    }

    let sourceLot = null;
    if (source_item_id) {
      sourceLot = await Item.findOne({
        where: { id: source_item_id, tenant_id: req.scope.tenant_id, branch_id },
        include: [BulkItem], transaction: t, lock: { level: t.LOCK.UPDATE, of: Item },
      });
      if (!sourceLot || sourceLot.mode !== 'BULK' || !sourceLot.BulkItem) throw new AppError('Wholesale stock not found', 404);
      if (Number(sourceLot.product_master_id) !== Number(product_master_id)) throw new AppError('This stock belongs to a different design', 400);
      if (sourceLot.BulkItem.quantity_status === 'ISSUED_TO_KARIGAR') throw new AppError('This stock is already issued to a karigar', 409);
      if (sourceLot.BulkItem.quantity_status !== 'UNKNOWN') {
        throw new AppError('Only stock whose quantity is not finalised can be issued this way. This lot already has a confirmed quantity.', 409);
      }
      sourceLot.BulkItem.quantity_status = 'ISSUED_TO_KARIGAR';
      await sourceLot.BulkItem.save({ transaction: t });
    }

    if (raw_material_id) {
      const raw = await RawMaterial.findOne({ where: { id: raw_material_id, tenant_id: req.scope.tenant_id }, transaction: t, lock: true });
      if (!raw) throw new AppError('Raw material not found', 404);
      if (Number(raw.quantity) < Number(issued_weight)) throw new AppError('Not enough raw material stock to issue', 400);
      raw.quantity = Number(raw.quantity) - Number(issued_weight);
      await raw.save({ transaction: t });
    }

    const order = await ManufacturingOrder.create({
      tenant_id: req.scope.tenant_id, branch_id, order_number: generateOrderNumber(), karigar_name,
      product_master_id, raw_material_id: raw_material_id || null, source_item_id: sourceLot ? sourceLot.id : null, issued_weight,
      expected_pieces: expected_pieces || null, expected_finish_date: expected_finish_date || null, notes: notes || null,
    }, { transaction: t });

    await t.commit();
    res.status(201).json(order);
  } catch (err) { await t.rollback(); next(err); }
};

// When goods come back from the karigar, the finished piece is created in the Item table
export const receiveManufacturingOrder = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const order = await ManufacturingOrder.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id }, transaction: t });
    if (!order) throw new AppError('Manufacturing order not found', 404);
    if (order.status === 'RECEIVED') throw new AppError('Already received', 409);

    const { received_weight, received_pieces, wastage_weight, location_id, mode, huid_code, gross_weight, purity } = req.body;

    // ---- Received back into the wholesale lot it was issued from (no new stock row) ----
    if (order.source_item_id) {
      const rw = Number(received_weight);
      const rp = Number(received_pieces);
      if (!(rw > 0)) throw new AppError('Received weight (grams) is required', 400);
      if (!Number.isInteger(rp) || rp < 1) throw new AppError('Enter the finished quantity (pieces) received', 400);

      const lot = await Item.findOne({
        where: { id: order.source_item_id, tenant_id: req.scope.tenant_id },
        include: [BulkItem, MetalDetail], transaction: t, lock: { level: t.LOCK.UPDATE, of: Item },
      });
      if (!lot?.BulkItem) throw new AppError('The wholesale stock for this order was not found', 409);
      if (lot.BulkItem.quantity_status !== 'ISSUED_TO_KARIGAR') {
        throw new AppError('This stock is not marked as issued to a karigar, so receiving would count it twice.', 409);
      }

      lot.BulkItem.total_pieces = Number(lot.BulkItem.total_pieces) + rp;
      lot.BulkItem.total_gross_weight = Number(lot.BulkItem.total_gross_weight) + rw;
      lot.BulkItem.total_net_weight = Number(lot.BulkItem.total_net_weight) + rw;
      lot.BulkItem.quantity_status = 'CONFIRMED';
      await lot.BulkItem.save({ transaction: t });
      if (lot.MetalDetail) {
        lot.MetalDetail.gross_weight = Number(lot.MetalDetail.gross_weight) + rw;
        await lot.MetalDetail.save({ transaction: t });
      }
      lot.last_moved_at = new Date();
      await lot.save({ transaction: t });

      await StockMovement.create({
        tenant_id: lot.tenant_id, branch_id: lot.branch_id, item_id: lot.id, movement_type: 'MANUFACTURING_IN', bucket: 'WHOLESALE',
        quantity_change: rp, weight_change: rw, to_location_id: lot.location_id,
        reference_type: 'MANUFACTURING', reference_id: order.id, created_by: req.user.id,
      }, { transaction: t });

      order.received_weight = rw;
      order.received_pieces = rp;
      order.wastage_weight = wastage_weight || (Number(order.issued_weight) - rw);
      order.status = 'RECEIVED';
      await order.save({ transaction: t });

      await t.commit();
      return res.json({ order, item: lot });
    }

    if (!location_id) throw new AppError('location_id is required to place finished stock', 400);

    order.received_weight = received_weight;
    order.received_pieces = received_pieces || null;
    order.wastage_weight = wastage_weight || (Number(order.issued_weight) - Number(received_weight));
    order.status = 'RECEIVED';
    await order.save({ transaction: t });

    const item = await createItemInternal({
      tenant_id: req.scope.tenant_id, branch_id: order.branch_id, location_id,
      product_master_id: order.product_master_id,
      mode: mode || (received_pieces > 1 ? 'BULK' : 'PIECE'),
      huid_code: huid_code || null,
      total_pieces: received_pieces || 1, total_gross_weight: received_weight, total_net_weight: received_weight,
      gross_weight: received_weight, purity,
      source_type: 'MANUFACTURING', source_reference_id: order.id,
      channel: req.body.channel || 'RETAIL',
    }, { transaction: t, userId: req.user.id });

    await t.commit();
    res.json({ order, item });
  } catch (err) { await t.rollback(); next(err); }
};

export const listManufacturingOrders = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;
    if (req.query.status) where.status = req.query.status;

    const orders = await ManufacturingOrder.findAll({ where, include: [ProductMaster], order: [['created_at', 'DESC']] });

    // Show where each order's stock sits, and whether its quantity is confirmed yet.
    const lotIds = orders.map((o) => o.source_item_id).filter(Boolean);
    const lots = lotIds.length ? await Item.findAll({ where: { id: lotIds }, include: [BulkItem] }) : [];
    const lotById = {};
    lots.forEach((l) => { lotById[l.id] = l; });
    const locations = await loadLocations(req.scope.tenant_id, req.scope.branch_id || null);
    const byId = indexById(locations);

    res.json(orders.map((o) => {
      const j = o.toJSON();
      const lot = lotById[o.source_item_id];
      j.source_location_path = lot ? pathString(lot.location_id, byId) : null;
      j.source_quantity_status = lot?.BulkItem?.quantity_status || null;
      return j;
    }));
  } catch (err) { next(err); }
};

// Cancels an order that has not been received. The raw material goes back, and a wholesale lot
// that was issued goes back to "quantity unknown".
export const cancelManufacturingOrder = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const order = await ManufacturingOrder.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id }, transaction: t, lock: true });
    if (!order) throw new AppError('Manufacturing order not found', 404);
    if (order.status === 'RECEIVED') throw new AppError('This order is already received.', 409);
    if (order.status === 'CANCELLED') throw new AppError('This order is already cancelled.', 409);

    if (order.raw_material_id) {
      const raw = await RawMaterial.findOne({ where: { id: order.raw_material_id }, transaction: t, lock: true });
      if (raw) { raw.quantity = Number(raw.quantity) + Number(order.issued_weight); await raw.save({ transaction: t }); }
    }
    if (order.source_item_id) {
      const bulk = await BulkItem.findOne({ where: { item_id: order.source_item_id }, transaction: t, lock: true });
      if (bulk && bulk.quantity_status === 'ISSUED_TO_KARIGAR') { bulk.quantity_status = 'UNKNOWN'; await bulk.save({ transaction: t }); }
    }
    order.status = 'CANCELLED';
    await order.save({ transaction: t });
    await t.commit();
    res.json(order);
  } catch (err) { await t.rollback(); next(err); }
};

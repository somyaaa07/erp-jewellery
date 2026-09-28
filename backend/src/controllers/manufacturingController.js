// controllers/manufacturingController.js
// RawMaterial -> issued to a karigar -> finished piece comes back into Inventory (as a new Item)
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { createItemInternal } from './itemController.js';

const { sequelize, ManufacturingOrder, RawMaterial, ProductMaster } = db;

function generateOrderNumber() {
  return `MO-${Date.now().toString().slice(-8)}`;
}

export const createManufacturingOrder = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);

    const { karigar_name, product_master_id, raw_material_id, issued_weight, expected_pieces, expected_finish_date, notes } = req.body;
    if (!karigar_name || !product_master_id || !issued_weight) {
      throw new AppError('karigar_name, product_master_id, issued_weight are required', 400);
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
      product_master_id, raw_material_id: raw_material_id || null, issued_weight,
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
    res.json(orders);
  } catch (err) { next(err); }
};

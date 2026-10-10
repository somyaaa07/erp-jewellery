// controllers/repairOrderController.js
// Covers customer repair, internal repair and damage tracking - all three from this one model.
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { sequelize, RepairOrder, Item, Customer } = db;

export const createRepairOrder = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);

    const {
      item_id, customer_id, order_type, sent_to_karigar, issue_description,
      sent_date, expected_return_date, repair_charge, notes,
    } = req.body;

    if (!order_type) throw new AppError('order_type is required', 400);

    if (item_id) {
      const item = await Item.findOne({ where: { id: item_id, tenant_id: req.scope.tenant_id }, transaction: t, lock: true });
      if (!item) throw new AppError('Item not found', 404);
      item.status = order_type === 'DAMAGE' ? 'DAMAGED' : 'IN_REPAIR';
      await item.save({ transaction: t, userId: req.user.id });
    }

    const repair = await RepairOrder.create({
      tenant_id: req.scope.tenant_id, branch_id, item_id: item_id || null, customer_id: customer_id || null,
      order_type, sent_to_karigar: sent_to_karigar || null, issue_description: issue_description || null,
      sent_date: sent_date || new Date().toISOString().slice(0, 10),
      expected_return_date: expected_return_date || null, repair_charge: repair_charge || null, notes: notes || null,
    }, { transaction: t });

    await t.commit();
    res.status(201).json(repair);
  } catch (err) { await t.rollback(); next(err); }
};

export const completeRepairOrder = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const repair = await RepairOrder.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id }, transaction: t });
    if (!repair) throw new AppError('Repair order not found', 404);

    repair.status = 'COMPLETED';
    repair.received_date = req.body.received_date || new Date().toISOString().slice(0, 10);
    if (req.body.repair_charge !== undefined) repair.repair_charge = req.body.repair_charge;
    await repair.save({ transaction: t });

    if (repair.item_id) {
      const item = await Item.findByPk(repair.item_id, { transaction: t });
      item.status = 'IN_STOCK';
      await item.save({ transaction: t, userId: req.user.id });
    }

    await t.commit();
    res.json(repair);
  } catch (err) { await t.rollback(); next(err); }
};

export const listRepairOrders = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;
    if (req.query.status) where.status = req.query.status;
    if (req.query.order_type) where.order_type = req.query.order_type;

    const repairs = await RepairOrder.findAll({ where, include: [Item, Customer], order: [['created_at', 'DESC']] });
    res.json(repairs);
  } catch (err) { next(err); }
};

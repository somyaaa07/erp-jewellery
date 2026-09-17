// controllers/stockAdjustmentController.js
// Where a mismatch between the physical count and the system count is recorded and reconciled.
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { sequelize, StockAdjustment, Item, BulkItem, StockMovement } = db;

export const createAdjustment = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);
    const { item_id, physical_quantity, reason } = req.body;
    if (!item_id || physical_quantity == null) throw new AppError('item_id and physical_quantity are required', 400);

    const item = await Item.findOne({ where: { id: item_id, tenant_id: req.scope.tenant_id }, include: [BulkItem], transaction: t, lock: true });
    if (!item) throw new AppError('Item not found', 404);

    const systemQuantity = item.mode === 'BULK' ? item.BulkItem.total_pieces : 1;

    const adjustment = await StockAdjustment.create({
      tenant_id: req.scope.tenant_id, branch_id, item_id,
      system_quantity: systemQuantity, physical_quantity, reason: reason || null, adjusted_by: req.user.id,
    }, { transaction: t });

    if (item.mode === 'BULK') {
      const diff = Number(physical_quantity) - Number(systemQuantity);
      item.BulkItem.total_pieces = Number(physical_quantity);
      await item.BulkItem.save({ transaction: t });

      await StockMovement.create({
        tenant_id: req.scope.tenant_id, branch_id, item_id, movement_type: 'ADJUSTMENT',
        quantity_change: diff, weight_change: 0, reference_type: 'STOCK_ADJUSTMENT', reference_id: adjustment.id,
        created_by: req.user.id,
      }, { transaction: t });
    }

    await t.commit();
    res.status(201).json(adjustment);
  } catch (err) { await t.rollback(); next(err); }
};

export const listAdjustments = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;

    const adjustments = await StockAdjustment.findAll({ where, include: [Item], order: [['adjusted_at', 'DESC']] });
    res.json(adjustments);
  } catch (err) { next(err); }
};

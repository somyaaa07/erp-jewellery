// controllers/stockTransferController.js
import { Op } from 'sequelize';
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { sequelize, StockTransfer, Item, BulkItem, MetalDetail, Location, ProductMaster } = db;

export const initiateTransfer = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { item_id, to_branch_id, notes, quantity } = req.body;

    // Users scoped to a single branch may only transfer items belonging to that branch.
    // Users with no fixed branch (e.g. tenant Admins) can transfer from any branch the
    // selected item currently belongs to - the item's own branch_id decides "from".
    const itemWhere = { id: item_id, tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) itemWhere.branch_id = req.scope.branch_id;

    const item = await Item.findOne({
      where: itemWhere,
      include: [BulkItem, MetalDetail],
      transaction: t,
      lock: true,
    });
    if (!item) throw new AppError('Item not found in your branch', 404);
    if (item.status !== 'IN_STOCK') throw new AppError('Only in-stock items can be transferred', 409);

    const from_branch_id = item.branch_id;
    if (from_branch_id === Number(to_branch_id)) throw new AppError('Source and destination branch cannot be the same', 400);

    const existingActive = await StockTransfer.findOne({ where: { item_id: item.id, status: 'IN_TRANSIT' }, transaction: t });
    if (existingActive) throw new AppError('This item already has a pending transfer', 409);

    let transferItemId = item.id;
    let originalItemId = null;
    let transferredQuantity = null;

    if (item.mode === 'BULK') {
      if (!quantity || quantity <= 0) throw new AppError('quantity is required for transferring a BULK item', 400);
      if (quantity > item.BulkItem.total_pieces) throw new AppError('Transfer quantity exceeds available pieces', 400);

      const perPieceWeight = item.BulkItem.total_gross_weight / item.BulkItem.total_pieces;
      const transferWeight = Number((perPieceWeight * quantity).toFixed(3));

      if (quantity === item.BulkItem.total_pieces) {
        item.status = 'IN_TRANSIT';
        await item.save({ transaction: t, userId: req.user.id });
      } else {
        item.BulkItem.total_pieces -= quantity;
        item.BulkItem.total_gross_weight = Number(item.BulkItem.total_gross_weight) - transferWeight;
        item.BulkItem.total_net_weight = Number(item.BulkItem.total_net_weight) - transferWeight;
        await item.BulkItem.save({ transaction: t });

        const splitItem = await Item.create({
          tenant_id: item.tenant_id, branch_id: item.branch_id, location_id: item.location_id,
          product_master_id: item.product_master_id, mode: 'BULK',
          huid_code: null,
          barcode_value: `${item.barcode_value}-SPLIT-${Date.now()}`,
          status: 'IN_TRANSIT',
          source_type: item.source_type,
          source_reference_id: item.source_reference_id,
          channel: item.channel || (item.is_wholesale ? 'WHOLESALE' : 'RETAIL'), is_tray_display: item.is_tray_display,
        }, { transaction: t, userId: req.user.id });

        await BulkItem.create({
          item_id: splitItem.id, total_pieces: quantity,
          total_gross_weight: transferWeight, total_net_weight: transferWeight,
        }, { transaction: t });

        if (item.MetalDetail) {
          await MetalDetail.create({
            item_id: splitItem.id, metal_type: item.MetalDetail.metal_type, purity: item.MetalDetail.purity,
            gross_weight: transferWeight, less_weight: 0,
          }, { transaction: t });
        }

        transferItemId = splitItem.id;
        originalItemId = item.id;
      }
      transferredQuantity = quantity;
    } else {
      item.status = 'IN_TRANSIT';
      await item.save({ transaction: t, userId: req.user.id });
    }

    const transfer = await StockTransfer.create({
      tenant_id: req.scope.tenant_id,
      item_id: transferItemId,
      original_item_id: originalItemId,
      from_branch_id, to_branch_id,
      quantity_transferred: transferredQuantity,
      status: 'IN_TRANSIT',
      requested_by: req.user.id,
      notes: notes || null,
    }, { transaction: t });

    await t.commit();
    res.status(201).json(transfer);
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

export const receiveTransfer = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { to_location_id } = req.body;
    const where = { id: req.params.id, tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.to_branch_id = req.scope.branch_id;

    const transfer = await StockTransfer.findOne({ where, transaction: t });
    if (!transfer) throw new AppError('Transfer not found for your branch', 404);
    if (transfer.status !== 'IN_TRANSIT') throw new AppError(`Cannot receive: current status is ${transfer.status}`, 409);

    const location = await Location.findOne({
      where: { id: to_location_id, tenant_id: req.scope.tenant_id, branch_id: transfer.to_branch_id },
      transaction: t,
    });
    if (!location) throw new AppError('Invalid destination location for your branch', 404);

    const item = await Item.findByPk(transfer.item_id, { transaction: t });
    item.branch_id = transfer.to_branch_id;
    item.location_id = to_location_id;
    item.status = 'IN_STOCK';
    item.source_type = 'BRANCH_TRANSFER';
    item.source_reference_id = transfer.id;
    await item.save({ transaction: t, userId: req.user.id });

    transfer.status = 'RECEIVED';
    transfer.to_location_id = to_location_id;
    transfer.received_by = req.user.id;
    await transfer.save({ transaction: t });

    await t.commit();
    res.json(transfer);
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

async function returnItemToSender(transfer, t) {
  const item = await Item.findByPk(transfer.item_id, { include: [BulkItem], transaction: t });

  if (transfer.original_item_id) {
    const original = await Item.findByPk(transfer.original_item_id, { include: [BulkItem], transaction: t });
    original.BulkItem.total_pieces += item.BulkItem.total_pieces;
    original.BulkItem.total_gross_weight = Number(original.BulkItem.total_gross_weight) + Number(item.BulkItem.total_gross_weight);
    original.BulkItem.total_net_weight = Number(original.BulkItem.total_net_weight) + Number(item.BulkItem.total_net_weight);
    await original.BulkItem.save({ transaction: t });
    await item.BulkItem.destroy({ transaction: t });
    await item.destroy({ transaction: t });
  } else {
    item.status = 'IN_STOCK';
    await item.save({ transaction: t });
  }
}

export const rejectTransfer = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const where = { id: req.params.id, tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.to_branch_id = req.scope.branch_id;

    const transfer = await StockTransfer.findOne({ where, transaction: t });
    if (!transfer) throw new AppError('Transfer not found for your branch', 404);
    if (transfer.status !== 'IN_TRANSIT') throw new AppError(`Cannot reject: current status is ${transfer.status}`, 409);

    await returnItemToSender(transfer, t);
    transfer.status = 'REJECTED';
    await transfer.save({ transaction: t });

    await t.commit();
    res.json(transfer);
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

export const cancelTransfer = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const where = { id: req.params.id, tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.from_branch_id = req.scope.branch_id;

    const transfer = await StockTransfer.findOne({ where, transaction: t });
    if (!transfer) throw new AppError('Transfer not found for your branch', 404);
    if (transfer.status !== 'IN_TRANSIT') throw new AppError(`Cannot cancel: current status is ${transfer.status}`, 409);

    await returnItemToSender(transfer, t);
    transfer.status = 'CANCELLED';
    await transfer.save({ transaction: t });

    await t.commit();
    res.json(transfer);
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

export const listTransfers = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) {
      where[Op.or] = [{ from_branch_id: req.scope.branch_id }, { to_branch_id: req.scope.branch_id }];
    }
    if (req.query.status) where.status = req.query.status;

    const transfers = await StockTransfer.findAll({ where, include: [{ model: Item, include: [ProductMaster] }], order: [['created_at', 'DESC']] });
    res.json(transfers);
  } catch (err) { next(err); }
};
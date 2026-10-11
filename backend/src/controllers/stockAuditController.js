// controllers/stockAuditController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { sequelize, StockAudit, StockAuditItem, Item, BulkItem } = db;

export const startAudit = async (req, res, next) => {
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);

    const audit = await StockAudit.create({
      tenant_id: req.scope.tenant_id, branch_id,
      audit_date: req.body.audit_date || new Date().toISOString().slice(0, 10),
      conducted_by: req.user.id, notes: req.body.notes || null,
    });
    res.status(201).json(audit);
  } catch (err) { next(err); }
};

// body: { entries: [{ item_id, physical_quantity, remarks }] }
export const recordAuditEntries = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const audit = await StockAudit.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id }, transaction: t });
    if (!audit) throw new AppError('Audit not found', 404);

    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) throw new AppError('entries array is required', 400);

    const created = [];
    for (const e of entries) {
      const item = await Item.findOne({ where: { id: e.item_id, tenant_id: req.scope.tenant_id }, include: [BulkItem], transaction: t });
      if (!item) throw new AppError(`Item ${e.item_id} not found`, 404);
      const systemQuantity = item.mode === 'BULK' ? item.BulkItem.total_pieces : 1;

      const row = await StockAuditItem.create({
        audit_id: audit.id, item_id: item.id, system_quantity: systemQuantity,
        physical_quantity: e.physical_quantity, remarks: e.remarks || null,
      }, { transaction: t });
      created.push(row);
    }

    await t.commit();
    res.status(201).json(created);
  } catch (err) { await t.rollback(); next(err); }
};

export const completeAudit = async (req, res, next) => {
  try {
    const audit = await StockAudit.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!audit) throw new AppError('Audit not found', 404);
    audit.status = 'COMPLETED';
    await audit.save();
    res.json(audit);
  } catch (err) { next(err); }
};

export const listAudits = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;

    const audits = await StockAudit.findAll({ where, include: [{ model: StockAuditItem, include: [Item] }], order: [['audit_date', 'DESC']] });
    res.json(audits);
  } catch (err) { next(err); }
};

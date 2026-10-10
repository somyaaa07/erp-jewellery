// controllers/rawMaterialController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { RawMaterial } = db;

export const addRawMaterial = async (req, res, next) => {
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);
    const { material_type, purity, quantity, unit, location_id, notes } = req.body;
    if (!material_type || quantity == null) throw new AppError('material_type and quantity are required', 400);

    const raw = await RawMaterial.create({
      tenant_id: req.scope.tenant_id, branch_id, location_id: location_id || null,
      material_type, purity: purity || null, quantity, unit: unit || 'GRAM', notes: notes || null,
    });
    res.status(201).json(raw);
  } catch (err) { next(err); }
};

export const listRawMaterials = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;
    if (req.query.material_type) where.material_type = req.query.material_type;

    const raw = await RawMaterial.findAll({ where, order: [['created_at', 'DESC']] });
    res.json(raw);
  } catch (err) { next(err); }
};

export const adjustRawMaterial = async (req, res, next) => {
  try {
    const raw = await RawMaterial.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!raw) throw new AppError('Raw material record not found', 404);

    const { quantity_change } = req.body;
    if (quantity_change == null) throw new AppError('quantity_change is required', 400);

    raw.quantity = Number(raw.quantity) + Number(quantity_change);
    if (raw.quantity < 0) throw new AppError('Resulting quantity cannot be negative', 400);
    await raw.save();
    res.json(raw);
  } catch (err) { next(err); }
};

// controllers/purityMasterController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { PurityMaster } = db;

export const createPurity = async (req, res, next) => {
  try {
    const { metal_type, purity_code, fineness_percent } = req.body;
    if (!metal_type || !purity_code) throw new AppError('metal_type and purity_code are required', 400);

    const purity = await PurityMaster.create({
      tenant_id: req.scope.tenant_id, metal_type, purity_code, fineness_percent: fineness_percent || null,
    });
    res.status(201).json(purity);
  } catch (err) { next(err); }
};

export const listPurities = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id, is_active: true };
    if (req.query.metal_type) where.metal_type = req.query.metal_type;

    const purities = await PurityMaster.findAll({ where, order: [['metal_type', 'ASC'], ['purity_code', 'DESC']] });
    res.json(purities);
  } catch (err) { next(err); }
};

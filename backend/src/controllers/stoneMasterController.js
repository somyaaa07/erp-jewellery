// controllers/stoneMasterController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { StoneMaster } = db;

export const createStoneMaster = async (req, res, next) => {
  try {
    const { stone_type, default_rate_per_carat, unit } = req.body;
    if (!stone_type) throw new AppError('stone_type is required', 400);

    const stone = await StoneMaster.create({
      tenant_id: req.scope.tenant_id, stone_type, default_rate_per_carat: default_rate_per_carat || null, unit: unit || 'CARAT',
    });
    res.status(201).json(stone);
  } catch (err) { next(err); }
};

export const listStoneMasters = async (req, res, next) => {
  try {
    const stones = await StoneMaster.findAll({ where: { tenant_id: req.scope.tenant_id, is_active: true } });
    res.json(stones);
  } catch (err) { next(err); }
};

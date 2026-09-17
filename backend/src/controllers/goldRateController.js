// controllers/goldRateController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { GoldRate } = db;

// A new rate is always INSERTed (never updated), so the full rate history is always preserved.
export const addGoldRate = async (req, res, next) => {
  try {
    const { metal_type, purity, rate_per_gram, rate_date, branch_id } = req.body;
    if (!metal_type || !purity || !rate_per_gram) {
      throw new AppError('metal_type, purity, rate_per_gram are required', 400);
    }

    const rate = await GoldRate.create({
      tenant_id: req.scope.tenant_id,
      branch_id: branch_id || req.scope.branch_id || null,
      rate_date: rate_date || new Date().toISOString().slice(0, 10),
      metal_type, purity, rate_per_gram,
      created_by: req.user.id,
    });

    res.status(201).json(rate);
  } catch (err) { next(err); }
};

export const listGoldRates = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.query.metal_type) where.metal_type = req.query.metal_type;
    if (req.query.purity) where.purity = req.query.purity;

    const rates = await GoldRate.findAll({ where, order: [['rate_date', 'DESC'], ['created_at', 'DESC']], limit: 200 });
    res.json(rates);
  } catch (err) { next(err); }
};

// Latest rates for today (or any given day) across every purity - for the dashboard / quick view
export const todaysRates = async (req, res, next) => {
  try {
    const { Op } = await import('sequelize');
    const asOf = req.query.date || new Date().toISOString().slice(0, 10);

    const all = await GoldRate.findAll({
      where: { tenant_id: req.scope.tenant_id, rate_date: { [Op.lte]: asOf } },
      order: [['rate_date', 'DESC'], ['id', 'DESC']],
    });

    const latestByKey = {};
    for (const r of all) {
      const key = `${r.metal_type}|${r.purity}|${r.branch_id || 'ALL'}`;
      if (!latestByKey[key]) latestByKey[key] = r;
    }
    res.json(Object.values(latestByKey));
  } catch (err) { next(err); }
};

// controllers/pricingProfileController.js
// This is where the RETAIL and WHOLESALE pricing rules are defined.
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { PricingProfile, Category } = db;

export const createPricingProfile = async (req, res, next) => {
  try {
    const {
      profile_type, category_id, branch_id, making_charge_type, making_charge_value,
      wastage_percent, gst_percent, other_charges_flat,
    } = req.body;

    if (!profile_type || !['RETAIL', 'WHOLESALE'].includes(profile_type)) {
      throw new AppError('profile_type must be RETAIL or WHOLESALE', 400);
    }

    const profile = await PricingProfile.create({
      tenant_id: req.scope.tenant_id,
      branch_id: branch_id || null,
      category_id: category_id || null,
      profile_type,
      making_charge_type: making_charge_type || 'PERCENT_OF_GOLD',
      making_charge_value: making_charge_value ?? 0,
      wastage_percent: wastage_percent ?? 0,
      gst_percent: gst_percent ?? 3,
      other_charges_flat: other_charges_flat ?? 0,
    });

    res.status(201).json(profile);
  } catch (err) { next(err); }
};

export const listPricingProfiles = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.query.profile_type) where.profile_type = req.query.profile_type;

    const profiles = await PricingProfile.findAll({ where, include: [Category], order: [['profile_type', 'ASC']] });
    res.json(profiles);
  } catch (err) { next(err); }
};

export const updatePricingProfile = async (req, res, next) => {
  try {
    const profile = await PricingProfile.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!profile) throw new AppError('Pricing profile not found', 404);

    ['making_charge_type', 'making_charge_value', 'wastage_percent', 'gst_percent', 'other_charges_flat', 'is_active']
      .forEach((f) => { if (req.body[f] !== undefined) profile[f] = req.body[f]; });

    await profile.save();
    res.json(profile);
  } catch (err) { next(err); }
};

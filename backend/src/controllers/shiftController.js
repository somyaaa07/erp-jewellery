// backend/src/controllers/shiftController.js
import { Op } from 'sequelize';
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { Shift, Branch } = db;

function resolveTenantId(req) {
  if (req.user.role === 'SUPER_ADMIN') {
    return req.query.tenant_id ? parseInt(req.query.tenant_id, 10) : req.user.tenant_id;
  }
  return req.user.tenant_id;
}

// GET /api/shifts - List shifts for authenticated tenant
export const listShifts = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId && req.user.role !== 'SUPER_ADMIN') {
      throw new AppError('User is not associated with any tenant', 403);
    }

    const { branch_id, is_active } = req.query;
    const where = { tenant_id: tenantId };

    // Manager branch scoping: only shifts that are tenant-wide or specific to their branch
    if (req.user.role === 'MANAGER') {
      where[Op.or] = [
        { branch_id: null },
        { branch_id: req.user.branch_id },
      ];
    } else if (branch_id) {
      if (branch_id === 'tenant-wide') {
        where.branch_id = null;
      } else {
        where.branch_id = parseInt(branch_id, 10);
      }
    }

    if (is_active !== undefined) {
      where.is_active = is_active === 'true';
    }

    const shifts = await Shift.findAll({
      where,
      include: [
        {
          model: Branch,
          as: 'Branch',
          attributes: ['id', 'name'],
        },
      ],
      order: [
        ['is_active', 'DESC'],
        ['name', 'ASC'],
      ],
    });

    return res.json({ data: shifts });
  } catch (err) {
    next(err);
  }
};

// GET /api/shifts/:id - Single shift details
export const getShiftById = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const shift = await Shift.findOne({
      where: { id, tenant_id: tenantId },
      include: [
        {
          model: Branch,
          as: 'Branch',
          attributes: ['id', 'name'],
        },
      ],
    });

    if (!shift) {
      throw new AppError('Shift schedule not found', 404);
    }

    // Branch manager check
    if (req.user.role === 'MANAGER' && shift.branch_id && shift.branch_id !== req.user.branch_id) {
      throw new AppError('Access denied to shift schedule outside your branch', 403);
    }

    return res.json({ data: shift });
  } catch (err) {
    next(err);
  }
};

// POST /api/shifts - Create a new shift schedule
export const createShift = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      throw new AppError('Tenant context required', 403);
    }

    const {
      name,
      start_time,
      end_time,
      grace_period_minutes = 15,
      half_day_threshold_hours = 4.0,
      is_overnight = false,
      branch_id = null,
      is_active = true,
    } = req.body;

    if (!name || !name.trim()) {
      throw new AppError('Shift name is required', 400);
    }
    if (!start_time || !end_time) {
      throw new AppError('Shift start time and end time are required', 400);
    }

    // Check unique shift name per tenant
    const existing = await Shift.findOne({
      where: { tenant_id: tenantId, name: name.trim() },
    });
    if (existing) {
      throw new AppError(`A shift named '${name.trim()}' already exists in this tenant`, 400);
    }

    // Validate branch ownership if specified
    let targetBranchId = branch_id ? parseInt(branch_id, 10) : null;
    if (req.user.role === 'MANAGER') {
      targetBranchId = req.user.branch_id;
    } else if (targetBranchId) {
      const branch = await Branch.findOne({
        where: { id: targetBranchId, tenant_id: tenantId },
      });
      if (!branch) {
        throw new AppError('Invalid branch for this tenant', 400);
      }
    }

    const newShift = await Shift.create({
      tenant_id: tenantId,
      branch_id: targetBranchId,
      name: name.trim(),
      start_time,
      end_time,
      grace_period_minutes: parseInt(grace_period_minutes, 10) || 0,
      half_day_threshold_hours: parseFloat(half_day_threshold_hours) || 4.0,
      is_overnight: Boolean(is_overnight),
      is_active: Boolean(is_active),
    });

    return res.status(201).json({
      message: 'Shift created successfully',
      data: newShift,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/shifts/:id - Update shift
export const updateShift = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const shift = await Shift.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!shift) {
      throw new AppError('Shift schedule not found', 404);
    }

    if (req.user.role === 'MANAGER' && shift.branch_id && shift.branch_id !== req.user.branch_id) {
      throw new AppError('Access denied: You cannot modify shifts outside your branch', 403);
    }

    const {
      name,
      start_time,
      end_time,
      grace_period_minutes,
      half_day_threshold_hours,
      is_overnight,
      branch_id,
      is_active,
    } = req.body;

    if (name && name.trim() !== shift.name) {
      const conflict = await Shift.findOne({
        where: {
          tenant_id: tenantId,
          name: name.trim(),
          id: { [Op.ne]: id },
        },
      });
      if (conflict) {
        throw new AppError(`A shift named '${name.trim()}' already exists in this tenant`, 400);
      }
      shift.name = name.trim();
    }

    if (start_time) shift.start_time = start_time;
    if (end_time) shift.end_time = end_time;
    if (grace_period_minutes !== undefined) {
      shift.grace_period_minutes = parseInt(grace_period_minutes, 10);
    }
    if (half_day_threshold_hours !== undefined) {
      shift.half_day_threshold_hours = parseFloat(half_day_threshold_hours);
    }
    if (is_overnight !== undefined) {
      shift.is_overnight = Boolean(is_overnight);
    }
    if (is_active !== undefined) {
      shift.is_active = Boolean(is_active);
    }

    if (branch_id !== undefined && req.user.role !== 'MANAGER') {
      if (branch_id === null || branch_id === '') {
        shift.branch_id = null;
      } else {
        const b = await Branch.findOne({
          where: { id: parseInt(branch_id, 10), tenant_id: tenantId },
        });
        if (!b) throw new AppError('Invalid branch for this tenant', 400);
        shift.branch_id = b.id;
      }
    }

    await shift.save();

    return res.json({
      message: 'Shift updated successfully',
      data: shift,
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/shifts/:id/status - Toggle active/inactive
export const updateShiftStatus = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;
    const { is_active } = req.body;

    if (is_active === undefined) {
      throw new AppError('is_active status is required', 400);
    }

    const shift = await Shift.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!shift) {
      throw new AppError('Shift schedule not found', 404);
    }

    if (req.user.role === 'MANAGER' && shift.branch_id && shift.branch_id !== req.user.branch_id) {
      throw new AppError('Access denied to shift outside your branch', 403);
    }

    shift.is_active = Boolean(is_active);
    await shift.save();

    return res.json({
      message: `Shift ${shift.is_active ? 'activated' : 'deactivated'} successfully`,
      data: shift,
    });
  } catch (err) {
    next(err);
  }
};

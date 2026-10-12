// backend/src/controllers/leaveController.js
import { Op } from 'sequelize';
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import {
  calculateChargeableLeaveDays,
  parseDateOnly,
  formatDateOnly,
} from '../utils/leaveCalculator.js';

const {
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  StaffProfile,
  Attendance,
  Branch,
  User,
  sequelize,
} = db;

// Helper: Resolve multi-tenant scope
function resolveTenantId(req) {
  if (req.user.role === 'SUPER_ADMIN') {
    return req.query.tenant_id ? parseInt(req.query.tenant_id, 10) : req.user.tenant_id;
  }
  return req.user.tenant_id;
}

// Helper: Resolve branch authorization scope
function resolveBranchScope(req) {
  if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
    return null; // Full tenant access across all branches
  }
  return req.user.branch_id || null; // Scoped strictly to assigned branch
}

/**
 * Idempotently seed default leave types for a tenant
 * @param {number} tenantId
 */
export async function seedDefaultLeaveTypes(tenantId) {
  const defaultTypes = [
    {
      code: 'CASUAL',
      name: 'Casual Leave',
      days_allowed_per_year: 12.0,
      is_paid: true,
      exclude_weekly_offs: true,
      exclude_holidays: true,
      requires_attachment: false,
    },
    {
      code: 'SICK',
      name: 'Sick Leave',
      days_allowed_per_year: 10.0,
      is_paid: true,
      exclude_weekly_offs: true,
      exclude_holidays: true,
      requires_attachment: false,
    },
    {
      code: 'ANNUAL',
      name: 'Annual Leave',
      days_allowed_per_year: 15.0,
      is_paid: true,
      exclude_weekly_offs: true,
      exclude_holidays: true,
      requires_attachment: false,
    },
    {
      code: 'MATERNITY',
      name: 'Maternity Leave',
      days_allowed_per_year: 90.0,
      is_paid: true,
      exclude_weekly_offs: false,
      exclude_holidays: false,
      requires_attachment: true,
    },
    {
      code: 'UNPAID',
      name: 'Unpaid Leave',
      days_allowed_per_year: 0.0,
      is_paid: false,
      exclude_weekly_offs: true,
      exclude_holidays: true,
      requires_attachment: false,
    },
  ];

  for (const t of defaultTypes) {
    await LeaveType.findOrCreate({
      where: { tenant_id: tenantId, code: t.code },
      defaults: {
        tenant_id: tenantId,
        ...t,
        is_active: true,
      },
    });
  }
}

/**
 * GET /api/leaves/types
 * List active leave types for tenant.
 */
export const listLeaveTypes = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) throw new AppError('Tenant context required', 403);

    // Ensure defaults exist
    const count = await LeaveType.count({ where: { tenant_id: tenantId } });
    if (count === 0) {
      await seedDefaultLeaveTypes(tenantId);
    }

    const types = await LeaveType.findAll({
      where: { tenant_id: tenantId, is_active: true },
      order: [['id', 'ASC']],
    });

    return res.json({ data: types });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/leaves/types
 * Admin-only: Create a custom leave type
 */
export const createLeaveType = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) throw new AppError('Tenant context required', 403);

    const {
      name,
      code,
      days_allowed_per_year = 0.0,
      is_paid = true,
      exclude_weekly_offs = true,
      exclude_holidays = true,
      requires_attachment = false,
    } = req.body;

    if (!name || !name.trim()) throw new AppError('Leave type name is required', 400);
    if (!code || !code.trim()) throw new AppError('Leave type code is required', 400);

    const cleanCode = code.trim().toUpperCase();

    const existing = await LeaveType.findOne({
      where: { tenant_id: tenantId, code: cleanCode },
    });
    if (existing) {
      throw new AppError(`Leave type with code '${cleanCode}' already exists for this tenant`, 409);
    }

    const newType = await LeaveType.create({
      tenant_id: tenantId,
      name: name.trim(),
      code: cleanCode,
      days_allowed_per_year: parseFloat(days_allowed_per_year) || 0.0,
      is_paid: Boolean(is_paid),
      exclude_weekly_offs: Boolean(exclude_weekly_offs),
      exclude_holidays: Boolean(exclude_holidays),
      requires_attachment: Boolean(requires_attachment),
      is_active: true,
    });

    return res.status(201).json({
      message: 'Leave type created successfully',
      data: newType,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/leaves/types/:id
 * Admin-only: Update a leave type
 */
export const updateLeaveType = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const leaveType = await LeaveType.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!leaveType) throw new AppError('Leave type not found', 404);

    const {
      name,
      days_allowed_per_year,
      is_paid,
      exclude_weekly_offs,
      exclude_holidays,
      requires_attachment,
      is_active,
    } = req.body;

    if (name !== undefined) leaveType.name = name.trim();
    if (days_allowed_per_year !== undefined) leaveType.days_allowed_per_year = parseFloat(days_allowed_per_year);
    if (is_paid !== undefined) leaveType.is_paid = Boolean(is_paid);
    if (exclude_weekly_offs !== undefined) leaveType.exclude_weekly_offs = Boolean(exclude_weekly_offs);
    if (exclude_holidays !== undefined) leaveType.exclude_holidays = Boolean(exclude_holidays);
    if (requires_attachment !== undefined) leaveType.requires_attachment = Boolean(requires_attachment);
    if (is_active !== undefined) leaveType.is_active = Boolean(is_active);

    await leaveType.save();

    return res.json({
      message: 'Leave type updated successfully',
      data: leaveType,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/leaves
 * Directly record an employee's leave as APPROVED.
 * Enforces:
 * - Tenant ownership and branch authorization
 * - Date validation & half-day rules
 * - Mutual exclusion via StaffProfile row lock (safe under concurrency)
 * - Strict balance verification & cross-year allocation in yearly_deductions
 */
export const recordLeave = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) throw new AppError('Tenant context required', 403);

    const branchScope = resolveBranchScope(req);
    const {
      staff_id,
      leave_type_id,
      start_date,
      end_date,
      is_half_day = false,
      half_day_period,
      reason,
      document_url,
    } = req.body;

    // 1. Basic parameter validation
    if (!staff_id) throw new AppError('Employee (staff_id) is required', 400);
    if (!leave_type_id) throw new AppError('Leave type is required', 400);
    if (!start_date || !end_date) throw new AppError('Start date and end date are required', 400);
    if (!reason || !reason.trim()) throw new AppError('Reason for leave is required', 400);

    // Validate date format & sequence
    try {
      parseDateOnly(start_date);
      parseDateOnly(end_date);
    } catch (e) {
      throw new AppError(e.message, 400);
    }

    if (start_date > end_date) {
      throw new AppError(`Start date (${start_date}) cannot be after end date (${end_date})`, 400);
    }

    // Half-day validation
    if (is_half_day) {
      if (start_date !== end_date) {
        throw new AppError(`Half-day leave must start and end on the exact same date (${start_date} != ${end_date})`, 400);
      }
      if (!half_day_period || !['FIRST_HALF', 'SECOND_HALF'].includes(half_day_period)) {
        throw new AppError('Half-day period must be specified as either FIRST_HALF or SECOND_HALF', 400);
      }
    }

    // 2. Validate Leave Type exists in tenant
    const leaveType = await LeaveType.findOne({
      where: { id: leave_type_id, tenant_id: tenantId, is_active: true },
    });
    if (!leaveType) {
      throw new AppError('Invalid or inactive leave type selected', 404);
    }

    // 3. Fetch existing attendance records to honor recorded holiday/weekly-off punches
    const existingAttendances = await Attendance.findAll({
      where: {
        tenant_id: tenantId,
        staff_id,
        attendance_date: { [Op.between]: [start_date, end_date] },
      },
    });

    // 4. Calculate Chargeable Days & Cross-Year Breakdown
    const calculation = calculateChargeableLeaveDays({
      startDate: start_date,
      endDate: end_date,
      isHalfDay: Boolean(is_half_day),
      leaveType,
      existingAttendances,
    });

    if (calculation.total_days <= 0) {
      throw new AppError(
        'Cannot record leave: all requested dates fall on excluded weekly-offs or holidays.',
        400
      );
    }

    // 5. Transactional Execution with Exclusive StaffProfile Mutex Row Lock
    const tx = await sequelize.transaction();
    try {
      // Step A: Acquire exclusive row lock on StaffProfile (serializes concurrent requests for same employee)
      const lockedStaff = await StaffProfile.findOne({
        where: { id: staff_id, tenant_id: tenantId },
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });

      if (!lockedStaff) {
        throw new AppError('Employee profile not found in current tenant', 404);
      }

      // Branch authorization check
      if (branchScope && lockedStaff.branch_id !== branchScope) {
        throw new AppError('Access denied: You are only authorized to manage leave for employees in your assigned branch', 403);
      }

      // Step B: Check for overlapping active leaves
      const overlappingLeaves = await LeaveRequest.findAll({
        where: {
          tenant_id: tenantId,
          staff_id,
          status: { [Op.in]: ['APPROVED', 'PENDING'] },
          start_date: { [Op.lte]: end_date },
          end_date: { [Op.gte]: start_date },
        },
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });

      if (overlappingLeaves.length > 0) {
        if (is_half_day) {
          for (const existing of overlappingLeaves) {
            if (!existing.is_half_day) {
              throw new AppError(
                `Conflict: Employee already has an active full-day leave (${existing.start_date} to ${existing.end_date}) covering this date.`,
                409
              );
            }
            if (existing.is_half_day && existing.start_date === start_date && existing.half_day_period === half_day_period) {
              throw new AppError(
                `Conflict: Employee already has an active half-day leave for the ${half_day_period.replace('_', ' ').toLowerCase()} on ${start_date}.`,
                409
              );
            }
          }
        } else {
          const firstConflict = overlappingLeaves[0];
          throw new AppError(
            `Conflict: Employee already has an active leave (${firstConflict.start_date} to ${firstConflict.end_date}, status: ${firstConflict.status}) overlapping the selected dates.`,
            409
          );
        }
      }

      // Step C: Leave Balance Deduction Logic
      let is_balance_deducted = false;
      let yearly_deductions = null;

      if (leaveType.is_paid) {
        for (const [yearStr, requiredDays] of Object.entries(calculation.yearly_breakdown)) {
          const yearNum = parseInt(yearStr, 10);

          // Find or initialize leave balance for this year
          const [balanceRecord] = await LeaveBalance.findOrCreate({
            where: {
              tenant_id: tenantId,
              staff_id,
              leave_type_id,
              year: yearNum,
            },
            defaults: {
              tenant_id: tenantId,
              staff_id,
              leave_type_id,
              year: yearNum,
              entitled_days: leaveType.days_allowed_per_year,
              used_days: 0.0,
              pending_days: 0.0,
            },
            transaction: tx,
            lock: tx.LOCK.UPDATE,
          });

          const entitled = Number(balanceRecord.entitled_days);
          const used = Number(balanceRecord.used_days);
          const pending = Number(balanceRecord.pending_days);
          const available = Number((entitled - used - pending).toFixed(1));

          if (available < requiredDays) {
            throw new AppError(
              `Insufficient leave balance for ${leaveType.name} in year ${yearNum}. Available: ${available} day(s), Required: ${requiredDays} day(s).`,
              400
            );
          }

          // Deduct from balance
          balanceRecord.used_days = Number((used + requiredDays).toFixed(1));
          await balanceRecord.save({ transaction: tx });
        }

        is_balance_deducted = true;
        yearly_deductions = calculation.yearly_breakdown;
      }

      // Step D: Insert LeaveRequest record as APPROVED
      const createdLeave = await LeaveRequest.create(
        {
          tenant_id: tenantId,
          branch_id: lockedStaff.branch_id,
          staff_id,
          leave_type_id,
          start_date,
          end_date,
          total_days: calculation.total_days,
          is_half_day: Boolean(is_half_day),
          half_day_period: is_half_day ? half_day_period : null,
          reason: reason.trim(),
          status: 'APPROVED',
          is_balance_deducted,
          yearly_deductions,
          document_url: document_url || null,
          created_by_id: req.user.id,
          approved_by_id: req.user.id,
          approved_at: new Date(),
        },
        { transaction: tx }
      );

      await tx.commit();

      // Return fully hydrated record
      const fullRecord = await LeaveRequest.findByPk(createdLeave.id, {
        include: [
          { model: StaffProfile, as: 'StaffProfile', attributes: ['id', 'first_name', 'last_name', 'employee_id', 'department', 'designation'] },
          { model: LeaveType, as: 'LeaveType', attributes: ['id', 'name', 'code', 'is_paid'] },
          { model: Branch, as: 'Branch', attributes: ['id', 'name'] },
          { model: User, as: 'ApprovedBy', attributes: ['id', 'name', 'email'] },
        ],
      });

      return res.status(201).json({
        message: 'Leave recorded and approved successfully',
        data: fullRecord,
      });
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/leaves/:id/cancel
 * Cancel an approved leave request and idempotently reverse balances.
 */
export const cancelLeave = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const branchScope = resolveBranchScope(req);
    const { id } = req.params;
    const { reason } = req.body || {};

    const tx = await sequelize.transaction();
    try {
      const leave = await LeaveRequest.findOne({
        where: { id, tenant_id: tenantId },
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });

      if (!leave) {
        throw new AppError('Leave request not found', 404);
      }

      // Branch authorization check
      if (branchScope && leave.branch_id !== branchScope) {
        throw new AppError('Access denied: You are only authorized to cancel leaves in your assigned branch', 403);
      }

      // Idempotency: If already cancelled, return immediately without restoring twice
      if (leave.status === 'CANCELLED') {
        await tx.commit();
        return res.json({
          message: 'Leave is already cancelled',
          data: leave,
        });
      }

      if (!['APPROVED', 'PENDING'].includes(leave.status)) {
        throw new AppError(`Cannot cancel leave with status '${leave.status}'`, 400);
      }

      // Reversal of leave balances (strictly once)
      if (leave.is_balance_deducted && leave.yearly_deductions) {
        const rawDeductions = leave.yearly_deductions;
        const deductions = typeof rawDeductions === 'string' ? JSON.parse(rawDeductions) : rawDeductions;
        if (deductions && typeof deductions === 'object') {
          for (const [yearStr, deductedDays] of Object.entries(deductions)) {
            const yearNum = parseInt(yearStr, 10);
          const bal = await LeaveBalance.findOne({
            where: {
              tenant_id: tenantId,
              staff_id: leave.staff_id,
              leave_type_id: leave.leave_type_id,
              year: yearNum,
            },
            transaction: tx,
            lock: tx.LOCK.UPDATE,
          });

          if (bal) {
            const restoredUsed = Math.max(0, Number((Number(bal.used_days) - Number(deductedDays)).toFixed(1)));
            bal.used_days = restoredUsed;
            await bal.save({ transaction: tx });
          }
        }
        }
        leave.is_balance_deducted = false;
      }

      // Update leave record status
      leave.status = 'CANCELLED';
      leave.cancelled_by_id = req.user.id;
      leave.cancelled_at = new Date();
      leave.cancellation_reason = reason ? reason.trim() : 'Cancelled by administrator/manager';

      await leave.save({ transaction: tx });
      await tx.commit();

      const updated = await LeaveRequest.findByPk(leave.id, {
        include: [
          { model: StaffProfile, as: 'StaffProfile', attributes: ['id', 'first_name', 'last_name', 'employee_id'] },
          { model: LeaveType, as: 'LeaveType', attributes: ['id', 'name', 'code', 'is_paid'] },
          { model: User, as: 'CancelledBy', attributes: ['id', 'name', 'email'] },
        ],
      });

      return res.json({
        message: 'Leave request cancelled successfully and balances restored',
        data: updated,
      });
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leaves
 * List and filter leave records with pagination.
 */
export const listLeaves = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const branchScope = resolveBranchScope(req);

    const {
      status,
      staff_id,
      branch_id,
      leave_type_id,
      start_date,
      end_date,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const where = { tenant_id: tenantId };

    // Branch scoping
    if (branchScope) {
      where.branch_id = branchScope;
    } else if (branch_id) {
      where.branch_id = parseInt(branch_id, 10);
    }

    if (status && status.trim()) {
      where.status = status.trim().toUpperCase();
    }
    if (staff_id) {
      where.staff_id = parseInt(staff_id, 10);
    }
    if (leave_type_id) {
      where.leave_type_id = parseInt(leave_type_id, 10);
    }

    // Date range overlapping filter
    if (start_date && end_date) {
      where.start_date = { [Op.lte]: end_date };
      where.end_date = { [Op.gte]: start_date };
    } else if (start_date) {
      where.end_date = { [Op.gte]: start_date };
    } else if (end_date) {
      where.start_date = { [Op.lte]: end_date };
    }

    const staffIncludeWhere = {};
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      staffIncludeWhere[Op.or] = [
        { first_name: { [Op.like]: q } },
        { last_name: { [Op.like]: q } },
        { employee_id: { [Op.like]: q } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await LeaveRequest.findAndCountAll({
      where,
      include: [
        {
          model: StaffProfile,
          as: 'StaffProfile',
          where: Object.keys(staffIncludeWhere).length ? staffIncludeWhere : undefined,
          attributes: ['id', 'first_name', 'last_name', 'employee_id', 'department', 'designation', 'profile_photo'],
        },
        { model: LeaveType, as: 'LeaveType', attributes: ['id', 'name', 'code', 'is_paid'] },
        { model: Branch, as: 'Branch', attributes: ['id', 'name'] },
        { model: User, as: 'CreatedBy', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'ApprovedBy', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'CancelledBy', attributes: ['id', 'name', 'email'] },
      ],
      order: [['created_at', 'DESC']],
      limit: limitNum,
      offset,
    });

    return res.json({
      data: rows,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leaves/summary
 * KPI summary metrics for Leave dashboard.
 */
export const getLeaveSummary = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const branchScope = resolveBranchScope(req);
    const today = new Date().toISOString().split('T')[0];

    const where = { tenant_id: tenantId };
    if (branchScope) where.branch_id = branchScope;

    const [totalApproved, totalPending, totalCancelled, onLeaveToday] = await Promise.all([
      LeaveRequest.count({ where: { ...where, status: 'APPROVED' } }),
      LeaveRequest.count({ where: { ...where, status: 'PENDING' } }),
      LeaveRequest.count({ where: { ...where, status: 'CANCELLED' } }),
      LeaveRequest.count({
        where: {
          ...where,
          status: 'APPROVED',
          start_date: { [Op.lte]: today },
          end_date: { [Op.gte]: today },
        },
      }),
    ]);

    return res.json({
      summary: {
        approved: totalApproved,
        pending: totalPending,
        cancelled: totalCancelled,
        on_leave_today: onLeaveToday,
        today,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leaves/balances/:staffId
 * View leave balances and quotas for an employee for a specific year.
 */
export const getLeaveBalances = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const branchScope = resolveBranchScope(req);
    const { staffId } = req.params;
    const year = parseInt(req.query.year, 10) || new Date().getUTCFullYear();

    const staff = await StaffProfile.findOne({
      where: { id: staffId, tenant_id: tenantId },
      include: [{ model: Branch, as: 'Branch', attributes: ['id', 'name'] }],
    });

    if (!staff) throw new AppError('Employee profile not found', 404);

    if (branchScope && staff.branch_id !== branchScope) {
      throw new AppError('Access denied: You cannot view balances for employees outside your branch', 403);
    }

    // Ensure default leave types exist
    const typeCount = await LeaveType.count({ where: { tenant_id: tenantId } });
    if (typeCount === 0) {
      await seedDefaultLeaveTypes(tenantId);
    }

    const leaveTypes = await LeaveType.findAll({
      where: { tenant_id: tenantId, is_active: true },
      order: [['id', 'ASC']],
    });

    const balances = await Promise.all(
      leaveTypes.map(async (lt) => {
        const [bal] = await LeaveBalance.findOrCreate({
          where: {
            tenant_id: tenantId,
            staff_id: staff.id,
            leave_type_id: lt.id,
            year,
          },
          defaults: {
            tenant_id: tenantId,
            staff_id: staff.id,
            leave_type_id: lt.id,
            year,
            entitled_days: lt.days_allowed_per_year,
            used_days: 0.0,
            pending_days: 0.0,
          },
        });

        const entitled = Number(bal.entitled_days);
        const used = Number(bal.used_days);
        const pending = Number(bal.pending_days);
        const available = lt.is_paid ? Math.max(0, Number((entitled - used - pending).toFixed(1))) : 999;

        return {
          leave_type_id: lt.id,
          leave_type_name: lt.name,
          leave_type_code: lt.code,
          is_paid: lt.is_paid,
          year,
          entitled_days: entitled,
          used_days: used,
          pending_days: pending,
          available_days: available,
        };
      })
    );

    return res.json({
      staff: {
        id: staff.id,
        employee_id: staff.employee_id,
        name: `${staff.first_name} ${staff.last_name || ''}`.trim(),
        branch_name: staff.Branch?.name || '—',
      },
      year,
      data: balances,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leaves/:id
 * Get single leave request details.
 */
export const getLeaveById = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const branchScope = resolveBranchScope(req);
    const { id } = req.params;

    const leave = await LeaveRequest.findOne({
      where: { id, tenant_id: tenantId },
      include: [
        { model: StaffProfile, as: 'StaffProfile', attributes: ['id', 'first_name', 'last_name', 'employee_id', 'department', 'designation'] },
        { model: LeaveType, as: 'LeaveType', attributes: ['id', 'name', 'code', 'is_paid'] },
        { model: Branch, as: 'Branch', attributes: ['id', 'name'] },
        { model: User, as: 'CreatedBy', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'ApprovedBy', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'CancelledBy', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!leave) throw new AppError('Leave request not found', 404);

    if (branchScope && leave.branch_id !== branchScope) {
      throw new AppError('Access denied: You cannot view leaves outside your assigned branch', 403);
    }

    return res.json({ data: leave });
  } catch (err) {
    next(err);
  }
};

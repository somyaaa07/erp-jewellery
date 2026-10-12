// backend/src/controllers/attendanceController.js
import { Op } from 'sequelize';
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import {
  calculateAttendanceMetrics,
  validatePunchTimes,
} from '../utils/attendanceCalculator.js';

const { Attendance, StaffProfile, Shift, Branch, User, AuditLog, LeaveRequest, LeaveType, sequelize } = db;

const VALID_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'WEEKLY_OFF', 'HOLIDAY', 'ON_LEAVE'];

function resolveTenantId(req) {
  if (req.user.role === 'SUPER_ADMIN') {
    return req.query.tenant_id ? parseInt(req.query.tenant_id, 10) : req.user.tenant_id;
  }
  return req.user.tenant_id;
}

function resolveBranchScope(req) {
  if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
    return null;
  }
  return req.user.branch_id || null;
}

/**
 * GET /api/attendance
 * Daily Attendance view with real-time statistics cards, employee join, and pagination.
 * Distinguishes NOT_MARKED from ABSENT without creating dummy database rows.
 */
export const listDailyAttendance = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) throw new AppError('Tenant context required', 403);

    const branchScope = resolveBranchScope(req);
    const {
      date = new Date().toISOString().split('T')[0],
      branch_id,
      department,
      status,
      search,
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'ASC',
    } = req.query;

    let targetBranchId = null;
    if (branchScope) {
      if (branch_id && parseInt(branch_id, 10) !== branchScope) {
        throw new AppError('Access denied: You are only authorized to view your branch attendance', 403);
      }
      targetBranchId = branchScope;
    } else if (branch_id) {
      targetBranchId = parseInt(branch_id, 10);
    }

    // 1. Build where clause for staff directory in scope
    const staffWhere = {
      tenant_id: tenantId,
      status: { [Op.in]: ['ACTIVE', 'ON_LEAVE'] }, // Active personnel
    };
    if (targetBranchId) {
      staffWhere.branch_id = targetBranchId;
    }
    if (department && department.trim()) {
      staffWhere.department = department.trim();
    }
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      staffWhere[Op.or] = [
        { first_name: { [Op.like]: q } },
        { last_name: { [Op.like]: q } },
        { employee_id: { [Op.like]: q } },
        { email: { [Op.like]: q } },
        { phone: { [Op.like]: q } },
      ];
    }

    // Fetch all staff members matching filters
    const staffMembers = await StaffProfile.findAll({
      where: staffWhere,
      include: [
        { model: Branch, as: 'Branch', attributes: ['id', 'name'] },
        { model: Shift, as: 'AssignedShift', attributes: ['id', 'name', 'start_time', 'end_time', 'is_overnight', 'grace_period_minutes', 'half_day_threshold_hours'] },
        { model: User, as: 'User', attributes: ['id', 'email', 'role'] },
      ],
      order: [
        ['first_name', sortOrder === 'DESC' ? 'DESC' : 'ASC'],
      ],
    });

    const staffIds = staffMembers.map((s) => s.id);

    // 2. Fetch existing attendance records for this date and tenant
    const attendanceWhere = {
      tenant_id: tenantId,
      attendance_date: date,
      staff_id: { [Op.in]: staffIds.length ? staffIds : [-1] },
    };
    if (targetBranchId) {
      attendanceWhere.branch_id = targetBranchId;
    }

    const attendanceRecords = await Attendance.findAll({
      where: attendanceWhere,
      include: [
        { model: Shift, as: 'Shift', attributes: ['id', 'name', 'start_time', 'end_time', 'is_overnight'] },
        { model: User, as: 'CorrectedBy', attributes: ['id', 'name', 'email'] },
      ],
    });

    // Map attendances by staff_id for O(1) lookup
    const attendanceMap = new Map();
    attendanceRecords.forEach((att) => {
      attendanceMap.set(att.staff_id, att);
    });

    // 2b. Fetch active approved leaves covering this date
    const approvedLeaves = await LeaveRequest.findAll({
      where: {
        tenant_id: tenantId,
        staff_id: { [Op.in]: staffIds.length ? staffIds : [-1] },
        status: 'APPROVED',
        start_date: { [Op.lte]: date },
        end_date: { [Op.gte]: date },
      },
      include: [
        { model: LeaveType, as: 'LeaveType', attributes: ['id', 'name', 'code', 'is_paid'] },
      ],
    });

    const leaveMap = new Map();
    approvedLeaves.forEach((l) => {
      leaveMap.set(l.staff_id, l);
    });

    // 3. Compute Summary KPI stats from real database state
    const summary = {
      total_staff: staffMembers.length,
      present: 0,
      absent: 0,
      half_day: 0,
      on_leave: 0,
      weekly_off: 0,
      holiday: 0,
      not_marked: 0,
    };

    // Build unified rows
    let unifiedRows = staffMembers.map((staff) => {
      const att = attendanceMap.get(staff.id);
      const leave = leaveMap.get(staff.id);

      let rowStatus = 'NOT_MARKED';
      let leaveConflict = false;
      let conflictDetails = null;

      if (att) {
        // Attendance punch exists: never overwrite punch status
        rowStatus = att.status;

        // Check if employee has an overlapping approved leave
        if (leave) {
          if (att.status === 'PRESENT' || att.status === 'HALF_DAY') {
            leaveConflict = true;
            conflictDetails = {
              type: 'PUNCH_WHILE_ON_LEAVE',
              message: `Employee was marked ${att.status} while having an approved leave (${leave.LeaveType?.name || 'Leave'})`,
              leave_id: leave.id,
              leave_type_name: leave.LeaveType?.name,
              attendance_status: att.status,
            };
          } else if (att.status === 'ABSENT') {
            leaveConflict = true;
            conflictDetails = {
              type: 'ABSENT_OVER_APPROVED_LEAVE',
              message: `Employee was marked ABSENT despite having an approved leave (${leave.LeaveType?.name || 'Leave'})`,
              leave_id: leave.id,
              leave_type_name: leave.LeaveType?.name,
              attendance_status: att.status,
            };
          }
        }
      } else {
        // No attendance punch exists
        if (leave) {
          // Dynamically appears as ON_LEAVE without creating dummy database rows
          rowStatus = 'ON_LEAVE';
        } else {
          rowStatus = 'NOT_MARKED';
        }
      }

      // Aggregate counts in KPI summary
      if (rowStatus === 'PRESENT') summary.present++;
      else if (rowStatus === 'ABSENT') summary.absent++;
      else if (rowStatus === 'HALF_DAY') summary.half_day++;
      else if (rowStatus === 'ON_LEAVE') summary.on_leave++;
      else if (rowStatus === 'WEEKLY_OFF') summary.weekly_off++;
      else if (rowStatus === 'HOLIDAY') summary.holiday++;
      else summary.not_marked++;

      const shiftData = att?.Shift || staff.AssignedShift || null;

      // Only actual attendance records with PRESENT or HALF_DAY have real punch in/out times.
      // Non-working statuses (ON_LEAVE, ABSENT, WEEKLY_OFF, HOLIDAY, NOT_MARKED) or virtual ON_LEAVE have no actual punches.
      const hasRealPunch = Boolean(
        att &&
        ['PRESENT', 'HALF_DAY'].includes(att.status) &&
        att.actual_check_in
      );

      return {
        staff_id: staff.id,
        employee_id: staff.employee_id,
        name: `${staff.first_name} ${staff.last_name || ''}`.trim(),
        department: staff.department,
        designation: staff.designation,
        branch_id: staff.branch_id,
        branch_name: staff.Branch?.name || '—',
        shift_id: att?.shift_id || staff.assigned_shift_id || null,
        shift_name: att?.shift_name || shiftData?.name || '—',
        scheduled_check_in: att?.scheduled_check_in || shiftData?.start_time || null,
        scheduled_check_out: att?.scheduled_check_out || shiftData?.end_time || null,
        is_overnight: att?.is_overnight ?? shiftData?.is_overnight ?? false,
        actual_check_in: hasRealPunch ? att.actual_check_in : null,
        actual_check_out: hasRealPunch ? att.actual_check_out : null,
        status: rowStatus,
        late_minutes: hasRealPunch ? (att?.late_minutes || 0) : 0,
        early_departure_minutes: hasRealPunch ? (att?.early_departure_minutes || 0) : 0,
        working_hours: hasRealPunch ? (att?.working_hours ?? null) : null,
        remarks: att?.remarks || null,
        attendance_id: att?.id || null,
        leave_id: leave?.id || null,
        leave_type_name: leave?.LeaveType?.name || null,
        leave_conflict: leaveConflict,
        conflict_details: conflictDetails,
        correction_reason: att?.correction_reason || null,
        corrected_at: att?.corrected_at || null,
        corrected_by: att?.CorrectedBy ? att.CorrectedBy.name : null,
      };
    });

    // 4. Apply status filter if requested
    if (status && status.trim()) {
      const filterStatus = status.trim().toUpperCase();
      unifiedRows = unifiedRows.filter((r) => r.status === filterStatus);
    }

    // 5. Pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const totalCount = unifiedRows.length;
    const totalPages = Math.ceil(totalCount / limitNum) || 1;
    const paginatedRows = unifiedRows.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return res.json({
      data: paginatedRows,
      summary,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
      date,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendance/:id
 * Single attendance record
 */
export const getAttendanceById = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const record = await Attendance.findOne({
      where: { id, tenant_id: tenantId },
      include: [
        {
          model: StaffProfile,
          as: 'StaffProfile',
          attributes: ['id', 'first_name', 'last_name', 'employee_id', 'department', 'designation', 'phone'],
        },
        { model: Shift, as: 'Shift' },
        { model: Branch, as: 'Branch', attributes: ['id', 'name'] },
        { model: User, as: 'CorrectedBy', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!record) throw new AppError('Attendance record not found', 404);

    // Manager branch restriction
    if (req.user.role === 'MANAGER' && record.branch_id !== req.user.branch_id) {
      throw new AppError('Access denied to attendance outside your assigned branch', 403);
    }

    return res.json({ data: record });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/attendance
 * Manual Attendance Marking (Single Employee)
 */
export const markAttendance = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) throw new AppError('Tenant context required', 403);

    const {
      staff_id,
      attendance_date,
      status,
      shift_id,
      actual_check_in,
      actual_check_out,
      remarks,
    } = req.body;

    if (!staff_id || !attendance_date || !status) {
      throw new AppError('staff_id, attendance_date, and status are required', 400);
    }

    if (!VALID_STATUSES.includes(status)) {
      throw new AppError(`Invalid attendance status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    }

    // 1. Verify staff belongs to tenant and get profile
    const staff = await StaffProfile.findOne({
      where: { id: staff_id, tenant_id: tenantId },
      transaction,
    });
    if (!staff) throw new AppError('Staff member not found in this tenant', 404);

    // Manager authorization check
    if (req.user.role === 'MANAGER' && staff.branch_id !== req.user.branch_id) {
      throw new AppError('Access denied: You can only mark attendance for staff in your branch', 403);
    }

    // 2. Prevent duplicate attendance records
    const existing = await Attendance.findOne({
      where: {
        tenant_id: tenantId,
        staff_id: staff.id,
        attendance_date,
      },
      transaction,
    });
    if (existing) {
      throw new AppError(
        `Attendance already exists for employee ${staff.employee_id || staff.first_name} on ${attendance_date}. Use Edit or Correction to update.`,
        400
      );
    }

    // 3. Resolve shift schedule
    let targetShiftId = shift_id ? parseInt(shift_id, 10) : staff.assigned_shift_id;
    let shift = null;
    if (targetShiftId) {
      shift = await Shift.findOne({
        where: { id: targetShiftId, tenant_id: tenantId },
        transaction,
      });
    }

    // 4. Validate punch times
    const isOvernight = shift?.is_overnight || false;
    if (status === 'PRESENT' && !actual_check_in) {
      throw new AppError('Actual check-in time is required for PRESENT status', 400);
    }
    validatePunchTimes(actual_check_in, actual_check_out, isOvernight);

    // 5. Authoritative calculation of late minutes, early departure, working hours
    const metrics = calculateAttendanceMetrics(shift, actual_check_in, actual_check_out);

    // 6. Create attendance record with historical schedule snapshots
    const record = await Attendance.create(
      {
        tenant_id: tenantId,
        branch_id: staff.branch_id || req.user.branch_id,
        staff_id: staff.id,
        user_id: staff.user_id || null,
        attendance_date,
        shift_id: shift ? shift.id : null,
        shift_name: shift ? shift.name : null,
        scheduled_check_in: shift ? shift.start_time : null,
        scheduled_check_out: shift ? shift.end_time : null,
        is_overnight: metrics.is_overnight,
        actual_check_in: ['PRESENT', 'HALF_DAY'].includes(status) ? (actual_check_in || null) : null,
        actual_check_out: ['PRESENT', 'HALF_DAY'].includes(status) ? (actual_check_out || null) : null,
        status,
        late_minutes: ['PRESENT', 'HALF_DAY'].includes(status) ? metrics.late_minutes : 0,
        early_departure_minutes: ['PRESENT', 'HALF_DAY'].includes(status) ? metrics.early_departure_minutes : 0,
        working_hours: ['PRESENT', 'HALF_DAY'].includes(status) ? metrics.working_hours : null,
        remarks: remarks || null,
      },
      {
        transaction,
        userId: req.user.id,
      }
    );

    await transaction.commit();

    return res.status(201).json({
      message: 'Attendance marked successfully',
      data: record,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

/**
 * PUT /api/attendance/:id
 * Update attendance details
 */
export const updateAttendance = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const record = await Attendance.findOne({
      where: { id, tenant_id: tenantId },
      transaction,
    });
    if (!record) throw new AppError('Attendance record not found', 404);

    if (req.user.role === 'MANAGER' && record.branch_id !== req.user.branch_id) {
      throw new AppError('Access denied to attendance outside your branch', 403);
    }

    const {
      status,
      shift_id,
      actual_check_in,
      actual_check_out,
      remarks,
    } = req.body;

    if (status && !VALID_STATUSES.includes(status)) {
      throw new AppError(`Invalid status: ${status}`, 400);
    }

    // Resolve shift if changed
    let shift = null;
    const targetShiftId = shift_id !== undefined ? (shift_id ? parseInt(shift_id, 10) : null) : record.shift_id;
    if (targetShiftId) {
      shift = await Shift.findOne({
        where: { id: targetShiftId, tenant_id: tenantId },
        transaction,
      });
      if (shift) {
        record.shift_id = shift.id;
        record.shift_name = shift.name;
        record.scheduled_check_in = shift.start_time;
        record.scheduled_check_out = shift.end_time;
        record.is_overnight = shift.is_overnight;
      }
    }

    const effectiveCheckIn = actual_check_in !== undefined ? actual_check_in : record.actual_check_in;
    const effectiveCheckOut = actual_check_out !== undefined ? actual_check_out : record.actual_check_out;

    validatePunchTimes(effectiveCheckIn, effectiveCheckOut, record.is_overnight);

    // Recompute metrics
    const shiftSpec = {
      start_time: record.scheduled_check_in,
      end_time: record.scheduled_check_out,
      is_overnight: record.is_overnight,
    };
    const metrics = calculateAttendanceMetrics(shiftSpec, effectiveCheckIn, effectiveCheckOut);

    if (status) record.status = status;
    const isPunched = ['PRESENT', 'HALF_DAY'].includes(record.status);
    record.actual_check_in = isPunched ? effectiveCheckIn : null;
    record.actual_check_out = isPunched ? effectiveCheckOut : null;
    record.late_minutes = isPunched ? metrics.late_minutes : 0;
    record.early_departure_minutes = isPunched ? metrics.early_departure_minutes : 0;
    record.working_hours = isPunched ? metrics.working_hours : null;
    if (remarks !== undefined) record.remarks = remarks;

    await record.save({ transaction, userId: req.user.id });
    await transaction.commit();

    return res.json({
      message: 'Attendance updated successfully',
      data: record,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

/**
 * PATCH /api/attendance/:id/checkout
 * Evening Check-out workflow: updates actual_check_out on the existing record.
 */
export const recordCheckOut = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;
    const { actual_check_out } = req.body;

    if (!actual_check_out) {
      throw new AppError('actual_check_out time is required', 400);
    }

    const record = await Attendance.findOne({
      where: { id, tenant_id: tenantId },
      transaction,
    });
    if (!record) throw new AppError('Attendance record not found', 404);

    if (req.user.role === 'MANAGER' && record.branch_id !== req.user.branch_id) {
      throw new AppError('Access denied: Cannot checkout employee outside your branch', 403);
    }

    validatePunchTimes(record.actual_check_in, actual_check_out, record.is_overnight);

    const shiftSpec = {
      start_time: record.scheduled_check_in,
      end_time: record.scheduled_check_out,
      is_overnight: record.is_overnight,
    };
    const metrics = calculateAttendanceMetrics(shiftSpec, record.actual_check_in, actual_check_out);

    record.actual_check_out = actual_check_out;
    record.early_departure_minutes = metrics.early_departure_minutes;
    record.working_hours = metrics.working_hours;

    await record.save({ transaction, userId: req.user.id });
    await transaction.commit();

    return res.json({
      message: 'Checkout recorded successfully',
      data: record,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

/**
 * PATCH /api/attendance/:id/correction
 * Audited attendance correction with mandatory correction_reason.
 */
export const correctAttendance = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;
    const {
      correction_reason,
      status,
      actual_check_in,
      actual_check_out,
      remarks,
    } = req.body;

    if (!correction_reason || !correction_reason.trim()) {
      throw new AppError('A valid correction reason is required to correct attendance', 400);
    }

    const record = await Attendance.findOne({
      where: { id, tenant_id: tenantId },
      transaction,
    });
    if (!record) throw new AppError('Attendance record not found', 404);

    if (req.user.role === 'MANAGER' && record.branch_id !== req.user.branch_id) {
      throw new AppError('Access denied to attendance record outside your branch', 403);
    }

    const beforeData = {
      status: record.status,
      actual_check_in: record.actual_check_in,
      actual_check_out: record.actual_check_out,
      working_hours: record.working_hours,
      late_minutes: record.late_minutes,
      early_departure_minutes: record.early_departure_minutes,
      remarks: record.remarks,
    };

    const effectiveIn = actual_check_in !== undefined ? actual_check_in : record.actual_check_in;
    const effectiveOut = actual_check_out !== undefined ? actual_check_out : record.actual_check_out;

    validatePunchTimes(effectiveIn, effectiveOut, record.is_overnight);

    const shiftSpec = {
      start_time: record.scheduled_check_in,
      end_time: record.scheduled_check_out,
      is_overnight: record.is_overnight,
    };
    const metrics = calculateAttendanceMetrics(shiftSpec, effectiveIn, effectiveOut);

    if (status) record.status = status;
    const isPunched = ['PRESENT', 'HALF_DAY'].includes(record.status);
    record.actual_check_in = isPunched ? effectiveIn : null;
    record.actual_check_out = isPunched ? effectiveOut : null;
    record.late_minutes = isPunched ? metrics.late_minutes : 0;
    record.early_departure_minutes = isPunched ? metrics.early_departure_minutes : 0;
    record.working_hours = isPunched ? metrics.working_hours : null;
    record.correction_reason = correction_reason.trim();
    record.corrected_by_id = req.user.id;
    record.corrected_at = new Date();
    if (remarks !== undefined) record.remarks = remarks;

    await record.save({ transaction, userId: req.user.id });

    // Explicit audit log row recording correction rationale
    await AuditLog.create(
      {
        tenant_id: tenantId,
        table_name: 'attendances',
        record_id: record.id,
        action: 'UPDATE',
        before_data: { ...beforeData, reason: 'PRE_CORRECTION' },
        after_data: {
          ...record.toJSON(),
          correction_reason: correction_reason.trim(),
        },
        operator_id: req.user.id,
      },
      { transaction }
    );

    await transaction.commit();

    return res.json({
      message: 'Attendance corrected successfully',
      data: record,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

/**
 * POST /api/attendance/bulk
 * Bulk Attendance Marking for branch staff
 */
export const bulkMarkAttendance = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) throw new AppError('Tenant context required', 403);

    const {
      date = new Date().toISOString().split('T')[0],
      branch_id,
      records = [],
    } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      throw new AppError('An array of employee attendance records is required', 400);
    }

    const branchScope = resolveBranchScope(req);
    let targetBranchId = branchScope;
    if (!branchScope && branch_id) {
      targetBranchId = parseInt(branch_id, 10);
    }

    const outcomes = {
      success: [],
      skipped: [],
      errors: [],
    };

    for (const item of records) {
      const {
        staff_id,
        status = 'PRESENT',
        shift_id,
        actual_check_in,
        actual_check_out,
        remarks,
      } = item;

      if (!staff_id) {
        outcomes.errors.push({ staff_id: null, error: 'staff_id is required' });
        continue;
      }

      const tx = await sequelize.transaction();
      try {
        const staff = await StaffProfile.findOne({
          where: { id: staff_id, tenant_id: tenantId },
          transaction: tx,
        });

        if (!staff) {
          await tx.rollback();
          outcomes.errors.push({ staff_id, error: 'Staff member not found in tenant' });
          continue;
        }

        if (branchScope && staff.branch_id !== branchScope) {
          await tx.rollback();
          outcomes.errors.push({ staff_id, error: 'Access denied: Staff outside your assigned branch' });
          continue;
        }

        // Check duplicate
        const existing = await Attendance.findOne({
          where: { tenant_id: tenantId, staff_id: staff.id, attendance_date: date },
          transaction: tx,
        });

        if (existing) {
          await tx.rollback();
          outcomes.skipped.push({
            staff_id: staff.id,
            employee_id: staff.employee_id,
            reason: 'Attendance record already exists for this date',
          });
          continue;
        }

        // Resolve shift
        const targetShiftId = shift_id || staff.assigned_shift_id;
        let shift = null;
        if (targetShiftId) {
          shift = await Shift.findOne({
            where: { id: targetShiftId, tenant_id: tenantId },
            transaction: tx,
          });
        }

        validatePunchTimes(actual_check_in, actual_check_out, shift?.is_overnight);
        const metrics = calculateAttendanceMetrics(shift, actual_check_in, actual_check_out);

        const newRec = await Attendance.create(
          {
            tenant_id: tenantId,
            branch_id: staff.branch_id || targetBranchId || req.user.branch_id,
            staff_id: staff.id,
            user_id: staff.user_id || null,
            attendance_date: date,
            shift_id: shift ? shift.id : null,
            shift_name: shift ? shift.name : null,
            scheduled_check_in: shift ? shift.start_time : null,
            scheduled_check_out: shift ? shift.end_time : null,
            is_overnight: metrics.is_overnight,
            actual_check_in: actual_check_in || null,
            actual_check_out: actual_check_out || null,
            status,
            late_minutes: metrics.late_minutes,
            early_departure_minutes: metrics.early_departure_minutes,
            working_hours: metrics.working_hours,
            remarks: remarks || null,
          },
          { transaction: tx, userId: req.user.id }
        );

        await tx.commit();
        outcomes.success.push({
          staff_id: staff.id,
          employee_id: staff.employee_id,
          attendance_id: newRec.id,
        });
      } catch (itemErr) {
        await tx.rollback();
        outcomes.errors.push({ staff_id, error: itemErr.message });
      }
    }

    return res.json({
      message: `Bulk attendance completed: ${outcomes.success.length} marked, ${outcomes.skipped.length} skipped, ${outcomes.errors.length} errors`,
      data: outcomes,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendance/employee/:staffId/history
 * Chronological attendance history for a single employee
 */
export const getEmployeeAttendanceHistory = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { staffId } = req.params;
    const { month, startDate, endDate } = req.query;

    const staff = await StaffProfile.findOne({
      where: { id: staffId, tenant_id: tenantId },
      include: [
        { model: Branch, as: 'Branch', attributes: ['id', 'name'] },
        { model: Shift, as: 'AssignedShift', attributes: ['id', 'name'] },
      ],
    });
    if (!staff) throw new AppError('Staff member not found', 404);

    // Manager branch restriction
    if (req.user.role === 'MANAGER' && staff.branch_id !== req.user.branch_id) {
      throw new AppError('Access denied: Staff outside your branch', 403);
    }

    // Salesman / Karigar self-service check: can only view own history
    if (['SALESMAN', 'KARIGAR_INCHARGE'].includes(req.user.role)) {
      if (staff.user_id !== req.user.id) {
        throw new AppError('Access denied: You can only view your own attendance history', 403);
      }
    }

    const where = { tenant_id: tenantId, staff_id: staff.id };

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, m] = month.split('-').map(Number);
      const start = `${month}-01`;
      const lastDay = new Date(year, m, 0).getDate();
      const end = `${month}-${String(lastDay).padStart(2, '0')}`;
      where.attendance_date = { [Op.between]: [start, end] };
    } else if (startDate && endDate) {
      where.attendance_date = { [Op.between]: [startDate, endDate] };
    }

    const records = await Attendance.findAll({
      where,
      include: [
        { model: Shift, as: 'Shift', attributes: ['id', 'name', 'start_time', 'end_time'] },
        { model: User, as: 'CorrectedBy', attributes: ['id', 'name'] },
      ],
      order: [['attendance_date', 'DESC']],
    });

    return res.json({
      employee: {
        id: staff.id,
        employee_id: staff.employee_id,
        name: `${staff.first_name} ${staff.last_name || ''}`.trim(),
        department: staff.department,
        designation: staff.designation,
        branch: staff.Branch?.name || '—',
      },
      data: records,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendance/monthly-report
 * Monthly aggregated report by employee.
 * Explicitly distinguishes actual records from unmarked days.
 */
export const getMonthlyReport = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) throw new AppError('Tenant context required', 403);

    const {
      month = new Date().toISOString().slice(0, 7), // "YYYY-MM"
      branch_id,
      department,
      staff_id,
    } = req.query;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError('Invalid month format. Please use YYYY-MM', 400);
    }

    const [year, m] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const lastDay = new Date(year, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    const branchScope = resolveBranchScope(req);
    let targetBranchId = branchScope;
    if (!branchScope && branch_id) {
      targetBranchId = parseInt(branch_id, 10);
    }

    // 1. Fetch staff members in scope
    const staffWhere = { tenant_id: tenantId };
    if (targetBranchId) staffWhere.branch_id = targetBranchId;
    if (department && department.trim()) staffWhere.department = department.trim();
    if (staff_id) staffWhere.id = parseInt(staff_id, 10);

    const staffList = await StaffProfile.findAll({
      where: staffWhere,
      include: [{ model: Branch, as: 'Branch', attributes: ['id', 'name'] }],
      order: [['first_name', 'ASC']],
    });

    const staffIds = staffList.map((s) => s.id);

    // 2. Fetch all attendance records in the month
    const attWhere = {
      tenant_id: tenantId,
      attendance_date: { [Op.between]: [startDate, endDate] },
      staff_id: { [Op.in]: staffIds.length ? staffIds : [-1] },
    };

    const attendanceRecords = await Attendance.findAll({
      where: attWhere,
    });

    // Group records by staff_id
    const attByStaff = new Map();
    attendanceRecords.forEach((att) => {
      if (!attByStaff.has(att.staff_id)) {
        attByStaff.set(att.staff_id, []);
      }
      attByStaff.get(att.staff_id).push(att);
    });

    // 2b. Fetch active approved leave requests covering the month
    const approvedMonthLeaves = await LeaveRequest.findAll({
      where: {
        tenant_id: tenantId,
        staff_id: { [Op.in]: staffIds.length ? staffIds : [-1] },
        status: 'APPROVED',
        start_date: { [Op.lte]: endDate },
        end_date: { [Op.gte]: startDate },
      },
      include: [{ model: LeaveType, as: 'LeaveType', attributes: ['id', 'name', 'code', 'is_paid', 'exclude_weekly_offs'] }],
    });

    const leavesByStaff = new Map();
    approvedMonthLeaves.forEach((l) => {
      if (!leavesByStaff.has(l.staff_id)) leavesByStaff.set(l.staff_id, []);
      leavesByStaff.get(l.staff_id).push(l);
    });

    // 3. Compute aggregations per employee
    const reportData = staffList.map((staff) => {
      const records = attByStaff.get(staff.id) || [];

      let presentDays = 0;
      let absentDays = 0;
      let halfDays = 0;
      let onLeaveDays = 0;
      let weeklyOffs = 0;
      let holidays = 0;
      let lateDays = 0;
      let totalWorkingHours = 0;

      records.forEach((r) => {
        if (r.status === 'PRESENT') presentDays++;
        else if (r.status === 'ABSENT') absentDays++;
        else if (r.status === 'HALF_DAY') halfDays++;
        else if (r.status === 'ON_LEAVE') onLeaveDays++;
        else if (r.status === 'WEEKLY_OFF') weeklyOffs++;
        else if (r.status === 'HOLIDAY') holidays++;

        if (r.late_minutes > 0) lateDays++;
        if (r.working_hours !== null && !Number.isNaN(Number(r.working_hours))) {
          totalWorkingHours += Number(r.working_hours);
        }
      });

      // Add dynamic ON_LEAVE days for dates covered by approved leave with no punch attendance
      const staffLeaves = leavesByStaff.get(staff.id) || [];
      const recordedDates = new Set(records.map((r) => r.attendance_date));

      staffLeaves.forEach((leave) => {
        const lStart = leave.start_date < startDate ? startDate : leave.start_date;
        const lEnd = leave.end_date > endDate ? endDate : leave.end_date;

        let cur = new Date(lStart + 'T00:00:00Z');
        const endDt = new Date(lEnd + 'T00:00:00Z');
        while (cur <= endDt) {
          const dStr = cur.toISOString().split('T')[0];
          if (!recordedDates.has(dStr)) {
            const isSun = cur.getUTCDay() === 0;
            if (!leave.LeaveType?.exclude_weekly_offs || !isSun) {
              onLeaveDays += leave.is_half_day ? 0.5 : 1.0;
              recordedDates.add(dStr);
            }
          }
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      });

      return {
        staff_id: staff.id,
        employee_id: staff.employee_id,
        name: `${staff.first_name} ${staff.last_name || ''}`.trim(),
        department: staff.department || '—',
        designation: staff.designation || '—',
        branch_name: staff.Branch?.name || '—',
        present_days: presentDays,
        absent_days: absentDays,
        half_days: halfDays,
        on_leave_days: onLeaveDays,
        weekly_offs: weeklyOffs,
        holidays: holidays,
        late_days: lateDays,
        total_working_hours: Number(totalWorkingHours.toFixed(2)),
      };
    });

    return res.json({
      month,
      startDate,
      endDate,
      data: reportData,
    });
  } catch (err) {
    next(err);
  }
};

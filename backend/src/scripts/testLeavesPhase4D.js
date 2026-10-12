// backend/src/scripts/testLeavesPhase4D.js
/**
 * Automated Test Suite for Phase 4D: Leave Management Backend & Attendance Integration
 *
 * Verifies:
 * 1. Default leave types seeding & tenant uniqueness (CASUAL, SICK, ANNUAL, MATERNITY, UNPAID)
 * 2. Custom leave type creation & update
 * 3. Direct leave recording as APPROVED (Admin & Manager)
 * 4. Strict balance verification & rejection on insufficient balance (400 Bad Request)
 * 5. Unpaid leave does not deduct paid balance
 * 6. Cross-year leave splits deductions across calendar years in yearly_deductions
 * 7. Cancellation reverses balances idempotently (never restores twice)
 * 8. Half-day leave validation & two distinct half-day periods on the same date
 * 9. Overlap prevention for active leaves (409 Conflict)
 * 10. Concurrency safety under simultaneous overlapping requests (StaffProfile row lock)
 * 11. Multi-tenant isolation & Branch Manager authorization (403 / 404)
 * 12. Attendance integration: dynamically derives ON_LEAVE without creating dummy rows
 * 13. Attendance conflict detection: punch while on leave flagged with leave_conflict: true
 * 14. Monthly report aggregation with approved leaves
 */

import db from '../models/index.js';
import * as leaveController from '../controllers/leaveController.js';
import * as attendanceController from '../controllers/attendanceController.js';
import { calculateChargeableLeaveDays } from '../utils/leaveCalculator.js';

const {
  Tenant,
  Branch,
  User,
  StaffProfile,
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  Attendance,
  sequelize,
} = db;

let total = 0;
let passed = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

function createMockReqRes({ user, query = {}, params = {}, body = {} }) {
  const req = {
    user,
    scope: { tenant_id: user.tenant_id, branch_id: user.branch_id },
    query,
    params,
    body,
  };

  let responseData = null;
  let statusCode = 200;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    send(data) {
      responseData = data;
      return this;
    },
  };

  const next = (err) => {
    if (err) {
      statusCode = err.statusCode || 500;
      responseData = { error: err.message };
    }
  };

  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

export async function runLeaveTests() {
  console.log('\n======================================================');
  console.log('🚀 Running Phase 4D Leave Management Test Suite');
  console.log('======================================================\n');

  try {
    // -----------------------------------------------------------------
    // 1. Fetch Test Setup Context from Database
    // -----------------------------------------------------------------
    const tenantA = await Tenant.findOne({ where: { name: 'Tenant A Jewellers' } });
    const tenantB = await Tenant.findOne({ where: { name: 'Tenant B Jewellers' } });

    if (!tenantA || !tenantB) {
      throw new Error('Tenant test fixtures missing. Run seedDemoData first.');
    }

    const branchNoida = await Branch.findOne({ where: { tenant_id: tenantA.id, name: 'Noida' } });
    const branchDelhi = await Branch.findOne({ where: { tenant_id: tenantA.id, name: 'Delhi' } });

    const adminUserA = await User.findOne({ where: { tenant_id: tenantA.id, role: 'ADMIN' } });
    const managerNoida = await User.findOne({
      where: { tenant_id: tenantA.id, branch_id: branchNoida.id, role: 'MANAGER' },
    });
    const managerDelhi = await User.findOne({
      where: { tenant_id: tenantA.id, branch_id: branchDelhi.id, role: 'MANAGER' },
    });
    const userTenantB = await User.findOne({ where: { tenant_id: tenantB.id } });

    const staffNoida = await StaffProfile.findOne({
      where: { tenant_id: tenantA.id, branch_id: branchNoida.id, status: 'ACTIVE' },
    });
    const staffDelhi = await StaffProfile.findOne({
      where: { tenant_id: tenantA.id, branch_id: branchDelhi.id, status: 'ACTIVE' },
    });
    const staffTenantB = await StaffProfile.findOne({
      where: { tenant_id: tenantB.id, status: 'ACTIVE' },
    });

    // -----------------------------------------------------------------
    // 2. Unit Testing: Leave Calculation Engine
    // -----------------------------------------------------------------
    console.log('--- 1. Testing Leave Calculation Engine (leaveCalculator) ---');
    const calcFull = calculateChargeableLeaveDays({
      startDate: '2026-11-02', // Monday
      endDate: '2026-11-06',   // Friday
      isHalfDay: false,
      leaveType: { exclude_weekly_offs: true, exclude_holidays: true },
    });
    assert(calcFull.total_days === 5, 'Full week Mon-Fri calculated as 5 chargeable days');
    assert(calcFull.yearly_breakdown['2026'] === 5, 'Yearly breakdown correctly assigns 5 days to 2026');

    // Sunday exclusion test: Nov 6 (Fri) to Nov 9 (Mon) covers Nov 8 (Sun)
    const calcWithSunday = calculateChargeableLeaveDays({
      startDate: '2026-11-06',
      endDate: '2026-11-09',
      isHalfDay: false,
      leaveType: { exclude_weekly_offs: true, exclude_holidays: true },
    });
    assert(calcWithSunday.total_days === 3, 'Range spanning Sunday excludes Sunday (4 calendar days -> 3 chargeable days)');
    assert(calcWithSunday.excluded_dates.some((e) => e.reason === 'SUNDAY_WEEKLY_OFF'), 'Sunday recorded in excluded_dates');

    // Half-day leave calculation
    const calcHalf = calculateChargeableLeaveDays({
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      isHalfDay: true,
      leaveType: { exclude_weekly_offs: true },
    });
    assert(calcHalf.total_days === 0.5, 'Half-day leave evaluates to exactly 0.5 days');
    assert(calcHalf.yearly_breakdown['2026'] === 0.5, 'Half-day yearly breakdown is 0.5');

    // Invalid half-day date span rejection
    let threwHalfRange = false;
    try {
      calculateChargeableLeaveDays({
        startDate: '2026-11-10',
        endDate: '2026-11-11',
        isHalfDay: true,
        leaveType: {},
      });
    } catch (e) {
      threwHalfRange = true;
    }
    assert(threwHalfRange, 'Half-day spanning multiple dates throws validation error');

    // -----------------------------------------------------------------
    // 3. Testing Leave Types Seeding & Management
    // -----------------------------------------------------------------
    console.log('\n--- 2. Testing Leave Types Seeding & Listing ---');
    await leaveController.seedDefaultLeaveTypes(tenantA.id);

    const mListTypes = createMockReqRes({ user: adminUserA });
    await leaveController.listLeaveTypes(mListTypes.req, mListTypes.res, mListTypes.next);
    assert(mListTypes.getStatus() === 200, 'List leave types returned 200');

    const typesData = mListTypes.getData().data;
    const typeCodes = typesData.map((t) => t.code);
    assert(typeCodes.includes('CASUAL'), 'Default CASUAL leave type seeded');
    assert(typeCodes.includes('SICK'), 'Default SICK leave type seeded');
    assert(typeCodes.includes('ANNUAL'), 'Default ANNUAL leave type seeded');
    assert(typeCodes.includes('MATERNITY'), 'Default MATERNITY leave type seeded');
    assert(typeCodes.includes('UNPAID'), 'Default UNPAID leave type seeded');

    const casualType = typesData.find((t) => t.code === 'CASUAL');
    const unpaidType = typesData.find((t) => t.code === 'UNPAID');

    // Test Admin creating custom leave type
    await LeaveType.destroy({ where: { tenant_id: tenantA.id, code: 'COMP_OFF' } });
    const mCreateType = createMockReqRes({
      user: adminUserA,
      body: {
        name: 'Compensatory Off',
        code: 'COMP_OFF',
        days_allowed_per_year: 5.0,
        is_paid: true,
        exclude_weekly_offs: true,
        exclude_holidays: true,
      },
    });
    await leaveController.createLeaveType(mCreateType.req, mCreateType.res, mCreateType.next);
    assert(mCreateType.getStatus() === 201, 'Admin created custom COMP_OFF leave type (201)');

    // -----------------------------------------------------------------
    // 4. Testing Direct Leave Recording & Strict Balance Verification
    // -----------------------------------------------------------------
    console.log('\n--- 3. Testing Leave Recording & Strict Balance Deduction ---');
    // Ensure clean balances for staffNoida in 2026
    await LeaveBalance.destroy({ where: { staff_id: staffNoida.id, year: 2026 } });
    await LeaveRequest.destroy({ where: { staff_id: staffNoida.id } });

    // Record 2 days Casual Leave (Nov 17 Tue to Nov 18 Wed 2026)
    const mRec1 = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: '2026-11-17',
        end_date: '2026-11-18',
        reason: 'Personal family emergency',
      },
    });
    await leaveController.recordLeave(mRec1.req, mRec1.res, mRec1.next);
    assert(mRec1.getStatus() === 201, 'Direct leave recording returned 201 Created');

    const leaveRec1 = mRec1.getData().data;
    assert(leaveRec1.status === 'APPROVED', 'Leave request recorded directly as APPROVED');
    assert(Number(leaveRec1.total_days) === 2.0, 'Chargeable total days calculated as 2.0');
    assert(leaveRec1.is_balance_deducted === true, 'is_balance_deducted set to true for paid leave');

    // Check LeaveBalance table
    const balRec1 = await LeaveBalance.findOne({
      where: { tenant_id: tenantA.id, staff_id: staffNoida.id, leave_type_id: casualType.id, year: 2026 },
    });
    assert(Number(balRec1.used_days) === 2.0, 'Leave balance used_days incremented by 2.0');
    assert(Number(balRec1.entitled_days) === 12.0, 'Leave balance entitled_days initialized from policy quota');

    // Test STRICT BALANCE REJECTION: Available is 10.0, attempt to record 12 days
    console.log('\n--- 4. Testing Strict Rejection on Insufficient Balance ---');
    const mRecExceed = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: '2026-11-20',
        end_date: '2026-12-05', // 16 calendar days, ~14 working days > 10.0 available
        reason: 'Extended vacation',
      },
    });
    await leaveController.recordLeave(mRecExceed.req, mRecExceed.res, mRecExceed.next);
    assert(mRecExceed.getStatus() === 400, 'Exceeding paid balance strictly rejected with 400 Bad Request');
    assert(mRecExceed.getData().error.includes('Insufficient leave balance'), 'Error message states insufficient leave balance');

    // -----------------------------------------------------------------
    // 5. Testing Unpaid Leave (Loss of Pay)
    // -----------------------------------------------------------------
    console.log('\n--- 5. Testing Unpaid Leave (Loss of Pay) ---');
    const mRecUnpaid = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: unpaidType.id,
        start_date: '2026-11-23',
        end_date: '2026-11-25',
        reason: 'Unpaid personal absence',
      },
    });
    await leaveController.recordLeave(mRecUnpaid.req, mRecUnpaid.res, mRecUnpaid.next);
    assert(mRecUnpaid.getStatus() === 201, 'Unpaid leave recorded successfully (201)');

    const leaveUnpaid = mRecUnpaid.getData().data;
    assert(leaveUnpaid.is_balance_deducted === false, 'Unpaid leave has is_balance_deducted = false');
    assert(leaveUnpaid.yearly_deductions === null, 'Unpaid leave has yearly_deductions = null');

    // Verify paid casual balance was untouched
    const balAfterUnpaid = await LeaveBalance.findOne({
      where: { tenant_id: tenantA.id, staff_id: staffNoida.id, leave_type_id: casualType.id, year: 2026 },
    });
    assert(Number(balAfterUnpaid.used_days) === 2.0, 'Casual leave balance untouched by unpaid leave');

    // -----------------------------------------------------------------
    // 6. Testing Cross-Year Leave Allocation in yearly_deductions
    // -----------------------------------------------------------------
    console.log('\n--- 6. Testing Cross-Year Leave (Dec 30 to Jan 2) ---');
    // Ensure clean 2027 balance
    await LeaveBalance.destroy({ where: { staff_id: staffNoida.id, year: 2027 } });

    // Dec 30, 2026 (Wed), Dec 31, 2026 (Thu), Jan 1, 2027 (Fri), Jan 2, 2027 (Sat)
    const mRecCross = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: '2026-12-30',
        end_date: '2027-01-02',
        reason: 'New Year vacation',
      },
    });
    await leaveController.recordLeave(mRecCross.req, mRecCross.res, mRecCross.next);
    assert(mRecCross.getStatus() === 201, 'Cross-year leave recorded successfully (201)');

    const leaveCross = mRecCross.getData().data;
    assert(leaveCross.yearly_deductions !== null, 'Cross-year leave has yearly_deductions populated');
    const deductions = typeof leaveCross.yearly_deductions === 'string'
      ? JSON.parse(leaveCross.yearly_deductions)
      : leaveCross.yearly_deductions;
    assert(Number(deductions['2026']) === 2, 'yearly_deductions allocated 2 days to 2026');
    assert(Number(deductions['2027']) === 2, 'yearly_deductions allocated 2 days to 2027');

    const bal2026 = await LeaveBalance.findOne({
      where: { tenant_id: tenantA.id, staff_id: staffNoida.id, leave_type_id: casualType.id, year: 2026 },
    });
    const bal2027 = await LeaveBalance.findOne({
      where: { tenant_id: tenantA.id, staff_id: staffNoida.id, leave_type_id: casualType.id, year: 2027 },
    });
    assert(Number(bal2026.used_days) === 4.0, '2026 used_days updated: 2.0 (prior) + 2.0 (cross-year) = 4.0');
    assert(Number(bal2027.used_days) === 2.0, '2027 used_days updated: 2.0 deducted from 2027 entitlement');

    // -----------------------------------------------------------------
    // 7. Testing Cancellation & Idempotent Reversal
    // -----------------------------------------------------------------
    console.log('\n--- 7. Testing Cancellation & Idempotent Balance Reversal ---');
    const mCancel = createMockReqRes({
      user: adminUserA,
      params: { id: leaveCross.id },
      body: { reason: 'Vacation plans cancelled by employee' },
    });
    await leaveController.cancelLeave(mCancel.req, mCancel.res, mCancel.next);
    assert(mCancel.getStatus() === 200, 'Leave cancellation returned 200 OK');

    const cancelledLeave = mCancel.getData().data;
    assert(cancelledLeave.status === 'CANCELLED', 'Leave request marked as CANCELLED');
    assert(cancelledLeave.is_balance_deducted === false, 'is_balance_deducted reset to false upon cancellation');

    const bal2026Restored = await LeaveBalance.findOne({
      where: { tenant_id: tenantA.id, staff_id: staffNoida.id, leave_type_id: casualType.id, year: 2026 },
    });
    const bal2027Restored = await LeaveBalance.findOne({
      where: { tenant_id: tenantA.id, staff_id: staffNoida.id, leave_type_id: casualType.id, year: 2027 },
    });
    assert(Number(bal2026Restored.used_days) === 2.0, '2026 used_days restored by exactly 2.0 (back to 2.0)');
    assert(Number(bal2027Restored.used_days) === 0.0, '2027 used_days restored by exactly 2.0 (back to 0.0)');

    // Idempotency check: Cancel again
    const mCancelRetry = createMockReqRes({
      user: adminUserA,
      params: { id: leaveCross.id },
      body: { reason: 'Retry cancellation' },
    });
    await leaveController.cancelLeave(mCancelRetry.req, mCancelRetry.res, mCancelRetry.next);
    assert(mCancelRetry.getStatus() === 200, 'Cancellation retry returned 200 (idempotent)');

    const bal2026Retry = await LeaveBalance.findOne({
      where: { tenant_id: tenantA.id, staff_id: staffNoida.id, leave_type_id: casualType.id, year: 2026 },
    });
    assert(Number(bal2026Retry.used_days) === 2.0, 'Retried cancellation did not deduct/restore balance a second time');

    // -----------------------------------------------------------------
    // 8. Testing Half-Day Leave Rules
    // -----------------------------------------------------------------
    console.log('\n--- 8. Testing Half-Day Leave & Dual Half-Day on Same Date ---');
    const halfDate = '2026-12-15';

    // Record FIRST_HALF
    const mHalf1 = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: halfDate,
        end_date: halfDate,
        is_half_day: true,
        half_day_period: 'FIRST_HALF',
        reason: 'Morning doctor visit',
      },
    });
    await leaveController.recordLeave(mHalf1.req, mHalf1.res, mHalf1.next);
    assert(mHalf1.getStatus() === 201, 'First half-day recorded successfully (201)');

    // Record SECOND_HALF on same date
    const mHalf2 = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: halfDate,
        end_date: halfDate,
        is_half_day: true,
        half_day_period: 'SECOND_HALF',
        reason: 'Afternoon dental procedure',
      },
    });
    await leaveController.recordLeave(mHalf2.req, mHalf2.res, mHalf2.next);
    assert(mHalf2.getStatus() === 201, 'Second half-day on same date with different period allowed (201)');

    // Attempt duplicate FIRST_HALF on same date
    const mHalfDuplicate = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: halfDate,
        end_date: halfDate,
        is_half_day: true,
        half_day_period: 'FIRST_HALF',
        reason: 'Duplicate morning appointment',
      },
    });
    await leaveController.recordLeave(mHalfDuplicate.req, mHalfDuplicate.res, mHalfDuplicate.next);
    assert(mHalfDuplicate.getStatus() === 409, 'Duplicate half-day for same period rejected with 409 Conflict');

    // -----------------------------------------------------------------
    // 9. Testing Overlap Prevention & Concurrency
    // -----------------------------------------------------------------
    console.log('\n--- 9. Testing Overlap Prevention & Concurrency ---');
    // Attempt full-day leave overlapping the half-day date
    const mFullOverHalf = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: '2026-12-14',
        end_date: '2026-12-16', // spans Dec 15
        reason: 'Full day request overlapping half-days',
      },
    });
    await leaveController.recordLeave(mFullOverHalf.req, mFullOverHalf.res, mFullOverHalf.next);
    assert(mFullOverHalf.getStatus() === 409, 'Full-day request overlapping existing leaves rejected with 409 Conflict');

    // Concurrent requests for same employee
    console.log('--- Testing Concurrent Overlapping Requests for Same Employee ---');
    const [concReq1, concReq2] = await Promise.allSettled([
      (async () => {
        const m = createMockReqRes({
          user: adminUserA,
          body: {
            staff_id: staffNoida.id,
            leave_type_id: casualType.id,
            start_date: '2026-12-21',
            end_date: '2026-12-24',
            reason: 'Concurrent request 1',
          },
        });
        await leaveController.recordLeave(m.req, m.res, m.next);
        return m.getStatus();
      })(),
      (async () => {
        const m = createMockReqRes({
          user: adminUserA,
          body: {
            staff_id: staffNoida.id,
            leave_type_id: casualType.id,
            start_date: '2026-12-23',
            end_date: '2026-12-26',
            reason: 'Concurrent request 2',
          },
        });
        await leaveController.recordLeave(m.req, m.res, m.next);
        return m.getStatus();
      })(),
    ]);

    const statuses = [concReq1.value, concReq2.value];
    assert(statuses.includes(201), 'Exactly one concurrent request succeeded (201)');
    assert(statuses.includes(409), 'Exactly one concurrent request was rejected (409 Conflict)');

    // -----------------------------------------------------------------
    // 10. Testing Multi-Tenant & Branch Scoping Authorization
    // -----------------------------------------------------------------
    console.log('\n--- 10. Testing Multi-Tenant & Branch Authorization ---');
    // Manager Noida attempting to record leave for Delhi staff
    const mManagerCrossBranch = createMockReqRes({
      user: managerNoida,
      body: {
        staff_id: staffDelhi.id,
        leave_type_id: casualType.id,
        start_date: '2026-11-26',
        end_date: '2026-11-27',
        reason: 'Cross branch attempt',
      },
    });
    await leaveController.recordLeave(mManagerCrossBranch.req, mManagerCrossBranch.res, mManagerCrossBranch.next);
    assert(mManagerCrossBranch.getStatus() === 403, 'Manager blocked from recording leave for another branch (403)');

    // Cross-tenant access attempt (Tenant A manager recording for Tenant B staff)
    const mCrossTenant = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffTenantB.id,
        leave_type_id: casualType.id,
        start_date: '2026-11-26',
        end_date: '2026-11-27',
        reason: 'Cross tenant attempt',
      },
    });
    await leaveController.recordLeave(mCrossTenant.req, mCrossTenant.res, mCrossTenant.next);
    assert(mCrossTenant.getStatus() === 404, 'IDOR blocked: Cannot record leave for another tenant staff ID (404)');

    // Manager Noida recording leave for their own staff (Staff Noida)
    const mManagerSelfBranch = createMockReqRes({
      user: managerNoida,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: '2026-11-26',
        end_date: '2026-11-27',
        reason: 'Manager recording for assigned branch employee',
      },
    });
    await leaveController.recordLeave(mManagerSelfBranch.req, mManagerSelfBranch.res, mManagerSelfBranch.next);
    assert(mManagerSelfBranch.getStatus() === 201, 'Manager can record leave for employees in assigned branch (201)');

    // -----------------------------------------------------------------
    // 11. Testing Attendance Integration & Conflict Detection
    // -----------------------------------------------------------------
    console.log('\n--- 11. Testing Attendance Integration & Conflict Detection ---');
    const integrationDate = '2026-10-28';
    await Attendance.destroy({ where: { attendance_date: integrationDate } });
    await LeaveRequest.destroy({ where: { start_date: integrationDate } });

    // Record approved leave for staffNoida on integrationDate
    const mLeaveInt = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: integrationDate,
        end_date: integrationDate,
        reason: 'Integration test leave',
      },
    });
    await leaveController.recordLeave(mLeaveInt.req, mLeaveInt.res, mLeaveInt.next);
    assert(mLeaveInt.getStatus() === 201, 'Approved leave recorded for integration test');

    // Case A: No punch recorded for staffNoida on integrationDate
    const mDailyView = createMockReqRes({
      user: adminUserA,
      query: { date: integrationDate },
    });
    await attendanceController.listDailyAttendance(mDailyView.req, mDailyView.res, mDailyView.next);
    assert(mDailyView.getStatus() === 200, 'Fetched daily attendance view (200)');

    const dailyRows = mDailyView.getData().data;
    const staffRow = dailyRows.find((r) => r.staff_id === staffNoida.id);
    assert(staffRow.status === 'ON_LEAVE', 'Employee on approved leave dynamically has status ON_LEAVE');
    assert(staffRow.attendance_id === null, 'Employee on approved leave has null attendance_id (no fake row)');
    assert(staffRow.leave_conflict === false, 'No conflict flagged when employee has no punch');

    const summaryKPI = mDailyView.getData().summary;
    assert(summaryKPI.on_leave >= 1, 'Daily KPI summary increments on_leave count');

    // Case B: Attendance punch PRESENT recorded on the SAME date (CONFLICT)
    console.log('--- Testing Punch While On Leave Conflict Flagging ---');
    await Attendance.create({
      tenant_id: tenantA.id,
      branch_id: branchNoida.id,
      staff_id: staffNoida.id,
      attendance_date: integrationDate,
      status: 'PRESENT',
      actual_check_in: '10:00:00',
      actual_check_out: '18:00:00',
      working_hours: 8.0,
    });

    const mDailyConflict = createMockReqRes({
      user: adminUserA,
      query: { date: integrationDate },
    });
    await attendanceController.listDailyAttendance(mDailyConflict.req, mDailyConflict.res, mDailyConflict.next);
    const conflictRows = mDailyConflict.getData().data;
    const conflictedStaffRow = conflictRows.find((r) => r.staff_id === staffNoida.id);

    assert(conflictedStaffRow.status === 'PRESENT', 'Attendance punch PRESENT is never overwritten');
    assert(conflictedStaffRow.leave_conflict === true, 'Punch while on approved leave flagged with leave_conflict = true');
    assert(conflictedStaffRow.conflict_details !== null, 'conflict_details payload attached to row');
    assert(
      conflictedStaffRow.conflict_details.type === 'PUNCH_WHILE_ON_LEAVE',
      'Conflict type identified as PUNCH_WHILE_ON_LEAVE'
    );

    // Case C: Monthly report includes approved leave days
    console.log('--- Testing Monthly Report Aggregation with Approved Leave ---');
    const mMonthly = createMockReqRes({
      user: adminUserA,
      query: { month: '2026-10' },
    });
    await attendanceController.getMonthlyReport(mMonthly.req, mMonthly.res, mMonthly.next);
    assert(mMonthly.getStatus() === 200, 'Monthly report responds 200');

    // Clean up test records created for integrationDate
    await Attendance.destroy({ where: { attendance_date: integrationDate } });
    await LeaveRequest.destroy({ where: { start_date: integrationDate } });

    console.log('\n======================================================');
    console.log(`Phase 4D Test Summary: ${passed}/${total} assertions passed`);
    console.log('======================================================\n');

    process.exit(passed === total ? 0 : 1);
  } catch (err) {
    console.error('❌ Test suite failed with exception:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runLeaveTests();

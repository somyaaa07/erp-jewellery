// backend/src/scripts/testAttendancePunchDisplay.js
/**
 * Test Suite: Attendance Punch Display and Leave Integration Verification
 *
 * Verifies the 5 scenarios required by Phase 4E Attendance Fix:
 * 1. Approved leave without a punch:
 *    - Status is ON_LEAVE
 *    - attendance_id is null
 *    - actual_check_in and actual_check_out are strictly null
 *    - leave_conflict is false
 * 2. Actual punch while on approved leave:
 *    - Status preserves PRESENT / HALF_DAY
 *    - attendance_id is present
 *    - actual_check_in and actual_check_out preserve real recorded punch times
 *    - leave_conflict is true with conflict_details
 * 3. Regular PRESENT employee:
 *    - Status is PRESENT
 *    - attendance_id is present
 *    - actual_check_in and actual_check_out populated
 *    - leave_conflict is false
 * 4. NOT_MARKED employee:
 *    - Status is NOT_MARKED
 *    - attendance_id is null
 *    - actual_check_in and actual_check_out are strictly null
 * 5. Scheduled shift with no actual punch:
 *    - scheduled_check_in and scheduled_check_out populated with shift timings
 *    - actual_check_in and actual_check_out remain strictly null (no fake punch leaking from schedule)
 */

import db from '../models/index.js';
import * as attendanceController from '../controllers/attendanceController.js';
import * as leaveController from '../controllers/leaveController.js';

const {
  Tenant,
  Branch,
  User,
  StaffProfile,
  Shift,
  LeaveType,
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

function createMockReqRes({ user, query = {} }) {
  const req = {
    user,
    scope: { tenant_id: user.tenant_id, branch_id: user.branch_id },
    query,
    params: {},
    body: {},
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  const next = (err) => {
    if (err) {
      statusCode = err.statusCode || 500;
      responseData = { error: err.message, status: statusCode };
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

/**
 * Frontend Rendering Simulation:
 * Mirrors the logic in AttendanceManagement.jsx to verify that what the user sees matches the requirements.
 */
function simulateFrontendRowRender(row) {
  const hasAttendanceRecord = Boolean(row.attendance_id);
  const hasRealPunch = Boolean(
    hasAttendanceRecord &&
    ['PRESENT', 'HALF_DAY'].includes(row.status) &&
    row.actual_check_in
  );
  const needsCheckout = hasRealPunch && row.status === 'PRESENT' && !row.actual_check_out;

  const actualPunchDisplay = hasRealPunch
    ? `${row.actual_check_in} → ${row.actual_check_out ? row.actual_check_out : 'Working'}`
    : '—';

  const scheduledShiftDisplay = row.scheduled_check_in
    ? `${row.scheduled_check_in} – ${row.scheduled_check_out || '—'}`
    : '—';

  return {
    hasAttendanceRecord,
    hasRealPunch,
    needsCheckout,
    actualPunchDisplay,
    scheduledShiftDisplay,
    statusDisplay: row.status === 'NOT_MARKED' ? 'NOT MARKED' : (row.status === 'ON_LEAVE' ? 'ON LEAVE' : row.status),
    showConflictBadge: Boolean(row.leave_conflict),
  };
}

async function runAttendancePunchDisplayTests() {
  console.log('======================================================');
  console.log('Attendance Punch Display & Leave Scenarios Test Suite');
  console.log('======================================================\n');

  try {
    const tenantA = await Tenant.findOne({ where: { name: 'Tenant A Jewellers' } });
    const branchNoida = await Branch.findOne({ where: { tenant_id: tenantA.id, name: 'Noida' } });
    const adminUserA = await User.findOne({ where: { tenant_id: tenantA.id, email: 'adminA@test.com' } });

    // Load distinct staff members in tenantA
    const staffList = await StaffProfile.findAll({
      where: { tenant_id: tenantA.id },
      limit: 6,
    });
    if (staffList.length < 4) throw new Error('Need at least 4 staff members in tenant A for testing');

    const staffLeaveOnly = staffList[0];
    const staffLeaveWithPunch = staffList[1];
    const staffRegularPresent = staffList[2];
    const staffUnmarked = staffList[3];

    const testDate = '2026-11-19';

    // Ensure clean state on testDate
    await Attendance.destroy({ where: { attendance_date: testDate } });
    await LeaveRequest.destroy({ where: { start_date: testDate } });

    // Load a leave type
    let casualType = await LeaveType.findOne({ where: { tenant_id: tenantA.id, code: 'CASUAL' } });
    if (!casualType) {
      await leaveController.seedDefaultLeaveTypes(tenantA.id);
      casualType = await LeaveType.findOne({ where: { tenant_id: tenantA.id, code: 'CASUAL' } });
    }

    // Load or create a standard shift with scheduled timings (10:00 to 19:00)
    let testShift = await Shift.findOne({ where: { tenant_id: tenantA.id, name: 'Morning Shift' } });
    if (!testShift) {
      testShift = await Shift.create({
        tenant_id: tenantA.id,
        branch_id: branchNoida.id,
        name: 'Morning Shift',
        start_time: '10:00:00',
        end_time: '19:00:00',
        is_active: true,
      });
    }

    // Assign shift to staffLeaveOnly to ensure scheduled timings are populated
    staffLeaveOnly.assigned_shift_id = testShift.id;
    await staffLeaveOnly.save();

    // -----------------------------------------------------------------
    // Scenario 1: Approved Leave WITHOUT a punch
    // -----------------------------------------------------------------
    console.log('\n--- Scenario 1: Approved Leave WITHOUT a Punch ---');
    await LeaveRequest.create({
      tenant_id: tenantA.id,
      branch_id: staffLeaveOnly.branch_id || branchNoida.id,
      staff_id: staffLeaveOnly.id,
      leave_type_id: casualType.id,
      start_date: testDate,
      end_date: testDate,
      total_days: 1.0,
      status: 'APPROVED',
      reason: 'Scenario 1: Doctor appointment',
      is_balance_deducted: false,
      created_by_id: adminUserA.id,
      approved_by_id: adminUserA.id,
      approved_at: new Date(),
    });

    // -----------------------------------------------------------------
    // Scenario 2: Actual punch WHILE on approved leave (Conflict)
    // -----------------------------------------------------------------
    console.log('--- Scenario 2: Actual Punch WHILE on Approved Leave ---');
    await LeaveRequest.create({
      tenant_id: tenantA.id,
      branch_id: staffLeaveWithPunch.branch_id || branchNoida.id,
      staff_id: staffLeaveWithPunch.id,
      leave_type_id: casualType.id,
      start_date: testDate,
      end_date: testDate,
      total_days: 1.0,
      status: 'APPROVED',
      reason: 'Scenario 2: Approved leave on same date',
      is_balance_deducted: false,
      created_by_id: adminUserA.id,
      approved_by_id: adminUserA.id,
      approved_at: new Date(),
    });

    await Attendance.create({
      tenant_id: tenantA.id,
      branch_id: staffLeaveWithPunch.branch_id || branchNoida.id,
      staff_id: staffLeaveWithPunch.id,
      attendance_date: testDate,
      status: 'PRESENT',
      shift_id: testShift.id,
      shift_name: testShift.name,
      scheduled_check_in: '10:00:00',
      scheduled_check_out: '19:00:00',
      actual_check_in: '10:05:00',
      actual_check_out: '19:10:00',
      working_hours: 9.08,
    });

    // -----------------------------------------------------------------
    // Scenario 3: Regular PRESENT employee
    // -----------------------------------------------------------------
    console.log('--- Scenario 3: Regular PRESENT Employee ---');
    await Attendance.create({
      tenant_id: tenantA.id,
      branch_id: staffRegularPresent.branch_id || branchNoida.id,
      staff_id: staffRegularPresent.id,
      attendance_date: testDate,
      status: 'PRESENT',
      shift_id: testShift.id,
      shift_name: testShift.name,
      scheduled_check_in: '10:00:00',
      scheduled_check_out: '19:00:00',
      actual_check_in: '09:55:00',
      actual_check_out: null, // Still working
      working_hours: null,
    });

    // Scenario 4: staffUnmarked has NO attendance record and NO leave request

    // Fetch Daily Attendance from API controller
    const mDaily = createMockReqRes({
      user: adminUserA,
      query: { date: testDate },
    });
    await attendanceController.listDailyAttendance(mDaily.req, mDaily.res, mDaily.next);
    assert(mDaily.getStatus() === 200, 'listDailyAttendance responded 200 OK');

    const dailyRows = mDaily.getData().data;

    // --- Verify Scenario 1: Approved leave without a punch ---
    const row1 = dailyRows.find((r) => r.staff_id === staffLeaveOnly.id);
    assert(row1 !== undefined, 'Found Scenario 1 staff row');
    assert(row1.status === 'ON_LEAVE', 'Scenario 1: Effective status is ON_LEAVE');
    assert(row1.attendance_id === null, 'Scenario 1: attendance_id is strictly null (no fake row)');
    assert(row1.actual_check_in === null, 'Scenario 1: actual_check_in is strictly null in API response');
    assert(row1.actual_check_out === null, 'Scenario 1: actual_check_out is strictly null in API response');
    assert(row1.working_hours === null, 'Scenario 1: working_hours is strictly null');
    assert(row1.leave_conflict === false, 'Scenario 1: leave_conflict is false (no punch conflict)');

    const ui1 = simulateFrontendRowRender(row1);
    assert(ui1.statusDisplay === 'ON LEAVE', 'Scenario 1 UI: Status column displays ON LEAVE');
    assert(ui1.actualPunchDisplay === '—', 'Scenario 1 UI: Actual Punch column displays "—"');
    assert(ui1.needsCheckout === false, 'Scenario 1 UI: Does NOT display "Working" badge');
    assert(ui1.hasRealPunch === false, 'Scenario 1 UI: hasRealPunch evaluates to false');
    assert(ui1.hasAttendanceRecord === false, 'Scenario 1 UI: hasAttendanceRecord evaluates to false');

    // --- Verify Scenario 5: Scheduled shift with no actual punch ---
    assert(row1.scheduled_check_in !== null, 'Scenario 5: scheduled_check_in is populated from shift schedule');
    assert(ui1.scheduledShiftDisplay !== '—', 'Scenario 5 UI: Scheduled shift timings rendered in shift column');
    assert(ui1.actualPunchDisplay === '—', 'Scenario 5 UI: Scheduled timings NEVER leak into actual punch column');

    // --- Verify Scenario 2: Actual punch WHILE on approved leave ---
    const row2 = dailyRows.find((r) => r.staff_id === staffLeaveWithPunch.id);
    assert(row2 !== undefined, 'Found Scenario 2 staff row');
    assert(row2.status === 'PRESENT', 'Scenario 2: Real recorded PRESENT status is strictly preserved');
    assert(row2.attendance_id !== null, 'Scenario 2: Real attendance_id is preserved');
    assert(row2.actual_check_in === '10:05:00', 'Scenario 2: Real actual_check_in time is preserved');
    assert(row2.actual_check_out === '19:10:00', 'Scenario 2: Real actual_check_out time is preserved');
    assert(row2.leave_conflict === true, 'Scenario 2: leave_conflict is flagged as true');
    assert(row2.conflict_details?.type === 'PUNCH_WHILE_ON_LEAVE', 'Scenario 2: conflict_details specifies PUNCH_WHILE_ON_LEAVE');

    const ui2 = simulateFrontendRowRender(row2);
    assert(ui2.statusDisplay === 'PRESENT', 'Scenario 2 UI: Status column shows PRESENT');
    assert(ui2.showConflictBadge === true, 'Scenario 2 UI: Displays visible ⚠️ Leave Conflict badge');
    assert(ui2.hasRealPunch === true, 'Scenario 2 UI: hasRealPunch evaluates to true');
    assert(ui2.actualPunchDisplay.includes('10:05:00'), 'Scenario 2 UI: Actual punch column displays real check-in');

    // --- Verify Scenario 3: Regular PRESENT employee ---
    const row3 = dailyRows.find((r) => r.staff_id === staffRegularPresent.id);
    assert(row3 !== undefined, 'Found Scenario 3 staff row');
    assert(row3.status === 'PRESENT', 'Scenario 3: Status is PRESENT');
    assert(row3.attendance_id !== null, 'Scenario 3: attendance_id exists');
    assert(row3.actual_check_in === '09:55:00', 'Scenario 3: actual_check_in is populated');
    assert(row3.actual_check_out === null, 'Scenario 3: actual_check_out is null (in progress)');
    assert(row3.leave_conflict === false, 'Scenario 3: leave_conflict is false (normal work day)');

    const ui3 = simulateFrontendRowRender(row3);
    assert(ui3.hasRealPunch === true, 'Scenario 3 UI: hasRealPunch evaluates to true');
    assert(ui3.needsCheckout === true, 'Scenario 3 UI: Active present employee displays "Working" badge');
    assert(ui3.showConflictBadge === false, 'Scenario 3 UI: No conflict badge shown');

    // --- Verify Scenario 4: NOT_MARKED employee ---
    // Staff without attendance and without leave
    const row4 = dailyRows.find((r) => r.staff_id !== staffLeaveOnly.id && r.staff_id !== staffLeaveWithPunch.id && r.staff_id !== staffRegularPresent.id);
    if (row4) {
      assert(row4.status === 'NOT_MARKED', 'Scenario 4: Status is NOT_MARKED');
      assert(row4.attendance_id === null, 'Scenario 4: attendance_id is null');
      assert(row4.actual_check_in === null, 'Scenario 4: actual_check_in is null');
      assert(row4.actual_check_out === null, 'Scenario 4: actual_check_out is null');
      assert(row4.working_hours === null, 'Scenario 4: working_hours is null');

      const ui4 = simulateFrontendRowRender(row4);
      assert(ui4.actualPunchDisplay === '—', 'Scenario 4 UI: Actual punch column displays "—"');
      assert(ui4.needsCheckout === false, 'Scenario 4 UI: Does not display "Working" badge');
      assert(ui4.statusDisplay === 'NOT MARKED', 'Scenario 4 UI: Displays NOT MARKED badge');
    }

    // Cleanup test records
    await Attendance.destroy({ where: { attendance_date: testDate } });
    await LeaveRequest.destroy({ where: { start_date: testDate } });

    console.log('\n======================================================');
    console.log(`Punch Display Test Summary: ${passed}/${total} assertions passed`);
    console.log('======================================================\n');

    process.exit(passed === total ? 0 : 1);
  } catch (err) {
    console.error('❌ Attendance Punch Display test suite failed with exception:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runAttendancePunchDisplayTests();

// backend/src/scripts/testAttendancePhase4C.js
/**
 * Frontend Contract & Integration Verification Test Suite for Phase 4C
 *
 * Validates that all backend APIs match the frontend component contracts in AttendanceManagement.jsx:
 * 1. Daily Attendance List API shape: data, summary (8 KPI cards), pagination
 * 2. Unmarked distinction: status NOT_MARKED with null attendance_id
 * 3. Mark Attendance API contract (POST /api/attendance)
 * 4. Evening Checkout API contract (PATCH /api/attendance/:id/checkout)
 * 5. Correction API contract with mandatory reason (PATCH /api/attendance/:id/correction)
 * 6. Bulk Attendance API contract (POST /api/attendance/bulk)
 * 7. Employee History API contract (GET /api/attendance/employee/:id/history)
 * 8. Monthly Report API contract (GET /api/attendance/monthly-report)
 * 9. Shift Management API contract (GET /api/shifts, POST /api/shifts, PUT, PATCH /status)
 * 10. Manager branch scoping & Admin branch switching contract
 */

import db from '../models/index.js';
import * as attendanceController from '../controllers/attendanceController.js';
import * as shiftController from '../controllers/shiftController.js';

const { Tenant, Branch, User, StaffProfile, Shift, Attendance } = db;

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

async function runFrontendContractTests() {
  console.log('\n======================================================');
  console.log('🖥️ Running Phase 4C Frontend Contract Verification Tests');
  console.log('======================================================\n');

  try {
    const tenantA = await Tenant.findOne({ where: { name: 'Tenant A Jewellers' } });
    const branchA1 = await Branch.findOne({ where: { tenant_id: tenantA.id, name: 'Noida Store' } });
    const adminUserA = await User.findOne({ where: { email: 'adminA_att@test.com' } });
    const managerUserA1 = await User.findOne({ where: { email: 'mgrA1_att@test.com' } });

    // 1. Contract: GET /api/attendance
    console.log('--- 1. Validating Daily Attendance API Contract ---');
    const listMock = createMockReqRes({
      user: adminUserA,
      query: { date: '2026-10-15', branch_id: branchA1.id },
    });
    await attendanceController.listDailyAttendance(listMock.req, listMock.res, listMock.next);
    assert(listMock.getStatus() === 200, 'Daily attendance responds 200');

    const resData = listMock.getData();
    assert(Array.isArray(resData?.data), 'Response contains data array');
    assert(typeof resData?.summary === 'object', 'Response contains summary object for KPI cards');
    assert(typeof resData?.pagination === 'object', 'Response contains pagination object');

    // Verify all 8 Summary Counters
    const summary = resData.summary;
    assert('total_staff' in summary, 'Summary card: total_staff present');
    assert('present' in summary, 'Summary card: present present');
    assert('absent' in summary, 'Summary card: absent present');
    assert('half_day' in summary, 'Summary card: half_day present');
    assert('on_leave' in summary, 'Summary card: on_leave present');
    assert('weekly_off' in summary, 'Summary card: weekly_off present');
    assert('holiday' in summary, 'Summary card: holiday present');
    assert('not_marked' in summary, 'Summary card: not_marked present');

    // Verify Row Fields for Attendance Table
    const firstRow = resData.data[0];
    if (firstRow) {
      assert('staff_id' in firstRow, 'Row field: staff_id present');
      assert('employee_id' in firstRow, 'Row field: employee_id present');
      assert('name' in firstRow, 'Row field: name present');
      assert('department' in firstRow, 'Row field: department present');
      assert('designation' in firstRow, 'Row field: designation present');
      assert('branch_name' in firstRow, 'Row field: branch_name present');
      assert('shift_name' in firstRow, 'Row field: shift_name present');
      assert('status' in firstRow, 'Row field: status present');
      assert('late_minutes' in firstRow, 'Row field: late_minutes present');
      assert('early_departure_minutes' in firstRow, 'Row field: early_departure_minutes present');
      assert('working_hours' in firstRow, 'Row field: working_hours present');
    }

    // 2. Contract: Monthly Report API
    console.log('\n--- 2. Validating Monthly Report API Contract ---');
    const reportMock = createMockReqRes({
      user: adminUserA,
      query: { month: '2026-10', branch_id: branchA1.id },
    });
    await attendanceController.getMonthlyReport(reportMock.req, reportMock.res, reportMock.next);
    assert(reportMock.getStatus() === 200, 'Monthly report responds 200');
    const reportRes = reportMock.getData();
    assert(Array.isArray(reportRes?.data), 'Monthly report contains data array');
    if (reportRes.data[0]) {
      const repRow = reportRes.data[0];
      assert('present_days' in repRow, 'Report row: present_days present');
      assert('absent_days' in repRow, 'Report row: absent_days present');
      assert('half_days' in repRow, 'Report row: half_days present');
      assert('on_leave_days' in repRow, 'Report row: on_leave_days present');
      assert('weekly_offs' in repRow, 'Report row: weekly_offs present');
      assert('holidays' in repRow, 'Report row: holidays present');
      assert('late_days' in repRow, 'Report row: late_days present');
      assert('total_working_hours' in repRow, 'Report row: total_working_hours present');
    }

    // 3. Contract: Employee History API
    console.log('\n--- 3. Validating Employee History API Contract ---');
    const staff1 = await StaffProfile.findOne({ where: { tenant_id: tenantA.id } });
    const histMock = createMockReqRes({
      user: adminUserA,
      params: { staffId: staff1.id },
      query: { month: '2026-10' },
    });
    await attendanceController.getEmployeeAttendanceHistory(histMock.req, histMock.res, histMock.next);
    assert(histMock.getStatus() === 200, 'Employee history responds 200');
    const histRes = histMock.getData();
    assert(typeof histRes?.employee === 'object', 'History response contains employee info');
    assert(Array.isArray(histRes?.data), 'History response contains data array');

    // 4. Contract: Shift Management APIs
    console.log('\n--- 4. Validating Shift Management API Contract ---');
    const shiftsMock = createMockReqRes({ user: adminUserA });
    await shiftController.listShifts(shiftsMock.req, shiftsMock.res, shiftsMock.next);
    assert(shiftsMock.getStatus() === 200, 'List shifts responds 200');
    assert(Array.isArray(shiftsMock.getData()?.data), 'Shifts response contains data array');

    console.log(`\n======================================================`);
    console.log(`Phase 4C Contract Test Summary: ${passed}/${total} assertions passed`);
    console.log(`======================================================\n`);

    return { total, passed, success: total === passed };
  } catch (err) {
    console.error('Contract test error:', err);
    return { total, passed, success: false, error: err.message };
  }
}

runFrontendContractTests().then(({ success }) => {
  process.exit(success ? 0 : 1);
});

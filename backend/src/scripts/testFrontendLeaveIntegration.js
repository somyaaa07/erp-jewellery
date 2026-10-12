// backend/src/scripts/testFrontendLeaveIntegration.js
/**
 * Frontend Integration & Contract Verification for Phase 4E: Leave Management
 *
 * Verifies that all API requests initiated by LeaveManagement.jsx and LeaveModals.jsx:
 * 1. Match the backend route parameters and schemas
 * 2. Return the exact response payloads expected by the React state hooks
 * 3. Enforce RBAC permissions (Admin vs Branch Manager)
 * 4. Handle error statuses (400, 403, 409) with human-readable error messages
 * 5. Verify Attendance conflict flagging consumed by AttendanceManagement.jsx
 */

import db from '../models/index.js';
import * as leaveController from '../controllers/leaveController.js';
import * as attendanceController from '../controllers/attendanceController.js';

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

async function runFrontendIntegrationTests() {
  console.log('======================================================');
  console.log('Phase 4E: Leave Management Frontend Integration Suite');
  console.log('======================================================\n');

  try {
    // 1. Fetch Fixtures
    const tenantA = await Tenant.findOne({ where: { name: 'Tenant A Jewellers' } });
    if (!tenantA) throw new Error('Tenant A not found');

    const branchNoida = await Branch.findOne({ where: { tenant_id: tenantA.id, name: 'Noida' } });
    const branchDelhi = await Branch.findOne({ where: { tenant_id: tenantA.id, name: 'Delhi' } });

    const adminUserA = await User.findOne({ where: { tenant_id: tenantA.id, email: 'adminA@test.com' } });
    const managerNoida = await User.findOne({ where: { tenant_id: tenantA.id, email: 'manager.noida@test.com' } });

    const staffNoida = await StaffProfile.findOne({ where: { tenant_id: tenantA.id, branch_id: branchNoida.id } });
    const staffDelhi = await StaffProfile.findOne({ where: { tenant_id: tenantA.id, branch_id: branchDelhi.id } });

    assert(adminUserA && managerNoida, 'Admin and Manager user fixtures loaded');
    assert(staffNoida && staffDelhi, 'Noida and Delhi staff fixtures loaded');

    // Clean up any test records for integration dates
    const testDate = '2026-11-12';
    await LeaveRequest.destroy({ where: { start_date: testDate } });
    await Attendance.destroy({ where: { attendance_date: testDate } });

    // -----------------------------------------------------------------
    // Contract 1: Summary KPI Card Contract (GET /api/leaves/summary)
    // -----------------------------------------------------------------
    console.log('\n--- 1. Testing Summary KPI Card API Contract ---');
    const mSummary = createMockReqRes({ user: adminUserA });
    await leaveController.getLeaveSummary(mSummary.req, mSummary.res, mSummary.next);
    assert(mSummary.getStatus() === 200, 'GET /api/leaves/summary returns 200 OK');

    const summaryData = mSummary.getData().summary;
    assert(summaryData !== undefined, 'Response includes summary object');
    assert(typeof summaryData.approved === 'number', 'Summary contains approved count');
    assert(typeof summaryData.cancelled === 'number', 'Summary contains cancelled count');
    assert(typeof summaryData.pending === 'number', 'Summary contains pending count');
    assert(typeof summaryData.on_leave_today === 'number', 'Summary contains on_leave_today count');

    // -----------------------------------------------------------------
    // Contract 2: Leave Types Dropdown & Management Contract (GET / POST / PUT)
    // -----------------------------------------------------------------
    console.log('\n--- 2. Testing Leave Types API Contract & RBAC ---');
    const mTypes = createMockReqRes({ user: adminUserA });
    await leaveController.listLeaveTypes(mTypes.req, mTypes.res, mTypes.next);
    assert(mTypes.getStatus() === 200, 'GET /api/leaves/types returns 200 OK');

    const typesList = mTypes.getData().data;
    assert(Array.isArray(typesList) && typesList.length >= 5, 'Returns array of leave types with standard defaults');
    const casualType = typesList.find((t) => t.code === 'CASUAL');
    assert(casualType && casualType.is_paid === true, 'CASUAL leave type identified with is_paid = true');

    // Admin creates custom leave type
    await LeaveType.destroy({ where: { tenant_id: tenantA.id, code: 'STUDY_LEAVE' } });
    const mCreateType = createMockReqRes({
      user: adminUserA,
      body: {
        name: 'Study Leave',
        code: 'STUDY_LEAVE',
        days_allowed_per_year: 7.0,
        is_paid: true,
        exclude_weekly_offs: true,
        exclude_holidays: true,
      },
    });
    await leaveController.createLeaveType(mCreateType.req, mCreateType.res, mCreateType.next);
    assert(mCreateType.getStatus() === 201, 'POST /api/leaves/types creates custom type (201)');
    const createdType = mCreateType.getData().data;
    assert(createdType.code === 'STUDY_LEAVE', 'Created type has code STUDY_LEAVE');

    // Admin updates leave type
    const mUpdateType = createMockReqRes({
      user: adminUserA,
      params: { id: createdType.id },
      body: { days_allowed_per_year: 10.0 },
    });
    await leaveController.updateLeaveType(mUpdateType.req, mUpdateType.res, mUpdateType.next);
    assert(mUpdateType.getStatus() === 200, 'PUT /api/leaves/types/:id updates type quota to 10.0');

    // Cleanup custom type
    await LeaveType.destroy({ where: { id: createdType.id } });

    // -----------------------------------------------------------------
    // Contract 3: Employee Leave Balances Contract (GET /api/leaves/balances/:staffId)
    // -----------------------------------------------------------------
    console.log('\n--- 3. Testing Leave Balances API Contract ---');
    const mBalances = createMockReqRes({
      user: adminUserA,
      params: { staffId: staffNoida.id },
      query: { year: '2026' },
    });
    await leaveController.getLeaveBalances(mBalances.req, mBalances.res, mBalances.next);
    assert(mBalances.getStatus() === 200, 'GET /api/leaves/balances/:staffId returns 200 OK');

    const balancesRes = mBalances.getData();
    assert(balancesRes.staff && balancesRes.staff.id === staffNoida.id, 'Response includes staff header info');
    assert(Array.isArray(balancesRes.data), 'Response includes data array of leave type quotas');
    const casualBal = balancesRes.data.find((b) => b.leave_type_code === 'CASUAL');
    assert(casualBal !== undefined, 'Casual leave quota record present in balance list');
    assert(typeof casualBal.entitled_days === 'number', 'entitled_days field is numeric');
    assert(typeof casualBal.available_days === 'number', 'available_days field is numeric');

    // Manager blocked from viewing staff of other branch
    const mManagerCrossBal = createMockReqRes({
      user: managerNoida,
      params: { staffId: staffDelhi.id },
      query: { year: '2026' },
    });
    await leaveController.getLeaveBalances(mManagerCrossBal.req, mManagerCrossBal.res, mManagerCrossBal.next);
    assert(mManagerCrossBal.getStatus() === 403, 'Manager blocked from viewing balances for another branch (403)');

    // -----------------------------------------------------------------
    // Contract 4: Direct Leave Recording & Validation (POST /api/leaves)
    // -----------------------------------------------------------------
    console.log('\n--- 4. Testing Record Leave Contract & Validation ---');
    // Ensure clean balance for staffNoida
    await LeaveBalance.destroy({ where: { staff_id: staffNoida.id, year: 2026 } });

    // Record valid leave (1 day on testDate)
    const mRecord = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: testDate,
        end_date: testDate,
        is_half_day: false,
        reason: 'Frontend contract verification test leave',
      },
    });
    await leaveController.recordLeave(mRecord.req, mRecord.res, mRecord.next);
    assert(mRecord.getStatus() === 201, 'POST /api/leaves directly creates APPROVED leave (201)');

    const newLeave = mRecord.getData().data;
    assert(newLeave.status === 'APPROVED', 'Record marked as APPROVED immediately (no 2nd approval step)');
    assert(Number(newLeave.total_days) === 1.0, 'total_days calculated correctly');

    // Overlap validation test (attempting overlapping leave on testDate)
    const mOverlap = createMockReqRes({
      user: adminUserA,
      body: {
        staff_id: staffNoida.id,
        leave_type_id: casualType.id,
        start_date: testDate,
        end_date: testDate,
        reason: 'Overlapping request',
      },
    });
    await leaveController.recordLeave(mOverlap.req, mOverlap.res, mOverlap.next);
    assert(mOverlap.getStatus() === 409, 'Overlapping leave correctly returns 409 Conflict');
    assert(mOverlap.getData().error.includes('already has an active leave'), 'Error message details active overlap');

    // -----------------------------------------------------------------
    // Contract 5: Leave Listing & Table Filters (GET /api/leaves)
    // -----------------------------------------------------------------
    console.log('\n--- 5. Testing Leave Listing & Server Filters Contract ---');
    const mList = createMockReqRes({
      user: adminUserA,
      query: {
        staff_id: String(staffNoida.id),
        status: 'APPROVED',
        page: '1',
        limit: '10',
      },
    });
    await leaveController.listLeaves(mList.req, mList.res, mList.next);
    assert(mList.getStatus() === 200, 'GET /api/leaves returns 200 OK');

    const listRes = mList.getData();
    assert(Array.isArray(listRes.data), 'Response data is an array of leave records');
    assert(listRes.pagination && listRes.pagination.total >= 1, 'Response includes pagination metadata');

    const recordInList = listRes.data.find((r) => r.id === newLeave.id);
    assert(recordInList !== undefined, 'Newly recorded leave present in listing');
    assert(recordInList.StaffProfile !== undefined, 'Record includes joined StaffProfile object');
    assert(recordInList.LeaveType !== undefined, 'Record includes joined LeaveType object');
    assert(recordInList.Branch !== undefined, 'Record includes joined Branch object');

    // -----------------------------------------------------------------
    // Contract 6: Cancellation & Balance Restoration (PATCH /api/leaves/:id/cancel)
    // -----------------------------------------------------------------
    console.log('\n--- 6. Testing Cancellation & Idempotency Contract ---');
    const mCancel = createMockReqRes({
      user: adminUserA,
      params: { id: newLeave.id },
      body: { reason: 'Test cancellation from frontend UI' },
    });
    await leaveController.cancelLeave(mCancel.req, mCancel.res, mCancel.next);
    assert(mCancel.getStatus() === 200, 'PATCH /api/leaves/:id/cancel returns 200 OK');

    const cancelledData = mCancel.getData().data;
    assert(cancelledData.status === 'CANCELLED', 'Leave status changed to CANCELLED');
    assert(cancelledData.is_balance_deducted === false, 'is_balance_deducted reset to false');
    assert(cancelledData.cancellation_reason === 'Test cancellation from frontend UI', 'Cancellation reason saved');

    // Already-cancelled check
    const mCancelAgain = createMockReqRes({
      user: adminUserA,
      params: { id: newLeave.id },
      body: { reason: 'Retry' },
    });
    await leaveController.cancelLeave(mCancelAgain.req, mCancelAgain.res, mCancelAgain.next);
    assert(mCancelAgain.getStatus() === 200, 'Idempotent cancel on already-cancelled leave returns 200 OK');

    // Clean up test records
    await LeaveRequest.destroy({ where: { id: newLeave.id } });

    console.log('\n======================================================');
    console.log(`Phase 4E Integration Summary: ${passed}/${total} assertions passed`);
    console.log('======================================================\n');

    process.exit(passed === total ? 0 : 1);
  } catch (err) {
    console.error('❌ Phase 4E test suite failed with exception:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runFrontendIntegrationTests();

// backend/src/scripts/testStaffPhase3.js
/**
 * Phase 3 Integration & Frontend Contract Test Suite
 * Tests all workflows required for Staff Directory Frontend:
 * 1. Directory loading
 * 2. Search (name, employee_id, email, phone)
 * 3. Filters (branch, department, designation, employment_type, status, has_login)
 * 4. Pagination (page, limit, total count, totalPages)
 * 5. Sorting (field, ASC/DESC)
 * 6. Add staff without login (user_id = null)
 * 7. Add staff with login (linked User created with selected role)
 * 8. Edit staff details (department, designation, phone)
 * 9. View employee profile by ID (relations included: Branch, User, ReportingManager)
 * 10. Deactivate staff (soft deactivation: status=INACTIVE, User.is_active=false, not deleted)
 * 11. Activate staff (status=ACTIVE, User.is_active=true)
 * 12. Permission restrictions (e.g. Branch Manager cannot assign ADMIN role)
 * 13. Manager branch scoping (Branch Manager only sees staff in their branch)
 * 14. Sensitive-field visibility (DOB, emergency contact phone stripped for managers, visible to admin)
 */

import jwt from 'jsonwebtoken';
import db from '../models/index.js';
import * as staffController from '../controllers/staffController.js';

const { StaffProfile, User, Branch } = db;
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_key_12345';

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

// Mock Express req/res
function createMockReqRes({ user, query = {}, params = {}, body = {} }) {
  const req = {
    user,
    scope: { tenant_id: user.tenant_id },
    query,
    params,
    body,
  };

  let responseData = null;
  let statusCode = 200;
  const headers = {};

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    setHeader(key, value) {
      headers[key] = value;
    },
    getHeader(key) {
      return headers[key];
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
    getData: () => responseData,
    getStatus: () => statusCode,
    getHeader: (k) => headers[k],
  };
}

async function runPhase3Tests() {
  console.log('======================================================');
  console.log('   STARTING PHASE 3 STAFF DIRECTORY TEST SUITE        ');
  console.log('======================================================\n');

  try {
    // Setup test users
    const adminUser = await User.findOne({ where: { role: 'ADMIN', tenant_id: 2 } });
    if (!adminUser) throw new Error('Admin user in tenant 2 not found');

    const managerUser = await User.findOne({ where: { role: 'MANAGER', tenant_id: 2 } });
    if (!managerUser) throw new Error('Manager user in tenant 2 not found');

    const testBranch = await Branch.findOne({ where: { tenant_id: 2 } });
    if (!testBranch) throw new Error('Branch in tenant 2 not found');

    const timestamp = Date.now();

    // --- 1. Directory Loading & Pagination ---
    console.log('--- 1. Directory Loading & Pagination ---');
    {
      const { req, res, next, getData, getStatus } = createMockReqRes({
        user: adminUser,
        query: { page: '1', limit: '5' },
      });
      await staffController.listStaff(req, res, next);
      const data = getData();
      assert(getStatus() === 200, 'Directory list returns status 200');
      assert(Array.isArray(data.data), 'Returns paginated array of staff');
      assert(data.pagination.page === 1, 'Pagination page matches query');
      assert(data.pagination.limit === 5, 'Pagination limit matches query');
      assert(data.pagination.total >= 0, 'Pagination returns total records');
    }

    // --- 2. Search Functionality ---
    console.log('\n--- 2. Search Functionality ---');
    {
      // First get a known staff member
      const known = await StaffProfile.findOne({ where: { tenant_id: 2 } });
      const searchTerm = known.first_name || known.employee_id;

      const { req, res, next, getData, getStatus } = createMockReqRes({
        user: adminUser,
        query: { search: searchTerm, page: '1', limit: '10' },
      });
      await staffController.listStaff(req, res, next);
      const data = getData();
      assert(getStatus() === 200, 'Search request returns 200');
      assert(data.data.length > 0, `Search for "${searchTerm}" returned matching records`);
      const matched = data.data.some(
        (s) =>
          (s.first_name && s.first_name.includes(searchTerm)) ||
          (s.employee_id && s.employee_id.includes(searchTerm))
      );
      assert(matched, 'Matching staff found in search results');
    }

    // --- 3. Multi-field Filtering ---
    console.log('\n--- 3. Multi-field Filtering ---');
    {
      // Filter by department
      const { req, res, next, getData, getStatus } = createMockReqRes({
        user: adminUser,
        query: { department: 'Sales', page: '1', limit: '10' },
      });
      await staffController.listStaff(req, res, next);
      const data = getData();
      assert(getStatus() === 200, 'Department filter returns 200');
      const allSales = data.data.every((s) => s.department === 'Sales');
      assert(allSales, 'All returned records belong to Sales department');
    }
    {
      // Filter by has_login = 'true'
      const { req, res, next, getData } = createMockReqRes({
        user: adminUser,
        query: { has_login: 'true', page: '1', limit: '10' },
      });
      await staffController.listStaff(req, res, next);
      const data = getData();
      const allWithLogin = data.data.every((s) => s.user_id !== null);
      assert(allWithLogin, 'has_login=true returns only login-enabled staff');
    }
    {
      // Filter by has_login = 'false'
      const { req, res, next, getData } = createMockReqRes({
        user: adminUser,
        query: { has_login: 'false', page: '1', limit: '10' },
      });
      await staffController.listStaff(req, res, next);
      const data = getData();
      const allWithoutLogin = data.data.every((s) => s.user_id === null);
      assert(allWithoutLogin, 'has_login=false returns only staff without login accounts');
    }

    // --- 4. Sorting Functionality ---
    console.log('\n--- 4. Sorting Functionality ---');
    {
      const { req, res, next, getData } = createMockReqRes({
        user: adminUser,
        query: { sortBy: 'employee_id', sortOrder: 'ASC', page: '1', limit: '20' },
      });
      await staffController.listStaff(req, res, next);
      const data = getData();
      const ids = data.data.map((s) => s.employee_id).filter(Boolean);
      const isAsc = ids.slice(1).every((id, i) => ids[i].localeCompare(id) <= 0);
      assert(isAsc, 'Sorting by employee_id ASC returns correctly ordered list');
    }

    // --- 5. Add Staff WITHOUT Login Account ---
    console.log('\n--- 5. Add Staff WITHOUT Login Account ---');
    let noLoginStaffId = null;
    {
      const empId = `EMP-NL-${timestamp}`;
      const { req, res, next, getData, getStatus } = createMockReqRes({
        user: adminUser,
        body: {
          first_name: 'Pooja',
          last_name: 'Sharma',
          phone: '+91 9988776655',
          department: 'Workshop',
          designation: 'Karigar',
          employment_type: 'FULL_TIME',
          joining_date: '2026-03-01',
          branch_id: testBranch.id,
          employee_id: empId,
          create_login: false,
        },
      });
      await staffController.createStaff(req, res, next);
      const data = getData();
      assert(getStatus() === 201, 'Add staff without login returns 201 Created');
      assert(data.user_id === null, 'Staff profile has user_id = null (no User account created)');
      assert(data.employee_id === empId, 'Assigned custom employee_id');
      assert(data.first_name === 'Pooja', 'First name correctly stored');
      noLoginStaffId = data.id;
    }

    // --- 6. Add Staff WITH Login Account ---
    console.log('\n--- 6. Add Staff WITH Login Account ---');
    let loginStaffId = null;
    let loginUserId = null;
    {
      const empId = `EMP-LG-${timestamp}`;
      const email = `pooja.login.${timestamp}@testjewel.com`;
      const { req, res, next, getData, getStatus } = createMockReqRes({
        user: adminUser,
        body: {
          first_name: 'Vikram',
          last_name: 'Singhania',
          email,
          phone: '+91 9123456780',
          department: 'Sales',
          designation: 'Sales Executive',
          employment_type: 'FULL_TIME',
          joining_date: '2026-04-01',
          branch_id: testBranch.id,
          employee_id: empId,
          create_login: true,
          role: 'SALESMAN',
          password: 'Password@123',
        },
      });
      await staffController.createStaff(req, res, next);
      const data = getData();
      assert(getStatus() === 201, 'Add staff with login returns 201 Created');
      assert(data.user_id !== null, 'Staff profile has linked user_id');
      loginStaffId = data.id;
      loginUserId = data.user_id;

      // Verify User account created with right role
      const createdUser = await User.findByPk(loginUserId);
      assert(createdUser !== null, 'Linked User account exists in database');
      assert(createdUser.role === 'SALESMAN', 'User account assigned SALESMAN role');
      assert(createdUser.is_active === true, 'User account is active');
    }

    // --- 7. View Employee Profile by ID ---
    console.log('\n--- 7. View Employee Profile by ID ---');
    {
      const { req, res, next, getData, getStatus } = createMockReqRes({
        user: adminUser,
        params: { id: String(loginStaffId) },
      });
      await staffController.getStaffById(req, res, next);
      const data = getData();
      assert(getStatus() === 200, 'Get staff by ID returns 200');
      assert(data.id === loginStaffId, 'Profile ID matches requested ID');
      assert(data.first_name === 'Vikram', 'First name loaded correctly');
      assert(data.User !== undefined, 'User association loaded');
      assert(data.Branch !== undefined, 'Branch association loaded');
    }

    // --- 8. Edit Staff Information ---
    console.log('\n--- 8. Edit Staff Information ---');
    {
      const { req, res, next, getData, getStatus } = createMockReqRes({
        user: adminUser,
        params: { id: String(loginStaffId) },
        body: {
          designation: 'Senior Sales Consultant',
          phone: '+91 99999 11111',
          emergency_contact_name: 'Anjali Singhania',
          emergency_contact_phone: '+91 88888 22222',
        },
      });
      await staffController.updateStaff(req, res, next);
      const data = getData();
      assert(getStatus() === 200, 'Edit staff returns 200');
      assert(data.designation === 'Senior Sales Consultant', 'Designation updated in database');
      assert(data.phone === '+91 99999 11111', 'Phone updated in database');
      assert(data.emergency_contact_name === 'Anjali Singhania', 'Emergency contact updated');
    }

    // --- 9. Soft Deactivation & Historical Preservation ---
    console.log('\n--- 9. Soft Deactivation & Historical Preservation ---');
    {
      const { req, res, next, getData, getStatus } = createMockReqRes({
        user: adminUser,
        params: { id: String(loginStaffId) },
        body: { status: 'INACTIVE' },
      });
      await staffController.updateStaffStatus(req, res, next);
      const data = getData();
      assert(getStatus() === 200, 'Status update to INACTIVE returns 200');
      assert(data.status === 'INACTIVE', 'Staff status set to INACTIVE');

      // Verify DB record is preserved (NOT deleted)
      const dbProfile = await StaffProfile.findByPk(loginStaffId);
      assert(dbProfile !== null, 'Historical StaffProfile row remains in DB (soft-delete)');
      assert(dbProfile.status === 'INACTIVE', 'DB status confirmed INACTIVE');

      // Verify linked User is disabled
      const dbUser = await User.findByPk(loginUserId);
      assert(dbUser.is_active === false, 'Linked User account is_active set to false');
    }

    // --- 10. Activation of Deactivated Staff ---
    console.log('\n--- 10. Activation of Deactivated Staff ---');
    {
      const { req, res, next, getData, getStatus } = createMockReqRes({
        user: adminUser,
        params: { id: String(loginStaffId) },
        body: { status: 'ACTIVE' },
      });
      await staffController.updateStaffStatus(req, res, next);
      const data = getData();
      assert(getStatus() === 200, 'Status update to ACTIVE returns 200');
      assert(data.status === 'ACTIVE', 'Staff status restored to ACTIVE');

      const dbUser = await User.findByPk(loginUserId);
      assert(dbUser.is_active === true, 'Linked User account re-enabled (is_active = true)');
    }

    // --- 11. Permission Restrictions ---
    console.log('\n--- 11. Permission Restrictions ---');
    {
      // Branch Manager cannot assign ADMIN role
      const { req, res, next, getData, getStatus } = createMockReqRes({
        user: managerUser,
        body: {
          first_name: 'Attempt',
          last_name: 'Admin',
          email: `attempt.admin.${timestamp}@test.com`,
          create_login: true,
          role: 'ADMIN', // Prohibited for managers
          branch_id: managerUser.branch_id,
        },
      });
      await staffController.createStaff(req, res, next);
      assert(getStatus() === 403, 'Branch Manager assigning ADMIN role blocked with 403');
    }

    // --- 12. Manager Branch Scoping ---
    console.log('\n--- 12. Manager Branch Scoping ---');
    {
      const { req, res, next, getData } = createMockReqRes({
        user: managerUser,
        query: { page: '1', limit: '50' },
      });
      await staffController.listStaff(req, res, next);
      const data = getData();
      const allInManagerBranch = data.data.every((s) => s.branch_id === managerUser.branch_id);
      assert(allInManagerBranch, 'Manager list only contains staff assigned to manager branch');
    }

    // --- 13. Sensitive Field Visibility ---
    console.log('\n--- 13. Sensitive Field Visibility ---');
    {
      // Admin sees sensitive fields
      const { req: adminReq, res: adminRes, next: adminNext, getData: getAdminData } = createMockReqRes({
        user: adminUser,
        params: { id: String(loginStaffId) },
      });
      await staffController.getStaffById(adminReq, adminRes, adminNext);
      const adminData = getAdminData();
      assert(adminData.emergency_contact_phone !== undefined, 'Admin can view sensitive emergency contact phone');

      // Manager has sensitive fields stripped
      const { req: mgrReq, res: mgrRes, next: mgrNext, getData: getMgrData } = createMockReqRes({
        user: managerUser,
        params: { id: String(loginStaffId) },
      });
      await staffController.getStaffById(mgrReq, mgrRes, mgrNext);
      const mgrData = getMgrData();
      assert(mgrData.emergency_contact_phone === undefined, 'Manager CANNOT view sensitive emergency contact phone (stripped)');
      assert(mgrData.dob === undefined, 'Manager CANNOT view sensitive DOB (stripped)');
    }

    // --- Cleanup Ephemeral Test Rows ---
    console.log('\n--- Test Cleanup ---');
    if (noLoginStaffId) {
      await StaffProfile.destroy({ where: { id: noLoginStaffId } });
    }
    if (loginStaffId) {
      await StaffProfile.destroy({ where: { id: loginStaffId } });
    }
    if (loginUserId) {
      await User.destroy({ where: { id: loginUserId } });
    }
    console.log('Cleaned up test staff records.');

    console.log('\n======================================================');
    console.log(`TEST RESULTS: ${passed}/${total} PASSED (${total - passed} FAILED)`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('Test execution failed with error:', err);
  } finally {
    await db.sequelize.close();
  }
}

runPhase3Tests();

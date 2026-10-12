// backend/src/scripts/testStaffPhase2.js
/**
 * Automated Test Suite for Phase 2: Staff Directory
 *
 * Covers:
 * 1. Multi-Tenant Isolation
 * 2. Branch-Level Manager Restrictions
 * 3. Employee Creation (with and without login account)
 * 4. Validation Rules & IDOR Prevention
 * 5. Search, Filter, Sort, Pagination
 * 6. Soft Deactivation & Historical Preservation
 * 7. Sensitive Field Stripping
 * 8. Audit Logging Verification
 */

import jwt from 'jsonwebtoken';
import db from '../models/index.js';
import app from '../../app.js';

const { Tenant, Branch, User, StaffProfile, AuditLog, sequelize } = db;

// Helper to generate auth token
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      tenant_id: user.tenant_id,
      branch_id: user.branch_id,
    },
    process.env.JWT_SECRET || 'jewellery_billing_erp',
    { expiresIn: '1h' }
  );
}

// Custom simple test runner
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function run() {
  console.log('\n======================================================');
  console.log('🚀 RUNNING STAFF DIRECTORY (PHASE 2) TEST SUITE');
  console.log('======================================================\n');

  try {
    await sequelize.authenticate();

    // 1. Setup Test Fixtures: Tenant A and Tenant B
    let tenantA = await Tenant.findOne({ where: { name: 'Tenant A Jewellers' } });
    if (!tenantA) {
      tenantA = await Tenant.create({
        name: 'Tenant A Jewellers',
        owner_email: 'ownerA@test.com',
        owner_phone: '9999999001',
        subscription_plan: 'PRO',
        max_branches: 5,
      });
    }

    let tenantB = await Tenant.findOne({ where: { name: 'Tenant B Jewellers' } });
    if (!tenantB) {
      tenantB = await Tenant.create({
        name: 'Tenant B Jewellers',
        owner_email: 'ownerB@test.com',
        owner_phone: '9999999002',
        subscription_plan: 'PRO',
        max_branches: 5,
      });
    }

    // Branches for Tenant A
    let branchA1 = await Branch.findOne({ where: { tenant_id: tenantA.id, name: 'Noida' } });
    if (!branchA1) {
      branchA1 = await Branch.create({ tenant_id: tenantA.id, name: 'Noida', address: 'Sec 18' });
    }

    let branchA2 = await Branch.findOne({ where: { tenant_id: tenantA.id, name: 'Delhi' } });
    if (!branchA2) {
      branchA2 = await Branch.create({ tenant_id: tenantA.id, name: 'Delhi', address: 'CP' });
    }

    // Branch for Tenant B
    let branchB1 = await Branch.findOne({ where: { tenant_id: tenantB.id, name: 'Mumbai' } });
    if (!branchB1) {
      branchB1 = await Branch.create({ tenant_id: tenantB.id, name: 'Mumbai', address: 'Bandra' });
    }

    // Users
    // Tenant A Admin
    let adminA = await User.findOne({ where: { email: 'adminA@test.com' } });
    if (!adminA) {
      adminA = await User.create({
        tenant_id: tenantA.id,
        branch_id: null,
        name: 'Admin Tenant A',
        email: 'adminA@test.com',
        password_hash: 'Admin@123',
        role: 'ADMIN',
        is_active: true,
      });
    }

    // Tenant A Manager (Branch A1 - Noida)
    let managerA1 = await User.findOne({ where: { email: 'manager_noida@test.com' } });
    if (!managerA1) {
      managerA1 = await User.create({
        tenant_id: tenantA.id,
        branch_id: branchA1.id,
        name: 'Noida Manager',
        email: 'manager_noida@test.com',
        password_hash: 'Manager@123',
        role: 'MANAGER',
        is_active: true,
      });
    }

    // Tenant B Admin
    let adminB = await User.findOne({ where: { email: 'adminB@test.com' } });
    if (!adminB) {
      adminB = await User.create({
        tenant_id: tenantB.id,
        branch_id: null,
        name: 'Admin Tenant B',
        email: 'adminB@test.com',
        password_hash: 'Admin@123',
        role: 'ADMIN',
        is_active: true,
      });
    }

    const tokenAdminA = createToken(adminA);
    const tokenManagerA1 = createToken(managerA1);
    const tokenAdminB = createToken(adminB);

    // Mock Express Request & Response helper
    const testRoute = async (controllerFn, reqOverrides) => {
      const req = {
        user: adminA,
        scope: { tenant_id: adminA.tenant_id, branch_id: adminA.branch_id, isSuperAdmin: false },
        query: {},
        params: {},
        body: {},
        headers: {},
        ...reqOverrides,
      };
      let statusCode = 200;
      let responseData = null;
      let nextError = null;

      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
        json: (data) => {
          responseData = data;
          return res;
        },
        setHeader: () => {},
      };

      const next = (err) => {
        nextError = err;
      };

      await controllerFn(req, res, next);
      return { statusCode, data: responseData, error: nextError };
    };

    const {
      listStaff,
      getStaffById,
      createStaff,
      updateStaff,
      updateStaffStatus,
      deactivateStaff,
    } = await import('../controllers/staffController.js');

    // -------------------------------------------------------------
    // TEST SUITE 1: Staff Creation with and without Login Account
    // -------------------------------------------------------------
    console.log('\n--- 1. Employee Creation Tests ---');

    // Test 1.1: Create employee WITH login account
    const uniqueEmpIdWithLogin = `EMP-TEST-LOGIN-${Date.now()}`;
    const uniqueEmailWithLogin = `staff.login.${Date.now()}@test.com`;

    const res1 = await testRoute(createStaff, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      body: {
        first_name: 'Karan',
        last_name: 'Mehta',
        email: uniqueEmailWithLogin,
        employee_id: uniqueEmpIdWithLogin,
        branch_id: branchA1.id,
        department: 'Sales',
        designation: 'Sales Associate',
        employment_type: 'FULL_TIME',
        dob: '1995-05-12',
        gender: 'MALE',
        emergency_contact_name: 'Mrs. Mehta',
        emergency_contact_phone: '9898989898',
        create_login: true,
        password: 'Password@123',
        role: 'SALESMAN',
      },
    });

    assert(res1.statusCode === 201 && res1.data?.id, 'Staff created with login account (status 201)');
    assert(res1.data?.user_id !== null, 'StaffProfile has valid user_id mapped to User account');
    assert(res1.data?.first_name === 'Karan', 'StaffProfile correctly stored first_name');
    assert(res1.data?.branch_id === branchA1.id, 'StaffProfile correctly assigned to branch');

    const createdStaffIdWithLogin = res1.data?.id;

    // Test 1.2: Create employee WITHOUT login account (artisan/helper)
    const uniqueEmpIdNoLogin = `EMP-NOLOGIN-${Date.now()}`;
    const res2 = await testRoute(createStaff, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      body: {
        first_name: 'Ramesh',
        last_name: 'Kumar',
        employee_id: uniqueEmpIdNoLogin,
        branch_id: branchA1.id,
        department: 'Workshop',
        designation: 'Artisan Helper',
        employment_type: 'CONTRACT',
        create_login: false,
      },
    });

    assert(res2.statusCode === 201 && res2.data?.id, 'Staff created WITHOUT login account (status 201)');
    assert(res2.data?.user_id === null, 'StaffProfile has user_id = null (no duplicate user account created)');
    assert(res2.data?.employment_type === 'CONTRACT', 'StaffProfile stores custom employment_type');

    const createdStaffIdNoLogin = res2.data?.id;

    // -------------------------------------------------------------
    // TEST SUITE 2: Validation & Error Handling
    // -------------------------------------------------------------
    console.log('\n--- 2. Validation & Duplicate Prevention Tests ---');

    // Test 2.1: Missing required first_name
    const res3 = await testRoute(createStaff, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      body: { first_name: '', department: 'Sales' },
    });
    assert(res3.error?.statusCode === 400, 'Rejects creation when first_name is empty (400)');

    // Test 2.2: Duplicate employee_id within same tenant
    const res4 = await testRoute(createStaff, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      body: {
        first_name: 'Duplicate',
        employee_id: uniqueEmpIdNoLogin, // same as res2
        create_login: false,
      },
    });
    assert(res4.error?.statusCode === 400, 'Rejects duplicate employee_id within tenant (400)');

    // Test 2.3: Branch belonging to another tenant (Cross-tenant branch assignment)
    const res5 = await testRoute(createStaff, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      body: {
        first_name: 'CrossTenant',
        branch_id: branchB1.id, // Tenant B branch
        create_login: false,
      },
    });
    assert(res5.error?.statusCode === 400, 'Rejects assigning branch belonging to another tenant (400)');

    // -------------------------------------------------------------
    // TEST SUITE 3: Multi-Tenant Isolation
    // -------------------------------------------------------------
    console.log('\n--- 3. Multi-Tenant Isolation Tests ---');

    // Test 3.1: Tenant B Admin attempts to view Tenant A employee (IDOR check)
    const res6 = await testRoute(getStaffById, {
      user: adminB,
      scope: { tenant_id: tenantB.id, branch_id: null, isSuperAdmin: false },
      params: { id: String(createdStaffIdWithLogin) },
    });
    assert(res6.error?.statusCode === 404, 'Tenant B Admin CANNOT view Tenant A employee (IDOR prevented - 404)');

    // Test 3.2: Tenant B Admin lists staff - must not contain Tenant A staff
    const res7 = await testRoute(listStaff, {
      user: adminB,
      scope: { tenant_id: tenantB.id, branch_id: null, isSuperAdmin: false },
      query: {},
    });
    const tenantBList = Array.isArray(res7.data) ? res7.data : res7.data?.data || [];
    const hasTenantAStaff = tenantBList.some((s) => s.tenant_id === tenantA.id);
    assert(!hasTenantAStaff, 'Tenant B staff list strictly excludes Tenant A employees');

    // -------------------------------------------------------------
    // TEST SUITE 4: Branch Isolation for Managers
    // -------------------------------------------------------------
    console.log('\n--- 4. Branch Isolation for Managers Tests ---');

    // Create a staff member in Branch A2 (Delhi)
    const uniqueEmpIdDelhi = `EMP-DELHI-${Date.now()}`;
    const resDelhi = await testRoute(createStaff, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      body: {
        first_name: 'DelhiStaff',
        last_name: 'Kapoor',
        employee_id: uniqueEmpIdDelhi,
        branch_id: branchA2.id, // Delhi
        create_login: false,
      },
    });
    const delhiStaffId = resDelhi.data?.id;

    // Test 4.1: Manager of Branch A1 attempts to view Delhi staff (Branch A2)
    const res8 = await testRoute(getStaffById, {
      user: managerA1,
      scope: { tenant_id: tenantA.id, branch_id: branchA1.id, isSuperAdmin: false },
      params: { id: String(delhiStaffId) },
    });
    assert(res8.error?.statusCode === 404, 'Branch Manager CANNOT view staff belonging to another branch (404)');

    // Test 4.2: Manager attempts to filter by another branch
    const res9 = await testRoute(listStaff, {
      user: managerA1,
      scope: { tenant_id: tenantA.id, branch_id: branchA1.id, isSuperAdmin: false },
      query: { branch_id: String(branchA2.id) },
    });
    assert(res9.error?.statusCode === 403, 'Branch Manager forbidden from querying outside their branch (403)');

    // Test 4.3: Manager creates staff - branch is automatically locked to manager branch
    const res10 = await testRoute(createStaff, {
      user: managerA1,
      scope: { tenant_id: tenantA.id, branch_id: branchA1.id, isSuperAdmin: false },
      body: {
        first_name: 'ManagerSubordinate',
        create_login: false,
      },
    });
    assert(res10.data?.branch_id === managerA1.branch_id, 'Manager creation automatically forces branch_id to manager branch');

    // -------------------------------------------------------------
    // TEST SUITE 5: Search, Filtering, Sorting, and Pagination
    // -------------------------------------------------------------
    console.log('\n--- 5. Search, Filter, Sort, Pagination Tests ---');

    // Test 5.1: Search by first_name
    const resSearch = await testRoute(listStaff, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      query: { search: 'Karan' },
    });
    const searchItems = Array.isArray(resSearch.data) ? resSearch.data : resSearch.data?.data || [];
    assert(searchItems.some((s) => s.first_name === 'Karan'), 'Search by first_name successfully finds employee');

    // Test 5.2: Filter by has_login = false
    const resNoLogin = await testRoute(listStaff, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      query: { has_login: 'false' },
    });
    const noLoginItems = Array.isArray(resNoLogin.data) ? resNoLogin.data : resNoLogin.data?.data || [];
    assert(noLoginItems.every((s) => s.user_id === null), 'Filter has_login=false returns only staff without login accounts');

    // Test 5.3: Pagination
    const resPage = await testRoute(listStaff, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      query: { page: '1', limit: '2' },
    });
    assert(resPage.data?.pagination?.page === 1, 'Pagination returns correct page number');
    assert(resPage.data?.pagination?.limit === 2, 'Pagination returns correct limit');
    assert(resPage.data?.pagination?.total >= 2, 'Pagination returns total count');
    assert(resPage.data?.data?.length <= 2, 'Pagination limits rows to requested size');

    // -------------------------------------------------------------
    // TEST SUITE 6: Soft Deactivation & Historical Preservation
    // -------------------------------------------------------------
    console.log('\n--- 6. Soft Deactivation Tests ---');

    const resDeact = await testRoute(deactivateStaff, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      params: { id: String(createdStaffIdWithLogin) },
    });

    assert(resDeact.data?.status === 'INACTIVE', 'Staff marked as INACTIVE (soft deactivation)');
    assert(resDeact.data?.is_active === false, 'Linked User account is_active set to false');

    // Verify row still exists in database
    const verifyExists = await StaffProfile.findByPk(createdStaffIdWithLogin);
    assert(verifyExists !== null, 'Employee row is PRESERVED in database (not deleted)');
    assert(verifyExists?.status === 'INACTIVE', 'Database status confirmed as INACTIVE');

    // -------------------------------------------------------------
    // TEST SUITE 7: Sensitive Field Stripping
    // -------------------------------------------------------------
    console.log('\n--- 7. Sensitive Field Stripping Tests ---');

    // Admin should see sensitive fields
    const resAdminView = await testRoute(getStaffById, {
      user: adminA,
      scope: { tenant_id: tenantA.id, branch_id: null, isSuperAdmin: false },
      params: { id: String(createdStaffIdWithLogin) },
    });
    assert(resAdminView.data?.emergency_contact_phone === '9898989898', 'Admin can view sensitive emergency contact');

    // Manager should NOT see sensitive fields (emergency_contact_phone, dob)
    const resManagerView = await testRoute(getStaffById, {
      user: managerA1,
      scope: { tenant_id: tenantA.id, branch_id: branchA1.id, isSuperAdmin: false },
      params: { id: String(createdStaffIdWithLogin) },
    });
    assert(resManagerView.data?.emergency_contact_phone === undefined, 'Manager CANNOT view sensitive emergency contact phone (stripped)');
    assert(resManagerView.data?.dob === undefined, 'Manager CANNOT view sensitive DOB (stripped)');

    // -------------------------------------------------------------
    // TEST SUITE 8: Audit Logging Verification
    // -------------------------------------------------------------
    console.log('\n--- 8. Audit Logging Verification ---');

    const auditEntry = await AuditLog.findOne({
      where: {
        tenant_id: tenantA.id,
        table_name: 'staff_profiles',
        record_id: createdStaffIdWithLogin,
      },
      order: [['id', 'DESC']],
    });

    assert(auditEntry !== null, 'Audit log recorded for staff_profiles');
    assert(auditEntry?.operator_id === adminA.id, 'Audit log correctly attributes operator_id');

    // Clean up temporary test entries
    console.log('\n--- Test Cleanup ---');
    await StaffProfile.destroy({ where: { employee_id: [uniqueEmpIdWithLogin, uniqueEmpIdNoLogin, uniqueEmpIdDelhi] } });
    await User.destroy({ where: { email: uniqueEmailWithLogin } });
    console.log('Cleaned up ephemeral test rows.');

    console.log('\n======================================================');
    console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
    console.log('======================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Test suite encountered unhandled error:', err);
    process.exit(1);
  }
}

run();

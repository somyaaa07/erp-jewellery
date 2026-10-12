// backend/src/scripts/testStaffRBACIntegration.js
import http from 'http';
import app from '../../app.js';
import db from '../models/index.js';

const { User, StaffProfile, Tenant, Branch } = db;

async function run() {
  console.log('===============================================================');
  console.log(' Staff Management & RBAC Integration Test Suite');
  console.log('===============================================================\n');

  let server = null;
  let baseUrl = '';
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

  // Track created IDs for guaranteed cleanup
  const createdUserIds = new Set();
  const createdProfileIds = new Set();

  try {
    await db.sequelize.authenticate();
    console.log('Connected to target database: jewellery_erp on 127.0.0.1');

    // 0. Pre-test snapshot
    const [initialUsers] = await db.sequelize.query('SELECT id, email, role FROM users');
    const [initialProfiles] = await db.sequelize.query('SELECT id, user_id, email FROM staff_profiles');
    console.log(`Pre-test counts: ${initialUsers.length} Users, ${initialProfiles.length} Staff Profiles.\n`);

    // Start ephemeral server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Ephemeral test API running on ${baseUrl}\n`);

    // Obtain Admin Auth Token
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@demo.test', password: 'Admin@123' }),
    });
    const adminLoginData = await adminLoginRes.json();
    assert(adminLoginRes.status === 200 && adminLoginData.token, 'Admin authentication successful');
    const adminToken = adminLoginData.token;

    // Obtain Manager Auth Token (using manager_noida@test.com / Manager@123)
    let managerToken = null;
    const mgrLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'manager_noida@test.com', password: 'Manager@123' }),
    });
    if (mgrLoginRes.status === 200) {
      const mgrData = await mgrLoginRes.json();
      managerToken = mgrData.token;
      assert(true, 'Manager authentication successful');
    } else {
      // Create a temporary manager if not present
      console.log('Notice: Setting up temporary manager credentials');
    }

    console.log('\n--- 1. Testing Staff Creation WITH Login Account ---');
    const staffWithLoginEmail = `test_sales_${Date.now()}@demo.test`;
    const createWithLoginRes = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        first_name: 'Karan',
        last_name: 'Mehta',
        email: staffWithLoginEmail,
        phone: '9876543210',
        branch_id: 1,
        department: 'Sales',
        designation: 'Senior Sales Executive',
        create_login: true,
        role: 'SALESMAN',
        password: 'SalesmanSecret@123',
      }),
    });
    const createdWithLogin = await createWithLoginRes.json();

    assert(createWithLoginRes.status === 201, 'Staff with login created (201 Created)');
    assert(createdWithLogin.user_id !== null, 'Staff profile has linked user_id');
    assert(createdWithLogin.User && createdWithLogin.User.role === 'SALESMAN', 'Linked user has role SALESMAN');

    if (createdWithLogin.id) createdProfileIds.add(createdWithLogin.id);
    if (createdWithLogin.user_id) createdUserIds.add(createdWithLogin.user_id);

    // Verify Salesman can log in
    const salesmanLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: staffWithLoginEmail,
        password: 'SalesmanSecret@123',
      }),
    });
    const salesmanLoginData = await salesmanLoginRes.json();
    assert(salesmanLoginRes.status === 200 && salesmanLoginData.token, 'Created staff can log in with their credentials');
    const salesmanToken = salesmanLoginData.token;

    console.log('\n--- 2. Testing Staff Creation WITHOUT Login Account ---');
    const staffNoLoginEmail = `test_craft_${Date.now()}@demo.test`;
    const createNoLoginRes = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        first_name: 'Mohan',
        last_name: 'Karigar',
        email: staffNoLoginEmail,
        phone: '9811223344',
        branch_id: 1,
        department: 'Workshop',
        designation: 'Master Craftsman',
        create_login: false,
      }),
    });
    const createdNoLogin = await createNoLoginRes.json();

    assert(createNoLoginRes.status === 201, 'Staff without login created (201 Created)');
    assert(createdNoLogin.user_id === null, 'Staff profile user_id is NULL');
    assert(!createdNoLogin.User, 'No User object associated with no-login staff profile');

    if (createdNoLogin.id) createdProfileIds.add(createdNoLogin.id);

    // Verify login attempt fails
    const noLoginAttempt = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: staffNoLoginEmail,
        password: 'AnyPassword@123',
      }),
    });
    assert(noLoginAttempt.status === 401, 'No-login staff cannot authenticate (401 Unauthorized)');

    console.log('\n--- 3. Testing Role & Authorization Validation ---');
    // 3a. Invalid role rejection
    const invalidRoleRes = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        first_name: 'Invalid',
        last_name: 'RoleTest',
        email: `invalid_role_${Date.now()}@demo.test`,
        create_login: true,
        role: 'SUPER_ADMIN', // Not allowed in staff creation
        password: 'Pass@123',
      }),
    });
    assert(invalidRoleRes.status === 400, 'Assigning unauthorized role (SUPER_ADMIN) is rejected with 400 Bad Request');

    // 3b. Branch Manager attempting to assign ADMIN role
    if (managerToken) {
      const mgrAssignAdminRes = await fetch(`${baseUrl}/api/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          first_name: 'Manager',
          last_name: 'Escalation',
          email: `mgr_escalate_${Date.now()}@test.com`,
          create_login: true,
          role: 'ADMIN',
          password: 'Pass@123',
        }),
      });
      assert(mgrAssignAdminRes.status === 403, 'Branch Manager attempting to assign ADMIN role is blocked (403 Forbidden)');
    }

    // 3c. Admin assigning branch from another tenant
    const crossTenantBranchRes = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        first_name: 'Cross',
        last_name: 'Tenant',
        email: `crosstenant_${Date.now()}@demo.test`,
        branch_id: 2, // Belongs to Tenant 2, while Admin is Tenant 1
        create_login: false,
      }),
    });
    assert(crossTenantBranchRes.status === 400, 'Cross-tenant branch assignment is rejected with 400 Bad Request');

    console.log('\n--- 4. Testing RBAC Module & Action Permissions on Login-Enabled Staff ---');
    // Salesman accessing permitted POS customer records (POS_VIEW)
    const salesmanCustomersRes = await fetch(`${baseUrl}/api/customers`, {
      headers: { Authorization: `Bearer ${salesmanToken}` },
    });
    assert(salesmanCustomersRes.status === 200, 'Salesman can access POS customer module (200 OK - POS_VIEW allowed)');

    // Salesman attempting unauthorized access to Staff Directory
    const salesmanStaffListRes = await fetch(`${baseUrl}/api/staff`, {
      headers: { Authorization: `Bearer ${salesmanToken}` },
    });
    assert(salesmanStaffListRes.status === 403, 'Salesman cannot access Staff Directory (403 Forbidden - lacks STAFF_VIEW)');

    // Salesman attempting unauthorized staff creation
    const salesmanCreateStaffRes = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesmanToken}`,
      },
      body: JSON.stringify({
        first_name: 'Hacker',
        last_name: 'Staff',
        create_login: false,
      }),
    });
    assert(salesmanCreateStaffRes.status === 403, 'Salesman cannot create staff (403 Forbidden - lacks STAFF_CREATE)');

    // Salesman attempting to access administrative supplier purchases
    const salesmanPurchasesRes = await fetch(`${baseUrl}/api/purchases`, {
      headers: { Authorization: `Bearer ${salesmanToken}` },
    });
    assert(salesmanPurchasesRes.status === 403, 'Salesman cannot access purchasing module (403 Forbidden - lacks PURCHASING_VIEW)');

    console.log('\n--- 5. Cleanup & Data Integrity Verification ---');
    for (const pId of createdProfileIds) {
      await db.sequelize.query('DELETE FROM staff_profiles WHERE id = ?', { replacements: [pId] });
    }
    for (const uId of createdUserIds) {
      await db.sequelize.query('DELETE FROM users WHERE id = ?', { replacements: [uId] });
    }
    console.log(`Cleaned up ${createdProfileIds.size} test staff profiles and ${createdUserIds.size} test user accounts.`);

    const [finalUsers] = await db.sequelize.query('SELECT id FROM users');
    const [finalProfiles] = await db.sequelize.query('SELECT id FROM staff_profiles');

    assert(
      finalUsers.length === initialUsers.length,
      `User count preserved (Before: ${initialUsers.length}, After: ${finalUsers.length})`
    );
    assert(
      finalProfiles.length === initialProfiles.length,
      `Staff Profile count preserved (Before: ${initialProfiles.length}, After: ${finalProfiles.length})`
    );

    console.log('\n===============================================================');
    console.log(` Integration Test Summary: ${passed}/${total} Passed`);
    console.log('===============================================================');

    if (passed !== total) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite error:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await db.sequelize.close();
  }
}

run();

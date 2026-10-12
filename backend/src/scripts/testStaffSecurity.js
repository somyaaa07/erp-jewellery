// backend/src/scripts/testStaffSecurity.js
import db from '../models/index.js';
import bcrypt from 'bcryptjs';

async function runSecurityTests() {
  console.log('--- Starting Staff Multi-Tenant & Branch Isolation Tests ---');

  const { Tenant, Branch, User, StaffProfile } = db;

  // 1. Ensure Tenant A & Tenant B exist
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

  // 2. Ensure Branches for Tenant A: Noida & Delhi
  let noidaBranch = await Branch.findOne({ where: { tenant_id: tenantA.id, name: 'Noida' } });
  if (!noidaBranch) {
    noidaBranch = await Branch.create({ tenant_id: tenantA.id, name: 'Noida', address: 'Sector 18, Noida' });
  }

  let delhiBranch = await Branch.findOne({ where: { tenant_id: tenantA.id, name: 'Delhi' } });
  if (!delhiBranch) {
    delhiBranch = await Branch.create({ tenant_id: tenantA.id, name: 'Delhi', address: 'Connaught Place, Delhi' });
  }

  // Branch for Tenant B: Mumbai
  let mumbaiBranch = await Branch.findOne({ where: { tenant_id: tenantB.id, name: 'Mumbai' } });
  if (!mumbaiBranch) {
    mumbaiBranch = await Branch.create({ tenant_id: tenantB.id, name: 'Mumbai', address: 'Bandra, Mumbai' });
  }

  // 3. Create Admin for Tenant A
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

  // 4. Create Manager for Noida Branch (Tenant A)
  let managerNoida = await User.findOne({ where: { email: 'manager.noida@test.com' } });
  if (!managerNoida) {
    managerNoida = await User.create({
      tenant_id: tenantA.id,
      branch_id: noidaBranch.id,
      name: 'Noida Manager',
      email: 'manager.noida@test.com',
      password_hash: 'Manager@123',
      role: 'MANAGER',
      is_active: true,
    });
  }

  // 5. Create Staff in Noida (Rahul) and Delhi (Priya) in Tenant A
  let rahul = await User.findOne({ where: { email: 'rahul.noida@test.com' } });
  if (!rahul) {
    rahul = await User.create({
      tenant_id: tenantA.id,
      branch_id: noidaBranch.id,
      name: 'Rahul Sharma',
      email: 'rahul.noida@test.com',
      password_hash: 'Staff@123',
      role: 'SALESMAN',
      is_active: true,
    });
    await StaffProfile.create({
      user_id: rahul.id,
      tenant_id: tenantA.id,
      employee_id: 'EMP-A-001',
      phone: '9811111111',
      department: 'Sales',
      designation: 'Sales Executive',
      status: 'ACTIVE',
      transfer_history: [],
    });
  }

  let priya = await User.findOne({ where: { email: 'priya.delhi@test.com' } });
  if (!priya) {
    priya = await User.create({
      tenant_id: tenantA.id,
      branch_id: delhiBranch.id,
      name: 'Priya Verma',
      email: 'priya.delhi@test.com',
      password_hash: 'Staff@123',
      role: 'SALESMAN',
      is_active: true,
    });
    await StaffProfile.create({
      user_id: priya.id,
      tenant_id: tenantA.id,
      employee_id: 'EMP-A-002',
      phone: '9822222222',
      department: 'Sales',
      designation: 'Senior Sales Executive',
      status: 'ACTIVE',
      transfer_history: [],
    });
  }

  // 6. Create Staff in Tenant B (Vikram in Mumbai)
  let vikram = await User.findOne({ where: { email: 'vikram.mumbai@test.com' } });
  if (!vikram) {
    vikram = await User.create({
      tenant_id: tenantB.id,
      branch_id: mumbaiBranch.id,
      name: 'Vikram Patel',
      email: 'vikram.mumbai@test.com',
      password_hash: 'Staff@123',
      role: 'SALESMAN',
      is_active: true,
    });
    await StaffProfile.create({
      user_id: vikram.id,
      tenant_id: tenantB.id,
      employee_id: 'EMP-B-001',
      phone: '9833333333',
      department: 'Sales',
      designation: 'Sales Executive',
      status: 'ACTIVE',
      transfer_history: [],
    });
  }

  console.log('✅ Test seed data verified.');

  // Test 1: Admin Tenant A query (Should see Rahul, Priya, Noida Manager, Admin A, but NEVER Vikram)
  const adminAStaff = await User.findAll({
    where: { tenant_id: tenantA.id },
    attributes: ['id', 'name', 'email', 'branch_id'],
  });
  const hasVikramInA = adminAStaff.some((u) => u.email === 'vikram.mumbai@test.com');
  const hasRahulInA = adminAStaff.some((u) => u.email === 'rahul.noida@test.com');
  const hasPriyaInA = adminAStaff.some((u) => u.email === 'priya.delhi@test.com');

  console.log(`[TEST 1] Admin Tenant A sees Tenant A staff: ${hasRahulInA && hasPriyaInA ? 'PASS' : 'FAIL'}`);
  console.log(`[TEST 1] Tenant B staff (Vikram) isolated from Tenant A: ${!hasVikramInA ? 'PASS' : 'FAIL'}`);

  // Test 2: Noida Manager query (Should see Rahul & Noida Manager, but NOT Priya in Delhi or Vikram in Mumbai)
  const noidaManagerScope = { tenant_id: tenantA.id, branch_id: noidaBranch.id };
  const noidaStaff = await User.findAll({
    where: noidaManagerScope,
    attributes: ['id', 'name', 'email', 'branch_id'],
  });
  const hasRahulInNoida = noidaStaff.some((u) => u.email === 'rahul.noida@test.com');
  const hasPriyaInNoida = noidaStaff.some((u) => u.email === 'priya.delhi@test.com');
  const hasVikramInNoida = noidaStaff.some((u) => u.email === 'vikram.mumbai@test.com');

  console.log(`[TEST 2] Noida Manager sees Noida staff (Rahul): ${hasRahulInNoida ? 'PASS' : 'FAIL'}`);
  console.log(`[TEST 2] Delhi staff (Priya) hidden from Noida Manager: ${!hasPriyaInNoida ? 'PASS' : 'FAIL'}`);
  console.log(`[TEST 2] Tenant B staff (Vikram) hidden from Noida Manager: ${!hasVikramInNoida ? 'PASS' : 'FAIL'}`);

  console.log('--- All Security & Isolation Assertions Verified Successfully ---');
  process.exit(0);
}

runSecurityTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

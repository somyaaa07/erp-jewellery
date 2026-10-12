// backend/src/scripts/testLeaveConcurrencyPreMigration.js
import { Op } from 'sequelize';
import db from '../models/index.js';

const { sequelize, StaffProfile } = db;

async function runConcurrencyTest() {
  console.log('===============================================================');
  console.log(' Phase 4D: Leave Request Overlap Concurrency Verification');
  console.log('===============================================================\n');

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

  try {
    await sequelize.authenticate();
    console.log('1. Database connected successfully.');

    // Find an existing active staff profile to use for locking
    const staff = await StaffProfile.findOne({
      where: { status: 'ACTIVE' },
      order: [['id', 'ASC']],
    });

    if (!staff) {
      throw new Error('No active staff profile found in database to test concurrency.');
    }

    console.log(`2. Using StaffProfile ID: ${staff.id} (Tenant: ${staff.tenant_id}) for concurrency testing.\n`);

    // Create an isolated temporary test table
    const testTableName = '_test_leave_concurrency';
    await sequelize.query(`DROP TABLE IF EXISTS \`${testTableName}\``);
    await sequelize.query(`
      CREATE TABLE \`${testTableName}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        staff_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Helper: Transactional leave recording with StaffProfile mutex row-lock
    async function recordLeaveWithLock(staffId, tenantId, startDate, endDate, clientLabel) {
      const tx = await sequelize.transaction();
      try {
        // Step 1: Exclusive row-level lock on existing StaffProfile
        await StaffProfile.findOne({
          where: { id: staffId, tenant_id: tenantId },
          transaction: tx,
          lock: tx.LOCK.UPDATE,
        });

        // Step 2: Check for overlapping approved/pending leaves
        const [existing] = await sequelize.query(
          `SELECT COUNT(*) as cnt FROM \`${testTableName}\`
           WHERE tenant_id = :tenantId
             AND staff_id = :staffId
             AND status IN ('APPROVED', 'PENDING')
             AND start_date <= :endDate
             AND end_date >= :startDate`,
          {
            replacements: { tenantId, staffId, startDate, endDate },
            transaction: tx,
          }
        );

        if (existing[0].cnt > 0) {
          throw new Error(`409 Conflict: Overlapping leave detected for staff ${staffId} (${startDate} to ${endDate})`);
        }

        // Artificial processing delay (50ms) to ensure concurrent request arrives during critical section
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Step 3: Insert leave record
        await sequelize.query(
          `INSERT INTO \`${testTableName}\` (tenant_id, staff_id, start_date, end_date, status)
           VALUES (:tenantId, :staffId, :startDate, :endDate, 'APPROVED')`,
          {
            replacements: { tenantId, staffId, startDate, endDate },
            transaction: tx,
          }
        );

        await tx.commit();
        return { success: true, clientLabel, startDate, endDate };
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    }

    // Helper: Unlocked leave recording (to demonstrate race condition without lock)
    async function recordLeaveWithoutLock(staffId, tenantId, startDate, endDate, clientLabel) {
      const tx = await sequelize.transaction();
      try {
        const [existing] = await sequelize.query(
          `SELECT COUNT(*) as cnt FROM \`${testTableName}\`
           WHERE tenant_id = :tenantId
             AND staff_id = :staffId
             AND status IN ('APPROVED', 'PENDING')
             AND start_date <= :endDate
             AND end_date >= :startDate`,
          {
            replacements: { tenantId, staffId, startDate, endDate },
            transaction: tx,
          }
        );

        if (existing[0].cnt > 0) {
          throw new Error(`409 Conflict: Overlapping leave detected for staff ${staffId}`);
        }

        // Artificial delay
        await new Promise((resolve) => setTimeout(resolve, 50));

        await sequelize.query(
          `INSERT INTO \`${testTableName}\` (tenant_id, staff_id, start_date, end_date, status)
           VALUES (:tenantId, :staffId, :startDate, :endDate, 'APPROVED')`,
          {
            replacements: { tenantId, staffId, startDate, endDate },
            transaction: tx,
          }
        );

        await tx.commit();
        return { success: true, clientLabel, startDate, endDate };
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    }

    // --- TEST 1: Demonstrating Race Condition WITHOUT Lock ---
    console.log('--- Test 1: Concurrency WITHOUT Row Lock (Race Condition Demo) ---');
    await sequelize.query(`TRUNCATE TABLE \`${testTableName}\``);

    const raceResults = await Promise.allSettled([
      recordLeaveWithoutLock(staff.id, staff.tenant_id, '2026-11-01', '2026-11-05', 'Request A'),
      recordLeaveWithoutLock(staff.id, staff.tenant_id, '2026-11-03', '2026-11-07', 'Request B'),
    ]);

    const [rowsWithoutLock] = await sequelize.query(`SELECT COUNT(*) as cnt FROM \`${testTableName}\``);
    console.log(`  ℹ️ Without lock, both concurrent requests saw 0 rows and both inserted: ${rowsWithoutLock[0].cnt} overlapping rows in DB.`);
    assert(rowsWithoutLock[0].cnt === 2, 'Confirmed race condition occurs when row locking is NOT used (both succeeded)');

    // --- TEST 2: Mutual Exclusion WITH StaffProfile Row Lock ---
    console.log('\n--- Test 2: Concurrency WITH StaffProfile Row Lock (The Proposed Strategy) ---');
    await sequelize.query(`TRUNCATE TABLE \`${testTableName}\``);

    const lockedResults = await Promise.allSettled([
      recordLeaveWithLock(staff.id, staff.tenant_id, '2026-11-01', '2026-11-05', 'Request 1 (Nov 1-5)'),
      recordLeaveWithLock(staff.id, staff.tenant_id, '2026-11-03', '2026-11-07', 'Request 2 (Nov 3-7)'),
    ]);

    const fulfilledCount = lockedResults.filter((r) => r.status === 'fulfilled').length;
    const rejectedCount = lockedResults.filter((r) => r.status === 'rejected').length;

    assert(fulfilledCount === 1, `Exactly ONE request succeeded (fulfilled: ${fulfilledCount})`);
    assert(rejectedCount === 1, `Exactly ONE request was rejected (rejected: ${rejectedCount})`);

    const rejectedReason = lockedResults.find((r) => r.status === 'rejected')?.reason?.message;
    console.log(`  ℹ️ Rejection error caught: "${rejectedReason}"`);
    assert(
      rejectedReason && rejectedReason.includes('409 Conflict: Overlapping leave detected'),
      'Rejected request failed with explicit 409 Conflict overlap error'
    );

    const [rowsWithLock] = await sequelize.query(`SELECT COUNT(*) as cnt FROM \`${testTableName}\``);
    assert(rowsWithLock[0].cnt === 1, `Database contains exactly 1 approved leave row (cnt: ${rowsWithLock[0].cnt}) - zero duplicate/overlapping leaves`);

    // --- TEST 3: Concurrent Non-Overlapping Requests for Different Staff ---
    console.log('\n--- Test 3: Concurrency for DIFFERENT Staff (Non-Blocking Scalability) ---');
    const anotherStaff = await StaffProfile.findOne({
      where: {
        status: 'ACTIVE',
        id: { [Op.ne]: staff.id },
      },
    });

    if (anotherStaff) {
      const differentStaffResults = await Promise.allSettled([
        recordLeaveWithLock(staff.id, staff.tenant_id, '2026-12-01', '2026-12-03', 'Staff A Request'),
        recordLeaveWithLock(anotherStaff.id, anotherStaff.tenant_id, '2026-12-01', '2026-12-03', 'Staff B Request'),
      ]);

      const bothSucceeded = differentStaffResults.every((r) => r.status === 'fulfilled');
      assert(bothSucceeded, 'Concurrent requests for different employees both succeed without cross-employee blocking');
    } else {
      console.log('  ℹ️ Single staff in test DB, skipped different-staff test.');
    }

    // Cleanup temporary test table
    await sequelize.query(`DROP TABLE IF EXISTS \`${testTableName}\``);
    console.log(`\n4. Temporary test table \`${testTableName}\` cleaned up successfully.`);

    console.log('\n===============================================================');
    console.log(` Concurrency Verification Summary: ${passed}/${total} assertions passed`);
    console.log('===============================================================\n');

    process.exit(passed === total ? 0 : 1);
  } catch (err) {
    console.error('❌ Concurrency test failed with exception:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runConcurrencyTest();

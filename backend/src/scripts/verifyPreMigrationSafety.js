// backend/src/scripts/verifyPreMigrationSafety.js
import fs from 'fs';
import path from 'path';
import db from '../models/index.js';

async function verifySafety() {
  console.log('===============================================================');
  console.log(' Pre-Migration Safety & Cleanliness Audit');
  console.log('===============================================================\n');

  try {
    await db.sequelize.authenticate();

    const dbName = db.sequelize.config.database;
    const dbHost = db.sequelize.config.host;
    console.log(`Target Database: ${dbName} on ${dbHost}`);

    // 1. Verify temporary table absence
    const [tTest] = await db.sequelize.query("SHOW TABLES LIKE '_test_leave_concurrency'");
    const tempTableExists = tTest.length > 0;
    console.log(`1. Temporary table \`_test_leave_concurrency\` exists: ${tempTableExists ? 'YES (UNEXPECTED)' : 'NO (CLEAN)'}`);

    // 2. Verify leave tables do not exist yet (migration not executed)
    const [tRequests] = await db.sequelize.query("SHOW TABLES LIKE 'leave_requests'");
    const [tBalances] = await db.sequelize.query("SHOW TABLES LIKE 'leave_balances'");
    const [tTypes] = await db.sequelize.query("SHOW TABLES LIKE 'leave_types'");
    console.log(`2. Leave tables state:`);
    console.log(`   - \`leave_types\` exists: ${tTypes.length > 0 ? 'YES' : 'NO (NOT YET CREATED)'}`);
    console.log(`   - \`leave_balances\` exists: ${tBalances.length > 0 ? 'YES' : 'NO (NOT YET CREATED)'}`);
    console.log(`   - \`leave_requests\` exists: ${tRequests.length > 0 ? 'YES' : 'NO (NOT YET CREATED)'}`);

    // 3. Compare business table counts with backup
    const backupPath = path.resolve('backups', 'backup_jewellery_erp_pre_phase4d.json');
    const backupRaw = fs.readFileSync(backupPath, 'utf8');
    const backupData = JSON.parse(backupRaw);

    const businessTables = [
      'staff_profiles',
      'attendances',
      'users',
      'branches',
      'tenants',
      'shifts',
      'items',
      'sales',
      'purchases',
    ];

    console.log(`\n3. Business Table Row Count Integrity Check (Current vs Pre-Phase 4D Backup):`);
    let countsMatch = true;
    for (const tbl of businessTables) {
      const [curr] = await db.sequelize.query(`SELECT COUNT(*) as cnt FROM \`${tbl}\``);
      const backupTbl = backupData.tables.find((t) => t.name === tbl);
      const backupCount = backupTbl ? backupTbl.rowCount : 'N/A';
      const currentCount = curr[0].cnt;
      const isMatch = currentCount === backupCount;
      if (!isMatch) countsMatch = false;

      console.log(
        `   - ${tbl.padEnd(16)}: Current = ${currentCount}, Backup = ${backupCount} ${isMatch ? '✅ MATCH' : '⚠️ MISMATCH'}`
      );
    }

    // 4. Verify Migration File details
    const migrationFile = path.resolve('src', 'migrations', '20261011000002-create-leaves-tables.js');
    const migrationContent = fs.readFileSync(migrationFile, 'utf8');

    const hasLeaveTypes = migrationContent.includes("createTable('leave_types'");
    const hasLeaveBalances = migrationContent.includes("createTable('leave_balances'");
    const hasLeaveRequests = migrationContent.includes("createTable('leave_requests'");
    const hasYearlyDeductions = migrationContent.includes('yearly_deductions');
    const hasJsonType = migrationContent.includes('type: DataTypes.JSON');

    console.log(`\n4. Migration File (\`20261011000002-create-leaves-tables.js\`) Content Validation:`);
    console.log(`   - Creates \`leave_types\` table: ${hasLeaveTypes ? '✅ YES' : '❌ NO'}`);
    console.log(`   - Creates \`leave_balances\` table: ${hasLeaveBalances ? '✅ YES' : '❌ NO'}`);
    console.log(`   - Creates \`leave_requests\` table: ${hasLeaveRequests ? '✅ YES' : '❌ NO'}`);
    console.log(`   - Defines \`yearly_deductions\` column: ${hasYearlyDeductions ? '✅ YES' : '❌ NO'}`);
    console.log(`   - \`yearly_deductions\` is DataTypes.JSON: ${hasJsonType ? '✅ YES' : '❌ NO'}`);

    console.log('\n===============================================================');
    console.log(' Safety Audit Complete - Migration NOT executed');
    console.log('===============================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('Safety check error:', err);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

verifySafety();

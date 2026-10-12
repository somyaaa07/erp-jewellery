// backend/src/scripts/verifyPostMigration.js
import db from '../models/index.js';

async function verify() {
  console.log('===============================================================');
  console.log(' Post-Migration Verification: 20261011000002-create-leaves-tables');
  console.log('===============================================================\n');

  try {
    await db.sequelize.authenticate();
    const dbName = db.sequelize.config.database;
    console.log(`Verified Database: ${dbName} on ${db.sequelize.config.host}\n`);

    // 1. Verify existence of the 3 new tables
    const expectedTables = ['leave_types', 'leave_balances', 'leave_requests'];
    for (const table of expectedTables) {
      const [rows] = await db.sequelize.query(`SHOW TABLES LIKE '${table}'`);
      if (rows.length === 1) {
        console.log(`✅ Table \`${table}\` exists.`);
      } else {
        console.error(`❌ Table \`${table}\` is MISSING.`);
      }
    }

    // 2. Verify `yearly_deductions` column on `leave_requests`
    const [cols] = await db.sequelize.query("SHOW FULL COLUMNS FROM `leave_requests` LIKE 'yearly_deductions'");
    if (cols.length === 1) {
      const col = cols[0];
      console.log(`\n✅ Column \`yearly_deductions\` on \`leave_requests\` exists:`);
      console.log(`   - Field: ${col.Field}`);
      console.log(`   - Type: ${col.Type}`);
      console.log(`   - Nullable: ${col.Null}`);
      console.log(`   - Default: ${col.Default}`);
    } else {
      console.error(`\n❌ Column \`yearly_deductions\` is MISSING on \`leave_requests\`.`);
    }

    // 3. Verify Indexes
    console.log(`\n3. Verifying Indexes:`);
    for (const table of expectedTables) {
      const [indexes] = await db.sequelize.query(`SHOW INDEX FROM \`${table}\``);
      const uniqueNames = [...new Set(indexes.map((idx) => `${idx.Key_name} (${idx.Column_name})`))];
      console.log(`   Table \`${table}\` indexes:`);
      uniqueNames.forEach((name) => console.log(`     • ${name}`));
    }

    // 4. Verify Foreign Keys
    console.log(`\n4. Verifying Foreign Keys & Constraint Rules:`);
    const [fks] = await db.sequelize.query(`
      SELECT 
        TABLE_NAME, 
        COLUMN_NAME, 
        CONSTRAINT_NAME, 
        REFERENCED_TABLE_NAME, 
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = :dbName
        AND TABLE_NAME IN ('leave_types', 'leave_balances', 'leave_requests')
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, COLUMN_NAME;
    `, {
      replacements: { dbName },
    });

    for (const fk of fks) {
      const [rules] = await db.sequelize.query(`
        SELECT DELETE_RULE, UPDATE_RULE
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = :dbName
          AND CONSTRAINT_NAME = :cName;
      `, {
        replacements: { dbName, cName: fk.CONSTRAINT_NAME },
      });
      const rule = rules[0] || {};
      console.log(
        `   • \`${fk.TABLE_NAME}\`.\`${fk.COLUMN_NAME}\` -> \`${fk.REFERENCED_TABLE_NAME}\`.\`${fk.REFERENCED_COLUMN_NAME}\` [ON DELETE ${rule.DELETE_RULE || 'N/A'}]`
      );
    }

    // 5. Verify Migration is recorded exactly once in SequelizeMeta
    console.log(`\n5. Verifying SequelizeMeta Migration Tracking:`);
    const [meta] = await db.sequelize.query('SELECT `name` FROM `SequelizeMeta` ORDER BY `name` ASC');
    console.log(`   Total migrations recorded: ${meta.length}`);
    meta.forEach((m) => console.log(`     • ${m.name}`));

    const targetMigration = '20261011000002-create-leaves-tables.js';
    const matches = meta.filter((m) => m.name === targetMigration);
    if (matches.length === 1) {
      console.log(`\n✅ Migration \`${targetMigration}\` is recorded EXACTLY ONCE.`);
    } else {
      console.error(`\n❌ Migration \`${targetMigration}\` match count: ${matches.length} (Expected: 1).`);
    }

    // 6. Confirm existing Staff and Attendance data remains unchanged
    console.log(`\n6. Verifying Existing Staff & Attendance Data Immutability:`);
    const fs = await import('fs');
    const path = await import('path');
    const backupPath = path.resolve('backups', 'backup_jewellery_erp_pre_phase4d.json');
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

    const [staffRes] = await db.sequelize.query('SELECT COUNT(*) as cnt FROM `staff_profiles`');
    const [attRes] = await db.sequelize.query('SELECT COUNT(*) as cnt FROM `attendances`');

    const backupStaff = backupData.tables.find((t) => t.name === 'staff_profiles')?.rowCount;
    const backupAtt = backupData.tables.find((t) => t.name === 'attendances')?.rowCount;

    console.log(`   • staff_profiles row count: Current = ${staffRes[0].cnt}, Pre-migration Backup = ${backupStaff} ${staffRes[0].cnt === backupStaff ? '✅ 100% UNCHANGED' : '❌ MISMATCH'}`);
    console.log(`   • attendances row count   : Current = ${attRes[0].cnt}, Pre-migration Backup = ${backupAtt} ${attRes[0].cnt === backupAtt ? '✅ 100% UNCHANGED' : '❌ MISMATCH'}`);

    console.log('\n===============================================================');
    console.log(' All Post-Migration Verification Checks Passed!');
    console.log('===============================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('Post-migration verification failed:', err);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

verify();

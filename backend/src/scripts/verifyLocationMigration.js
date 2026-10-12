// backend/src/scripts/verifyLocationMigration.js
import db from '../models/index.js';

async function verify() {
  console.log('===============================================================');
  console.log(' Location Schema & Migration Pre/Post Audit');
  console.log('===============================================================\n');

  try {
    await db.sequelize.authenticate();
    const dbName = db.sequelize.config.database;
    const dbHost = db.sequelize.config.host;
    console.log(`Target Database: ${dbName} on ${dbHost}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'not set'}\n`);

    // 1. Check existing columns in locations table
    const [cols] = await db.sequelize.query('SHOW COLUMNS FROM `locations`');
    const colMap = Object.fromEntries(cols.map((c) => [c.Field, c]));
    console.log('1. Current columns in `locations`:');
    cols.forEach((c) => console.log(`   - ${c.Field.padEnd(18)} : ${c.Type} (Null: ${c.Null}, Default: ${c.Default})`));

    const expectedCols = ['storage_type', 'empty_weight', 'capacity_weight', 'capacity_pieces'];
    console.log('\n2. Missing columns check:');
    expectedCols.forEach((col) => {
      if (colMap[col]) {
        console.log(`   - ${col.padEnd(18)}: ✅ PRESENT (${colMap[col].Type})`);
      } else {
        console.log(`   - ${col.padEnd(18)}: ❌ MISSING`);
      }
    });

    // 3. Check SequelizeMeta status
    const [meta] = await db.sequelize.query('SELECT `name` FROM `SequelizeMeta` ORDER BY `name` ASC');
    console.log('\n3. SequelizeMeta migration history:');
    meta.forEach((m) => console.log(`   • ${m.name}`));

    const targetMigration = '20261012110000-add-storage-columns-to-locations.js';
    const isRecorded = meta.some((m) => m.name === targetMigration);
    console.log(`\n   Target Migration (${targetMigration}): ${isRecorded ? 'APPLIED' : 'PENDING APPROVAL'}`);

    // 4. Verify existing location rows integrity
    const [existingLocs] = await db.sequelize.query('SELECT * FROM `locations`');
    console.log(`\n4. Existing locations count: ${existingLocs.length}`);
    existingLocs.forEach((l) => {
      console.log(`   - ID ${l.id}: "${l.name}" (tenant: ${l.tenant_id}, branch: ${l.branch_id}, level: ${l.level})`);
    });

    // 5. Tenant and Branch verification
    console.log('\n5. Tenant & Branch Verification:');
    const [tenantRows] = await db.sequelize.query('SELECT id, name FROM `tenants` WHERE id = 1');
    if (tenantRows.length > 0) {
      console.log(`   - Tenant 1: ✅ VALID ("${tenantRows[0].name}")`);
    } else {
      console.log('   - Tenant 1: ❌ INVALID (Not found)');
    }

    const [branch13Rows] = await db.sequelize.query('SELECT id, tenant_id, name FROM `branches` WHERE id = 13');
    if (branch13Rows.length > 0) {
      console.log(`   - Branch 13: ✅ FOUND (belongs to tenant_id: ${branch13Rows[0].tenant_id})`);
    } else {
      console.log('   - Branch 13: ❌ INVALID (Branch ID 13 does not exist in `branches` table!)');
    }

    const [tenant1Branches] = await db.sequelize.query('SELECT id, name, is_active FROM `branches` WHERE tenant_id = 1');
    console.log('   - Valid branches for tenant_id = 1:');
    tenant1Branches.forEach((b) => {
      console.log(`     • Branch ID ${b.id}: "${b.name}" (active: ${b.is_active})`);
    });

    console.log('\n===============================================================');
  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await db.sequelize.close();
  }
}

verify();

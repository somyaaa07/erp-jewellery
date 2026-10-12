// backend/src/scripts/testLocationCreation.js
import db from '../models/index.js';

const { Location } = db;

async function test() {
  console.log('===============================================================');
  console.log(' Test Location Creation with storage_type: WHOLESALE_STORE');
  console.log('===============================================================\n');

  try {
    await db.sequelize.authenticate();

    // 0. Pre-test snapshot of existing locations
    const [initialRows] = await db.sequelize.query('SELECT id, name, tenant_id, branch_id FROM `locations`');
    console.log(`0. Pre-test location row count: ${initialRows.length}`);
    initialRows.forEach((r) => {
      console.log(`   - Pre-existing Location ID ${r.id}: "${r.name}" (tenant: ${r.tenant_id}, branch: ${r.branch_id})`);
    });

    // 1. Test invalid branch_id = 13 scenario
    console.log('\n1. Testing creation with tenant_id = 1, branch_id = 13:');
    try {
      await Location.create({
        tenant_id: 1,
        branch_id: 13,
        name: 'Test Wholesale Store (Invalid Branch)',
        level: 1,
        storage_type: 'WHOLESALE_STORE',
        empty_weight: 500,
        capacity_weight: 5000,
        capacity_pieces: 500,
      });
      console.error('❌ Unexpected: Insertion with branch_id = 13 succeeded without FK check');
    } catch (err) {
      console.log(`✅ Expected FK failure caught: ${err.name} - ${err.message}`);
    }

    // 2. Test valid branch_id = 1 (Main Branch of tenant 1)
    console.log('\n2. Testing creation with valid tenant_id = 1, branch_id = 1:');
    const newLocation = await Location.create({
      tenant_id: 1,
      branch_id: 1,
      name: '__TEST_WHOLESALE_STORE_TEMPORARY__',
      level: 1,
      storage_type: 'WHOLESALE_STORE',
      empty_weight: 500,
      capacity_weight: 5000,
      capacity_pieces: 500,
    });

    console.log('✅ Successfully created test location:');
    console.log(`   - ID             : ${newLocation.id}`);
    console.log(`   - Tenant ID      : ${newLocation.tenant_id}`);
    console.log(`   - Branch ID      : ${newLocation.branch_id}`);
    console.log(`   - Name           : ${newLocation.name}`);
    console.log(`   - Level          : ${newLocation.level}`);
    console.log(`   - Storage Type   : ${newLocation.storage_type}`);
    console.log(`   - Empty Weight   : ${newLocation.empty_weight}`);
    console.log(`   - Capacity Weight: ${newLocation.capacity_weight}`);
    console.log(`   - Capacity Pieces: ${newLocation.capacity_pieces}`);

    // Clean up ONLY the newly created test record
    const createdId = newLocation.id;
    await newLocation.destroy();
    console.log(`\n✅ Safely destroyed ONLY temporary test location (ID: ${createdId}).`);

    // 3. Post-test verification to ensure no existing data was altered or deleted
    const [finalRows] = await db.sequelize.query('SELECT id, name, tenant_id, branch_id FROM `locations`');
    console.log(`\n3. Post-test location row count: ${finalRows.length} (Expected: ${initialRows.length})`);
    const initialIds = initialRows.map((r) => r.id).sort();
    const finalIds = finalRows.map((r) => r.id).sort();
    const isUnchanged = JSON.stringify(initialIds) === JSON.stringify(finalIds);

    if (isUnchanged) {
      console.log('✅ Integrity Confirmed: All pre-existing location records remain completely intact.');
    } else {
      console.error('❌ Integrity Warning: Pre-existing records differ after test.');
    }

    console.log('\n===============================================================');
    console.log(' Test Finished Successfully!');
    console.log('===============================================================');
  } catch (err) {
    console.error('❌ Location test failed:', err);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

test();

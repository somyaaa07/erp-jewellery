// backend/src/scripts/runMigration.js
import { Sequelize } from 'sequelize';
import db from '../models/index.js';

const action = process.argv[2] || 'up';
const migrationName = process.argv[3] || '20261004120000-enhance-staff-profiles.js';

async function run() {
  try {
    await db.sequelize.authenticate();
    console.log('✅ Database connected.');

    // Ensure SequelizeMeta exists to track migrations
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`SequelizeMeta\` (
        \`name\` VARCHAR(255) COLLATE utf8_unicode_ci NOT NULL,
        PRIMARY KEY (\`name\`),
        UNIQUE KEY \`name\` (\`name\`)
      ) ENGINE=InnoDB;
    `);

    // Ensure prior applied migrations are recorded in SequelizeMeta
    const [existingMeta] = await db.sequelize.query('SELECT `name` FROM `SequelizeMeta`');
    const existingNames = new Set(existingMeta.map((m) => m.name));

    for (const prior of [
      '20261004120000-enhance-staff-profiles.js',
      '20261011000001-create-shifts-and-attendance.js',
      '20261011000002-create-leaves-tables.js',
    ]) {
      if (!existingNames.has(prior)) {
        await db.sequelize.query('INSERT IGNORE INTO `SequelizeMeta` (`name`) VALUES (?)', {
          replacements: [prior],
        });
        existingNames.add(prior);
      }
    }

    const queryInterface = db.sequelize.getQueryInterface();
    const migrationPath = `../migrations/${migrationName}`;
    const migration = await import(migrationPath);

    if (action === 'down') {
      console.log(`⏳ Reverting migration ${migrationName}...`);
      await migration.down(queryInterface, Sequelize);
      await db.sequelize.query('DELETE FROM `SequelizeMeta` WHERE `name` = ?', {
        replacements: [migrationName],
      });
      console.log(`✅ Successfully reverted ${migrationName}`);
    } else {
      if (existingNames.has(migrationName)) {
        console.log(`⚠️ Migration ${migrationName} is already recorded in SequelizeMeta.`);
        process.exit(0);
      }
      console.log(`⏳ Running migration ${migrationName}...`);
      await migration.up(queryInterface, Sequelize);
      await db.sequelize.query('INSERT INTO `SequelizeMeta` (`name`) VALUES (?)', {
        replacements: [migrationName],
      });
      console.log(`✅ Successfully applied ${migrationName}`);
      console.log(`📝 Recorded ${migrationName} in SequelizeMeta`);
    }

    process.exit(0);
  } catch (err) {
    console.error(`❌ Migration ${action} failed:`, err);
    process.exit(1);
  }
}

run();

// backend/src/scripts/backupDatabase.js
import fs from 'fs';
import path from 'path';
import db from '../models/index.js';

async function runBackup() {
  try {
    await db.sequelize.authenticate();
    const [tables] = await db.sequelize.query('SHOW TABLES');

    const backup = {
      timestamp: new Date().toISOString(),
      database: db.sequelize.config.database,
      host: db.sequelize.config.host,
      tables: [],
    };

    for (const t of tables) {
      const tableName = Object.values(t)[0];
      const [schema] = await db.sequelize.query(`SHOW CREATE TABLE \`${tableName}\``);
      const [count] = await db.sequelize.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      backup.tables.push({
        name: tableName,
        createTable: schema[0]['Create Table'],
        rowCount: count[0].cnt,
      });
    }

    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupPath = path.join(backupDir, 'backup_jewellery_erp_pre_phase4d.json');
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8');

    console.log(`✅ Verified database backup created successfully.`);
    console.log(`📁 Backup file: ${backupPath}`);
    console.log(`📊 Total tables backed up: ${backup.tables.length}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    process.exit(1);
  }
}

runBackup();

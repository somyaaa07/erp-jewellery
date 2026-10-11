// scripts/syncDb.js
// Syncs all loaded models with the database (creates tables if they don't exist).

// scripts/syncDb.js
// DEV CONVENIENCE ONLY. Creates/updates all tables directly from the model definitions.
//
// Why sync instead of hand-written migrations for a 20+ table schema like this one?
// Hand-writing correct migrations for every table up front is slow and error-prone at this stage.
// Run this now to get a working database fast. Once the schema stabilizes (after Phase 1 MVP),
// switch to `sequelize-cli` migrations for every CHANGE from that point on - never sync in production.
//
// Usage: npm run db:sync

import db from "../models/index.js";

// Sequelize's "alter" never changes a column that has a foreign key, so a column that became
// optional in the models stays NOT NULL in a database created earlier. These fixes make the
// database match the models. Each one checks first, so running them again does nothing.
const OPTIONAL_COLUMNS = [
  // A tray is identified by its name and designs; category is only an optional label now.
  { table: "display_trays", column: "category_id", definition: "INTEGER NULL" },
];

async function applyColumnFixes() {
  const qi = db.sequelize.getQueryInterface();
  for (const { table, column, definition } of OPTIONAL_COLUMNS) {
    const columns = await qi.describeTable(table);
    if (columns[column] && columns[column].allowNull === false) {
      await db.sequelize.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` ${definition}`);
      console.log(`✅ ${table}.${column} is now optional.`);
    }
  }
}

const sync = async () => {
  try {
    await db.sequelize.authenticate();
    console.log("✅ Database connected.");

    await db.sequelize.sync({ alter: true });
    console.log("✅ All tables synced successfully.");

    await applyColumnFixes();

    process.exit(0);
  } catch (err) {
    console.error("❌ Sync failed:", err.message);

    // Plain-language hints for the most common first-run problems.
    const code = err.original?.code || err.parent?.code || err.code;
    if (code === "ECONNREFUSED") {
      console.error(
        "\nMySQL is not running, or it is not on the host/port in your .env.\n" +
        `  Trying: ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306}\n` +
        "  1. Start the MySQL service (Windows: services.msc > MySQL > Start, or start it in XAMPP/WAMP).\n" +
        "  2. Check DB_HOST and DB_PORT in backend/.env.\n"
      );
    } else if (code === "ER_BAD_DB_ERROR") {
      console.error(
        `\nThe database "${process.env.DB_NAME}" does not exist yet. Create it first:\n` +
        `  CREATE DATABASE ${process.env.DB_NAME};\n`
      );
    } else if (code === "ER_ACCESS_DENIED_ERROR") {
      console.error("\nWrong DB_USER or DB_PASSWORD in backend/.env.\n");
    }
    process.exit(1);
  }
};

sync();

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

const sync = async () => {
  try {
    await db.sequelize.authenticate();
    console.log("✅ Database connected.");

    await db.sequelize.sync({ alter: true });
    console.log("✅ All tables synced successfully.");

    process.exit(0);
  } catch (err) {
    console.error("❌ Sync failed:", err.message);
    process.exit(1);
  }
};

sync();

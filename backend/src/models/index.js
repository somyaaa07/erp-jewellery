// // models/index.js
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath, pathToFileURL } from 'url';   // pathToFileURL add kiya
// import { DataTypes } from 'sequelize';
// import sequelize from '../config/database.js';
// import attachAuditHooks from '../utils/auditHook.js';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const db = {};

// const modelFiles = fs.readdirSync(__dirname)
//   .filter((file) => file !== 'index.js' && file.endsWith('.js'));

// for (const file of modelFiles) {
//   const fullPath = path.join(__dirname, file);
//   const fileUrl = pathToFileURL(fullPath).href;
//   const modelModule = await import(fileUrl);
//   console.log('Loaded:', file, '| default type:', typeof modelModule.default);
//   const model = modelModule.default(sequelize, DataTypes);
//   db[model.name] = model;
// }

// Object.keys(db).forEach((modelName) => {
//   if (db[modelName].associate) db[modelName].associate(db);
// });

// db.sequelize = sequelize;

// ['Item', 'Transaction', 'LedgerEntry', 'Purchase', 'Expense', 'KarigarLedger'].forEach((name) => {
//   if (db[name]) attachAuditHooks(db[name]);
// });

// export default db;

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { DataTypes } from "sequelize";

import sequelize from "../config/database.js";
import attachAuditHooks from "../utils/auditHook.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = {};

const modelFiles = fs
  .readdirSync(__dirname)
  .filter((file) => file !== "index.js" && file.endsWith(".js"));

for (const file of modelFiles) {
  const fullPath = path.join(__dirname, file);
  const fileUrl = pathToFileURL(fullPath).href;

  const modelModule = await import(fileUrl);

  console.log("Loaded:", file, "| default type:", typeof modelModule.default);

  if (typeof modelModule.default !== "function") {
    console.warn(`⚠️ Skipping ${file}: default export is not a function`);
    continue;
  }

  const model = modelModule.default(sequelize, DataTypes);

  db[model.name] = model;
}

// Run associations after ALL models are loaded
Object.keys(db).forEach((modelName) => {
  if (typeof db[modelName].associate === "function") {
    db[modelName].associate(db);
  }
});

// Add Sequelize instance
db.sequelize = sequelize;

// Attach audit hooks
[
  "Item",
  "Transaction",
  "LedgerEntry",
  "Purchase",
  "Expense",
  "KarigarLedger",
].forEach((name) => {
  if (db[name]) {
    attachAuditHooks(db[name]);
  }
});

export default db;

// // server.js
// import dotenv from "dotenv";
// dotenv.config();

// import app from "./app.js";
// import sequelize from "./src/config/database.js";
// const PORT = process.env.PORT || 5000;

// const startServer = async () => {
//   try {
//     // Test DB connection
//     await sequelize.authenticate();
//     console.log("✅ Database connected successfully.");

//     // Sync models (use { alter: true } only in dev, never in prod)
//     // if (process.env.NODE_ENV === "development") {
//     //   await sequelize.sync({ alter: true });
//     //   console.log("✅ Models synced.");
//     // }

//     app.listen(PORT, () => {
//       console.log(`🚀 Server running on http://localhost:${PORT}`);
//     });
//   } catch (err) {
//     console.error("❌ Unable to start server:", err.message);
//     process.exit(1);
//   }
// };

// startServer();


import dotenv from "dotenv";
dotenv.config();

import db from "./src/models/index.js";
import app from "./app.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await db.sequelize.authenticate();
    console.log("✅ Database connected successfully.");

    // All models are already loaded by models/index.js.
    //
    // NOTE: sync({ alter: true }) is NOT run on every boot any more. On MySQL, repeatedly
    // altering tables adds a duplicate index each time and eventually fails with
    // "Too many keys specified; max 64 keys allowed", which took the whole API down and made
    // every page in the app look broken. Run it deliberately instead:
    //   npm run db:sync           (or)  DB_SYNC=alter npm run dev
    if (process.env.DB_SYNC === "alter") {
      await db.sequelize.sync({ alter: true });
      console.log("✅ All models synced (alter).");
    } else {
      console.log("ℹ️  Schema sync skipped. Run `npm run db:sync` after changing any model.");
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Unable to start server:", err);
    process.exit(1);
  }
};

startServer();
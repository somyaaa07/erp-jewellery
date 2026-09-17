// scripts/seedSuperAdmin.js
// Creates the initial SUPER_ADMIN user from .env credentials.

// Creates the very first SUPER_ADMIN account so you can log into the Super Admin Dashboard
// and start onboarding tenants. Run once after db:sync.
//
// Usage: npm run db:seed




import dotenv from "dotenv";
dotenv.config();

import db from "../models/index.js";

const { User } = db;

const seed = async () => {
  try {
    await db.sequelize.authenticate();
    console.log("✅ Database connected.");

    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;

    if (!email || !password) {
      throw new Error(
        "SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD missing in .env"
      );
    }

    const existing = await User.findOne({ where: { email } });

    if (existing) {
      console.log(`⚠️  Super admin already exists: ${email}`);
      process.exit(0);
    }

    const admin = await User.create({
      name: "Super Admin",
      email,
      password_hash: password, // hook will hash it automatically
      role: "SUPER_ADMIN",
      is_active: true,
    });

    console.log(`✅ Super admin created: ${admin.email}`);
    process.exit(0);
  }  catch (err) {
  console.error("❌ Seeding failed:");
  console.error(err);
  process.exit(1);
}
};

seed();
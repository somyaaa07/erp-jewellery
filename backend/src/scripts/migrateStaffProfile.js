// backend/src/scripts/migrateStaffProfile.js
import db from '../models/index.js';

const migrate = async () => {
  try {
    await db.sequelize.authenticate();
    console.log('✅ Database connected.');

    // Ensure staff_profiles table exists
    await db.StaffProfile.sync();

    // Ensure transfer_history column exists
    const [cols] = await db.sequelize.query("SHOW COLUMNS FROM `staff_profiles` LIKE 'transfer_history'");
    if (cols.length === 0) {
      await db.sequelize.query("ALTER TABLE `staff_profiles` ADD COLUMN `transfer_history` JSON NULL");
      console.log('✅ Added transfer_history column to staff_profiles.');
    }

    console.log('✅ staff_profiles schema verified.');

    // Backfill any existing tenant users who do not have a StaffProfile yet
    const { User, StaffProfile } = db;
    const users = await User.findAll({
      where: {
        role: ['ADMIN', 'MANAGER', 'SALESMAN', 'KARIGAR_INCHARGE'],
      },
      include: [{ model: StaffProfile, as: 'StaffProfile', required: false }],
    });

    let createdCount = 0;
    for (const u of users) {
      if (!u.StaffProfile && u.tenant_id) {
        await StaffProfile.create({
          user_id: u.id,
          tenant_id: u.tenant_id,
          employee_id: `EMP-${String(u.id).padStart(4, '0')}`,
          department: u.role === 'SALESMAN' ? 'Sales' : u.role === 'KARIGAR_INCHARGE' ? 'Karigar' : 'Management',
          designation: u.role.replace('_', ' '),
          joining_date: u.createdAt ? u.createdAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          status: u.is_active ? 'ACTIVE' : 'INACTIVE',
          transfer_history: [],
        });
        createdCount++;
      }
    }

    console.log(`✅ Backfilled ${createdCount} staff profiles for existing users.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
};

migrate();

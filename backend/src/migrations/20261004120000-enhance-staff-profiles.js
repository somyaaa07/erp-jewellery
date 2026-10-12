// backend/src/migrations/20261004120000-enhance-staff-profiles.js
/**
 * Migration: Enhance Staff Profiles
 *
 * 1. Makes user_id NULLABLE in staff_profiles to support staff without ERP login accounts.
 * 2. Adds first_name, last_name, email, branch_id, profile_photo, dob, gender,
 *    emergency_contact_name, emergency_contact_phone, employment_type, reporting_manager_id.
 * 3. Backfills employee_id for any existing NULL records.
 * 4. Backfills first_name, last_name, email, branch_id from users table for existing staff.
 * 5. Adds unique index on (tenant_id, employee_id).
 * 6. Adds foreign keys to branches(id) and users(id) with ON DELETE SET NULL.
 * 7. Adds performance indexes on (tenant_id, branch_id) and (tenant_id, department).
 */

export const up = async (queryInterface, Sequelize) => {
  const { DataTypes } = Sequelize;
  const sequelize = queryInterface.sequelize;

  // 1. Backfill any NULL employee_id in staff_profiles before applying unique constraint
  const [nullEmpRows] = await sequelize.query(
    "SELECT id, tenant_id FROM staff_profiles WHERE employee_id IS NULL OR TRIM(employee_id) = ''"
  );
  for (const row of nullEmpRows) {
    const fallbackEmpId = `EMP-${String(row.id).padStart(4, '0')}`;
    await sequelize.query(
      'UPDATE staff_profiles SET employee_id = ? WHERE id = ?',
      { replacements: [fallbackEmpId, row.id] }
    );
  }

  // 2. Drop existing foreign key on user_id to modify it to NULLABLE with ON DELETE SET NULL
  try {
    await sequelize.query('ALTER TABLE staff_profiles DROP FOREIGN KEY staff_profiles_ibfk_1');
  } catch (err) {
    console.log('Notice: FK staff_profiles_ibfk_1 drop note:', err.message);
  }

  // Modify user_id to NULLABLE
  await sequelize.query('ALTER TABLE staff_profiles MODIFY COLUMN user_id INT(11) NULL');

  // Re-add foreign key with ON DELETE SET NULL
  await sequelize.query(
    'ALTER TABLE staff_profiles ADD CONSTRAINT fk_staff_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE'
  );

  // 3. Add new columns if they do not exist
  const [existingCols] = await sequelize.query('SHOW COLUMNS FROM staff_profiles');
  const colNames = existingCols.map((c) => c.Field);

  if (!colNames.includes('first_name')) {
    await queryInterface.addColumn('staff_profiles', 'first_name', {
      type: DataTypes.STRING(100),
      allowNull: true,
      after: 'employee_id',
    });
  }

  if (!colNames.includes('last_name')) {
    await queryInterface.addColumn('staff_profiles', 'last_name', {
      type: DataTypes.STRING(100),
      allowNull: true,
      after: 'first_name',
    });
  }

  if (!colNames.includes('email')) {
    await queryInterface.addColumn('staff_profiles', 'email', {
      type: DataTypes.STRING(255),
      allowNull: true,
      after: 'last_name',
    });
  }

  if (!colNames.includes('branch_id')) {
    await queryInterface.addColumn('staff_profiles', 'branch_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      after: 'tenant_id',
    });
  }

  if (!colNames.includes('profile_photo')) {
    await queryInterface.addColumn('staff_profiles', 'profile_photo', {
      type: DataTypes.STRING(255),
      allowNull: true,
      after: 'email',
    });
  }

  if (!colNames.includes('dob')) {
    await queryInterface.addColumn('staff_profiles', 'dob', {
      type: DataTypes.DATEONLY,
      allowNull: true,
      after: 'phone',
    });
  }

  if (!colNames.includes('gender')) {
    await queryInterface.addColumn('staff_profiles', 'gender', {
      type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'),
      allowNull: true,
      after: 'dob',
    });
  }

  if (!colNames.includes('emergency_contact_name')) {
    await queryInterface.addColumn('staff_profiles', 'emergency_contact_name', {
      type: DataTypes.STRING(150),
      allowNull: true,
      after: 'address',
    });
  }

  if (!colNames.includes('emergency_contact_phone')) {
    await queryInterface.addColumn('staff_profiles', 'emergency_contact_phone', {
      type: DataTypes.STRING(50),
      allowNull: true,
      after: 'emergency_contact_name',
    });
  }

  if (!colNames.includes('employment_type')) {
    await queryInterface.addColumn('staff_profiles', 'employment_type', {
      type: DataTypes.ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'PROBATION'),
      allowNull: false,
      defaultValue: 'FULL_TIME',
      after: 'designation',
    });
  }

  if (!colNames.includes('reporting_manager_id')) {
    await queryInterface.addColumn('staff_profiles', 'reporting_manager_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      after: 'employment_type',
    });
  }

  // 4. Backfill first_name, last_name, email, branch_id from users table for existing staff
  await sequelize.query(`
    UPDATE staff_profiles sp
    INNER JOIN users u ON sp.user_id = u.id
    SET 
      sp.email = u.email,
      sp.branch_id = u.branch_id,
      sp.first_name = CASE
        WHEN sp.first_name IS NOT NULL THEN sp.first_name
        WHEN INSTR(TRIM(u.name), ' ') > 0 THEN SUBSTRING_INDEX(TRIM(u.name), ' ', 1)
        ELSE TRIM(u.name)
      END,
      sp.last_name = CASE
        WHEN sp.last_name IS NOT NULL THEN sp.last_name
        WHEN INSTR(TRIM(u.name), ' ') > 0 THEN SUBSTRING(TRIM(u.name), INSTR(TRIM(u.name), ' ') + 1)
        ELSE ''
      END
    WHERE sp.first_name IS NULL OR sp.email IS NULL OR sp.branch_id IS NULL
  `);

  // 5. Add unique index on (tenant_id, employee_id) if not exists
  const [indexes] = await sequelize.query('SHOW INDEX FROM staff_profiles');
  const indexNames = indexes.map((idx) => idx.Key_name);

  if (!indexNames.includes('uniq_tenant_employee_id')) {
    await sequelize.query(
      'ALTER TABLE staff_profiles ADD UNIQUE KEY uniq_tenant_employee_id (tenant_id, employee_id)'
    );
  }

  if (!indexNames.includes('idx_staff_tenant_branch')) {
    await sequelize.query(
      'ALTER TABLE staff_profiles ADD INDEX idx_staff_tenant_branch (tenant_id, branch_id)'
    );
  }

  if (!indexNames.includes('idx_staff_tenant_dept')) {
    await sequelize.query(
      'ALTER TABLE staff_profiles ADD INDEX idx_staff_tenant_dept (tenant_id, department)'
    );
  }

  // 6. Add Foreign Key constraints for branch_id and reporting_manager_id
  try {
    await sequelize.query(
      'ALTER TABLE staff_profiles ADD CONSTRAINT fk_staff_profiles_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE'
    );
  } catch (err) {
    console.log('Notice: FK fk_staff_profiles_branch note:', err.message);
  }

  try {
    await sequelize.query(
      'ALTER TABLE staff_profiles ADD CONSTRAINT fk_staff_profiles_manager FOREIGN KEY (reporting_manager_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE'
    );
  } catch (err) {
    console.log('Notice: FK fk_staff_profiles_manager note:', err.message);
  }

  console.log('✅ Migration 20261004120000-enhance-staff-profiles: UP completed.');
};

export const down = async (queryInterface, Sequelize) => {
  const sequelize = queryInterface.sequelize;

  // 1. Drop foreign keys
  try {
    await sequelize.query('ALTER TABLE staff_profiles DROP FOREIGN KEY fk_staff_profiles_manager');
  } catch (err) {}

  try {
    await sequelize.query('ALTER TABLE staff_profiles DROP FOREIGN KEY fk_staff_profiles_branch');
  } catch (err) {}

  // 2. Drop indexes
  try {
    await sequelize.query('ALTER TABLE staff_profiles DROP INDEX idx_staff_tenant_dept');
  } catch (err) {}

  try {
    await sequelize.query('ALTER TABLE staff_profiles DROP INDEX idx_staff_tenant_branch');
  } catch (err) {}

  try {
    await sequelize.query('ALTER TABLE staff_profiles DROP INDEX uniq_tenant_employee_id');
  } catch (err) {}

  // 3. Drop columns
  const colsToDrop = [
    'reporting_manager_id',
    'employment_type',
    'emergency_contact_phone',
    'emergency_contact_name',
    'gender',
    'dob',
    'profile_photo',
    'branch_id',
    'email',
    'last_name',
    'first_name',
  ];

  for (const col of colsToDrop) {
    try {
      await queryInterface.removeColumn('staff_profiles', col);
    } catch (err) {}
  }

  // 4. Revert user_id to NOT NULL with CASCADE
  try {
    await sequelize.query('ALTER TABLE staff_profiles DROP FOREIGN KEY fk_staff_profiles_user');
  } catch (err) {}

  // Delete or handle rows with null user_id before making it NOT NULL
  // (In rollback, only rows without user_id would violate NOT NULL)
  await sequelize.query('DELETE FROM staff_profiles WHERE user_id IS NULL');

  await sequelize.query('ALTER TABLE staff_profiles MODIFY COLUMN user_id INT(11) NOT NULL');

  await sequelize.query(
    'ALTER TABLE staff_profiles ADD CONSTRAINT staff_profiles_ibfk_1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE'
  );

  console.log('✅ Migration 20261004120000-enhance-staff-profiles: DOWN (Rollback) completed.');
};

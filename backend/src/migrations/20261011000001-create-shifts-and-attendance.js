// backend/src/migrations/20261011000001-create-shifts-and-attendance.js
/**
 * Migration: Create Shifts and Attendances Tables
 *
 * 1. Creates `shifts` table for configurable working schedules per tenant/branch.
 * 2. Adds `assigned_shift_id` column to `staff_profiles` with FK to `shifts(id)` ON DELETE SET NULL.
 * 3. Creates `attendances` table with:
 *    - Primary employee reference: `staff_id` -> `staff_profiles(id)`
 *    - Optional user login reference: `user_id` -> `users(id)`
 *    - Historical shift snapshots: `shift_id`, `shift_name`, `scheduled_check_in`, `scheduled_check_out`, `is_overnight`
 *    - Actual check-in & check-out times
 *    - Calculated metrics: `late_minutes`, `early_departure_minutes`, `working_hours`
 *    - Correction audit tracking: `correction_reason`, `corrected_by_id`, `corrected_at`
 *    - Strict uniqueness: `(tenant_id, staff_id, attendance_date)`
 */

export const up = async (queryInterface, Sequelize) => {
  const { DataTypes } = Sequelize;
  const sequelize = queryInterface.sequelize;

  // 1. Create `shifts` table
  await queryInterface.createTable('shifts', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'branches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    start_time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    end_time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    grace_period_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 15,
    },
    half_day_threshold_hours: {
      type: DataTypes.DECIMAL(4, 2),
      allowNull: false,
      defaultValue: 4.00,
    },
    is_overnight: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
    },
  });

  // Unique index for shift name per tenant
  await queryInterface.addIndex('shifts', ['tenant_id', 'name'], {
    unique: true,
    name: 'uk_shifts_tenant_name',
  });
  await queryInterface.addIndex('shifts', ['tenant_id', 'branch_id'], {
    name: 'idx_shifts_tenant_branch',
  });

  // 2. Add `assigned_shift_id` to `staff_profiles` if not already present
  const [staffCols] = await sequelize.query('SHOW COLUMNS FROM staff_profiles LIKE "assigned_shift_id"');
  if (staffCols.length === 0) {
    await queryInterface.addColumn('staff_profiles', 'assigned_shift_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'shifts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'designation',
    });
    await queryInterface.addIndex('staff_profiles', ['assigned_shift_id'], {
      name: 'idx_staff_profiles_assigned_shift',
    });
  }

  // 3. Create `attendances` table
  await queryInterface.createTable('attendances', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'branches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    staff_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'staff_profiles', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    attendance_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    shift_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'shifts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    shift_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    scheduled_check_in: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    scheduled_check_out: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    is_overnight: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    actual_check_in: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    actual_check_out: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'WEEKLY_OFF', 'HOLIDAY', 'ON_LEAVE'),
      allowNull: false,
      defaultValue: 'PRESENT',
    },
    late_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    early_departure_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    working_hours: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    correction_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    corrected_by_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    corrected_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
    },
  });

  // 4. Indexes and Uniqueness constraints
  // Strictly enforce 1 attendance record per employee per work date
  await queryInterface.addIndex('attendances', ['tenant_id', 'staff_id', 'attendance_date'], {
    unique: true,
    name: 'uk_attendance_tenant_staff_date',
  });
  await queryInterface.addIndex('attendances', ['tenant_id', 'attendance_date'], {
    name: 'idx_attendance_tenant_date',
  });
  await queryInterface.addIndex('attendances', ['tenant_id', 'branch_id', 'attendance_date'], {
    name: 'idx_attendance_tenant_branch_date',
  });
  await queryInterface.addIndex('attendances', ['tenant_id', 'status'], {
    name: 'idx_attendance_tenant_status',
  });
};

export const down = async (queryInterface) => {
  const sequelize = queryInterface.sequelize;

  // 1. Drop attendances table
  await queryInterface.dropTable('attendances');

  // 2. Remove assigned_shift_id from staff_profiles
  try {
    const [staffCols] = await sequelize.query('SHOW COLUMNS FROM staff_profiles LIKE "assigned_shift_id"');
    if (staffCols.length > 0) {
      await queryInterface.removeColumn('staff_profiles', 'assigned_shift_id');
    }
  } catch (err) {
    console.warn('Rollback notice removing assigned_shift_id:', err.message);
  }

  // 3. Drop shifts table
  await queryInterface.dropTable('shifts');
};

// backend/src/migrations/20261011000002-create-leaves-tables.js
/**
 * Migration: Create Leave Management Tables (Phase 4D)
 *
 * Tables Created:
 * 1. `leave_types`: Configurable leave categories per tenant (Casual, Sick, Annual, Maternity, Unpaid)
 * 2. `leave_balances`: Annual balance quotas and usage per (tenant, staff, leave_type, year)
 * 3. `leave_requests`: Approved and cancelled leave records with idempotency tracking
 *
 * Foreign Key Safety:
 * - Foreign keys to `tenants`, `branches`, `staff_profiles`, and `leave_types` use ON DELETE RESTRICT
 *   so that deactivating staff or branches never deletes historical records.
 * - Operator auditing fields (approved_by_id, cancelled_by_id) use ON DELETE SET NULL.
 *
 * Idempotency Guarantee:
 * - `is_balance_deducted` boolean flag ensures retries cannot deduct or restore balances twice.
 */

export const up = async (queryInterface, Sequelize) => {
  const { DataTypes } = Sequelize;

  // 1. Create `leave_types` table
  await queryInterface.createTable('leave_types', {
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
      onDelete: 'RESTRICT',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    days_allowed_per_year: {
      type: DataTypes.DECIMAL(5, 1),
      allowNull: false,
      defaultValue: 0.0,
    },
    is_paid: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    exclude_weekly_offs: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    exclude_holidays: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    requires_attachment: {
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

  await queryInterface.addIndex('leave_types', ['tenant_id', 'code'], {
    unique: true,
    name: 'uk_leave_types_tenant_code',
  });

  // 2. Create `leave_balances` table
  await queryInterface.createTable('leave_balances', {
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
      onDelete: 'RESTRICT',
    },
    staff_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'staff_profiles', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    leave_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leave_types', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    entitled_days: {
      type: DataTypes.DECIMAL(5, 1),
      allowNull: false,
      defaultValue: 0.0,
    },
    used_days: {
      type: DataTypes.DECIMAL(5, 1),
      allowNull: false,
      defaultValue: 0.0,
    },
    pending_days: {
      type: DataTypes.DECIMAL(5, 1),
      allowNull: false,
      defaultValue: 0.0,
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

  await queryInterface.addIndex('leave_balances', ['tenant_id', 'staff_id', 'leave_type_id', 'year'], {
    unique: true,
    name: 'uk_leave_balances_tenant_staff_type_year',
  });

  // 3. Create `leave_requests` table
  await queryInterface.createTable('leave_requests', {
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
      onDelete: 'RESTRICT',
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
    leave_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leave_types', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    total_days: {
      type: DataTypes.DECIMAL(5, 1),
      allowNull: false,
    },
    is_half_day: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    half_day_period: {
      type: DataTypes.ENUM('FIRST_HALF', 'SECOND_HALF'),
      allowNull: true,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'APPROVED',
    },
    is_balance_deducted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    yearly_deductions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
    document_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_by_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    approved_by_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rejection_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancelled_by_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancellation_reason: {
      type: DataTypes.TEXT,
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

  await queryInterface.addIndex('leave_requests', ['tenant_id', 'staff_id', 'start_date', 'end_date'], {
    name: 'idx_leave_requests_tenant_staff_dates',
  });
  await queryInterface.addIndex('leave_requests', ['tenant_id', 'branch_id'], {
    name: 'idx_leave_requests_tenant_branch',
  });
  await queryInterface.addIndex('leave_requests', ['tenant_id', 'status'], {
    name: 'idx_leave_requests_tenant_status',
  });
};

export const down = async (queryInterface, Sequelize) => {
  // Safe reverse drop order: child tables before parent tables
  // WARNING: Dropping tables will delete the data inside these 3 leave tables.
  await queryInterface.dropTable('leave_requests');
  await queryInterface.dropTable('leave_balances');
  await queryInterface.dropTable('leave_types');
};

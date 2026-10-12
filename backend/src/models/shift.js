// backend/src/models/shift.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Shift = sequelize.define(
    'Shift',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      tenant_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // null means applies tenant-wide
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
    },
    {
      tableName: 'shifts',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  Shift.associate = (models) => {
    Shift.belongsTo(models.Tenant, {
      foreignKey: 'tenant_id',
      as: 'Tenant',
    });
    Shift.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'Branch',
      onDelete: 'SET NULL',
    });
    Shift.hasMany(models.StaffProfile, {
      foreignKey: 'assigned_shift_id',
      as: 'AssignedStaff',
    });
    Shift.hasMany(models.Attendance, {
      foreignKey: 'shift_id',
      as: 'Attendances',
    });
  };

  return Shift;
};

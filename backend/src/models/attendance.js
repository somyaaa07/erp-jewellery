// backend/src/models/attendance.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Attendance = sequelize.define(
    'Attendance',
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
        allowNull: false,
      },
      staff_id: {
        type: DataTypes.INTEGER,
        allowNull: false, // StaffProfile.id is the authoritative employee identity
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // Optional linked User login account
      },
      attendance_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
      },
      corrected_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'attendances',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  Attendance.associate = (models) => {
    Attendance.belongsTo(models.Tenant, {
      foreignKey: 'tenant_id',
      as: 'Tenant',
    });
    Attendance.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'Branch',
    });
    Attendance.belongsTo(models.StaffProfile, {
      foreignKey: 'staff_id',
      as: 'StaffProfile',
    });
    Attendance.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'User',
      onDelete: 'SET NULL',
    });
    Attendance.belongsTo(models.Shift, {
      foreignKey: 'shift_id',
      as: 'Shift',
      onDelete: 'SET NULL',
    });
    Attendance.belongsTo(models.User, {
      foreignKey: 'corrected_by_id',
      as: 'CorrectedBy',
      onDelete: 'SET NULL',
    });
  };

  return Attendance;
};

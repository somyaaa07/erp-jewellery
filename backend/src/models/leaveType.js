// backend/src/models/leaveType.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const LeaveType = sequelize.define(
    'LeaveType',
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
    },
    {
      tableName: 'leave_types',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  LeaveType.associate = (models) => {
    LeaveType.belongsTo(models.Tenant, {
      foreignKey: 'tenant_id',
      as: 'Tenant',
    });
    if (models.LeaveBalance) {
      LeaveType.hasMany(models.LeaveBalance, {
        foreignKey: 'leave_type_id',
        as: 'LeaveBalances',
      });
    }
    if (models.LeaveRequest) {
      LeaveType.hasMany(models.LeaveRequest, {
        foreignKey: 'leave_type_id',
        as: 'LeaveRequests',
      });
    }
  };

  return LeaveType;
};

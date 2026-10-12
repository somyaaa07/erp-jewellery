// backend/src/models/leaveBalance.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const LeaveBalance = sequelize.define(
    'LeaveBalance',
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
      staff_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      leave_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
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
    },
    {
      tableName: 'leave_balances',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  LeaveBalance.associate = (models) => {
    LeaveBalance.belongsTo(models.Tenant, {
      foreignKey: 'tenant_id',
      as: 'Tenant',
    });
    LeaveBalance.belongsTo(models.StaffProfile, {
      foreignKey: 'staff_id',
      as: 'StaffProfile',
    });
    LeaveBalance.belongsTo(models.LeaveType, {
      foreignKey: 'leave_type_id',
      as: 'LeaveType',
    });
  };

  return LeaveBalance;
};

// backend/src/models/leaveRequest.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const LeaveRequest = sequelize.define(
    'LeaveRequest',
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
        allowNull: false,
      },
      leave_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
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
        get() {
          const raw = this.getDataValue('yearly_deductions');
          if (typeof raw === 'string') {
            try {
              return JSON.parse(raw);
            } catch {
              return raw;
            }
          }
          return raw;
        },
      },
      document_url: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      created_by_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      approved_by_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
      },
      cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cancellation_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'leave_requests',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  LeaveRequest.associate = (models) => {
    LeaveRequest.belongsTo(models.Tenant, {
      foreignKey: 'tenant_id',
      as: 'Tenant',
    });
    LeaveRequest.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'Branch',
    });
    LeaveRequest.belongsTo(models.StaffProfile, {
      foreignKey: 'staff_id',
      as: 'StaffProfile',
    });
    LeaveRequest.belongsTo(models.LeaveType, {
      foreignKey: 'leave_type_id',
      as: 'LeaveType',
    });
    LeaveRequest.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'CreatedBy',
    });
    LeaveRequest.belongsTo(models.User, {
      foreignKey: 'approved_by_id',
      as: 'ApprovedBy',
    });
    LeaveRequest.belongsTo(models.User, {
      foreignKey: 'cancelled_by_id',
      as: 'CancelledBy',
    });
  };

  return LeaveRequest;
};

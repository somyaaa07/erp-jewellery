// backend/src/models/staffProfile.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const StaffProfile = sequelize.define(
    'StaffProfile',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
      },
      tenant_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      employee_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      first_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      last_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      profile_photo: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      dob: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      gender: {
        type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'),
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      emergency_contact_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      emergency_contact_phone: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      department: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      designation: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      employment_type: {
        type: DataTypes.ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'PROBATION'),
        defaultValue: 'FULL_TIME',
      },
      reporting_manager_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      joining_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED'),
        defaultValue: 'ACTIVE',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      assigned_shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      transfer_history: {
        type: DataTypes.JSON,
        defaultValue: [],
      },
    },
    {
      tableName: 'staff_profiles',
      timestamps: true,
    }
  );

  StaffProfile.associate = (models) => {
    StaffProfile.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'User',
      onDelete: 'SET NULL',
    });
    StaffProfile.belongsTo(models.Tenant, {
      foreignKey: 'tenant_id',
      as: 'Tenant',
    });
    StaffProfile.belongsTo(models.Branch, {
      foreignKey: 'branch_id',
      as: 'Branch',
      onDelete: 'SET NULL',
    });
    StaffProfile.belongsTo(models.User, {
      foreignKey: 'reporting_manager_id',
      as: 'ReportingManager',
      onDelete: 'SET NULL',
    });
    if (models.Shift) {
      StaffProfile.belongsTo(models.Shift, {
        foreignKey: 'assigned_shift_id',
        as: 'AssignedShift',
        onDelete: 'SET NULL',
      });
    }
    if (models.Attendance) {
      StaffProfile.hasMany(models.Attendance, {
        foreignKey: 'staff_id',
        as: 'Attendances',
      });
    }
    if (models.LeaveRequest) {
      StaffProfile.hasMany(models.LeaveRequest, {
        foreignKey: 'staff_id',
        as: 'LeaveRequests',
      });
    }
    if (models.LeaveBalance) {
      StaffProfile.hasMany(models.LeaveBalance, {
        foreignKey: 'staff_id',
        as: 'LeaveBalances',
      });
    }
    if (models.User) {
      models.User.hasOne(StaffProfile, {
        foreignKey: 'user_id',
        as: 'StaffProfile',
        onDelete: 'SET NULL',
      });
    }
    if (models.Branch) {
      models.Branch.hasMany(StaffProfile, {
        foreignKey: 'branch_id',
        as: 'StaffProfiles',
      });
    }
  };

  return StaffProfile;
};


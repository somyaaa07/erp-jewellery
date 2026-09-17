// models/tenant.js
// A Tenant = one jewellery business (could own multiple branches).
// Managed exclusively via the SUPER ADMIN dashboard.

import { DataTypes } from "sequelize";

export default (sequelize) => {
  const Tenant = sequelize.define(
    "Tenant",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      owner_email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      owner_phone: {
        type: DataTypes.STRING,
      },
      subscription_plan: {
        type: DataTypes.ENUM(
          "TRIAL",
          "BASIC",
          "PRO",
          "ENTERPRISE"
        ),
        defaultValue: "TRIAL",
      },
      max_branches: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },
      status: {
        type: DataTypes.ENUM(
          "ACTIVE",
          "SUSPENDED",
          "CANCELLED"
        ),
        defaultValue: "ACTIVE",
      },
      subscription_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "tenants",
    }
  );

  Tenant.associate = (models) => {
    Tenant.hasMany(models.Branch, {
      foreignKey: "tenant_id",
    });

    Tenant.hasMany(models.User, {
      foreignKey: "tenant_id",
    });
  };

  return Tenant;
};
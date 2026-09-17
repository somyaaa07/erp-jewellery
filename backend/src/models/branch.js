// models/branch.js
// A Branch belongs to a Tenant. Almost every other table scopes data by (tenant_id, branch_id).

import { DataTypes } from "sequelize";

export default (sequelize) => {
  const Branch = sequelize.define(
    "Branch",
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
        type: DataTypes.STRING,
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING,
      },
      gstin: {
        type: DataTypes.STRING,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "branches",
    }
  );

  Branch.associate = (models) => {
    Branch.belongsTo(models.Tenant, {
      foreignKey: "tenant_id",
    });

    Branch.hasMany(models.User, {
      foreignKey: "branch_id",
    });

    Branch.hasMany(models.Location, {
      foreignKey: "branch_id",
    });
  };

  return Branch;
};
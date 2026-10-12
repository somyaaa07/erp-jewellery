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

    Branch.hasMany(models.StaffProfile, {
      foreignKey: "branch_id",
      as: "staffProfiles",
    });
  };

  Branch.addHook("beforeDestroy", async (branch, options) => {
    const models = sequelize.models;
    if (models.StaffProfile) {
      const staffCount = await models.StaffProfile.count({
        where: { branch_id: branch.id },
        transaction: options.transaction,
      });
      if (staffCount > 0) {
        throw new Error(`Cannot delete branch '${branch.name}': ${staffCount} employee record(s) are assigned to this branch. Deactivate the branch instead.`);
      }
    }
    if (models.User) {
      const userCount = await models.User.count({
        where: { branch_id: branch.id },
        transaction: options.transaction,
      });
      if (userCount > 0) {
        throw new Error(`Cannot delete branch '${branch.name}': ${userCount} user(s) are assigned to this branch. Deactivate the branch instead.`);
      }
    }
    if (models.Location) {
      const locCount = await models.Location.count({
        where: { branch_id: branch.id },
        transaction: options.transaction,
      });
      if (locCount > 0) {
        throw new Error(`Cannot delete branch '${branch.name}': ${locCount} inventory location(s) are assigned to this branch. Deactivate the branch instead.`);
      }
    }
  });

  return Branch;
};
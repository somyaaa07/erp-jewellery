// controllers/branchController.js
// ADMIN-level. A tenant's ADMIN manages their own branches here.

import db from "../models/index.js";
import { AppError } from "../middlewares/errorHandler.js";

const { Branch, Tenant } = db;

// Create Branch
export const createBranch = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.scope.tenant_id);

    const existingCount = await Branch.count({
      where: {
        tenant_id: req.scope.tenant_id,
      },
    });

    if (existingCount >= tenant.max_branches) {
      throw new AppError(
        `Branch limit (${tenant.max_branches}) reached for your subscription plan`,
        403
      );
    }

    const branch = await Branch.create({
      tenant_id: req.scope.tenant_id,
      name: req.body.name,
      address: req.body.address,
      gstin: req.body.gstin,
    });

    res.status(201).json(branch);
  } catch (err) {
    next(err);
  }
};

// List Branches
export const listBranches = async (req, res, next) => {
  try {
    const branches = await Branch.findAll({
      where: {
        tenant_id: req.scope.tenant_id,
      },
    });

    res.json(branches);
  } catch (err) {
    next(err);
  }
};

// Update Branch
export const updateBranch = async (req, res, next) => {
  try {
    const branch = await Branch.findOne({
      where: {
        id: req.params.id,
        tenant_id: req.scope.tenant_id,
      },
    });

    if (!branch) {
      throw new AppError("Branch not found", 404);
    }

    ["name", "address", "gstin", "is_active"].forEach((field) => {
      if (req.body[field] !== undefined) {
        branch[field] = req.body[field];
      }
    });

    await branch.save();

    res.json(branch);
  } catch (err) {
    next(err);
  }
};
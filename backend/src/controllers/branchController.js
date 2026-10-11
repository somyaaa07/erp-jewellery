// controllers/branchController.js
// ADMIN-level. A tenant's ADMIN manages their own branches here.

import db from "../models/index.js";
import { AppError } from "../middlewares/errorHandler.js";

const { sequelize, Branch, Tenant, Location } = db;

// Create Branch
// BUG FIX: creating a branch used to leave it with zero locations, so there was nowhere to
// even put stock until someone manually created a location. Now every branch is born with its
// one wholesale storage (L1) and its display tray inside it (L2), automatically.
export const createBranch = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const tenant = await Tenant.findByPk(req.scope.tenant_id, { transaction: t });

    const existingCount = await Branch.count({
      where: {
        tenant_id: req.scope.tenant_id,
      },
      transaction: t,
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
    }, { transaction: t });

    // The single wholesale storage for this branch - all fresh stock (purchase, manufacturing,
    // incoming transfer) lands here by default.
    const wholesaleStore = await Location.create({
      tenant_id: req.scope.tenant_id,
      branch_id: branch.id,
      parent_id: null,
      name: "Wholesale Store",
      level: 1,
      storage_type: "WHOLESALE_STORE",
      empty_weight: req.body.wholesale_empty_weight || 0,
      capacity_weight: req.body.wholesale_capacity_weight || null,
      capacity_pieces: req.body.wholesale_capacity_pieces || null,
    }, { transaction: t });

    // The counter/display tray - stock is moved here FROM the wholesale store, never filled
    // directly.
    await Location.create({
      tenant_id: req.scope.tenant_id,
      branch_id: branch.id,
      parent_id: wholesaleStore.id,
      name: "Display Tray",
      level: 2,
      storage_type: "TRAY_DISPLAY",
      empty_weight: req.body.tray_empty_weight || 0,
      capacity_weight: req.body.tray_capacity_weight || null,
      capacity_pieces: req.body.tray_capacity_pieces || null,
    }, { transaction: t });

    await t.commit();
    res.status(201).json(branch);
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// One-time helper: back-fills a Wholesale Store + Display Tray for any EXISTING branch that
// was created before this fix and therefore still has no storage location.
export const backfillBranchStorage = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const branch = await Branch.findOne({
      where: { id: req.params.id, tenant_id: req.scope.tenant_id },
      transaction: t,
    });
    if (!branch) throw new AppError("Branch not found", 404);

    const existingWholesale = await Location.findOne({
      where: { tenant_id: req.scope.tenant_id, branch_id: branch.id, storage_type: "WHOLESALE_STORE" },
      transaction: t,
    });
    if (existingWholesale) throw new AppError("This branch already has a wholesale store", 409);

    const wholesaleStore = await Location.create({
      tenant_id: req.scope.tenant_id,
      branch_id: branch.id,
      parent_id: null,
      name: "Wholesale Store",
      level: 1,
      storage_type: "WHOLESALE_STORE",
    }, { transaction: t });

    const tray = await Location.create({
      tenant_id: req.scope.tenant_id,
      branch_id: branch.id,
      parent_id: wholesaleStore.id,
      name: "Display Tray",
      level: 2,
      storage_type: "TRAY_DISPLAY",
    }, { transaction: t });

    await t.commit();
    res.status(201).json({ wholesaleStore, tray });
  } catch (err) {
    await t.rollback();
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
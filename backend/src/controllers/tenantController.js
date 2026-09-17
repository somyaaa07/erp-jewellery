// controllers/tenantController.js
// SUPER ADMIN ONLY.

import db from "../models/index.js";
import { AppError } from "../middlewares/errorHandler.js";

const { Tenant, Branch, User } = db;

// Create Tenant
export const createTenant = async (req, res, next) => {
  try {
    const {
      name,
      owner_email,
      owner_phone,
      subscription_plan,
      max_branches,
    } = req.body;

    const tenant = await Tenant.create({
      name,
      owner_email,
      owner_phone,
      subscription_plan,
      max_branches,
    });

    res.status(201).json(tenant);
  } catch (err) {
    next(err);
  }
};

// List Tenants
export const listTenants = async (req, res, next) => {
  try {
    const tenants = await Tenant.findAll({
      include: [{ model: Branch }],
      order: [["created_at", "DESC"]],
    });

    res.json(tenants);
  } catch (err) {
    next(err);
  }
};

// Get Single Tenant
export const getTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id, {
      include: [Branch, User],
    });

    if (!tenant) {
      throw new AppError("Tenant not found", 404);
    }

    res.json(tenant);
  } catch (err) {
    next(err);
  }
};

// Update Tenant Status
export const updateTenantStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const tenant = await Tenant.findByPk(req.params.id);

    if (!tenant) {
      throw new AppError("Tenant not found", 404);
    }

    tenant.status = status;

    await tenant.save();

    res.json(tenant);
  } catch (err) {
    next(err);
  }
};

// Update Subscription
export const updateSubscription = async (req, res, next) => {
  try {
    const {
      subscription_plan,
      max_branches,
      subscription_expires_at,
    } = req.body;

    const tenant = await Tenant.findByPk(req.params.id);

    if (!tenant) {
      throw new AppError("Tenant not found", 404);
    }

    if (subscription_plan) {
      tenant.subscription_plan = subscription_plan;
    }

    if (max_branches) {
      tenant.max_branches = max_branches;
    }

    if (subscription_expires_at) {
      tenant.subscription_expires_at =
        subscription_expires_at;
    }

    await tenant.save();

    res.json(tenant);
  } catch (err) {
    next(err);
  }
};

// Create First ADMIN User for Tenant
export const createTenantAdmin = async (
  req,
  res,
  next
) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);

    if (!tenant) {
      throw new AppError("Tenant not found", 404);
    }

    const { name, email, password } = req.body;

    const admin = await User.create({
      tenant_id: tenant.id,
      branch_id: null, // ADMIN can access all branches
      name,
      email,
      password_hash: password, // Automatically hashed by model hook
      role: "ADMIN",
    });

    res.status(201).json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    });
  } catch (err) {
    next(err);
  }
};
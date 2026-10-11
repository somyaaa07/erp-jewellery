 // controllers/userController.js
// ADMIN manages staff (MANAGER/SALESMAN/KARIGAR_INCHARGE) within their own tenant.

import db from "../models/index.js";
import { AppError } from "../middlewares/errorHandler.js";

const { User } = db;

const ALLOWED_ROLES_FOR_ADMIN_TO_CREATE = [
  "MANAGER",
  "SALESMAN",
  "KARIGAR_INCHARGE",
];

// Create Staff
export const createStaff = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      role,
      branch_id,
    } = req.body;

    if (
      !ALLOWED_ROLES_FOR_ADMIN_TO_CREATE.includes(role)
    ) {
      throw new AppError(
        `Admins can only create these roles: ${ALLOWED_ROLES_FOR_ADMIN_TO_CREATE.join(
          ", "
        )}`,
        400
      );
    }

    const staff = await User.create({
      tenant_id: req.scope.tenant_id,
      branch_id,
      name,
      email,
      password_hash: password,
      role,
    });

    res.status(201).json({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      branch_id: staff.branch_id,
    });
  } catch (err) {
    next(err);
  }
};

// List Staff
export const listStaff = async (req, res, next) => {
  try {
    const where = {
      tenant_id: req.scope.tenant_id,
    };

    // MANAGER only sees their own branch
    if (req.scope.branch_id) {
      where.branch_id = req.scope.branch_id;
    }

    const staff = await User.findAll({
      where,
      attributes: {
        exclude: ["password_hash"],
      },
    });

    res.json(staff);
  } catch (err) {
    next(err);
  }
};

// Update Staff
export const updateStaff = async (req, res, next) => {
  try {
    const staff = await User.findOne({
      where: {
        id: req.params.id,
        tenant_id: req.scope.tenant_id,
      },
    });

    if (!staff) {
      throw new AppError(
        "Staff member not found",
        404
      );
    }

    if (staff.role === "ADMIN") {
      throw new AppError(
        "Cannot modify an ADMIN account from this endpoint",
        403
      );
    }

    ["name", "branch_id", "is_active"].forEach(
      (field) => {
        if (req.body[field] !== undefined) {
          staff[field] = req.body[field];
        }
      }
    );

    // Hook automatically hashes password
    if (req.body.password) {
      staff.password_hash = req.body.password;
    }

    await staff.save();

    res.json({
      id: staff.id,
      name: staff.name,
      role: staff.role,
      is_active: staff.is_active,
    });
  } catch (err) {
    next(err);
  }
};
// controllers/authController.js

import jwt from "jsonwebtoken";
import db from "../models/index.js";
import { AppError } from "../middlewares/errorHandler.js";

const { User } = db;

// Login
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError("Email and password are required", 400);
    }

    const user = await User.findOne({
      where: { email },
    });

    if (!user || !user.is_active) {
      throw new AppError("Invalid credentials", 401);
    }

    const valid = await user.validatePassword(password);

    if (!valid) {
      throw new AppError("Invalid credentials", 401);
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        tenant_id: user.tenant_id,
        branch_id: user.branch_id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "8h",
      }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        branch_id: user.branch_id,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Logged-in User Details
export const me = async (req, res) => {
  const {
    id,
    name,
    email,
    role,
    tenant_id,
    branch_id,
  } = req.user;

  res.json({
    id,
    name,
    email,
    role,
    tenant_id,
    branch_id,
  });
};
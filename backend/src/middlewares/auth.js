// middlewares/auth.js
// Verifies the JWT sent in the Authorization header and loads the full user record onto req.user.
// Every protected route should use this BEFORE tenantScope and rbac.

import jwt from "jsonwebtoken";
import db from "../models/index.js";

const { User } = db;

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or malformed Authorization header",
      });
    }

    const token = header.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id);

    if (!user || !user.is_active) {
      return res.status(401).json({
        error: "User not found or inactive",
      });
    }

    req.user = user;

    next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
};

export default auth;
// routes/userRoutes.js

import express from "express";
import auth from "../middlewares/auth.js";
import tenantScope from "../middlewares/tenantScope.js";
import rbac from "../middlewares/rbac.js";

import {
  createStaff,
  listStaff,
  updateStaff,
} from "../controllers/userController.js";

const router = express.Router();

// Apply middlewares to all routes
router.use(auth, tenantScope, rbac("USER_MANAGE"));

// Routes
router.post("/", createStaff);

router.get("/", listStaff);

router.patch("/:id", updateStaff);

export default router;
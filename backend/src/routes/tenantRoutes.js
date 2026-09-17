// routes/tenantRoutes.js

import express from "express";
import auth from "../middlewares/auth.js";
import tenantScope from "../middlewares/tenantScope.js";
import rbac from "../middlewares/rbac.js";

import {
  createTenant,
  listTenants,
  getTenant,
  updateTenantStatus,
  updateSubscription,
  createTenantAdmin,
} from "../controllers/tenantController.js";

const router = express.Router();

// All routes here are SUPER_ADMIN only ('*' permission)
router.use(auth, tenantScope, rbac("*"));

router.post("/", createTenant);

router.get("/", listTenants);

router.get("/:id", getTenant);

router.patch("/:id/status", updateTenantStatus);

router.patch("/:id/subscription", updateSubscription);

router.post("/:id/admin", createTenantAdmin);

export default router;
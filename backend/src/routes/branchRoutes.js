// routes/branchRoutes.js

import express from "express";
import auth from "../middlewares/auth.js";
import tenantScope from "../middlewares/tenantScope.js";
import rbac from "../middlewares/rbac.js";
import {
  createBranch,
  listBranches,
  updateBranch,
} from "../controllers/branchController.js";

const router = express.Router();

// Apply authentication and tenant scoping to all routes
router.use(auth, tenantScope);

// Routes
router.post("/", rbac("USER_MANAGE"), createBranch);

router.get(
  "/",
  rbac("INVENTORY_VIEW"),
  listBranches
);

router.patch(
  "/:id",
  rbac("USER_MANAGE"),
  updateBranch
);

export default router;
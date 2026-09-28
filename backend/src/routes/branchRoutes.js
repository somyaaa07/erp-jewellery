// routes/branchRoutes.js

import express from "express";
import auth from "../middlewares/auth.js";
import tenantScope from "../middlewares/tenantScope.js";
import rbac from "../middlewares/rbac.js";
import {
  createBranch,
  listBranches,
  updateBranch,
  backfillBranchStorage,
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

// For branches created before the auto-storage fix - creates their missing
// Wholesale Store + Display Tray locations.
router.post(
  "/:id/backfill-storage",
  rbac("USER_MANAGE"),
  backfillBranchStorage
);

export default router;
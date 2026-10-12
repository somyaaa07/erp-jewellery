// backend/src/routes/staffRoutes.js
import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import {
  listStaff,
  getStaffById,
  createStaff,
  updateStaff,
  updateStaffStatus,
  deactivateStaff,
  transferStaffBranch,
} from '../controllers/staffController.js';

const router = express.Router();

// All staff routes require authenticated session and tenant scoping
router.use(auth, tenantScope);

// GET /api/staff - List staff with search, filters, sorting, and pagination (Admin & Manager)
router.get('/', rbac('STAFF_VIEW'), listStaff);

// GET /api/staff/:id - View single staff member profile (Admin & Manager)
router.get('/:id', rbac('STAFF_VIEW'), getStaffById);

// POST /api/staff - Add new staff member (Admin & Manager)
router.post('/', rbac('STAFF_CREATE'), createStaff);

// PUT /api/staff/:id - Edit staff member details (Admin & Manager)
router.put('/:id', rbac('STAFF_EDIT'), updateStaff);

// PATCH /api/staff/:id/status - Update staff status (Active, Inactive, On Leave, Suspended)
router.patch('/:id/status', rbac('STAFF_DEACTIVATE'), updateStaffStatus);

// PATCH /api/staff/:id/deactivate - Dedicated soft deactivation
router.patch('/:id/deactivate', rbac('STAFF_DEACTIVATE'), deactivateStaff);

// DELETE /api/staff/:id - Soft deactivation preserving all historical records
router.delete('/:id', rbac('STAFF_DEACTIVATE'), deactivateStaff);

// PATCH /api/staff/:id/branch - Transfer staff to another branch (Admin only)
router.patch('/:id/branch', rbac('USER_MANAGE'), transferStaffBranch);

export default router;

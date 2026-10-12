// backend/src/routes/shiftRoutes.js
import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import {
  listShifts,
  getShiftById,
  createShift,
  updateShift,
  updateShiftStatus,
} from '../controllers/shiftController.js';

const router = express.Router();

// All shift endpoints require authentication and tenant isolation
router.use(auth, tenantScope);

// GET /api/shifts - List shifts (viewable by Admin, Manager, Salesman)
router.get('/', rbac('SHIFT_VIEW'), listShifts);

// GET /api/shifts/:id - View shift details
router.get('/:id', rbac('SHIFT_VIEW'), getShiftById);

// POST /api/shifts - Create shift schedule (Admin only)
router.post('/', rbac('SHIFT_MANAGE'), createShift);

// PUT /api/shifts/:id - Update shift schedule (Admin only)
router.put('/:id', rbac('SHIFT_MANAGE'), updateShift);

// PATCH /api/shifts/:id/status - Toggle shift active status (Admin only)
router.patch('/:id/status', rbac('SHIFT_MANAGE'), updateShiftStatus);

export default router;

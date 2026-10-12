// backend/src/routes/leaveRoutes.js
import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import {
  listLeaves,
  getLeaveById,
  recordLeave,
  cancelLeave,
  getLeaveSummary,
  getLeaveBalances,
  listLeaveTypes,
  createLeaveType,
  updateLeaveType,
} from '../controllers/leaveController.js';

const router = express.Router();

// All leave endpoints strictly require authentication and tenant isolation
router.use(auth, tenantScope);

// Leave Types management
router.get('/types', rbac('LEAVE_VIEW'), listLeaveTypes);
router.post('/types', rbac('LEAVE_TYPE_MANAGE'), createLeaveType);
router.put('/types/:id', rbac('LEAVE_TYPE_MANAGE'), updateLeaveType);

// Summary metrics & employee balances
router.get('/summary', rbac('LEAVE_VIEW'), getLeaveSummary);
router.get('/balances/:staffId', rbac('LEAVE_BALANCE_VIEW'), getLeaveBalances);

// Leave Requests management
router.get('/', rbac('LEAVE_VIEW'), listLeaves);
router.get('/:id', rbac('LEAVE_VIEW'), getLeaveById);
router.post('/', rbac('LEAVE_RECORD'), recordLeave);
router.patch('/:id/cancel', rbac('LEAVE_CANCEL'), cancelLeave);

export default router;

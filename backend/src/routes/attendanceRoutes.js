// backend/src/routes/attendanceRoutes.js
import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import {
  listDailyAttendance,
  getAttendanceById,
  markAttendance,
  updateAttendance,
  recordCheckOut,
  correctAttendance,
  bulkMarkAttendance,
  getEmployeeAttendanceHistory,
  getMonthlyReport,
} from '../controllers/attendanceController.js';

const router = express.Router();

// All attendance routes require authentication and tenant isolation
router.use(auth, tenantScope);

// GET /api/attendance - List daily attendance with summary statistics
router.get('/', rbac('ATTENDANCE_VIEW'), listDailyAttendance);

// GET /api/attendance/monthly-report - Monthly attendance report
router.get('/monthly-report', rbac('ATTENDANCE_REPORT'), getMonthlyReport);

// GET /api/attendance/employee/:staffId/history - Employee attendance history
router.get('/employee/:staffId/history', rbac('ATTENDANCE_VIEW'), getEmployeeAttendanceHistory);

// GET /api/attendance/:id - Single attendance record
router.get('/:id', rbac('ATTENDANCE_VIEW'), getAttendanceById);

// POST /api/attendance - Mark single attendance
router.post('/', rbac('ATTENDANCE_MARK'), markAttendance);

// PUT /api/attendance/:id - Edit attendance record
router.put('/:id', rbac('ATTENDANCE_EDIT'), updateAttendance);

// PATCH /api/attendance/:id/checkout - Evening checkout
router.patch('/:id/checkout', rbac('ATTENDANCE_MARK'), recordCheckOut);

// PATCH /api/attendance/:id/correction - Audited attendance correction with reason
router.patch('/:id/correction', rbac('ATTENDANCE_EDIT'), correctAttendance);

// POST /api/attendance/bulk - Bulk attendance marking
router.post('/bulk', rbac('ATTENDANCE_MARK'), bulkMarkAttendance);

export default router;

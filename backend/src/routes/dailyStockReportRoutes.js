import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/dailyStockReportController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.get('/history', rbac('INVENTORY_VIEW'), controller.listReports);
router.get('/', rbac('INVENTORY_VIEW'), controller.getReport);
router.put('/', rbac('INVENTORY_EDIT'), controller.saveReport);
router.post('/sign', rbac('INVENTORY_EDIT'), controller.signReport);

export default router;

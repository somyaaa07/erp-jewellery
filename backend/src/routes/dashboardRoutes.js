import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/dashboardController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.get('/summary', rbac('INVENTORY_VIEW'), controller.dashboardSummary);

export default router;

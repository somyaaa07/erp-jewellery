import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/goldRateController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('RATE_LOCK'), controller.addGoldRate);
router.get('/', rbac('INVENTORY_VIEW'), controller.listGoldRates);
router.get('/today', rbac('INVENTORY_VIEW'), controller.todaysRates);

export default router;

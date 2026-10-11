import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/reportsController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.get('/inventory-valuation', rbac('ACCOUNTING_VIEW'), controller.inventoryValuation);
router.get('/slow-moving-stock', rbac('INVENTORY_VIEW'), controller.slowMovingStock);
router.get('/dead-stock', rbac('INVENTORY_VIEW'), controller.deadStock);
router.get('/sales', rbac('ACCOUNTING_VIEW'), controller.salesReport);
router.get('/purchases', rbac('ACCOUNTING_VIEW'), controller.purchaseReport);
router.get('/stock-movements', rbac('INVENTORY_VIEW'), controller.stockMovementReport);

export default router;

// routes/purchaseRoutes.js
import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/purchaseController.js';

const router = express.Router();

router.use(auth, tenantScope);

router.post('/', rbac('PURCHASING_EDIT'), controller.createPurchase);
router.get('/', rbac('PURCHASING_VIEW'), controller.listPurchases);
router.patch('/:id/verify-tunch', rbac('PURCHASING_EDIT'), controller.verifyTunch);
router.post('/:id/receive-into-inventory', rbac('INVENTORY_EDIT'), controller.receiveIntoInventory);

export default router;
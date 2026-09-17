import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/saleController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('POS_BILL'), controller.createSale);
router.get('/', rbac('POS_VIEW'), controller.listSales);
router.get('/:id', rbac('POS_VIEW'), controller.getSale);
router.get('/:id/invoice', rbac('POS_VIEW'), controller.getInvoice);

export default router;

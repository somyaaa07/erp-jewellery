import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/customerController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('POS_BILL'), controller.createCustomer);
router.get('/', rbac('POS_VIEW'), controller.listCustomers);
router.get('/:id', rbac('POS_VIEW'), controller.getCustomer);
router.patch('/:id', rbac('POS_BILL'), controller.updateCustomer);
router.delete('/:id', rbac('POS_BILL'), controller.deactivateCustomer);

export default router;

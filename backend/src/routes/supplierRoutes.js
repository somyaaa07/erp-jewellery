import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/supplierController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('PURCHASING_EDIT'), controller.createSupplier);
router.get('/', rbac('PURCHASING_VIEW'), controller.listSuppliers);
router.get('/:id', rbac('PURCHASING_VIEW'), controller.getSupplier);
router.patch('/:id', rbac('PURCHASING_EDIT'), controller.updateSupplier);

export default router;

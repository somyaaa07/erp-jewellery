import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/productMasterController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('INVENTORY_EDIT'), controller.createProductMaster);
router.get('/', rbac('INVENTORY_VIEW'), controller.listProductMasters);
router.get('/lookup', rbac('INVENTORY_VIEW'), controller.lookupProductMaster);
router.patch('/:id', rbac('INVENTORY_EDIT'), controller.updateProductMaster);

export default router;

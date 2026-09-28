import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/manufacturingController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('KARIGAR_EDIT'), controller.createManufacturingOrder);
router.get('/', rbac('KARIGAR_VIEW'), controller.listManufacturingOrders);
router.patch('/:id/receive', rbac('KARIGAR_EDIT'), controller.receiveManufacturingOrder);

export default router;

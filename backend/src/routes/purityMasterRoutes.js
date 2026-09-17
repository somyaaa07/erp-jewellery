import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/purityMasterController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('INVENTORY_EDIT'), controller.createPurity);
router.get('/', rbac('INVENTORY_VIEW'), controller.listPurities);

export default router;

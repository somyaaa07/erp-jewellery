import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/rawMaterialController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('KARIGAR_EDIT'), controller.addRawMaterial);
router.get('/', rbac('KARIGAR_VIEW'), controller.listRawMaterials);
router.patch('/:id/adjust', rbac('KARIGAR_EDIT'), controller.adjustRawMaterial);

export default router;

// routes/locationRoutes.js
import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/locationController.js';

const router = express.Router();

router.use(auth, tenantScope);

router.post('/', rbac('INVENTORY_EDIT'), controller.createLocation);
router.get('/', rbac('INVENTORY_VIEW'), controller.listLocations);
router.delete('/:id', rbac('INVENTORY_EDIT'), controller.deleteLocation);

export default router;
// routes/locationRoutes.js
import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/locationController.js';

const router = express.Router();

router.use(auth, tenantScope);

router.get('/summary', rbac('INVENTORY_VIEW'), controller.getSummary);
router.get('/tree', rbac('INVENTORY_VIEW'), controller.getTree);
router.get('/find', rbac('INVENTORY_VIEW'), controller.findLocations);
router.get('/movements', rbac('INVENTORY_VIEW'), controller.listMovements);
router.post('/items/:itemId/move', rbac('INVENTORY_EDIT'), controller.moveStockLot);
router.get('/:id/contents', rbac('INVENTORY_VIEW'), controller.getContents);
router.post('/:id/place-design', rbac('INVENTORY_EDIT'), controller.placeDesign);
router.post('/:id/move', rbac('INVENTORY_EDIT'), controller.moveLocation);
router.post('/', rbac('INVENTORY_EDIT'), controller.createLocation);
router.get('/', rbac('INVENTORY_VIEW'), controller.listLocations);
router.patch('/:id', rbac('INVENTORY_EDIT'), controller.updateLocation);
router.delete('/:id', rbac('INVENTORY_EDIT'), controller.deleteLocation);

export default router;
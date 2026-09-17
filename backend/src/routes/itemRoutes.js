// routes/itemRoutes.js
import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import upload from '../middlewares/upload.js';
import * as controller from '../controllers/itemController.js';

const router = express.Router();

router.use(auth, tenantScope);

router.post('/', rbac('INVENTORY_EDIT'), controller.createItem);
router.get('/', rbac('INVENTORY_VIEW'), controller.listItems);
router.get('/low-stock', rbac('INVENTORY_VIEW'), controller.lowStockAlerts);
router.get('/barcode/:barcode', rbac('INVENTORY_VIEW'), controller.getItemByBarcode);
router.get('/:id', rbac('INVENTORY_VIEW'), controller.getItem);
router.get('/:id/price', rbac('INVENTORY_VIEW'), controller.getItemPrice);
router.get('/:id/transfer-history', rbac('INVENTORY_VIEW'), controller.getItemTransferHistory);
router.patch('/:id', rbac('INVENTORY_EDIT'), controller.updateItem);
router.post('/:id/images', rbac('INVENTORY_EDIT'), upload.array('images', 5), controller.uploadItemImages);
router.delete('/:id/images/:imageId', rbac('INVENTORY_EDIT'), controller.deleteItemImage);

export default router;
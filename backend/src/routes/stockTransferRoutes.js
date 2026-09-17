// routes/stockTransferRoutes.js
import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/stockTransferController.js';

const router = express.Router();

router.use(auth, tenantScope, rbac('INVENTORY_EDIT'));

router.post('/', controller.initiateTransfer);
router.get('/', controller.listTransfers);
router.patch('/:id/receive', controller.receiveTransfer);
router.patch('/:id/reject', controller.rejectTransfer);
router.patch('/:id/cancel', controller.cancelTransfer);

export default router;
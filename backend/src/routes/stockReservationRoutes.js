import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/stockReservationController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('POS_BILL'), controller.createReservation);
router.get('/', rbac('INVENTORY_VIEW'), controller.listReservations);
router.patch('/:id/release', rbac('POS_BILL'), controller.releaseReservation);

export default router;

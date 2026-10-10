import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/openingStockController.js';

const router = express.Router();
router.use(auth, tenantScope);

// Opening stock is entered once. Correcting it afterwards is an admin-only action.
const adminOnly = (req, res, next) => (
  req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN'
    ? next()
    : res.status(403).json({ error: 'Only an admin can correct opening stock' })
);

router.get('/', rbac('INVENTORY_VIEW'), controller.listOpeningStock);
router.post('/', rbac('INVENTORY_EDIT'), controller.createOpeningStock);
router.patch('/:id', rbac('INVENTORY_EDIT'), adminOnly, controller.updateOpeningStock);

export default router;

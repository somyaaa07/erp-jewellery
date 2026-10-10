import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import { searchInventory } from '../controllers/inventorySearchController.js';

const router = express.Router();
router.use(auth, tenantScope);
router.get('/', rbac('INVENTORY_VIEW'), searchInventory);
export default router;

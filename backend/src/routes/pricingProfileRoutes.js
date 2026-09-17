import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/pricingProfileController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('RATE_LOCK'), controller.createPricingProfile);
router.get('/', rbac('INVENTORY_VIEW'), controller.listPricingProfiles);
router.patch('/:id', rbac('RATE_LOCK'), controller.updatePricingProfile);

export default router;

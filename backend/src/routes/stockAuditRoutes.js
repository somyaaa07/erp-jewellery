import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/stockAuditController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/', rbac('AUDIT_VIEW'), controller.startAudit);
router.get('/', rbac('AUDIT_VIEW'), controller.listAudits);
router.post('/:id/entries', rbac('AUDIT_VIEW'), controller.recordAuditEntries);
router.patch('/:id/complete', rbac('AUDIT_VIEW'), controller.completeAudit);

export default router;

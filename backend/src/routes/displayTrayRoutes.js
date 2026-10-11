import express from 'express';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import * as controller from '../controllers/displayTrayController.js';

const router = express.Router();
router.use(auth, tenantScope);

router.get('/summary', rbac('INVENTORY_VIEW'), controller.getSummary);
router.get('/pieces', rbac('INVENTORY_VIEW'), controller.listPieces);
router.post('/pieces/:pieceId/move', rbac('INVENTORY_EDIT'), controller.movePieceToTray);
router.post('/pieces/:pieceId/remove', rbac('INVENTORY_EDIT'), controller.removePiece);

router.get('/', rbac('INVENTORY_VIEW'), controller.listTrays);
router.post('/', rbac('INVENTORY_EDIT'), controller.createTray);
router.get('/:id', rbac('INVENTORY_VIEW'), controller.getTray);
router.patch('/:id', rbac('INVENTORY_EDIT'), controller.updateTray);
router.post('/:id/move', rbac('INVENTORY_EDIT'), controller.moveTray);
router.post('/:id/pieces', rbac('INVENTORY_EDIT'), controller.addPiece);
router.get('/:id/audits', rbac('INVENTORY_VIEW'), controller.listAudits);
router.post('/:id/audits', rbac('INVENTORY_EDIT'), controller.createAudit);

export default router;

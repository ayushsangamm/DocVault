import { Router } from 'express';
import { listAuditLogs, getAuditLogById } from '../controllers/auditController.js';
import { authenticate } from '../middleware/authenticate.js';
import { standardLimiter } from '../middleware/rateLimiters.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authenticate);
router.use(standardLimiter);

router.get('/', asyncHandler(listAuditLogs));
router.get('/:id', asyncHandler(getAuditLogById));

export default router;

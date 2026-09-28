import { Router } from 'express';
import {
  createShare,
  listShares,
  getShareById,
  revokeShare,
  resetDeviceLock,
  regenerateLink,
  createShareSchema,
} from '../controllers/shareController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { standardLimiter } from '../middleware/rateLimiters.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authenticate);
router.use(standardLimiter);

router.post('/', validate(createShareSchema), asyncHandler(createShare));
router.get('/', asyncHandler(listShares));
router.get('/:id', asyncHandler(getShareById));
router.post('/:id/revoke', asyncHandler(revokeShare));
router.post('/:id/reset-lock', asyncHandler(resetDeviceLock));
router.post('/:id/regenerate-link', asyncHandler(regenerateLink));

export default router;

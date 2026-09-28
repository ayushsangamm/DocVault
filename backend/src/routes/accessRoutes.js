import { Router } from 'express';
import {
  openShareLink,
  streamDocument,
  downloadDocument,
  verifyStatus,
  openTokenSchema,
} from '../controllers/accessController.js';
import { accessLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Public recipient routes are rate-limited per IP
router.use(accessLimiter);

router.post('/open', validate(openTokenSchema), asyncHandler(openShareLink));
router.get('/stream', asyncHandler(streamDocument));
router.post('/download', validate(openTokenSchema), asyncHandler(downloadDocument));
router.post('/verify-status', asyncHandler(verifyStatus));

export default router;

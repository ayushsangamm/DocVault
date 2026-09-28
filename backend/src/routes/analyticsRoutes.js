import { Router } from 'express';
import { getAnalyticsSummary } from '../controllers/analyticsController.js';
import { authenticate } from '../middleware/authenticate.js';
import { standardLimiter } from '../middleware/rateLimiters.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authenticate);
router.use(standardLimiter);

router.get('/summary', asyncHandler(getAnalyticsSummary));

export default router;

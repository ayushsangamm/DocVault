import { Router } from 'express';
import {
  uploadDocument,
  listDocuments,
  getDocumentById,
  renameDocument,
  deleteDocument,
  renameDocumentSchema,
} from '../controllers/documentController.js';
import { authenticate } from '../middleware/authenticate.js';
import { uploadMiddleware } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { standardLimiter } from '../middleware/rateLimiters.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// All document routes require authentication
router.use(authenticate);
router.use(standardLimiter);

router.post('/', uploadMiddleware.single('file'), asyncHandler(uploadDocument));
router.get('/', asyncHandler(listDocuments));
router.get('/:id', asyncHandler(getDocumentById));
router.patch('/:id', validate(renameDocumentSchema), asyncHandler(renameDocument));
router.delete('/:id', asyncHandler(deleteDocument));

export default router;

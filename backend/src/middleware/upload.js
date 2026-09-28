import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

/**
 * File Upload and Signature Verification Middleware
 * 
 * WHY:
 * 1. Multer Memory Storage: File bytes are held in RAM for immediate signature inspection
 *    and streaming to Cloudinary. No unencrypted files are ever written to the host filesystem disk.
 * 2. 10 MB Strict Limit: Mitigates denial-of-service attempts through file payload inflation.
 * 3. Magic-Byte Validation: Attackers can easily rename malicious binaries (e.g. `payload.exe` to `invoice.pdf`).
 *    We inspect the first bytes of the binary header to verify actual file signatures.
 */

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
];

const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        ApiError.badRequest(
          `Unsupported file type (${file.mimetype}). Allowed types: PDF, PNG, JPG/JPEG, WEBP, DOCX.`,
          'INVALID_FILE_TYPE'
        )
      );
    }
  },
});

/**
 * Validates the file buffer magic bytes against expected file signatures
 */
export function validateFileMagicBytes(buffer, mimeType) {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  // PDF: %PDF (0x25 0x50 0x44 0x46)
  if (mimeType === 'application/pdf') {
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    );
  }

  // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (mimeType === 'image/jpeg') {
    return (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  // WEBP: RIFF....WEBP
  if (mimeType === 'image/webp') {
    if (buffer.length < 12) return false;
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }

  // DOCX (ZIP format): PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }

  return false;
}

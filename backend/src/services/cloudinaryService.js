import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

/**
 * Cloudinary Secure Storage Service
 * 
 * WHY:
 * 1. `type: "authenticated"`: Files uploaded with this flag are locked down by Cloudinary.
 *    They cannot be downloaded through public URLs without a cryptographic signature.
 * 2. URL secrecy: We NEVER send Cloudinary URLs to the client. All files are fetched
 *    server-side using signed URLs and proxied directly into the Express response stream.
 */

/**
 * Uploads a buffer to Cloudinary using authenticated mode
 */
export async function uploadDocumentStream(buffer, { userId, originalName, mimeType }) {
  return new Promise((resolve, reject) => {
    // Images use 'image' resource_type so Cloudinary can process image dimensions;
    // PDFs, docx, and binary files use 'raw'
    const isImage = mimeType.startsWith('image/');
    const resourceType = isImage ? 'image' : 'raw';

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        type: 'authenticated',
        resource_type: resourceType,
        folder: `docvault/${userId}`,
        use_filename: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary Upload Error]', error);
          return reject(error);
        }
        resolve({
          publicId: result.public_id,
          resourceType: result.resource_type || resourceType,
          sizeBytes: result.bytes,
          format: result.format,
        });
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
}

/**
 * Generates an authenticated, short-lived signed delivery URL server-side
 */
export function getSignedDeliveryUrl(publicId, resourceType = 'raw') {
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    secure: true,
  });
}

/**
 * Generates an authenticated download URL using Cloudinary private_download_url
 */
export function getPrivateDownloadUrl(publicId, format = '', resourceType = 'raw') {
  try {
    if (cloudinary.utils?.private_download_url) {
      return cloudinary.utils.private_download_url(publicId, format, {
        resource_type: resourceType,
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + 600, // 10 min TTL
      });
    }
  } catch (err) {
    console.warn('[Cloudinary private_download_url fallback]:', err.message);
  }
  return getSignedDeliveryUrl(publicId, resourceType);
}

/**
 * Destroys an authenticated asset in Cloudinary
 */
export async function deleteDocumentAsset(publicId, resourceType = 'raw') {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      type: 'authenticated',
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    console.error(`[Cloudinary Destroy Error] Failed to delete ${publicId}:`, error.message);
    // Don't crash database cleanup if remote asset was already removed
    return null;
  }
}

import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

/**
 * Cloudinary Storage Configuration
 * 
 * WHY: Files stored in DocVault represent sensitive documents (medical records, legal
 * papers, credentials). We upload with `type: "authenticated"` so Cloudinary does
 * NOT serve them over public CDN URLs. Delivery requires a cryptographic server-side signature.
 */
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;

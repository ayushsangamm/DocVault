/**
 * Environment Configuration and Fail-Fast Validator
 * 
 * WHY: Validating required environment variables on startup prevents unpredictable
 * runtime errors later in request pipelines (e.g. attempting to sign a JWT with an
 * undefined secret or silently storing files with missing storage credentials).
 */

const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'SHARE_TOKEN_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

export function validateEnv() {
  const missing = [];

  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    console.error('\n============================================================');
    console.error(' FATAL: Missing Required Environment Variables in DocVault:');
    missing.forEach(v => console.error(`  - ${v}`));
    console.error(' Please ensure backend/.env contains these variables.');
    console.error('============================================================\n');
    process.exit(1);
  }
}

// Perform validation on import
validateEnv();

export const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  MONGODB_URI: process.env.MONGODB_URI,
  
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  SHARE_TOKEN_SECRET: process.env.SHARE_TOKEN_SECRET,
  
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD || '',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  
  // Cross-site cookie configuration for deployments across different domains
  CROSS_SITE: process.env.CROSS_SITE === 'true',
};

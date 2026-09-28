import 'dotenv/config'; // MUST BE FIRST: Load .env variables before any other imports
import { env } from './src/config/env.js'; // Validates required environment variables on startup
import { connectDB } from './src/config/db.js';
import { pingRedis } from './src/config/redis.js';
import app from './src/app.js';

async function bootstrap() {
  console.log('====================================================');
  console.log(' Starting DocVault Secure Document Infrastructure...');
  console.log('====================================================');

  // 1. Connect to MongoDB
  await connectDB();

  // 2. Test Upstash Redis connectivity
  await pingRedis();

  // 3. Start Express server
  const server = app.listen(env.PORT, () => {
    console.log(`\nDocVault Backend Server running on port ${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`Client URL:  ${env.CLIENT_URL}`);
    console.log(`Healthcheck: http://localhost:${env.PORT}/api/health\n`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    console.log(`\n[Shutdown] Received ${signal}. Closing HTTP server and database connections...`);
    server.close(() => {
      console.log('[Shutdown] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Fatal Bootstrap Error]', err);
  process.exit(1);
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';

import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import shareRoutes from './routes/shareRoutes.js';
import accessRoutes from './routes/accessRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';

import { errorHandler } from './middleware/errorHandler.js';
import { ApiError } from './utils/ApiError.js';

const app = express();

// Trust reverse proxy (e.g. for accurate client IP detection in rate limiting and logs)
app.set('trust proxy', 1);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows cross-origin document viewing/canvas rendering
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: false, // Allows iframing document streams from client origin
  })
);

// CORS configuration (restricted to client URL with credentials support)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin) return callback(null, true);
      if (origin === env.CLIENT_URL || origin === 'http://localhost:5173') {
        return callback(null, true);
      }
      callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
    },
    credentials: true,
  })
);

// Cookie & Body Parsers
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'DocVault API',
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/analytics', analyticsRoutes);

// Catch-all 404 handler for undefined API routes
app.use((req, res, next) => {
  next(ApiError.notFound(`Cannot ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
});

// Centralized Error Handler
app.use(errorHandler);

export default app;

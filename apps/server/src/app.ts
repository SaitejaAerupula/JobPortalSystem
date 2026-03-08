import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import authRoutes from './modules/auth/auth.routes';
import candidateRoutes from './modules/candidates/candidates.routes';
import recruiterRoutes from './modules/recruiters/recruiters.routes';
import jobsRoutes from './modules/jobs/jobs.routes';
import applicationRoutes from './modules/applications/applications.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import adminRoutes from './modules/admin/admin.routes';
import { env } from './config/env';
import { errorHandler } from './middlewares/error';
import { observabilityMiddleware } from './middlewares/observability';
import { getMetricsSnapshot } from './observability/metrics';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true
    })
  );
  app.use(helmet());
  app.use(morgan('dev'));
  app.use(cookieParser());
  app.use(express.json());
  app.use(observabilityMiddleware);
  app.use(
    '/api',
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ message: 'OK' });
  });

  app.get('/api/v1/metrics', (_req, res) => {
    res.status(200).json({ message: 'OK', data: getMetricsSnapshot() });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/candidates', candidateRoutes);
  app.use('/api/v1/recruiters', recruiterRoutes);
  app.use('/api/v1/jobs', jobsRoutes);
  app.use('/api/v1/applications', applicationRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/admin', adminRoutes);

  app.use(errorHandler);

  return app;
}

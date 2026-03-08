import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

import { recordRequestMetric } from '../observability/metrics';

export const observabilityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const routeKey = `${req.method} ${req.baseUrl || ''}${req.path}`;
    recordRequestMetric(routeKey, duration, res.statusCode);
  });

  next();
};

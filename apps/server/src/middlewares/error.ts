import { Prisma } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/app-error';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Resource already exists' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Resource not found' });
    }
  }

  if (err instanceof Error && (err.name === 'MulterError' || err.message.includes('PDF'))) {
    return res.status(400).json({ message: err.message });
  }

  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
}

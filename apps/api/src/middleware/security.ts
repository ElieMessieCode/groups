import type { Request, Response, NextFunction } from 'express';
import { env } from '../env.js';
import { ForbiddenError } from './error.js';

export function verifyOrigin(req: Request, _res: Response, next: NextFunction): void {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  const origin = req.headers['origin'];
  if (!origin) {
    return next();
  }

  const allowedOrigins = [
    env.CORS_ORIGIN,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];

  if (!allowedOrigins.includes(origin)) {
    return next(new ForbiddenError(`Origine non autorisée : ${origin}`));
  }

  next();
}

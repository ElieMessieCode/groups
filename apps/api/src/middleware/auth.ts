import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { findUserBySessionTokenHash } from '../repos/sessionRepo.js';
import { UnauthorizedError } from './error.js';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  let token: string | undefined;

  const cookieToken = req.cookies?.['session_token'];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    token = cookieToken;
  } else {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      const headerToken = req.headers['x-session-token'];
      if (typeof headerToken === 'string') {
        token = headerToken;
      }
    }
  }

  if (!token) {
    return next(new UnauthorizedError('Session non fournie'));
  }

  try {
    const tokenHash = hashToken(token);
    const session = await findUserBySessionTokenHash(tokenHash);

    if (!session) {
      return next(new UnauthorizedError('Session invalide ou expirée'));
    }

    req.user = session.user;
    req.sessionToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

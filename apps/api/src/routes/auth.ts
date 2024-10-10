import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { env } from '../env.js';
import { createUser, findUserByEmail } from '../repos/userRepo.js';
import { createSession, deleteSession } from '../repos/sessionRepo.js';
import { authenticate, hashToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { ConflictError, UnauthorizedError } from '../middleware/error.js';

export const authRouter: Router = Router();

const RegisterSchema = z.object({
  email: z.string().email('Format d\'adresse email invalide').max(191),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').max(128)
});

const LoginSchema = z.object({
  email: z.string().email('Format d\'adresse email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis')
});

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie('session_token', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  });
}

authRouter.post(
  '/register',
  validateBody(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;

      const existingUser = await findUserByEmail(email);
      if (existingUser) {
        throw new ConflictError('Un compte avec cette adresse email existe déjà');
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id
      });

      const user = await createUser(email, passwordHash);

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      await createSession(tokenHash, user.id, expiresAt);
      setSessionCookie(res, token, expiresAt);

      res.status(201).json({
        user,
        token
      });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.post(
  '/login',
  validateBody(LoginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;

      const user = await findUserByEmail(email);
      if (!user) {
        throw new UnauthorizedError('Identifiants invalides');
      }

      const isValid = await argon2.verify(user.passwordHash, password);
      if (!isValid) {
        throw new UnauthorizedError('Identifiants invalides');
      }

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      await createSession(tokenHash, user.id, expiresAt);
      setSessionCookie(res, token, expiresAt);

      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt
        },
        token
      });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.cookies?.['session_token'] || req.headers['x-session-token'];
      if (typeof token === 'string' && token.length > 0) {
        const tokenHash = hashToken(token);
        await deleteSession(tokenHash);
      }

      res.clearCookie('session_token', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

authRouter.get(
  '/me',
  authenticate,
  (req: Request, res: Response): void => {
    res.status(200).json({
      user: req.user
    });
  }
);

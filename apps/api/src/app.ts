import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { verifyOrigin } from './middleware/security.js';
import { errorHandler, NotFoundError } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { classesRouter } from './routes/classes.js';
import { studentsRouter } from './routes/students.js';
import { drawsRouter } from './routes/draws.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: [
        env.CORS_ORIGIN,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
      ],
      credentials: true
    })
  );

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 10000 : 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  });
  app.use(limiter);

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ limit: '1mb', type: ['text/csv', 'text/plain'] }));
  app.use(verifyOrigin);

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/classes', classesRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/draws', drawsRouter);


  app.use((_req, _res, next) => {
    next(new NotFoundError('Point de terminaison API introuvable'));
  });

  app.use(errorHandler);

  return app;
}

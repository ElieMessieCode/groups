import pino, { type LoggerOptions } from 'pino';
import { env } from './env.js';

const options: LoggerOptions = {
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'password', 'passwordHash', 'token', 'tokenHash'],
    censor: '[REDACTED]'
  }
};

if (env.NODE_ENV !== 'production' && env.NODE_ENV !== 'test') {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  };
}

export const logger = pino(options);

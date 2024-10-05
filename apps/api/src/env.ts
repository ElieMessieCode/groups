import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1).default('groups_user'),
  DB_PASSWORD: z.string().default('groups_password'),
  DB_NAME: z.string().min(1).default('groups_db'),
  SESSION_SECRET: z.string().min(32).default('default_dev_session_secret_that_is_at_least_32_characters_long'),
  CORS_ORIGIN: z.string().default('http://localhost:5173')
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuration environnement invalide :', parsed.error.format());
  throw new Error('Variables d\'environnement invalides.');
}

export const env = parsed.data;

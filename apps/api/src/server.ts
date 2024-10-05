import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { closePool } from './db.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Serveur API démarré sur http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Signal de fermeture reçu, arrêt en cours...');
  server.close(async () => {
    logger.info('Serveur HTTP fermé.');
    await closePool();
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

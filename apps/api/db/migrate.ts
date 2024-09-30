import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../src/env.js';
import { logger } from '../src/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MigrationRow extends RowDataPacket {
  name: string;
  applied_at: Date;
}

export async function runMigrations(): Promise<void> {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  try {
    logger.info('Vérification de la table _migrations...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(191) PRIMARY KEY,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const [rows] = await connection.query<MigrationRow[]>('SELECT name FROM _migrations ORDER BY name ASC');
    const appliedSet = new Set(rows.map(r => r.name));

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

    for (const file of sqlFiles) {
      if (appliedSet.has(file)) {
        logger.info({ migration: file }, 'Migration déjà appliquée, ignorée');
        continue;
      }

      logger.info({ migration: file }, 'Application de la migration...');
      const filePath = path.join(migrationsDir, file);
      const sqlContent = await fs.readFile(filePath, 'utf-8');

      await connection.beginTransaction();
      try {
        await connection.query(sqlContent);
        await connection.query('INSERT INTO _migrations (name) VALUES (?)', [file]);
        await connection.commit();
        logger.info({ migration: file }, 'Migration appliquée avec succès');
      } catch (err) {
        await connection.rollback();
        logger.error({ err, migration: file }, 'Échec lors de l\'application de la migration');
        throw err;
      }
    }

    logger.info('Toutes les migrations sont à jour.');
  } finally {
    await connection.end();
  }
}

// Allow direct execution via CLI (e.g. tsx db/migrate.ts)
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) {
  runMigrations()
    .then(() => {
      logger.info('Migration terminée.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Erreur fatale lors des migrations');
      process.exit(1);
    });
}

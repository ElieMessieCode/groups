import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { env } from './env.js';
import { logger } from './logger.js';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 15,
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      charset: 'utf8mb4',
      multipleStatements: false, // Prevents SQL injection multiple statement attacks
      decimalNumbers: true
    });
    logger.info({ host: env.DB_HOST, db: env.DB_NAME }, 'MySQL Connection Pool initialized');
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('MySQL Connection Pool closed');
  }
}

export async function withTransaction<T>(
  callback: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await getPool().getConnection();
  await connection.beginTransaction();
  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function query<T extends RowDataPacket[] | ResultSetHeader>(
  sql: string,
  params: unknown[] = [],
  connection?: PoolConnection
): Promise<T> {
  const executor = connection ?? getPool();
  const [result] = await executor.query<T>(sql, params);
  return result;
}

import type { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { query } from '../db.js';
import type { UserResponse } from '../types/index.js';

interface SessionUserRow extends RowDataPacket {
  user_id: number;
  email: string;
  user_created_at: Date;
  expires_at: Date;
}

export async function createSession(
  tokenHash: string,
  userId: number,
  expiresAt: Date,
  connection?: PoolConnection
): Promise<void> {
  await query<ResultSetHeader>(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [tokenHash, userId, expiresAt],
    connection
  );
}

export async function findUserBySessionTokenHash(
  tokenHash: string,
  connection?: PoolConnection
): Promise<{ user: UserResponse; expiresAt: Date } | null> {
  const rows = await query<SessionUserRow[]>(
    `SELECT 
       s.user_id,
       s.expires_at,
       u.email,
       u.created_at AS user_created_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token_hash = ? AND s.expires_at > NOW(3)
     LIMIT 1`,
    [tokenHash],
    connection
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    user: {
      id: row.user_id,
      email: row.email,
      createdAt: row.user_created_at.toISOString()
    },
    expiresAt: row.expires_at
  };
}

export async function deleteSession(
  tokenHash: string,
  connection?: PoolConnection
): Promise<void> {
  await query<ResultSetHeader>(
    'DELETE FROM sessions WHERE token_hash = ?',
    [tokenHash],
    connection
  );
}

export async function deleteExpiredSessions(connection?: PoolConnection): Promise<number> {
  const result = await query<ResultSetHeader>(
    'DELETE FROM sessions WHERE expires_at <= NOW(3)',
    [],
    connection
  );
  return result.affectedRows;
}

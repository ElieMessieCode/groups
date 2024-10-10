import type { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { query } from '../db.js';
import type { User, UserResponse } from '../types/index.js';

interface UserRow extends RowDataPacket {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
}

export async function createUser(
  email: string,
  passwordHash: string,
  connection?: PoolConnection
): Promise<UserResponse> {
  const result = await query<ResultSetHeader>(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    [email.toLowerCase().trim(), passwordHash],
    connection
  );

  const user = await findUserById(result.insertId, connection);
  if (!user) {
    throw new Error('Échec lors de la récupération de l\'utilisateur créé');
  }

  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt
  };
}

export async function findUserByEmail(
  email: string,
  connection?: PoolConnection
): Promise<User | null> {
  const rows = await query<UserRow[]>(
    'SELECT id, email, password_hash, created_at FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase().trim()],
    connection
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at.toISOString()
  };
}

export async function findUserById(
  id: number,
  connection?: PoolConnection
): Promise<User | null> {
  const rows = await query<UserRow[]>(
    'SELECT id, email, password_hash, created_at FROM users WHERE id = ? LIMIT 1',
    [id],
    connection
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at.toISOString()
  };
}

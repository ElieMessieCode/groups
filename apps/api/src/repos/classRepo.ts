import type { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { query } from '../db.js';
import type { ClassEntity, ClassWithStudentCount } from '../types/index.js';

interface ClassRow extends RowDataPacket {
  id: number;
  ownerId: number;
  name: string;
  createdAt: Date | string;
}

interface ClassListRow extends RowDataPacket {
  id: number;
  ownerId: number;
  name: string;
  createdAt: Date | string;
  studentCount: number;
}

export async function createClass(
  ownerId: number,
  name: string,
  connection?: PoolConnection
): Promise<ClassEntity> {
  const result = await query<ResultSetHeader>(
    'INSERT INTO classes (owner_id, name) VALUES (?, ?)',
    [ownerId, name.trim()],
    connection
  );

  const created = await findClassByIdAndOwner(result.insertId, ownerId, connection);
  if (!created) {
    throw new Error('Échec lors de la création de la classe');
  }

  return created;
}

export async function findClassByIdAndOwner(
  id: number,
  ownerId: number,
  connection?: PoolConnection
): Promise<ClassEntity | null> {
  const rows = await query<ClassRow[]>(
    'SELECT id, owner_id AS ownerId, name, created_at AS createdAt FROM classes WHERE id = ? AND owner_id = ? LIMIT 1',
    [id, ownerId],
    connection
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)
  };
}

export async function listClassesByOwner(
  ownerId: number,
  connection?: PoolConnection
): Promise<ClassWithStudentCount[]> {
  const rows = await query<ClassListRow[]>(
    `SELECT 
       c.id, 
       c.owner_id AS ownerId, 
       c.name, 
       c.created_at AS createdAt,
       COUNT(s.id) AS studentCount
     FROM classes c
     LEFT JOIN students s ON c.id = s.class_id
     WHERE c.owner_id = ?
     GROUP BY c.id, c.owner_id, c.name, c.created_at
     ORDER BY c.created_at DESC`,
    [ownerId],
    connection
  );

  return rows.map((r) => ({
    id: r.id,
    ownerId: r.ownerId,
    name: r.name,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    studentCount: Number(r.studentCount)
  }));
}

export async function updateClass(
  id: number,
  ownerId: number,
  name: string,
  connection?: PoolConnection
): Promise<ClassEntity | null> {
  const result = await query<ResultSetHeader>(
    'UPDATE classes SET name = ? WHERE id = ? AND owner_id = ?',
    [name.trim(), id, ownerId],
    connection
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return findClassByIdAndOwner(id, ownerId, connection);
}

export async function deleteClass(
  id: number,
  ownerId: number,
  connection?: PoolConnection
): Promise<boolean> {
  const result = await query<ResultSetHeader>(
    'DELETE FROM classes WHERE id = ? AND owner_id = ?',
    [id, ownerId],
    connection
  );

  return result.affectedRows > 0;
}

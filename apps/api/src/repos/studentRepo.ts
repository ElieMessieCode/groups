import type { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { query } from '../db.js';
import type { StudentEntity, StudentWithClass } from '../types/index.js';

interface StudentRow extends RowDataPacket {
  id: number;
  classId: number;
  fullName: string;
  tag: string | null;
  createdAt: Date | string;
}

interface StudentWithClassRow extends StudentRow {
  ownerId: number;
}

interface ExistingNameRow extends RowDataPacket {
  full_name: string;
}

export async function createStudent(
  classId: number,
  fullName: string,
  tag?: string | null,
  connection?: PoolConnection
): Promise<StudentEntity> {
  const normalizedTag = tag ? tag.trim() : null;
  const result = await query<ResultSetHeader>(
    'INSERT INTO students (class_id, full_name, tag) VALUES (?, ?, ?)',
    [classId, fullName.trim(), normalizedTag],
    connection
  );

  const rows = await query<StudentRow[]>(
    'SELECT id, class_id AS classId, full_name AS fullName, tag, created_at AS createdAt FROM students WHERE id = ? LIMIT 1',
    [result.insertId],
    connection
  );

  const row = rows[0];
  if (!row) {
    throw new Error('Échec lors de la création de l\'étudiant');
  }

  return {
    id: row.id,
    classId: row.classId,
    fullName: row.fullName,
    tag: row.tag ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)
  };
}

export async function createStudentsBatch(
  classId: number,
  items: Array<{ fullName: string; tag?: string | null }>,
  connection?: PoolConnection
): Promise<{ created: StudentEntity[]; duplicates: string[] }> {
  const existingRows = await query<ExistingNameRow[]>(
    'SELECT full_name FROM students WHERE class_id = ?',
    [classId],
    connection
  );

  const seenNames = new Set<string>(
    existingRows.map((r) => r.full_name.trim().toLowerCase())
  );

  const created: StudentEntity[] = [];
  const duplicates: string[] = [];

  for (const item of items) {
    const trimmedName = item.fullName.trim();
    const lower = trimmedName.toLowerCase();

    if (seenNames.has(lower)) {
      duplicates.push(trimmedName);
      continue;
    }

    seenNames.add(lower);
    const newStudent = await createStudent(classId, trimmedName, item.tag, connection);
    created.push(newStudent);
  }

  return { created, duplicates };
}

export async function findStudentsByClassId(
  classId: number,
  connection?: PoolConnection
): Promise<StudentEntity[]> {
  const rows = await query<StudentRow[]>(
    'SELECT id, class_id AS classId, full_name AS fullName, tag, created_at AS createdAt FROM students WHERE class_id = ? ORDER BY full_name ASC',
    [classId],
    connection
  );

  return rows.map((r) => ({
    id: r.id,
    classId: r.classId,
    fullName: r.fullName,
    tag: r.tag ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)
  }));
}

export async function findStudentById(
  id: number,
  connection?: PoolConnection
): Promise<StudentWithClass | null> {
  const rows = await query<StudentWithClassRow[]>(
    `SELECT 
       s.id, 
       s.class_id AS classId, 
       s.full_name AS fullName, 
       s.tag, 
       s.created_at AS createdAt, 
       c.owner_id AS ownerId 
     FROM students s 
     JOIN classes c ON s.class_id = c.id 
     WHERE s.id = ? 
     LIMIT 1`,
    [id],
    connection
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    classId: row.classId,
    fullName: row.fullName,
    tag: row.tag ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    ownerId: row.ownerId
  };
}

export async function updateStudent(
  id: number,
  data: { fullName?: string; tag?: string | null },
  connection?: PoolConnection
): Promise<StudentEntity | null> {
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.fullName !== undefined) {
    updates.push('full_name = ?');
    params.push(data.fullName.trim());
  }

  if (data.tag !== undefined) {
    updates.push('tag = ?');
    params.push(data.tag ? data.tag.trim() : null);
  }

  if (updates.length > 0) {
    params.push(id);
    const result = await query<ResultSetHeader>(
      `UPDATE students SET ${updates.join(', ')} WHERE id = ?`,
      params,
      connection
    );

    if (result.affectedRows === 0) {
      return null;
    }
  }

  const rows = await query<StudentRow[]>(
    'SELECT id, class_id AS classId, full_name AS fullName, tag, created_at AS createdAt FROM students WHERE id = ? LIMIT 1',
    [id],
    connection
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    classId: row.classId,
    fullName: row.fullName,
    tag: row.tag ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)
  };
}

export async function deleteStudent(
  id: number,
  connection?: PoolConnection
): Promise<boolean> {
  const result = await query<ResultSetHeader>(
    'DELETE FROM students WHERE id = ?',
    [id],
    connection
  );

  return result.affectedRows > 0;
}

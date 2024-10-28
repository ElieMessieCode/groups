import type { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { query, withTransaction } from '../db.js';
import type { ConstraintEntity } from '../types/index.js';

interface ConstraintRow extends RowDataPacket {
  id: number;
  classId: number;
  studentA: number;
  studentB: number;
  kind: 'apart' | 'together';
}

export async function findConstraintsByClassId(
  classId: number,
  connection?: PoolConnection
): Promise<ConstraintEntity[]> {
  const rows = await query<ConstraintRow[]>(
    'SELECT id, class_id AS classId, student_a AS studentA, student_b AS studentB, kind FROM constraints WHERE class_id = ? ORDER BY id ASC',
    [classId],
    connection
  );

  return rows.map((r) => ({
    id: r.id,
    classId: r.classId,
    studentA: r.studentA,
    studentB: r.studentB,
    kind: r.kind
  }));
}

export async function replaceConstraints(
  classId: number,
  items: Array<{ studentA: number; studentB: number; kind: 'apart' | 'together' }>
): Promise<ConstraintEntity[]> {
  return withTransaction(async (conn) => {
    await query<ResultSetHeader>(
      'DELETE FROM constraints WHERE class_id = ?',
      [classId],
      conn
    );

    for (const item of items) {
      const a = Math.min(item.studentA, item.studentB);
      const b = Math.max(item.studentA, item.studentB);

      await query<ResultSetHeader>(
        'INSERT INTO constraints (class_id, student_a, student_b, kind) VALUES (?, ?, ?, ?)',
        [classId, a, b, item.kind],
        conn
      );
    }

    const rows = await query<ConstraintRow[]>(
      'SELECT id, class_id AS classId, student_a AS studentA, student_b AS studentB, kind FROM constraints WHERE class_id = ? ORDER BY id ASC',
      [classId],
      conn
    );

    return rows.map((r) => ({
      id: r.id,
      classId: r.classId,
      studentA: r.studentA,
      studentB: r.studentB,
      kind: r.kind
    }));
  });
}

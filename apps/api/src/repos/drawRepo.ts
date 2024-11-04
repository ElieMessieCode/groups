import type { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import type { HistoricalDraw } from '@groups/domain';
import { query, withTransaction } from '../db.js';
import type {
  DrawEntity,
  DrawGroupEntity,
  DrawWithGroupsEntity,
  DrawOptionsEntity,
  PaginatedResult,
  StudentEntity
} from '../types/index.js';

interface DrawRow extends RowDataPacket {
  id: number;
  classId: number;
  seed: number;
  mode: 'group_count' | 'group_size';
  param: number;
  options: unknown;
  rosterSnapshot: unknown;
  score: number;
  candidateIndex: number;
  createdAt: Date | string;
}

interface GroupRow extends RowDataPacket {
  id: number;
  drawId: number;
  position: number;
  name: string;
}

interface MemberRow extends RowDataPacket {
  groupId: number;
  drawId?: number;
  id: number;
  classId: number;
  fullName: string;
  tag: string | null;
  createdAt: Date | string;
}

interface HistoryGroupMemberRow extends RowDataPacket {
  drawId: number;
  groupId: number;
  studentId: number;
}

function parseJsonField<T>(field: unknown, fallback: T): T {
  if (field === null || field === undefined) {
    return fallback;
  }
  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as T;
    } catch {
      return fallback;
    }
  }
  return field as T;
}

function mapDrawRow(row: DrawRow): DrawEntity {
  return {
    id: row.id,
    classId: row.classId,
    seed: Number(row.seed),
    mode: row.mode,
    param: Number(row.param),
    options: parseJsonField<DrawOptionsEntity>(row.options, {}),
    rosterSnapshot: parseJsonField<number[]>(row.rosterSnapshot, []),
    score: Number(row.score),
    candidateIndex: Number(row.candidateIndex),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)
  };
}

export async function createDraw(
  data: {
    classId: number;
    seed: number;
    mode: 'group_count' | 'group_size';
    param: number;
    options: DrawOptionsEntity;
    rosterSnapshot: number[];
    score: number;
    candidateIndex: number;
    groups: Array<{
      position: number;
      name: string;
      members: Array<{ id: number }>;
    }>;
  },
  connection?: PoolConnection
): Promise<DrawWithGroupsEntity> {
  const execute = async (conn: PoolConnection): Promise<DrawWithGroupsEntity> => {
    const result = await query<ResultSetHeader>(
      `INSERT INTO draws (class_id, seed, mode, param, options, roster_snapshot, score, candidate_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.classId,
        data.seed,
        data.mode,
        data.param,
        JSON.stringify(data.options),
        JSON.stringify(data.rosterSnapshot),
        data.score,
        data.candidateIndex
      ],
      conn
    );

    const drawId = result.insertId;

    for (const group of data.groups) {
      const groupResult = await query<ResultSetHeader>(
        'INSERT INTO draw_groups (draw_id, position, name) VALUES (?, ?, ?)',
        [drawId, group.position, group.name],
        conn
      );

      const groupId = groupResult.insertId;

      for (const member of group.members) {
        await query<ResultSetHeader>(
          'INSERT INTO draw_members (group_id, student_id) VALUES (?, ?)',
          [groupId, member.id],
          conn
        );
      }
    }

    const created = await findDrawById(drawId, conn);
    if (!created) {
      throw new Error('Échec lors de la création du tirage');
    }

    return created;
  };

  if (connection) {
    return execute(connection);
  }

  return withTransaction(execute);
}

export async function findDrawById(
  id: number,
  connection?: PoolConnection
): Promise<DrawWithGroupsEntity | null> {
  const rows = await query<DrawRow[]>(
    `SELECT 
       id, 
       class_id AS classId, 
       seed, 
       mode, 
       param, 
       options, 
       roster_snapshot AS rosterSnapshot, 
       score, 
       candidate_index AS candidateIndex, 
       created_at AS createdAt 
     FROM draws 
     WHERE id = ? 
     LIMIT 1`,
    [id],
    connection
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  const baseDraw = mapDrawRow(row);

  const groupRows = await query<GroupRow[]>(
    'SELECT id, draw_id AS drawId, position, name FROM draw_groups WHERE draw_id = ? ORDER BY position ASC, id ASC',
    [id],
    connection
  );

  if (groupRows.length === 0) {
    return {
      ...baseDraw,
      groups: []
    };
  }

  const memberRows = await query<MemberRow[]>(
    `SELECT 
       dm.group_id AS groupId, 
       s.id, 
       s.class_id AS classId, 
       s.full_name AS fullName, 
       s.tag, 
       s.created_at AS createdAt 
     FROM draw_members dm 
     JOIN students s ON dm.student_id = s.id 
     JOIN draw_groups dg ON dm.group_id = dg.id 
     WHERE dg.draw_id = ? 
     ORDER BY dg.position ASC, s.full_name ASC, s.id ASC`,
    [id],
    connection
  );

  const membersByGroup = new Map<number, StudentEntity[]>();
  for (const m of memberRows) {
    const list = membersByGroup.get(m.groupId);
    const student: StudentEntity = {
      id: m.id,
      classId: m.classId,
      fullName: m.fullName,
      tag: m.tag ?? null,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt)
    };
    if (list) {
      list.push(student);
    } else {
      membersByGroup.set(m.groupId, [student]);
    }
  }

  const groups: DrawGroupEntity[] = groupRows.map((g) => ({
    id: g.id,
    drawId: g.drawId,
    position: g.position,
    name: g.name,
    members: membersByGroup.get(g.id) ?? []
  }));

  return {
    ...baseDraw,
    groups
  };
}

export async function findDrawByIdAndOwner(
  id: number,
  ownerId: number,
  connection?: PoolConnection
): Promise<DrawWithGroupsEntity | null> {
  const rows = await query<DrawRow[]>(
    `SELECT 
       d.id, 
       d.class_id AS classId, 
       d.seed, 
       d.mode, 
       d.param, 
       d.options, 
       d.roster_snapshot AS rosterSnapshot, 
       d.score, 
       d.candidate_index AS candidateIndex, 
       d.created_at AS createdAt 
     FROM draws d 
     JOIN classes c ON d.class_id = c.id 
     WHERE d.id = ? AND c.owner_id = ? 
     LIMIT 1`,
    [id, ownerId],
    connection
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  const baseDraw = mapDrawRow(row);

  const groupRows = await query<GroupRow[]>(
    'SELECT id, draw_id AS drawId, position, name FROM draw_groups WHERE draw_id = ? ORDER BY position ASC, id ASC',
    [id],
    connection
  );

  if (groupRows.length === 0) {
    return {
      ...baseDraw,
      groups: []
    };
  }

  const memberRows = await query<MemberRow[]>(
    `SELECT 
       dm.group_id AS groupId, 
       s.id, 
       s.class_id AS classId, 
       s.full_name AS fullName, 
       s.tag, 
       s.created_at AS createdAt 
     FROM draw_members dm 
     JOIN students s ON dm.student_id = s.id 
     JOIN draw_groups dg ON dm.group_id = dg.id 
     WHERE dg.draw_id = ? 
     ORDER BY dg.position ASC, s.full_name ASC, s.id ASC`,
    [id],
    connection
  );

  const membersByGroup = new Map<number, StudentEntity[]>();
  for (const m of memberRows) {
    const list = membersByGroup.get(m.groupId);
    const student: StudentEntity = {
      id: m.id,
      classId: m.classId,
      fullName: m.fullName,
      tag: m.tag ?? null,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt)
    };
    if (list) {
      list.push(student);
    } else {
      membersByGroup.set(m.groupId, [student]);
    }
  }

  const groups: DrawGroupEntity[] = groupRows.map((g) => ({
    id: g.id,
    drawId: g.drawId,
    position: g.position,
    name: g.name,
    members: membersByGroup.get(g.id) ?? []
  }));

  return {
    ...baseDraw,
    groups
  };
}

export async function getHistoricalDraws(
  classId: number,
  limit: number,
  beforeDrawId?: number,
  connection?: PoolConnection
): Promise<HistoricalDraw[]> {
  if (limit <= 0) {
    return [];
  }

  let rows: Array<{ id: number }>;

  if (beforeDrawId !== undefined) {
    rows = await query<DrawRow[]>(
      'SELECT id FROM draws WHERE class_id = ? AND id < ? ORDER BY created_at DESC, id DESC LIMIT ?',
      [classId, beforeDrawId, limit],
      connection
    );
  } else {
    rows = await query<DrawRow[]>(
      'SELECT id FROM draws WHERE class_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
      [classId, limit],
      connection
    );
  }

  if (rows.length === 0) {
    return [];
  }

  const drawIds = rows.map((r) => r.id).reverse();
  const placeholders = drawIds.map(() => '?').join(', ');

  const memberRows = await query<HistoryGroupMemberRow[]>(
    `SELECT 
       dg.draw_id AS drawId, 
       dg.id AS groupId, 
       dm.student_id AS studentId 
     FROM draw_groups dg 
     JOIN draw_members dm ON dg.id = dm.group_id 
     WHERE dg.draw_id IN (${placeholders}) 
     ORDER BY dg.draw_id ASC, dg.position ASC, dm.student_id ASC`,
    drawIds,
    connection
  );

  const drawMap = new Map<number, Map<number, number[]>>();
  for (const drawId of drawIds) {
    drawMap.set(drawId, new Map());
  }

  for (const row of memberRows) {
    const groupsMap = drawMap.get(row.drawId);
    if (!groupsMap) continue;

    const list = groupsMap.get(row.groupId);
    if (list) {
      list.push(row.studentId);
    } else {
      groupsMap.set(row.groupId, [row.studentId]);
    }
  }

  const result: HistoricalDraw[] = [];
  for (const drawId of drawIds) {
    const groupsMap = drawMap.get(drawId);
    if (!groupsMap) continue;

    const groups: Array<{ studentIds: number[] }> = [];
    for (const studentIds of groupsMap.values()) {
      groups.push({ studentIds });
    }

    result.push({
      drawId,
      weight: 1.0,
      groups
    });
  }

  return result;
}

export async function listDrawsByClassPaginated(
  classId: number,
  options: { cursor?: string | null | undefined; limit?: number | undefined },
  connection?: PoolConnection
): Promise<PaginatedResult<DrawWithGroupsEntity>> {
  const limit = options.limit ?? 20;
  let rows: DrawRow[];

  let decodedCursor: { createdAt: string; id: number } | null = null;
  if (options.cursor) {
    try {
      const decodedStr = Buffer.from(options.cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(decodedStr);
      if (parsed && typeof parsed.createdAt === 'string' && typeof parsed.id === 'number') {
        decodedCursor = parsed;
      }
    } catch {
      decodedCursor = null;
    }
  }

  if (decodedCursor) {
    rows = await query<DrawRow[]>(
      `SELECT 
         id, 
         class_id AS classId, 
         seed, 
         mode, 
         param, 
         options, 
         roster_snapshot AS rosterSnapshot, 
         score, 
         candidate_index AS candidateIndex, 
         created_at AS createdAt 
       FROM draws 
       WHERE class_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) 
       ORDER BY created_at DESC, id DESC 
       LIMIT ?`,
      [
        classId,
        new Date(decodedCursor.createdAt),
        new Date(decodedCursor.createdAt),
        decodedCursor.id,
        limit + 1
      ],
      connection
    );
  } else {
    rows = await query<DrawRow[]>(
      `SELECT 
         id, 
         class_id AS classId, 
         seed, 
         mode, 
         param, 
         options, 
         roster_snapshot AS rosterSnapshot, 
         score, 
         candidate_index AS candidateIndex, 
         created_at AS createdAt 
       FROM draws 
       WHERE class_id = ? 
       ORDER BY created_at DESC, id DESC 
       LIMIT ?`,
      [classId, limit + 1],
      connection
    );
  }

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  if (pageRows.length === 0) {
    return {
      items: [],
      nextCursor: null,
      hasMore: false
    };
  }

  const drawIds = pageRows.map((r) => r.id);
  const placeholders = drawIds.map(() => '?').join(', ');

  const groupRows = await query<GroupRow[]>(
    `SELECT id, draw_id AS drawId, position, name 
     FROM draw_groups 
     WHERE draw_id IN (${placeholders}) 
     ORDER BY draw_id ASC, position ASC, id ASC`,
    drawIds,
    connection
  );

  const memberRows = await query<MemberRow[]>(
    `SELECT 
       dm.group_id AS groupId, 
       dg.draw_id AS drawId, 
       s.id, 
       s.class_id AS classId, 
       s.full_name AS fullName, 
       s.tag, 
       s.created_at AS createdAt 
     FROM draw_members dm 
     JOIN draw_groups dg ON dm.group_id = dg.id 
     JOIN students s ON dm.student_id = s.id 
     WHERE dg.draw_id IN (${placeholders}) 
     ORDER BY dg.position ASC, s.full_name ASC, s.id ASC`,
    drawIds,
    connection
  );

  const membersByGroup = new Map<number, StudentEntity[]>();
  for (const m of memberRows) {
    const list = membersByGroup.get(m.groupId);
    const student: StudentEntity = {
      id: m.id,
      classId: m.classId,
      fullName: m.fullName,
      tag: m.tag ?? null,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt)
    };
    if (list) {
      list.push(student);
    } else {
      membersByGroup.set(m.groupId, [student]);
    }
  }

  const groupsByDraw = new Map<number, DrawGroupEntity[]>();
  for (const g of groupRows) {
    const list = groupsByDraw.get(g.drawId);
    const groupEntity: DrawGroupEntity = {
      id: g.id,
      drawId: g.drawId,
      position: g.position,
      name: g.name,
      members: membersByGroup.get(g.id) ?? []
    };
    if (list) {
      list.push(groupEntity);
    } else {
      groupsByDraw.set(g.drawId, [groupEntity]);
    }
  }

  const items: DrawWithGroupsEntity[] = pageRows.map((r) => {
    const base = mapDrawRow(r);
    return {
      ...base,
      groups: groupsByDraw.get(r.id) ?? []
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1]!;
    nextCursor = Buffer.from(
      JSON.stringify({
        createdAt: lastItem.createdAt,
        id: lastItem.id
      })
    ).toString('base64url');
  }

  return {
    items,
    nextCursor,
    hasMore
  };
}

export async function deleteDraw(
  id: number,
  ownerId: number,
  connection?: PoolConnection
): Promise<boolean> {
  const result = await query<ResultSetHeader>(
    `DELETE d FROM draws d 
     JOIN classes c ON d.class_id = c.id 
     WHERE d.id = ? AND c.owner_id = ?`,
    [id, ownerId],
    connection
  );

  return result.affectedRows > 0;
}

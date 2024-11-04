import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import * as db from '../src/db.js';

interface MockUser {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
}

interface MockSession {
  token_hash: string;
  user_id: number;
  expires_at: Date;
  created_at: Date;
}

interface MockClass {
  id: number;
  owner_id: number;
  name: string;
  created_at: Date;
}

interface MockStudent {
  id: number;
  class_id: number;
  full_name: string;
  tag: string | null;
  created_at: Date;
}

interface MockConstraint {
  id: number;
  class_id: number;
  student_a: number;
  student_b: number;
  kind: 'apart' | 'together';
}

interface MockDraw {
  id: number;
  class_id: number;
  seed: number;
  mode: 'group_count' | 'group_size';
  param: number;
  options: string;
  roster_snapshot: string;
  score: number;
  candidate_index: number;
  created_at: Date;
}

interface MockDrawGroup {
  id: number;
  draw_id: number;
  position: number;
  name: string;
}

interface MockDrawMember {
  group_id: number;
  student_id: number;
}

describe('Draws Integration Tests', () => {
  let mockUsers: MockUser[] = [];
  let mockSessions: MockSession[] = [];
  let mockClasses: MockClass[] = [];
  let mockStudents: MockStudent[] = [];
  let mockConstraints: MockConstraint[] = [];
  let mockDraws: MockDraw[] = [];
  let mockDrawGroups: MockDrawGroup[] = [];
  let mockDrawMembers: MockDrawMember[] = [];

  let nextClassId = 1;
  let nextStudentId = 1;
  let nextConstraintId = 1;
  let nextDrawId = 1;
  let nextGroupId = 1;

  const app = createApp();

  const userToken1 = 'token_user_1_test_secret_value_123';
  const userToken2 = 'token_user_2_test_secret_value_456';

  beforeEach(() => {
    mockUsers = [
      {
        id: 1,
        email: 'prof1@univ.fr',
        password_hash: 'hash1',
        created_at: new Date()
      },
      {
        id: 2,
        email: 'prof2@univ.fr',
        password_hash: 'hash2',
        created_at: new Date()
      }
    ];

    const now = new Date();
    const expiry = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    const hash1 = crypto.createHash('sha256').update(userToken1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(userToken2).digest('hex');

    mockSessions = [
      {
        token_hash: hash1,
        user_id: 1,
        expires_at: expiry,
        created_at: now
      },
      {
        token_hash: hash2,
        user_id: 2,
        expires_at: expiry,
        created_at: now
      }
    ];

    mockClasses = [];
    mockStudents = [];
    mockConstraints = [];
    mockDraws = [];
    mockDrawGroups = [];
    mockDrawMembers = [];

    nextClassId = 1;
    nextStudentId = 1;
    nextConstraintId = 1;
    nextDrawId = 1;
    nextGroupId = 1;

    vi.spyOn(db, 'withTransaction').mockImplementation(async (cb) => {
      return cb({} as any);
    });

    vi.spyOn(db, 'query').mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.trim().replace(/\s+/g, ' ');

      if (normalizedSql.includes('FROM sessions s') && normalizedSql.includes('s.token_hash = ?')) {
        const tokenHash = params[0] as string;
        const session = mockSessions.find((s) => s.token_hash === tokenHash && s.expires_at > new Date());
        if (!session) return [] as any;
        const user = mockUsers.find((u) => u.id === session.user_id);
        if (!user) return [] as any;
        return [
          {
            user_id: user.id,
            expires_at: session.expires_at,
            email: user.email,
            user_created_at: user.created_at
          }
        ] as any;
      }

      if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM classes WHERE id = ? AND owner_id = ?')) {
        const id = params[0] as number;
        const ownerId = params[1] as number;
        const cls = mockClasses.find((c) => c.id === id && c.owner_id === ownerId);
        if (!cls) return [] as any;
        return [
          {
            id: cls.id,
            ownerId: cls.owner_id,
            name: cls.name,
            createdAt: cls.created_at
          }
        ] as any;
      }

      if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM students WHERE class_id = ? ORDER BY full_name ASC')) {
        const classId = params[0] as number;
        const list = mockStudents.filter((s) => s.class_id === classId).sort((a, b) => a.full_name.localeCompare(b.full_name));
        return list.map((s) => ({
          id: s.id,
          classId: s.class_id,
          fullName: s.full_name,
          tag: s.tag,
          createdAt: s.created_at
        })) as any;
      }

      if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM constraints WHERE class_id = ? ORDER BY id ASC')) {
        const classId = params[0] as number;
        const list = mockConstraints.filter((c) => c.class_id === classId).sort((a, b) => a.id - b.id);
        return list.map((c) => ({
          id: c.id,
          classId: c.class_id,
          studentA: c.student_a,
          studentB: c.student_b,
          kind: c.kind
        })) as any;
      }

      if (normalizedSql.startsWith('INSERT INTO draws')) {
        const id = nextDrawId++;
        const class_id = params[0] as number;
        const seed = params[1] as number;
        const mode = params[2] as 'group_count' | 'group_size';
        const param = params[3] as number;
        const options = params[4] as string;
        const roster_snapshot = params[5] as string;
        const score = params[6] as number;
        const candidate_index = params[7] as number;

        const newDraw: MockDraw = {
          id,
          class_id,
          seed,
          mode,
          param,
          options,
          roster_snapshot,
          score,
          candidate_index,
          created_at: new Date()
        };
        mockDraws.push(newDraw);
        return { insertId: id, affectedRows: 1 } as any;
      }

      if (normalizedSql.startsWith('INSERT INTO draw_groups')) {
        const id = nextGroupId++;
        const draw_id = params[0] as number;
        const position = params[1] as number;
        const name = params[2] as string;

        mockDrawGroups.push({ id, draw_id, position, name });
        return { insertId: id, affectedRows: 1 } as any;
      }

      if (normalizedSql.startsWith('INSERT INTO draw_members')) {
        const group_id = params[0] as number;
        const student_id = params[1] as number;

        mockDrawMembers.push({ group_id, student_id });
        return { insertId: 1, affectedRows: 1 } as any;
      }

      if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM draws d JOIN classes c ON d.class_id = c.id WHERE d.id = ? AND c.owner_id = ?')) {
        const id = params[0] as number;
        const ownerId = params[1] as number;
        const draw = mockDraws.find((d) => d.id === id);
        if (!draw) return [] as any;
        const cls = mockClasses.find((c) => c.id === draw.class_id && c.owner_id === ownerId);
        if (!cls) return [] as any;
        return [
          {
            id: draw.id,
            classId: draw.class_id,
            seed: draw.seed,
            mode: draw.mode,
            param: draw.param,
            options: draw.options,
            rosterSnapshot: draw.roster_snapshot,
            score: draw.score,
            candidateIndex: draw.candidate_index,
            createdAt: draw.created_at,
            ownerId: cls.owner_id
          }
        ] as any;
      }

      if (normalizedSql.includes('FROM draws WHERE id = ? LIMIT 1')) {
        const id = params[0] as number;
        const draw = mockDraws.find((d) => d.id === id);
        if (!draw) return [] as any;
        return [
          {
            id: draw.id,
            classId: draw.class_id,
            seed: draw.seed,
            mode: draw.mode,
            param: draw.param,
            options: draw.options,
            rosterSnapshot: draw.roster_snapshot,
            score: draw.score,
            candidateIndex: draw.candidate_index,
            createdAt: draw.created_at
          }
        ] as any;
      }

      if (normalizedSql.includes('FROM draw_groups WHERE draw_id = ?')) {
        const drawId = params[0] as number;
        const groups = mockDrawGroups
          .filter((g) => g.draw_id === drawId)
          .sort((a, b) => a.position - b.position || a.id - b.id);
        return groups.map((g) => ({
          id: g.id,
          drawId: g.draw_id,
          position: g.position,
          name: g.name
        })) as any;
      }

      if (normalizedSql.includes('FROM draw_groups WHERE draw_id IN')) {
        const drawIds = params as number[];
        const groups = mockDrawGroups
          .filter((g) => drawIds.includes(g.draw_id))
          .sort((a, b) => a.draw_id - b.draw_id || a.position - b.position || a.id - b.id);
        return groups.map((g) => ({
          id: g.id,
          drawId: g.draw_id,
          position: g.position,
          name: g.name
        })) as any;
      }

      if (normalizedSql.includes('FROM draw_members dm JOIN students s ON dm.student_id = s.id JOIN draw_groups dg ON dm.group_id = dg.id WHERE dg.draw_id = ?')) {
        const drawId = params[0] as number;
        const drawGroupIds = new Set(mockDrawGroups.filter((g) => g.draw_id === drawId).map((g) => g.id));
        const groupPositionMap = new Map(mockDrawGroups.map((g) => [g.id, g.position]));

        const results: any[] = [];
        for (const dm of mockDrawMembers) {
          if (drawGroupIds.has(dm.group_id)) {
            const student = mockStudents.find((s) => s.id === dm.student_id);
            if (student) {
              results.push({
                groupId: dm.group_id,
                id: student.id,
                classId: student.class_id,
                fullName: student.full_name,
                tag: student.tag,
                createdAt: student.created_at,
                position: groupPositionMap.get(dm.group_id) ?? 0
              });
            }
          }
        }
        results.sort((a, b) => a.position - b.position || a.fullName.localeCompare(b.fullName) || a.id - b.id);
        return results as any;
      }

      if (normalizedSql.includes('FROM draw_members dm JOIN draw_groups dg ON dm.group_id = dg.id JOIN students s ON dm.student_id = s.id WHERE dg.draw_id IN')) {
        const drawIds = params as number[];
        const groups = mockDrawGroups.filter((g) => drawIds.includes(g.draw_id));
        const groupMap = new Map(groups.map((g) => [g.id, g]));

        const results: any[] = [];
        for (const dm of mockDrawMembers) {
          const group = groupMap.get(dm.group_id);
          if (group) {
            const student = mockStudents.find((s) => s.id === dm.student_id);
            if (student) {
              results.push({
                groupId: dm.group_id,
                drawId: group.draw_id,
                id: student.id,
                classId: student.class_id,
                fullName: student.full_name,
                tag: student.tag,
                createdAt: student.created_at,
                position: group.position
              });
            }
          }
        }
        results.sort((a, b) => a.position - b.position || a.fullName.localeCompare(b.fullName) || a.id - b.id);
        return results as any;
      }

      if (normalizedSql.includes('FROM draw_groups dg JOIN draw_members dm ON dg.id = dm.group_id WHERE dg.draw_id IN')) {
        const drawIds = params as number[];
        const groups = mockDrawGroups.filter((g) => drawIds.includes(g.draw_id));
        const groupMap = new Map(groups.map((g) => [g.id, g]));

        const results: any[] = [];
        for (const dm of mockDrawMembers) {
          const group = groupMap.get(dm.group_id);
          if (group) {
            results.push({
              drawId: group.draw_id,
              groupId: group.id,
              studentId: dm.student_id,
              position: group.position
            });
          }
        }
        results.sort((a, b) => a.drawId - b.drawId || a.position - b.position || a.studentId - b.studentId);
        return results as any;
      }

      if (normalizedSql.startsWith('SELECT id FROM draws WHERE class_id = ? AND id < ?')) {
        const classId = params[0] as number;
        const beforeId = params[1] as number;
        const limit = params[2] as number;
        const matches = mockDraws
          .filter((d) => d.class_id === classId && d.id < beforeId)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id - a.id)
          .slice(0, limit);
        return matches.map((d) => ({ id: d.id })) as any;
      }

      if (normalizedSql.startsWith('SELECT id FROM draws WHERE class_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')) {
        const classId = params[0] as number;
        const limit = params[1] as number;
        const matches = mockDraws
          .filter((d) => d.class_id === classId)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id - a.id)
          .slice(0, limit);
        return matches.map((d) => ({ id: d.id })) as any;
      }

      if (normalizedSql.includes('FROM draws WHERE class_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))')) {
        const classId = params[0] as number;
        const cursorDate = new Date(params[1] as string | Date);
        const cursorId = params[3] as number;
        const limit = params[4] as number;

        const matches = mockDraws
          .filter((d) => d.class_id === classId && (d.created_at < cursorDate || (d.created_at.getTime() === cursorDate.getTime() && d.id < cursorId)))
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id - a.id)
          .slice(0, limit);

        return matches.map((d) => ({
          id: d.id,
          classId: d.class_id,
          seed: d.seed,
          mode: d.mode,
          param: d.param,
          options: d.options,
          rosterSnapshot: d.roster_snapshot,
          score: d.score,
          candidateIndex: d.candidate_index,
          createdAt: d.created_at
        })) as any;
      }

      if (normalizedSql.includes('FROM draws WHERE class_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')) {
        const classId = params[0] as number;
        const limit = params[1] as number;

        const matches = mockDraws
          .filter((d) => d.class_id === classId)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id - a.id)
          .slice(0, limit);

        return matches.map((d) => ({
          id: d.id,
          classId: d.class_id,
          seed: d.seed,
          mode: d.mode,
          param: d.param,
          options: d.options,
          rosterSnapshot: d.roster_snapshot,
          score: d.score,
          candidateIndex: d.candidate_index,
          createdAt: d.created_at
        })) as any;
      }

      if (normalizedSql.includes('DELETE d FROM draws d') || normalizedSql.includes('DELETE FROM draws')) {
        const id = Number(params[0]);
        const ownerId = Number(params[1]);
        const draw = mockDraws.find((d) => d.id === id);
        if (!draw) return { affectedRows: 0 } as any;
        const cls = mockClasses.find((c) => c.id === draw.class_id && c.owner_id === ownerId);
        if (!cls) return { affectedRows: 0 } as any;

        const groupIds = mockDrawGroups.filter((g) => g.draw_id === id).map((g) => g.id);
        mockDrawMembers = mockDrawMembers.filter((m) => !groupIds.includes(m.group_id));
        mockDrawGroups = mockDrawGroups.filter((g) => g.draw_id !== id);
        mockDraws = mockDraws.filter((d) => d.id !== id);

        return { affectedRows: 1 } as any;
      }

      return [] as any;
    });
  });

  function seedClassAndStudents(ownerId = 1, studentCount = 12): { classId: number; students: MockStudent[] } {
    const classId = nextClassId++;
    mockClasses.push({
      id: classId,
      owner_id: ownerId,
      name: `Classe ${classId}`,
      created_at: new Date()
    });

    const students: MockStudent[] = [];
    for (let i = 1; i <= studentCount; i++) {
      const studentId = nextStudentId++;
      const student: MockStudent = {
        id: studentId,
        class_id: classId,
        full_name: `Etudiant ${studentId < 10 ? '0' + studentId : studentId}`,
        tag: i % 2 === 0 ? 'Groupe A' : 'Groupe B',
        created_at: new Date()
      };
      mockStudents.push(student);
      students.push(student);
    }

    return { classId, students };
  }

  describe('POST /api/classes/:id/draws', () => {
    it('creates a draw with group_count and returns 201 with populated groups', async () => {
      const { classId, students } = seedClassAndStudents(1, 12);

      const res = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({
          mode: 'group_count',
          param: 3,
          seed: 42,
          options: {
            balanceByTag: false,
            avoidRepeats: true,
            candidates: 50
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.classId).toBe(classId);
      expect(res.body.seed).toBe(42);
      expect(res.body.mode).toBe('group_count');
      expect(res.body.param).toBe(3);
      expect(res.body.groups).toHaveLength(3);

      const totalMembers = res.body.groups.reduce(
        (acc: number, g: { members: any[] }) => acc + g.members.length,
        0
      );
      expect(totalMembers).toBe(12);

      for (const group of res.body.groups) {
        expect(group.members).toHaveLength(4);
      }
    });

    it('creates a draw with group_size and returns 201', async () => {
      const { classId } = seedClassAndStudents(1, 10);

      const res = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({
          mode: 'group_size',
          param: 3,
          seed: 100
        });

      expect(res.status).toBe(201);
      expect(res.body.mode).toBe('group_size');
      expect(res.body.param).toBe(3);
      expect(res.body.groups.length).toBeGreaterThanOrEqual(3);
    });

    it('respects together and apart constraints in the generated draw', async () => {
      const { classId, students } = seedClassAndStudents(1, 6);
      const s1 = students[0]!;
      const s2 = students[1]!;
      const s3 = students[2]!;

      mockConstraints.push(
        { id: nextConstraintId++, class_id: classId, student_a: s1.id, student_b: s2.id, kind: 'together' },
        { id: nextConstraintId++, class_id: classId, student_a: s1.id, student_b: s3.id, kind: 'apart' }
      );

      const res = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({
          mode: 'group_count',
          param: 2,
          seed: 123
        });

      expect(res.status).toBe(201);
      const groups = res.body.groups;

      const groupS1 = groups.find((g: any) => g.members.some((m: any) => m.id === s1.id));
      const groupS2 = groups.find((g: any) => g.members.some((m: any) => m.id === s2.id));
      const groupS3 = groups.find((g: any) => g.members.some((m: any) => m.id === s3.id));

      expect(groupS1.id).toBe(groupS2.id);
      expect(groupS1.id).not.toBe(groupS3.id);
    });

    it('returns 422 Unprocessable Entity RFC 7807 when constraints are unsatisfiable', async () => {
      const { classId, students } = seedClassAndStudents(1, 6);
      const s1 = students[0]!;
      const s2 = students[1]!;

      mockConstraints.push(
        { id: nextConstraintId++, class_id: classId, student_a: s1.id, student_b: s2.id, kind: 'together' },
        { id: nextConstraintId++, class_id: classId, student_a: s1.id, student_b: s2.id, kind: 'apart' }
      );

      const res = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({
          mode: 'group_count',
          param: 2,
          seed: 123
        });

      expect(res.status).toBe(422);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.status).toBe(422);
      expect(res.body.title).toBe('Unprocessable Entity');
      expect(res.body.detail).toBeDefined();
    });

    it('returns 404 when class belongs to another user (multi-tenant isolation)', async () => {
      const { classId } = seedClassAndStudents(2, 6);

      const res = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({
          mode: 'group_count',
          param: 2
        });

      expect(res.status).toBe(404);
    });

    it('returns 400 on invalid payload parameters', async () => {
      const { classId } = seedClassAndStudents(1, 6);

      const res = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({
          mode: 'invalid_mode',
          param: -1
        });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(app)
        .post('/api/classes/1/draws')
        .send({ mode: 'group_count', param: 2 });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/classes/:id/draws (Cursor Pagination)', () => {
    it('lists paginated draws for a class', async () => {
      const { classId } = seedClassAndStudents(1, 6);

      await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({ mode: 'group_count', param: 2, seed: 1 });

      await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({ mode: 'group_count', param: 2, seed: 2 });

      const res = await request(app)
        .get(`/api/classes/${classId}/draws?limit=1`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.nextCursor).toBeDefined();

      const nextRes = await request(app)
        .get(`/api/classes/${classId}/draws?limit=1&cursor=${res.body.nextCursor}`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(nextRes.status).toBe(200);
      expect(nextRes.body.items).toHaveLength(1);
      expect(nextRes.body.items[0].id).not.toBe(res.body.items[0].id);
    });

    it('returns 404 for class owned by another user', async () => {
      const { classId } = seedClassAndStudents(2, 6);

      const res = await request(app)
        .get(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/draws/:id', () => {
    it('retrieves full draw by id with groups and members', async () => {
      const { classId } = seedClassAndStudents(1, 6);

      const created = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({ mode: 'group_count', param: 2, seed: 42 });

      const drawId = created.body.id;

      const res = await request(app)
        .get(`/api/draws/${drawId}`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(drawId);
      expect(res.body.groups).toHaveLength(2);
      expect(res.body.groups[0].members).toBeDefined();
    });

    it('returns 404 for non-existent draw or draw of another user', async () => {
      const { classId } = seedClassAndStudents(2, 6);

      const created = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken2}`])
        .send({ mode: 'group_count', param: 2, seed: 42 });

      const drawId = created.body.id;

      const res = await request(app)
        .get(`/api/draws/${drawId}`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/draws/:id/verify', () => {
    it('verifies deterministic replay of an existing draw', async () => {
      const { classId } = seedClassAndStudents(1, 8);

      const created = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({
          mode: 'group_count',
          param: 2,
          seed: 999,
          options: {
            candidates: 100,
            avoidRepeats: true,
            balanceByTag: false,
            historyLimit: 5
          }
        });

      const drawId = created.body.id;

      const res = await request(app)
        .get(`/api/draws/${drawId}/verify`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(true);
      expect(res.body.drawId).toBe(drawId);
      expect(res.body.seed).toBe(999);
      expect(res.body.score).toBe(created.body.score);
      expect(res.body.recalculatedScore).toBe(created.body.score);
      expect(res.body.matchesExactGroups).toBe(true);
    });

    it('returns 404 when verifying a draw of another user', async () => {
      const { classId } = seedClassAndStudents(2, 8);

      const created = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken2}`])
        .send({ mode: 'group_count', param: 2, seed: 999 });

      const res = await request(app)
        .get(`/api/draws/${created.body.id}/verify`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/draws/:id/export.csv', () => {
    it('exports draw groups and members as formatted CSV', async () => {
      const { classId } = seedClassAndStudents(1, 4);

      const created = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({ mode: 'group_count', param: 2, seed: 11 });

      const drawId = created.body.id;

      const res = await request(app)
        .get(`/api/draws/${drawId}/export.csv`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(`attachment; filename="tirage-${drawId}.csv"`);

      const text = res.text;
      expect(text).toContain('Groupe,Nom,Tag');
      expect(text).toContain('Groupe 1');
      expect(text).toContain('Groupe 2');
      expect(text).toContain('Etudiant');
    });

    it('returns 404 on CSV export for unauthorized user', async () => {
      const { classId } = seedClassAndStudents(2, 4);

      const created = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken2}`])
        .send({ mode: 'group_count', param: 2 });

      const res = await request(app)
        .get(`/api/draws/${created.body.id}/export.csv`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/draws/:id', () => {
    it('deletes a draw and cascades properly (204)', async () => {
      const { classId } = seedClassAndStudents(1, 4);

      const created = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken1}`])
        .send({ mode: 'group_count', param: 2 });

      const drawId = created.body.id;

      const delRes = await request(app)
        .delete(`/api/draws/${drawId}`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(delRes.status).toBe(204);

      const getRes = await request(app)
        .get(`/api/draws/${drawId}`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(getRes.status).toBe(404);
    });

    it('returns 404 when attempting to delete another user\'s draw', async () => {
      const { classId } = seedClassAndStudents(2, 4);

      const created = await request(app)
        .post(`/api/classes/${classId}/draws`)
        .set('Cookie', [`session_token=${userToken2}`])
        .send({ mode: 'group_count', param: 2 });

      const res = await request(app)
        .delete(`/api/draws/${created.body.id}`)
        .set('Cookie', [`session_token=${userToken1}`]);

      expect(res.status).toBe(404);
    });
  });
});

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

describe('Classes, Students & Constraints Integration Tests', () => {
  let mockUsers: MockUser[] = [];
  let mockSessions: MockSession[] = [];
  let mockClasses: MockClass[] = [];
  let mockStudents: MockStudent[] = [];
  let mockConstraints: MockConstraint[] = [];

  let nextClassId = 1;
  let nextStudentId = 1;
  let nextConstraintId = 1;

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
    nextClassId = 1;
    nextStudentId = 1;
    nextConstraintId = 1;

    // Spy on withTransaction to execute callback directly
    vi.spyOn(db, 'withTransaction').mockImplementation(async (cb) => {
      return cb({} as any);
    });

    // Stub db.query
    vi.spyOn(db, 'query').mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.trim().replace(/\s+/g, ' ');

      // Session auth lookup
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

      // INSERT INTO classes (owner_id, name)
      if (normalizedSql.startsWith('INSERT INTO classes')) {
        const ownerId = params[0] as number;
        const name = params[1] as string;
        const id = nextClassId++;
        const newClass: MockClass = {
          id,
          owner_id: ownerId,
          name,
          created_at: new Date()
        };
        mockClasses.push(newClass);
        return { insertId: id, affectedRows: 1 } as any;
      }

      // SELECT ... FROM classes WHERE id = ? AND owner_id = ?
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

      // SELECT ... FROM classes c LEFT JOIN students s ... WHERE c.owner_id = ?
      if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM classes c') && normalizedSql.includes('WHERE c.owner_id = ?')) {
        const ownerId = params[0] as number;
        const userClasses = mockClasses.filter((c) => c.owner_id === ownerId);
        return userClasses.map((c) => {
          const studentCount = mockStudents.filter((s) => s.class_id === c.id).length;
          return {
            id: c.id,
            ownerId: c.owner_id,
            name: c.name,
            createdAt: c.created_at,
            studentCount
          };
        }) as any;
      }

      // UPDATE classes SET name = ? WHERE id = ? AND owner_id = ?
      if (normalizedSql.startsWith('UPDATE classes SET name = ? WHERE id = ? AND owner_id = ?')) {
        const name = params[0] as string;
        const id = params[1] as number;
        const ownerId = params[2] as number;
        const cls = mockClasses.find((c) => c.id === id && c.owner_id === ownerId);
        if (!cls) return { affectedRows: 0 } as any;
        cls.name = name;
        return { affectedRows: 1 } as any;
      }

      // DELETE FROM classes WHERE id = ? AND owner_id = ?
      if (normalizedSql.startsWith('DELETE FROM classes WHERE id = ? AND owner_id = ?')) {
        const id = params[0] as number;
        const ownerId = params[1] as number;
        const prevLen = mockClasses.length;
        mockClasses = mockClasses.filter((c) => !(c.id === id && c.owner_id === ownerId));
        if (mockClasses.length < prevLen) {
          mockStudents = mockStudents.filter((s) => s.class_id !== id);
          mockConstraints = mockConstraints.filter((ct) => ct.class_id !== id);
          return { affectedRows: 1 } as any;
        }
        return { affectedRows: 0 } as any;
      }

      // SELECT full_name FROM students WHERE class_id = ?
      if (normalizedSql.startsWith('SELECT full_name FROM students WHERE class_id = ?')) {
        const classId = params[0] as number;
        const names = mockStudents.filter((s) => s.class_id === classId).map((s) => ({ full_name: s.full_name }));
        return names as any;
      }

      // INSERT INTO students (class_id, full_name, tag)
      if (normalizedSql.startsWith('INSERT INTO students')) {
        const classId = params[0] as number;
        const fullName = params[1] as string;
        const tag = (params[2] as string) || null;
        const id = nextStudentId++;
        const newStudent: MockStudent = {
          id,
          class_id: classId,
          full_name: fullName,
          tag,
          created_at: new Date()
        };
        mockStudents.push(newStudent);
        return { insertId: id, affectedRows: 1 } as any;
      }

      // SELECT ... FROM students WHERE id = ?
      if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM students WHERE id = ?') && !normalizedSql.includes('JOIN classes')) {
        const id = params[0] as number;
        const student = mockStudents.find((s) => s.id === id);
        if (!student) return [] as any;
        return [
          {
            id: student.id,
            classId: student.class_id,
            fullName: student.full_name,
            tag: student.tag,
            createdAt: student.created_at
          }
        ] as any;
      }

      // SELECT ... FROM students WHERE class_id = ?
      if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM students WHERE class_id = ?')) {
        const classId = params[0] as number;
        const list = mockStudents
          .filter((s) => s.class_id === classId)
          .map((s) => ({
            id: s.id,
            classId: s.class_id,
            fullName: s.full_name,
            tag: s.tag,
            createdAt: s.created_at
          }));
        return list as any;
      }

      // SELECT s.id, s.class_id AS classId ... FROM students s JOIN classes c ON s.class_id = c.id WHERE s.id = ?
      if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM students s JOIN classes c') && normalizedSql.includes('WHERE s.id = ?')) {
        const id = params[0] as number;
        const student = mockStudents.find((s) => s.id === id);
        if (!student) return [] as any;
        const cls = mockClasses.find((c) => c.id === student.class_id);
        if (!cls) return [] as any;
        return [
          {
            id: student.id,
            classId: student.class_id,
            fullName: student.full_name,
            tag: student.tag,
            createdAt: student.created_at,
            ownerId: cls.owner_id
          }
        ] as any;
      }

      // UPDATE students SET ... WHERE id = ?
      if (normalizedSql.startsWith('UPDATE students SET')) {
        const studentId = params[params.length - 1] as number;
        const student = mockStudents.find((s) => s.id === studentId);
        if (!student) return { affectedRows: 0 } as any;

        if (normalizedSql.includes('full_name = ?') && normalizedSql.includes('tag = ?')) {
          student.full_name = params[0] as string;
          student.tag = (params[1] as string) || null;
        } else if (normalizedSql.includes('full_name = ?')) {
          student.full_name = params[0] as string;
        } else if (normalizedSql.includes('tag = ?')) {
          student.tag = (params[0] as string) || null;
        }
        return { affectedRows: 1 } as any;
      }

      // DELETE FROM students WHERE id = ?
      if (normalizedSql.startsWith('DELETE FROM students WHERE id = ?')) {
        const id = params[0] as number;
        const prevLen = mockStudents.length;
        mockStudents = mockStudents.filter((s) => s.id !== id);
        mockConstraints = mockConstraints.filter((c) => c.student_a !== id && c.student_b !== id);
        return { affectedRows: prevLen - mockStudents.length } as any;
      }

      // SELECT ... FROM constraints WHERE class_id = ?
      if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM constraints WHERE class_id = ?')) {
        const classId = params[0] as number;
        const list = mockConstraints
          .filter((c) => c.class_id === classId)
          .map((c) => ({
            id: c.id,
            classId: c.class_id,
            studentA: c.student_a,
            studentB: c.student_b,
            kind: c.kind
          }));
        return list as any;
      }

      // DELETE FROM constraints WHERE class_id = ?
      if (normalizedSql.startsWith('DELETE FROM constraints WHERE class_id = ?')) {
        const classId = params[0] as number;
        mockConstraints = mockConstraints.filter((c) => c.class_id !== classId);
        return { affectedRows: 1 } as any;
      }

      // INSERT INTO constraints (class_id, student_a, student_b, kind)
      if (normalizedSql.startsWith('INSERT INTO constraints')) {
        const classId = params[0] as number;
        const studentA = params[1] as number;
        const studentB = params[2] as number;
        const kind = params[3] as 'apart' | 'together';
        const id = nextConstraintId++;
        mockConstraints.push({
          id,
          class_id: classId,
          student_a: studentA,
          student_b: studentB,
          kind
        });
        return { insertId: id, affectedRows: 1 } as any;
      }

      return [] as any;
    });
  });

  describe('Classes Endpoints', () => {
    it('creates a class successfully (201)', async () => {
      const res = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ name: 'L3 Informatique' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('L3 Informatique');
      expect(res.body.ownerId).toBe(1);
    });

    it('rejects empty class name (400 RFC 7807)', async () => {
      const res = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ name: '   ' });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('lists user classes with student count', async () => {
      await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ name: 'Master 1' });

      const res = await request(app)
        .get('/api/classes')
        .set('Authorization', `Bearer ${userToken1}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Master 1');
      expect(res.body[0].studentCount).toBe(0);
    });

    it('returns 404 when accessing another user class', async () => {
      const createRes = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ name: 'Privée Prof 1' });

      const res = await request(app)
        .get(`/api/classes/${createRes.body.id}`)
        .set('Authorization', `Bearer ${userToken2}`);

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('updates a class name (200)', async () => {
      const createRes = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ name: 'Old Name' });

      const res = await request(app)
        .patch(`/api/classes/${createRes.body.id}`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
    });

    it('deletes a class (204)', async () => {
      const createRes = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ name: 'To Delete' });

      const classId = createRes.body.id;

      const delRes = await request(app)
        .delete(`/api/classes/${classId}`)
        .set('Authorization', `Bearer ${userToken1}`);

      expect(delRes.status).toBe(204);

      const getRes = await request(app)
        .get(`/api/classes/${classId}`)
        .set('Authorization', `Bearer ${userToken1}`);

      expect(getRes.status).toBe(404);
    });
  });

  describe('Students Endpoints', () => {
    let testClassId = 1;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ name: 'Classe Test' });
      testClassId = res.body.id;
    });

    it('adds batch of students and detects duplicate names', async () => {
      const res = await request(app)
        .post(`/api/classes/${testClassId}/students`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({
          students: [
            { fullName: 'Alice Martin', tag: 'TD1' },
            { fullName: 'Bob Dupont', tag: 'TD2' },
            { fullName: 'Alice Martin', tag: 'TD3' }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.created).toHaveLength(2);
      expect(res.body.duplicates).toEqual(['Alice Martin']);
      expect(res.body.total).toBe(2);
    });

    it('updates student fullName and tag', async () => {
      const createRes = await request(app)
        .post(`/api/classes/${testClassId}/students`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({
          students: [{ fullName: 'Claire Petit', tag: 'TD1' }]
        });

      const studentId = createRes.body.created[0].id;

      const res = await request(app)
        .patch(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ fullName: 'Claire Martin-Petit', tag: 'TD2' });

      expect(res.status).toBe(200);
      expect(res.body.fullName).toBe('Claire Martin-Petit');
      expect(res.body.tag).toBe('TD2');
    });

    it('rejects updating student from another user (404)', async () => {
      const createRes = await request(app)
        .post(`/api/classes/${testClassId}/students`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({
          students: [{ fullName: 'David Grand' }]
        });

      const studentId = createRes.body.created[0].id;

      const res = await request(app)
        .patch(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${userToken2}`)
        .send({ fullName: 'Hack Name' });

      expect(res.status).toBe(404);
    });

    it('deletes student (204)', async () => {
      const createRes = await request(app)
        .post(`/api/classes/${testClassId}/students`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({
          students: [{ fullName: 'Eve Adams' }]
        });

      const studentId = createRes.body.created[0].id;

      const delRes = await request(app)
        .delete(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${userToken1}`);

      expect(delRes.status).toBe(204);

      const patchRes = await request(app)
        .patch(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ fullName: 'New' });

      expect(patchRes.status).toBe(404);
    });
  });

  describe('CSV Import Endpoint', () => {
    let testClassId = 1;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ name: 'Classe Import' });
      testClassId = res.body.id;
    });

    it('imports CSV string payload and skips header', async () => {
      const csv = 'nom,étiquette\nAlice Martin,Groupe A\nBob Dupont,Groupe B';
      const res = await request(app)
        .post(`/api/classes/${testClassId}/students/import`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ csv });

      expect(res.status).toBe(201);
      expect(res.body.created).toHaveLength(2);
      expect(res.body.totalImported).toBe(2);
    });

    it('rejects empty CSV import (400)', async () => {
      const res = await request(app)
        .post(`/api/classes/${testClassId}/students/import`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ csv: '   ' });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });
  });

  describe('Constraints Endpoints', () => {
    let testClassId = 1;
    let s1Id = 1;
    let s2Id = 2;
    let s3Id = 3;

    beforeEach(async () => {
      const classRes = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ name: 'Classe Contraintes' });
      testClassId = classRes.body.id;

      const stRes = await request(app)
        .post(`/api/classes/${testClassId}/students`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({
          students: [
            { fullName: 'Alice' },
            { fullName: 'Bob' },
            { fullName: 'Charlie' }
          ]
        });

      s1Id = stRes.body.created[0].id;
      s2Id = stRes.body.created[1].id;
      s3Id = stRes.body.created[2].id;
    });

    it('replaces constraints with canonical ordering (studentA < studentB)', async () => {
      const res = await request(app)
        .put(`/api/classes/${testClassId}/constraints`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({
          constraints: [
            { studentA: s2Id, studentB: s1Id, kind: 'apart' },
            { studentA: s1Id, studentB: s3Id, kind: 'together' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].studentA).toBe(Math.min(s1Id, s2Id));
      expect(res.body[0].studentB).toBe(Math.max(s1Id, s2Id));
      expect(res.body[0].kind).toBe('apart');
      expect(res.body[1].studentA).toBe(Math.min(s1Id, s3Id));
      expect(res.body[1].studentB).toBe(Math.max(s1Id, s3Id));
      expect(res.body[1].kind).toBe('together');
    });

    it('rejects constraint on invalid student ID (400)', async () => {
      const res = await request(app)
        .put(`/api/classes/${testClassId}/constraints`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({
          constraints: [{ studentA: s1Id, studentB: 99999, kind: 'apart' }]
        });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('rejects conflicting constraints on same pair (409)', async () => {
      const res = await request(app)
        .put(`/api/classes/${testClassId}/constraints`)
        .set('Authorization', `Bearer ${userToken1}`)
        .send({
          constraints: [
            { studentA: s1Id, studentB: s2Id, kind: 'apart' },
            { studentA: s2Id, studentB: s1Id, kind: 'together' }
          ]
        });

      expect(res.status).toBe(409);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });
  });
});

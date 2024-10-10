import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import * as db from '../src/db.js';

// In-memory simulation of DB tables for isolated integration testing
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

describe('Authentication & API Security Integration Tests', () => {
  let mockUsers: MockUser[] = [];
  let mockSessions: MockSession[] = [];
  let nextUserId = 1;
  const app = createApp();

  beforeEach(() => {
    mockUsers = [];
    mockSessions = [];
    nextUserId = 1;

    // Stub db.query to operate on mock state
    vi.spyOn(db, 'query').mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.trim().replace(/\s+/g, ' ');

      // INSERT INTO users
      if (normalizedSql.startsWith('INSERT INTO users')) {
        const email = params[0] as string;
        const passwordHash = params[1] as string;
        const id = nextUserId++;
        const user: MockUser = {
          id,
          email,
          password_hash: passwordHash,
          created_at: new Date()
        };
        mockUsers.push(user);
        return { insertId: id, affectedRows: 1 } as any;
      }

      // SELECT ... FROM users WHERE email = ?
      if (normalizedSql.includes('FROM users WHERE email = ?')) {
        const email = params[0] as string;
        const user = mockUsers.find((u) => u.email === email);
        return (user ? [user] : []) as any;
      }

      // SELECT ... FROM users WHERE id = ?
      if (normalizedSql.includes('FROM users WHERE id = ?')) {
        const id = params[0] as number;
        const user = mockUsers.find((u) => u.id === id);
        return (user ? [user] : []) as any;
      }

      // INSERT INTO sessions
      if (normalizedSql.startsWith('INSERT INTO sessions')) {
        const tokenHash = params[0] as string;
        const userId = params[1] as number;
        const expiresAt = params[2] as Date;
        mockSessions.push({
          token_hash: tokenHash,
          user_id: userId,
          expires_at: expiresAt,
          created_at: new Date()
        });
        return { affectedRows: 1 } as any;
      }

      // SELECT ... FROM sessions s JOIN users u ... WHERE s.token_hash = ?
      if (normalizedSql.includes('FROM sessions s') && normalizedSql.includes('s.token_hash = ?')) {
        const tokenHash = params[0] as string;
        const now = new Date();
        const session = mockSessions.find(
          (s) => s.token_hash === tokenHash && s.expires_at > now
        );
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

      // DELETE FROM sessions WHERE token_hash = ?
      if (normalizedSql.startsWith('DELETE FROM sessions WHERE token_hash = ?')) {
        const tokenHash = params[0] as string;
        const prevLen = mockSessions.length;
        mockSessions = mockSessions.filter((s) => s.token_hash !== tokenHash);
        return { affectedRows: prevLen - mockSessions.length } as any;
      }

      // DELETE FROM sessions WHERE expires_at <= NOW(3)
      if (normalizedSql.startsWith('DELETE FROM sessions WHERE expires_at <= NOW(3)')) {
        const now = new Date();
        const prevLen = mockSessions.length;
        mockSessions = mockSessions.filter((s) => s.expires_at > now);
        return { affectedRows: prevLen - mockSessions.length } as any;
      }

      return [] as any;
    });
  });

  describe('GET /api/health', () => {
    it('returns status ok with 200', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user and sets session cookie', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'professeur.turing@univ-paris.fr',
          password: 'SuperSecretPassword123!'
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('professeur.turing@univ-paris.fr');
      expect(res.body.user.id).toBe(1);
      expect(res.body.token).toBeDefined();

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('session_token=');
      expect(cookies[0]).toContain('HttpOnly');
    });

    it('rejects registration with invalid email format (400 RFC 7807)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SuperSecretPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.title).toBe('Validation Error');
      expect(res.body.invalidParams).toBeDefined();
      expect(res.body.invalidParams[0].name).toBe('email');
    });

    it('rejects registration with password shorter than 8 chars (400 RFC 7807)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'user@test.fr',
          password: 'short'
        });

      expect(res.status).toBe(400);
      expect(res.body.invalidParams[0].name).toBe('password');
    });

    it('returns 409 Conflict if email is already taken', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@test.fr',
          password: 'ValidPassword123!'
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@test.fr',
          password: 'AnotherPassword123!'
        });

      expect(res.status).toBe(409);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.title).toBe('Conflict');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const hash = await argon2.hash('MySecretPassword123!', { type: argon2.argon2id });
      mockUsers.push({
        id: 10,
        email: 'ada.lovelace@polytechnique.edu',
        password_hash: hash,
        created_at: new Date()
      });
    });

    it('logs in successfully with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'ada.lovelace@polytechnique.edu',
          password: 'MySecretPassword123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('ada.lovelace@polytechnique.edu');
      expect(res.body.token).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('session_token=');
    });

    it('rejects login with wrong password (401 RFC 7807)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'ada.lovelace@polytechnique.edu',
          password: 'WrongPassword!'
        });

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.title).toBe('Unauthorized');
    });

    it('rejects login with unknown email (401 RFC 7807)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unknown@polytechnique.edu',
          password: 'SomePassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.title).toBe('Unauthorized');
    });
  });

  describe('GET /api/auth/me & Protected Session Route', () => {
    it('returns 401 when no session cookie or header is provided', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('returns current user with valid session cookie', async () => {
      // 1. Register user
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'curie@sorbonne.fr',
          password: 'Radioactivity123!'
        });

      const cookie = registerRes.headers['set-cookie'];

      // 2. Call /me with session cookie
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe('curie@sorbonne.fr');
      expect(meRes.body.user.id).toBe(registerRes.body.user.id);
    });

    it('supports Bearer token in Authorization header', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'poincare@sorbonne.fr',
          password: 'Topology12345!'
        });

      const token = registerRes.body.token;

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe('poincare@sorbonne.fr');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears cookie and revokes session', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'fourier@univ-paris.fr',
          password: 'TransformPass123!'
        });

      const cookie = registerRes.headers['set-cookie'];

      // Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie);

      expect(logoutRes.status).toBe(204);

      // Attempting /me should now fail with 401
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie);

      expect(meRes.status).toBe(401);
    });
  });

  describe('RFC 7807 404 Route handling', () => {
    it('returns structured problem+json for non-existent endpoint', async () => {
      const res = await request(app).get('/api/non-existent');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.title).toBe('Not Found');
    });
  });
});

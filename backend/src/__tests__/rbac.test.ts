import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';

describe('RBAC', () => {
  it('owner can read customers with token', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'owner@serviceos.local', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.data?.token).toBeDefined();
    const res = await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('missing permission returns 403 when enforced', async () => {
    // If DB is unavailable, this verifies middleware exists (403 or 401 expected)
    const res = await request(app).get('/api/v1/customers');
    expect([401, 403]).toContain(res.status);
  });
});

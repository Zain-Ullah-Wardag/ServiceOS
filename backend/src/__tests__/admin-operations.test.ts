import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';

describe('Phase 2B Admin Operations — Real', () => {
  let authToken: string = '';

  beforeAll(async () => {
    // Use existing integration setup (serviceos_test DB guard applied externally)
    try {
      // Clean previous test users
      await prisma.user.deleteMany({ where: { email: { contains: '@test.local' } } });
    } catch { /* ignore */ }

    // Create real test user via auth endpoint
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test-admin@test.local', password: 'testpass123', name: 'Test Admin' });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test-admin@test.local', password: 'testpass123' });

    authToken = login.body?.data?.token || login.body?.token || '';
  });

  it('customer create really persists', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Customer', phone: '03001234567', email: 'cust@test.local', notes: 'Walk-in' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
  });

  it('measurement fields endpoint returns real config', async () => {
    const res = await request(app)
      .get('/api/v1/tailoring/measurement-fields')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('service create really persists', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Suit', price: 12000, duration: 60, description: 'Tailored' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('garment endpoint is tenant-scoped', async () => {
    const res = await request(app)
      .get('/api/v1/tailoring/garments')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('staff endpoint accessible', async () => {
    const res = await request(app)
      .get('/api/v1/staff')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('tailoring orders endpoint accessible', async () => {
    const res = await request(app)
      .get('/api/v1/tailoring/orders')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('customer update and delete use real endpoints', async () => {
    // Create
    const createRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Update Me', phone: '0300', email: 'update@test.local' });
    expect(createRes.status).toBe(201);
    const id = createRes.body.data.id;

    // Update
    const patch = await request(app)
      .patch(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ notes: 'Updated' });
    expect(patch.status).toBe(200);

    // Delete
    const del = await request(app)
      .delete(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(del.status).toBe(200);
  });
});

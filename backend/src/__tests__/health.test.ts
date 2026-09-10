import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';

describe('Health', () => {
  it('GET /health returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

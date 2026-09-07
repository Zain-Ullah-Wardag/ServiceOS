import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('Public Business', () => {
  it('GET /api/v1/public/business/zain-tailors returns 200 with services', async () => {
    const res = await request(app).get('/api/v1/public/business/zain-tailors');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('Unknown slug returns 404', async () => {
    const res = await request(app).get('/api/v1/public/business/nonexistent-business-xyz');
    expect(res.status).toBe(404);
  });
});

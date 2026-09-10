import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('Guest Order & Tracking', () => {
  it('POST guest order succeeds for existing tenant', async () => {
    const res = await request(app)
      .post('/api/v1/public/business/zain-tailors/orders')
      .send({
        customerName: 'Guest User',
        customerPhone: '+920001111',
        serviceId: undefined,
        notes: 'Test',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderNumber).toBeDefined();
  });

  it('GET tracking with valid token format works', async () => {
    const res = await request(app).get(
      '/api/v1/public/orders/ORD-123-test-token-abc'
    );

    expect([200, 404]).toContain(res.status);
  });

  it('Guest order with cross-tenant serviceId must be rejected', async () => {
    const res = await request(app)
      .post('/api/v1/public/business/zain-tailors/orders')
      .send({
        customerName: 'Injector',
        customerPhone: '+999999',
        serviceId: '00000000-0000-0000-0000-000000000000',
        notes: 'bad',
      });

    expect([400, 403, 404]).toContain(res.status);
  });
});
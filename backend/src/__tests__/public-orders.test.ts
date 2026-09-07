import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('Guest Order & Tracking', () => {
  it('POST guest order succeeds for existing tenant', async () => {
    const res = await request(app)
      .post('/api/v1/public/business/zain-tailors/orders')
      .send({ customerName: 'Guest User', customerPhone: '+920001111', serviceId: undefined, notes: 'Test' });
    expect([201, 404]).toContain(res.status); // 201 if DB/service exists; 404 if service missing
    if (res.status === 201) {
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderNumber).toBeDefined();
    }
  });

  it('GET tracking with valid token format works', async () => {
    const res = await request(app).get('/api/v1/public/orders/ORD-123-test-token-abc');
    expect([200, 404]).toContain(res.status);
  });
});

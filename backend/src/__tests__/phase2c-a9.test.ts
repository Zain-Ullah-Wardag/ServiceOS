import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import prisma from '../lib/prisma';

/**
 * A9: order-specific Fabric & Design details. Runs against serviceos_test
 * only. Covers the required Part I scenarios (31 tests):
 * empty state, create, read-back, update, no duplicates, tenant isolation,
 * RBAC, validation (source, quantity, designFields, instructions),
 * order isolation, audit events, read-only GET, and the nullable fabric
 * source/unit semantics (optional first saves, null clears, omitted
 * unchanged, never invented).
 */

const FULL_DETAILS = {
  fabricSource: 'customer',
  fabricType: 'Wash & Wear',
  fabricColor: 'White',
  fabricQuantity: 4.5,
  fabricUnit: 'meter',
  designFields: {
    collar: 'Ban Collar',
    cuff: 'Round',
    fit: 'Regular',
    chestPocket: 'Yes',
    sidePockets: '2',
    daman: 'Round',
  },
  specialInstructions: 'Keep sleeves slightly loose.',
};

describe('A9 tailoring order fabric & design details (real serviceos_test)', () => {
  let tenantId: string;
  let foreignTenantId: string;
  let customerId: string;
  let foreignCustomerId: string;
  let token: string;
  let noReadToken: string;
  let readOnlyToken: string;
  const users: string[] = [];

  beforeAll(async () => {
    const db = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database() AS current_database`;
    expect(db[0].current_database).toBe('serviceos_test');

    const suffix = randomUUID();
    tenantId = (await prisma.tenant.create({ data: { name: 'A9 tenant', slug: `a9-${suffix}`, businessType: 'tailoring' } })).id;
    foreignTenantId = (await prisma.tenant.create({ data: { name: 'Other A9 tenant', slug: `other-a9-${suffix}` } })).id;

    const makeUser = async (name: string, permissions: string[]) => {
      const user = await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, '-')}-${suffix}@a9.invalid`, passwordHash: 'unused' } });
      users.push(user.id);
      const role = await prisma.role.create({ data: { tenantId, name: `${name} role` } });
      for (const permissionName of permissions) {
        const permission = await prisma.permission.upsert({ where: { name: permissionName }, create: { name: permissionName }, update: {} });
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      }
      await prisma.tenantUser.create({ data: { tenantId, userId: user.id, roleId: role.id } });
      return jwt.sign({ userId: user.id, tenantId }, process.env.JWT_SECRET!);
    };

    token = await makeUser('A9 owner', ['tailoring.read', 'tailoring.update']);
    noReadToken = await makeUser('A9 no read', ['analytics.read']);
    readOnlyToken = await makeUser('A9 read only', ['tailoring.read']);

    customerId = (await prisma.customer.create({ data: { tenantId, name: 'A9 customer', phone: 'a9-phone' } })).id;
    foreignCustomerId = (await prisma.customer.create({ data: { tenantId: foreignTenantId, name: 'A9 foreign customer', phone: 'a9-phone-f' } })).id;
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    if (foreignTenantId) await prisma.tenant.delete({ where: { id: foreignTenantId } });
    if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  async function makeOrder(suffix: string, tenantIdOverride?: string) {
    const tid = tenantIdOverride ?? tenantId;
    const cid = tenantIdOverride ? foreignCustomerId : customerId;
    const order = await prisma.order.create({ data: { tenantId: tid, customerId: cid, orderNumber: `A9-${suffix}-${randomUUID().slice(0, 8)}` } });
    const tailoringOrder = await prisma.tailoringOrder.create({ data: { tenantId: tid, customerId: cid, orderId: order.id, status: 'confirmed' } });
    return { order, tailoringOrder };
  }

  const detailsUrl = (id: string) => `/api/v1/tailoring/orders/${id}/details`;

  /* ----------------------------------------------------------
     1-5: core read/create/update behavior
  ---------------------------------------------------------- */

  it('1. GET returns null (empty state) for an order without details', async () => {
    const { tailoringOrder } = await makeOrder('EMPTY');
    const response = await request(app).get(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeNull();
  });

  it('2. PATCH creates details on first save (201) and persists them', async () => {
    const { tailoringOrder } = await makeOrder('CREATE');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send(FULL_DETAILS);
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const row = await prisma.tailoringOrderDetails.findUnique({ where: { tailoringOrderId: tailoringOrder.id } });
    expect(row).not.toBeNull();
    expect(row!.tenantId).toBe(tenantId);
    expect(row!.fabricSource).toBe('customer');
    expect(row!.fabricType).toBe('Wash & Wear');
    expect(row!.fabricColor).toBe('White');
    expect(row!.fabricUnit).toBe('meter');
    expect(row!.designFields).toMatchObject(FULL_DETAILS.designFields);
    expect(row!.specialInstructions).toBe('Keep sleeves slightly loose.');
  });

  it('3. GET returns the saved details with quantity as a fixed-precision string', async () => {
    const { tailoringOrder } = await makeOrder('READ');
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send(FULL_DETAILS);

    const response = await request(app).get(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.fabric).toEqual({ source: 'customer', type: 'Wash & Wear', color: 'White', quantity: '4.50', unit: 'meter' });
    expect(data.designFields).toEqual(FULL_DETAILS.designFields);
    expect(data.specialInstructions).toBe('Keep sleeves slightly loose.');
    expect(data.id).toBeTruthy();
    expect(data.createdAt).toBeTruthy();
    expect(data.updatedAt).toBeTruthy();
  });

  it('4. PATCH updates the same row; omitted fields stay unchanged, empty strings clear', async () => {
    const { tailoringOrder } = await makeOrder('UPDATE');
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send(FULL_DETAILS);

    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricColor: '  Navy Blue  ', fabricType: '' });
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.fabric.color).toBe('Navy Blue'); // trimmed
    expect(data.fabric.type).toBeNull(); // explicit empty clears
    expect(data.fabric.source).toBe('customer'); // omitted = unchanged
    expect(data.fabric.quantity).toBe('4.50'); // omitted = unchanged
    expect(data.designFields).toEqual(FULL_DETAILS.designFields); // omitted = unchanged
    expect(data.specialInstructions).toBe(FULL_DETAILS.specialInstructions); // omitted = unchanged
  });

  it('5. repeated saves never create a duplicate detail row', async () => {
    const { tailoringOrder } = await makeOrder('DUP');
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send(FULL_DETAILS);
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send({ fabricColor: 'Black' });
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send({ designFields: { collar: 'Simple' } });

    const count = await prisma.tailoringOrderDetails.count({ where: { tailoringOrderId: tailoringOrder.id } });
    expect(count).toBe(1);
  });

  /* ----------------------------------------------------------
     6-9: tenancy and RBAC
  ---------------------------------------------------------- */

  it('6. cross-tenant GET returns 404', async () => {
    const { tailoringOrder } = await makeOrder('XGET', foreignTenantId);
    const response = await request(app).get(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('7. cross-tenant PATCH returns 404 and writes nothing', async () => {
    const { tailoringOrder } = await makeOrder('XPATCH', foreignTenantId);
    const before = await prisma.tailoringOrderDetails.count();
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send(FULL_DETAILS);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await prisma.tailoringOrderDetails.count()).toBe(before);
  });

  it('8. GET requires tailoring.read', async () => {
    const { tailoringOrder } = await makeOrder('RBAC-GET');
    const response = await request(app).get(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${noReadToken}`);
    expect(response.status).toBe(403);
  });

  it('9. PATCH requires tailoring.update (read-only user is rejected)', async () => {
    const { tailoringOrder } = await makeOrder('RBAC-PATCH');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send(FULL_DETAILS);
    expect(response.status).toBe(403);
    expect(await prisma.tailoringOrderDetails.count({ where: { tailoringOrderId: tailoringOrder.id } })).toBe(0);
  });

  /* ----------------------------------------------------------
     10-16: validation
  ---------------------------------------------------------- */

  it('10. rejects an unknown fabricSource', async () => {
    const { tailoringOrder } = await makeOrder('BAD-SRC');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ ...FULL_DETAILS, fabricSource: 'donor' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('11. rejects a zero fabric quantity', async () => {
    const { tailoringOrder } = await makeOrder('Q-ZERO');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: 'shop', fabricQuantity: 0 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('12. rejects a negative fabric quantity', async () => {
    const { tailoringOrder } = await makeOrder('Q-NEG');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: 'shop', fabricQuantity: -1.5 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('13. rejects non-finite fabric quantities (Infinity / NaN / non-numeric)', async () => {
    const { tailoringOrder } = await makeOrder('Q-NAN');
    for (const bad of ['Infinity', 'NaN', 'abc']) {
      const response = await request(app)
        .patch(detailsUrl(tailoringOrder.id))
        .set('Authorization', `Bearer ${token}`)
        .send({ fabricSource: 'shop', fabricQuantity: bad });
      expect(response.status, `expected 400 for ${bad}`).toBe(400);
    }
  });

  it('14. rejects designFields that is an array', async () => {
    const { tailoringOrder } = await makeOrder('DF-ARR');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: 'shop', designFields: ['collar', 'cuff'] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('15. rejects oversized design keys, values and >30 keys', async () => {
    const { tailoringOrder } = await makeOrder('DF-BIG');
    const longKey = 'k'.repeat(81);
    const longValue = 'v'.repeat(501);
    const manyKeys = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`field${i}`, 'x']));

    for (const bad of [{ collar: longValue }, { [longKey]: 'x' }, manyKeys]) {
      const response = await request(app)
        .patch(detailsUrl(tailoringOrder.id))
        .set('Authorization', `Bearer ${token}`)
        .send({ fabricSource: 'shop', designFields: bad });
      expect(response.status, JSON.stringify(bad).slice(0, 40)).toBe(400);
    }
  });

  it('16. enforces the specialInstructions length limit (5000 max, trimmed)', async () => {
    const { tailoringOrder } = await makeOrder('SI-LIMIT');
    const tooLong = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: 'shop', specialInstructions: 'x'.repeat(5001) });
    expect(tooLong.status).toBe(400);

    const exact = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: 'shop', specialInstructions: `  ${'x'.repeat(5000)}  `.trim() });
    expect(exact.status).toBe(201);
    expect(exact.body.data.specialInstructions).toHaveLength(5000);
  });

  /* ----------------------------------------------------------
     17-20: isolation, audit, read-only
  ---------------------------------------------------------- */

  it('17. editing Order B never changes Order A details', async () => {
    const orderA = await makeOrder('ISO-A');
    const orderB = await makeOrder('ISO-B');
    await request(app)
      .patch(detailsUrl(orderA.tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: 'shop', fabricType: 'Cotton', designFields: { collar: 'Ban' } });
    await request(app)
      .patch(detailsUrl(orderB.tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: 'customer', fabricType: 'Linen', designFields: { collar: 'Simple' } });

    // Now edit B — A must stay exactly as saved.
    await request(app)
      .patch(detailsUrl(orderB.tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricType: 'Wash & Wear' });

    const a = await request(app).get(detailsUrl(orderA.tailoringOrder.id)).set('Authorization', `Bearer ${token}`);
    const b = await request(app).get(detailsUrl(orderB.tailoringOrder.id)).set('Authorization', `Bearer ${token}`);
    expect(a.body.data.fabric.type).toBe('Cotton');
    expect(a.body.data.designFields).toEqual({ collar: 'Ban' });
    expect(a.body.data.fabric.source).toBe('shop');
    expect(b.body.data.fabric.type).toBe('Wash & Wear');
    expect(b.body.data.designFields).toEqual({ collar: 'Simple' });
  });

  it('18. first save writes a TAILORING_DETAILS_CREATED audit event', async () => {
    const { tailoringOrder } = await makeOrder('AUDIT-CREATE');
    const before = await prisma.auditLog.count({ where: { tenantId, entity: 'TailoringOrderDetails' } });
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send(FULL_DETAILS);
    expect(response.status).toBe(201);

    const events = await prisma.auditLog.findMany({ where: { tenantId, entity: 'TailoringOrderDetails' }, orderBy: { createdAt: 'desc' } });
    expect(events.length).toBe(before + 1);
    const event = events[0];
    expect(event.action).toBe('TAILORING_DETAILS_CREATED');
    expect(event.entityId).toBe(response.body.data.id);
    const metadata = JSON.parse(event.metadata!);
    expect(metadata.tailoringOrderId).toBe(tailoringOrder.id);
  });

  it('19. later edit writes a TAILORING_DETAILS_UPDATED audit event', async () => {
    const { tailoringOrder } = await makeOrder('AUDIT-UPDATE');
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send(FULL_DETAILS);
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send({ fabricColor: 'Black' });

    const events = await prisma.auditLog.findMany({ where: { tenantId, entity: 'TailoringOrderDetails' } });
    const mine = events
      .filter((event) => {
        try {
          return JSON.parse(event.metadata ?? '{}').tailoringOrderId === tailoringOrder.id;
        } catch {
          return false;
        }
      })
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
    expect(mine.length).toBe(2);
    expect(mine[0].action).toBe('TAILORING_DETAILS_UPDATED');
    expect(mine[1].action).toBe('TAILORING_DETAILS_CREATED');
  });

  it('20. GET performs no writes', async () => {
    const { tailoringOrder } = await makeOrder('NOOP');
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send(FULL_DETAILS);

    const before = {
      details: await prisma.tailoringOrderDetails.count({ where: { tenantId } }),
      audits: await prisma.auditLog.count({ where: { tenantId } }),
      orders: await prisma.tailoringOrder.count({ where: { tenantId } }),
    };
    const response = await request(app).get(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(await prisma.tailoringOrderDetails.count({ where: { tenantId } })).toBe(before.details);
    expect(await prisma.auditLog.count({ where: { tenantId } })).toBe(before.audits);
    expect(await prisma.tailoringOrder.count({ where: { tenantId } })).toBe(before.orders);
  });

  /* ----------------------------------------------------------
     21-31: nullable fabricSource / fabricUnit semantics
     (fabric may be unknown when design/instructions are first
     saved; null clears, omitted stays unchanged, never invented)
  ---------------------------------------------------------- */

  it('21. first save with only designFields succeeds (201), fabric fields stay null', async () => {
    const { tailoringOrder } = await makeOrder('DESIGN-ONLY');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ designFields: { collar: 'Ban Collar' } });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.fabric.source).toBeNull();
    expect(response.body.data.fabric.unit).toBeNull();
    expect(response.body.data.designFields).toEqual({ collar: 'Ban Collar' });

    const row = await prisma.tailoringOrderDetails.findUnique({ where: { tailoringOrderId: tailoringOrder.id } });
    expect(row!.fabricSource).toBeNull();
    expect(row!.fabricUnit).toBeNull();
    expect(row!.fabricType).toBeNull();
    expect(row!.specialInstructions).toBeNull();
  });

  it('22. first save with only specialInstructions succeeds (201)', async () => {
    const { tailoringOrder } = await makeOrder('INSTR-ONLY');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ specialInstructions: 'No stitching on the cuffs.' });
    expect(response.status).toBe(201);
    expect(response.body.data.specialInstructions).toBe('No stitching on the cuffs.');
    expect(response.body.data.fabric.source).toBeNull();
    expect(response.body.data.fabric.quantity).toBeNull();
  });

  it('23. first save without fabricSource persists source as null', async () => {
    const { tailoringOrder } = await makeOrder('NO-SRC');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricType: 'Cotton', fabricQuantity: 3, fabricUnit: 'meter' });
    expect(response.status).toBe(201);
    expect(response.body.data.fabric.source).toBeNull();
    expect(response.body.data.fabric.type).toBe('Cotton');
    expect(response.body.data.fabric.quantity).toBe('3.00');
    const row = await prisma.tailoringOrderDetails.findUnique({ where: { tailoringOrderId: tailoringOrder.id } });
    expect(row!.fabricSource).toBeNull();
    expect(row!.fabricUnit).toBe('meter');
  });

  it('24. GET on a design-only save returns the valid empty fabric object', async () => {
    const { tailoringOrder } = await makeOrder('EMPTY-FABRIC');
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send({ designFields: { fit: 'Regular' } });

    const response = await request(app).get(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.fabric).toEqual({ source: null, type: null, color: null, quantity: null, unit: null });
    expect(response.body.data.designFields).toEqual({ fit: 'Regular' });
  });

  it('25. explicit null clears fabricSource (other fields preserved)', async () => {
    const { tailoringOrder } = await makeOrder('CLEAR-SRC');
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send(FULL_DETAILS);

    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: null });
    expect(response.status).toBe(200);
    expect(response.body.data.fabric.source).toBeNull();
    expect(response.body.data.fabric.type).toBe('Wash & Wear'); // preserved
    expect(response.body.data.fabric.unit).toBe('meter'); // preserved
    const row = await prisma.tailoringOrderDetails.findUnique({ where: { tailoringOrderId: tailoringOrder.id } });
    expect(row!.fabricSource).toBeNull();
  });

  it('26. explicit null clears fabricUnit (never re-invented as meter)', async () => {
    const { tailoringOrder } = await makeOrder('CLEAR-UNIT');
    await request(app).patch(detailsUrl(tailoringOrder.id)).set('Authorization', `Bearer ${token}`).send(FULL_DETAILS);

    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricUnit: null });
    expect(response.status).toBe(200);
    expect(response.body.data.fabric.unit).toBeNull();
    expect(response.body.data.fabric.source).toBe('customer'); // preserved
    const row = await prisma.tailoringOrderDetails.findUnique({ where: { tailoringOrderId: tailoringOrder.id } });
    expect(row!.fabricUnit).toBeNull();
  });

  it('27. omitted fabricSource is unchanged on a later save', async () => {
    const { tailoringOrder } = await makeOrder('OMIT-SRC');
    await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: 'shop', designFields: { collar: 'Simple' } });

    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ designFields: { collar: 'Round' } });
    expect(response.status).toBe(200);
    expect(response.body.data.fabric.source).toBe('shop'); // unchanged
    expect(response.body.data.designFields).toEqual({ collar: 'Round' }); // replaced
  });

  it('28. omitted fabricUnit is unchanged on a later save', async () => {
    const { tailoringOrder } = await makeOrder('OMIT-UNIT');
    await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: 'customer', fabricQuantity: 2, fabricUnit: 'yard' });

    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricColor: 'Cream' });
    expect(response.status).toBe(200);
    expect(response.body.data.fabric.unit).toBe('yard'); // unchanged
    expect(response.body.data.fabric.color).toBe('Cream');
  });

  it('29. invalid non-null fabricUnit is rejected (400)', async () => {
    const { tailoringOrder } = await makeOrder('BAD-UNIT');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: 'shop', fabricQuantity: 1, fabricUnit: 'foot' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.tailoringOrderDetails.count({ where: { tailoringOrderId: tailoringOrder.id } })).toBe(0);
  });

  it('30. explicit null fabricSource on first save is stored as null', async () => {
    const { tailoringOrder } = await makeOrder('NULL-SRC');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricSource: null, designFields: { fit: 'Slim' } });
    expect(response.status).toBe(201);
    expect(response.body.data.fabric.source).toBeNull();
    const row = await prisma.tailoringOrderDetails.findUnique({ where: { tailoringOrderId: tailoringOrder.id } });
    expect(row!.fabricSource).toBeNull();
  });

  it('31. explicit null fabricUnit on first save is stored as null', async () => {
    const { tailoringOrder } = await makeOrder('NULL-UNIT');
    const response = await request(app)
      .patch(detailsUrl(tailoringOrder.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ fabricUnit: null, fabricType: 'Linen' });
    expect(response.status).toBe(201);
    expect(response.body.data.fabric.unit).toBeNull();
    expect(response.body.data.fabric.type).toBe('Linen');
    const row = await prisma.tailoringOrderDetails.findUnique({ where: { tailoringOrderId: tailoringOrder.id } });
    expect(row!.fabricUnit).toBeNull();
  });
});

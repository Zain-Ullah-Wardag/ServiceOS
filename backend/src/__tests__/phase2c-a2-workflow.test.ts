import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';

const mapping: Record<string, string> = {
  received: 'pending', confirmed: 'pending', measurement: 'measured', cutting: 'cutting',
  stitching: 'stitching', finishing: 'finishing', quality_check: 'quality_check',
  ready: 'ready', delivered: 'delivered', cancelled: 'cancelled',
};

describe('Phase 2C-A2.1 real PostgreSQL workflow', () => {
  let tenantId: string;
  let foreignTenantId: string;
  let userId: string;
  let customerId: string;
  let staffId: string;
  let inactiveStaffId: string;
  let foreignStaffId: string;
  let measurementId: string;
  let token: string;
  let deniedToken: string;
  const users: string[] = [];

  beforeAll(async () => {
    const db = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
    expect(db[0].current_database).toBe('serviceos_test');
    const suffix = randomUUID();
    const tenant = await prisma.tenant.create({ data: { name: 'Workflow tests', slug: `workflow-${suffix}`, businessType: 'tailoring' } });
    tenantId = tenant.id;
    foreignTenantId = (await prisma.tenant.create({ data: { name: 'Foreign workflow', slug: `foreign-${suffix}`, businessType: 'tailoring' } })).id;
    userId = (await prisma.user.create({ data: { email: `${suffix}@workflow.invalid`, name: 'Workflow owner', passwordHash: 'unused', status: 'active' } })).id;
    users.push(userId);
    const role = await prisma.role.create({ data: { tenantId, name: 'Workflow operator' } });
    const permission = await prisma.permission.upsert({ where: { name: 'tailoring.update' }, update: {}, create: { name: 'tailoring.update' } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.tenantUser.create({ data: { tenantId, userId, roleId: role.id, status: 'active' } });
    token = jwt.sign({ userId, tenantId }, process.env.JWT_SECRET!);
    const denied = await prisma.user.create({ data: { email: `denied-${suffix}@workflow.invalid`, name: 'No permission', passwordHash: 'unused', status: 'active' } });
    users.push(denied.id);
    const deniedRole = await prisma.role.create({ data: { tenantId, name: 'No permissions' } });
    await prisma.tenantUser.create({ data: { tenantId, userId: denied.id, roleId: deniedRole.id, status: 'active' } });
    deniedToken = jwt.sign({ userId: denied.id, tenantId }, process.env.JWT_SECRET!);
    customerId = (await prisma.customer.create({ data: { tenantId, name: 'Workflow customer', phone: suffix } })).id;
    staffId = (await prisma.staff.create({ data: { tenantId, userId, jobTitle: 'Tailor', status: 'active' } })).id;
    inactiveStaffId = (await prisma.staff.create({ data: { tenantId, userId, jobTitle: 'Inactive tailor', status: 'inactive' } })).id;
    foreignStaffId = (await prisma.staff.create({ data: { tenantId: foreignTenantId, userId, jobTitle: 'Foreign tailor', status: 'active' } })).id;
    measurementId = (await prisma.measurement.create({ data: { tenantId, customerId, createdBy: userId, fields: { chest: 40 } } })).id;
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    if (foreignTenantId) await prisma.tenant.delete({ where: { id: foreignTenantId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  async function fixture(status = 'received', garment = true) {
    const parent = await prisma.order.create({ data: { tenantId, customerId, orderNumber: `WF-${randomUUID()}`, status, expectedDate: new Date('2026-12-20') } });
    const item = garment ? await prisma.garment.create({ data: { tenantId, customerId, orderId: parent.id, name: 'Suit', status: mapping[status] } }) : null;
    return prisma.tailoringOrder.create({ data: { tenantId, customerId, orderId: parent.id, garmentId: item?.id, status, staffId, measurementId } });
  }
  function patch(id: string, endpoint: string, body: object) {
    return request(app).patch(`/api/v1/tailoring/orders/${id}/${endpoint}`).set('Authorization', `Bearer ${token}`).send(body);
  }
  function qc(id: string, body: object) {
    return request(app).post(`/api/v1/tailoring/orders/${id}/qc`).set('Authorization', `Bearer ${token}`).send(body);
  }
  async function synchronized(id: string, status: string, historyCount = 1) {
    const row = await prisma.tailoringOrder.findUniqueOrThrow({ where: { id }, include: { order: { include: { statusHistory: true } }, garment: true } });
    expect(row.status).toBe(status);
    expect(row.order.status).toBe(status);
    if (row.garment) expect(row.garment.status).toBe(mapping[status]);
    expect(row.order.statusHistory).toHaveLength(historyCount);
    if (historyCount) expect(row.order.statusHistory).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: row.orderId, tenantId, status, changedBy: userId })]));
    expect(row.order.completedDate !== null).toBe(status === 'delivered');
  }

  it('registers exactly one PATCH status, PATCH confirm/staff, and POST QC', () => {
    const paths: string[] = [];
    function walk(stack: any[], prefix = '') {
      for (const layer of stack) {
        if (layer.route) for (const method of Object.keys(layer.route.methods)) paths.push(`${method} ${prefix}${layer.route.path}`);
        else if (layer.handle?.stack) walk(layer.handle.stack, layer.regexp.toString().includes('tailoring') ? '/api/v1/tailoring/orders' : prefix);
      }
    }
    walk((app as any)._router.stack);
    expect(paths.filter(p => p.endsWith('/api/v1/tailoring/orders/:id/status'))).toEqual(['patch /api/v1/tailoring/orders/:id/status']);
    for (const [method, endpoint] of [['patch', 'confirm'], ['patch', 'staff'], ['post', 'qc']]) {
      expect(paths.filter(p => p.endsWith(`/api/v1/tailoring/orders/:id/${endpoint}`))).toEqual([`${method} /api/v1/tailoring/orders/:id/${endpoint}`]);
    }
  });

  it.each([
    ['received', 'confirmed'], ['confirmed', 'measurement'], ['measurement', 'cutting'],
    ['cutting', 'stitching'], ['stitching', 'finishing'], ['finishing', 'quality_check'],
    ['quality_check', 'ready'], ['ready', 'delivered'], ['quality_check', 'stitching'], ['quality_check', 'finishing'],
  ])('synchronizes %s -> %s', async (from, to) => {
    const row = await fixture(from);
    expect((await patch(row.id, 'status', { status: to, notes: 'Transition test' })).status).toBe(200);
    await synchronized(row.id, to);
  });

  it.each(Object.keys(mapping).filter(s => !['delivered', 'cancelled'].includes(s)))('allows cancellation from %s', async status => {
    const row = await fixture(status);
    expect((await patch(row.id, 'status', { status: 'cancelled' })).status).toBe(200);
    await synchronized(row.id, 'cancelled');
  });

  it.each(['delivered', 'cancelled'])('%s is terminal for status and assignment', async status => {
    const row = await fixture(status);
    for (const target of ['received', 'delivered', 'cancelled']) expect((await patch(row.id, 'status', { status: target })).status).toBe(409);
    expect((await patch(row.id, 'staff', { staffId: null })).status).toBe(409);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: row.orderId } })).toBe(0);
  });

  it('rejects skipped, unknown, and self transitions without writing', async () => {
    const row = await fixture();
    for (const status of ['ready', 'unknown', 'received']) expect((await patch(row.id, 'status', { status })).status).toBe(409);
    await synchronized(row.id, 'received', 0);
  });

  it('requires a date for both confirmation paths and validates supplied dates', async () => {
    const row = await fixture();
    await prisma.order.update({ where: { id: row.orderId }, data: { expectedDate: null } });
    expect((await patch(row.id, 'status', { status: 'confirmed' })).status).toBe(400);
    expect((await patch(row.id, 'confirm', {})).status).toBe(400);
    expect((await patch(row.id, 'confirm', { deliveryDate: 'not-a-date' })).status).toBe(400);
    await synchronized(row.id, 'received', 0);
    expect((await patch(row.id, 'confirm', { deliveryDate: '2026-12-25', priority: 'urgent', notes: '' })).status).toBe(200);
    await synchronized(row.id, 'confirmed');
    const updated = await prisma.tailoringOrder.findUniqueOrThrow({ where: { id: row.id }, include: { order: true } });
    expect(updated.deliveryDate).toEqual(new Date('2026-12-25'));
    expect(updated.order.expectedDate).toEqual(updated.deliveryDate);
    expect(updated.order.priority).toBe('urgent');
  });

  it.each(['delivery', 'expected'])('confirmation accepts existing %s date', async source => {
    const row = await fixture();
    if (source === 'delivery') {
      await prisma.order.update({ where: { id: row.orderId }, data: { expectedDate: null } });
      await prisma.tailoringOrder.update({ where: { id: row.id }, data: { deliveryDate: new Date('2026-12-22') } });
    }
    expect((await patch(row.id, 'confirm', {})).status).toBe(200);
    await synchronized(row.id, 'confirmed');
    expect((await request(app).post(`/api/v1/tailoring/orders/${row.id}/confirm`).set('Authorization', `Bearer ${token}`).send({})).status).toBe(404);
  });

  it('requires measurementId to enter measurement', async () => {
    const row = await fixture('confirmed');
    await prisma.tailoringOrder.update({ where: { id: row.id }, data: { measurementId: null } });
    expect((await patch(row.id, 'status', { status: 'measurement' })).status).toBe(409);
    await synchronized(row.id, 'confirmed', 0);
  });

  it('requires active same-tenant staff to enter cutting', async () => {
    const row = await fixture('measurement');
    for (const id of [null, inactiveStaffId, foreignStaffId]) {
      await prisma.tailoringOrder.update({ where: { id: row.id }, data: { staffId: id } });
      expect((await patch(row.id, 'status', { status: 'cutting' })).status).toBe(409);
    }
    await synchronized(row.id, 'measurement', 0);
  });

  it('assigns and clears staff; rejects missing, empty, inactive and foreign staff', async () => {
    const row = await fixture();
    for (const body of [{}, { staffId: '' }, { staffId: inactiveStaffId }, { staffId: foreignStaffId }, { staffId: randomUUID() }]) expect((await patch(row.id, 'staff', body)).status).toBe(400);
    expect((await patch(row.id, 'staff', { staffId: null })).body.data.staffId).toBeNull();
    expect(await prisma.auditLog.findMany({ where: { tenantId, entityId: row.id } })).toEqual([
      expect.objectContaining({ action: 'TAILORING_STAFF_UNASSIGNED', userId, entity: 'TailoringOrder' }),
    ]);
    expect((await patch(row.id, 'staff', { staffId })).body.data.staffId).toBe(staffId);
    const audits = await prisma.auditLog.findMany({ where: { tenantId, entityId: row.id } });
    expect(audits).toHaveLength(2);
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'TAILORING_STAFF_UNASSIGNED', userId, entity: 'TailoringOrder' }),
      expect.objectContaining({ action: 'TAILORING_STAFF_ASSIGNED', userId, entity: 'TailoringOrder' }),
    ]));
    await synchronized(row.id, 'received', 0);
  });

  it.each(['pass', 'stitching', 'finishing'])('QC %s synchronizes without completing', async result => {
    const row = await fixture('quality_check');
    expect((await qc(row.id, result === 'pass' ? { result } : { result: 'rework', returnTo: result })).status).toBe(200);
    await synchronized(row.id, result === 'pass' ? 'ready' : result);
    if (result === 'pass') {
      expect((await patch(row.id, 'status', { status: 'delivered' })).status).toBe(200);
      await synchronized(row.id, 'delivered', 2);
    }
  });

  it.each(['pass', 'stitching', 'finishing'])('QC %s with null garment leaves other garments untouched', async result => {
    const unrelated = await fixture('cutting');
    const row = await fixture('quality_check', false);
    expect((await qc(row.id, result === 'pass' ? { result } : { result: 'rework', returnTo: result })).status).toBe(200);
    await synchronized(row.id, result === 'pass' ? 'ready' : result);
    await synchronized(unrelated.id, 'cutting', 0);
  });

  it('status and confirmation work with no garment', async () => {
    const row = await fixture('received', false);
    expect((await patch(row.id, 'confirm', {})).status).toBe(200);
    expect((await patch(row.id, 'status', { status: 'measurement' })).status).toBe(200);
    await synchronized(row.id, 'measurement', 2);
  });

  it('rejects QC outside quality_check and malformed rework', async () => {
    const row = await fixture('quality_check');
    for (const body of [{ result: 'rework' }, { result: 'rework', returnTo: 'cutting' }, { result: 'bad' }]) expect((await qc(row.id, body)).status).toBe(400);
    await synchronized(row.id, 'quality_check', 0);
    const other = await fixture('finishing');
    expect((await qc(other.id, { result: 'pass' })).status).toBe(409);
    await synchronized(other.id, 'finishing', 0);
  });

  it('enforces authentication, permissions, and tenant isolation on all four routes', async () => {
    const row = await fixture('quality_check');
    // A valid foreign tenant row must remain invisible to this token.
    await prisma.tailoringOrder.update({ where: { id: row.id }, data: { tenantId: foreignTenantId } });
    for (const endpoint of ['status', 'confirm', 'staff', 'qc']) {
      const body = endpoint === 'status' ? { status: 'ready' } : endpoint === 'staff' ? { staffId } : endpoint === 'qc' ? { result: 'pass' } : {};
      const call = () => endpoint === 'qc' ? request(app).post(`/api/v1/tailoring/orders/${row.id}/${endpoint}`) : request(app).patch(`/api/v1/tailoring/orders/${row.id}/${endpoint}`);
      expect((await call().send(body)).status).toBe(401);
      expect((await call().set('Authorization', `Bearer ${deniedToken}`).send(body)).status).toBe(403);
      expect((await call().set('Authorization', `Bearer ${token}`).send(body)).status).toBe(404);
    }
    expect(await prisma.orderStatusHistory.count({ where: { orderId: row.orderId } })).toBe(0);
  });

  it('rolls back every write when linked garment cannot be updated in this tenant', async () => {
    const row = await fixture('quality_check');
    await prisma.garment.update({ where: { id: row.garmentId! }, data: { tenantId: foreignTenantId } });
    expect((await qc(row.id, { result: 'pass' })).status).toBe(500);
    await synchronized(row.id, 'quality_check', 0);
  });

  it('serializes competing transitions and records only one history entry', async () => {
    const row = await fixture('ready');
    const responses = await Promise.all([
      patch(row.id, 'status', { status: 'delivered' }),
      patch(row.id, 'status', { status: 'cancelled' }),
    ]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = responses.find(r => r.status === 200)!.body.data.status;
    await synchronized(row.id, winner);
  });
});

import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../app';
import prisma from '../lib/prisma';

describe('A4 measurement snapshots and staff onboarding (real serviceos_test)', () => {
  let tenantId: string;
  let foreignTenantId: string;
  let userId: string;
  let customerId: string;
  let otherCustomerId: string;
  let templateId: string;
  let readerRoleId: string;
  let foreignRoleId: string;
  let elevatedRoleId: string;
  let token: string;
  let deniedToken: string;
  const users: string[] = [];
  const password = 'Local-Test-Strong!42';

  beforeAll(async () => {
    const db = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()::text AS current_database`;
    expect(db[0].current_database).toBe('serviceos_test');
    tenantId = (await prisma.tenant.create({ data: { name: 'A4 tenant', slug: `a4-${randomUUID()}`, businessType: 'tailoring' } })).id;
    foreignTenantId = (await prisma.tenant.create({ data: { name: 'Other A4 tenant', slug: `other-a4-${randomUUID()}` } })).id;
    userId = (await prisma.user.create({ data: { name: 'A4 owner', email: `${randomUUID()}@a4.invalid`, passwordHash: 'unused' } })).id;
    users.push(userId);
    const role = await prisma.role.create({ data: { tenantId, name: 'A4 admin' } });
    readerRoleId = (await prisma.role.create({ data: { tenantId, name: 'Reader' } })).id;
    foreignRoleId = (await prisma.role.create({ data: { tenantId: foreignTenantId, name: 'Foreign role' } })).id;
    elevatedRoleId = (await prisma.role.create({ data: { tenantId, name: 'Higher privilege' } })).id;
    for (const name of ['tailoring.read', 'tailoring.update', 'staff.create', 'settings.manage', 'a4.extra']) {
      const permission = await prisma.permission.upsert({ where: { name }, create: { name }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: name === 'a4.extra' ? elevatedRoleId : role.id, permissionId: permission.id } });
      if (name === 'tailoring.read') await prisma.rolePermission.create({ data: { roleId: readerRoleId, permissionId: permission.id } });
    }
    await prisma.tenantUser.create({ data: { tenantId, userId, roleId: role.id } });
    token = jwt.sign({ userId, tenantId }, process.env.JWT_SECRET!);
    const denied = await prisma.user.create({ data: { name: 'Read only', email: `${randomUUID()}@a4.invalid`, passwordHash: 'unused' } });
    users.push(denied.id);
    await prisma.tenantUser.create({ data: { tenantId, userId: denied.id, roleId: readerRoleId } });
    deniedToken = jwt.sign({ userId: denied.id, tenantId }, process.env.JWT_SECRET!);
    customerId = (await prisma.customer.create({ data: { tenantId, name: 'Customer', phone: 'test' } })).id;
    otherCustomerId = (await prisma.customer.create({ data: { tenantId, name: 'Other customer', phone: 'other' } })).id;
    templateId = (await prisma.measurementTemplate.create({ data: { tenantId, code: 'a4', name: 'A4 template', defaultUnit: 'cm', fields: { create: [
      { name: 'chest', label: 'Chest', required: true, section: 'Top', sortOrder: 10 },
      { name: 'waist', label: 'Waist', required: false, section: 'Bottom', sortOrder: 20 },
    ] } } })).id;
  });
  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    if (foreignTenantId) await prisma.tenant.delete({ where: { id: foreignTenantId } });
    if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });
  const auth = () => ({ Authorization: `Bearer ${token}` });
  async function fixture(createMeasurement = true) {
    const parent = await prisma.order.create({ data: { tenantId, customerId, orderNumber: `A4-${randomUUID()}`, status: 'confirmed' } });
    const garment = await prisma.garment.create({ data: { tenantId, customerId, name: 'A4 garment', measurementTemplateId: templateId } });
    const row = await prisma.tailoringOrder.create({ data: { tenantId, customerId, orderId: parent.id, garmentId: garment.id, status: 'confirmed' } });
    if (createMeasurement) {
      const response = await request(app).post(`/api/v1/tailoring/orders/${row.id}/measurements`).set(auth()).send({ fields: { chest: 40, waist: 36, custom: 12 } });
      expect(response.status).toBe(201);
    }
    return prisma.tailoringOrder.findUniqueOrThrow({ where: { id: row.id } });
  }
  const view = (id: string) => request(app).get(`/api/v1/tailoring/orders/${id}/measurement`).set(auth());
  const edit = (id: string, fields: object = { chest: 42, waist: 37, custom: 13 }) => request(app).patch(`/api/v1/tailoring/orders/${id}/measurement`).set(auth()).send({ fields });

  it('reads, edits and reloads the same measurement without changing template, unit, status or history', async () => {
    const row = await fixture();
    const response = await view(row.id);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ editable: true, status: 'measurement', measurement: { id: row.measurementId, templateId, unit: 'cm', fields: { chest: 40 } } });
    expect(response.body.data.fields.map((field: { name: string }) => field.name)).toEqual(['chest', 'waist']);
    const saved = await edit(row.id);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ id: row.measurementId, templateId, unit: 'cm', createdBy: userId, fields: { chest: 42, waist: 37, custom: 13 } });
    expect((await view(row.id)).body.data.measurement.fields).toEqual({ chest: 42, waist: 37, custom: 13 });
    expect(await prisma.measurement.count({ where: { garmentId: row.garmentId } })).toBe(1);
    expect((await prisma.tailoringOrder.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('measurement');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: row.orderId } })).status).toBe('measurement');
    expect(await prisma.orderStatusHistory.count({ where: { orderId: row.orderId } })).toBe(1);
    expect(await prisma.auditLog.findFirst({ where: { entityId: row.measurementId!, action: 'TAILORING_MEASUREMENT_UPDATED' } })).toMatchObject({ userId, tenantId });
  });

  it('uses the stored template rather than resolving changed garment mappings', async () => {
    const row = await fixture();
    const replacement = await prisma.measurementTemplate.create({ data: { tenantId, code: randomUUID(), name: 'Replacement', defaultUnit: 'inch', fields: { create: { name: 'different', label: 'Different', required: true } } } });
    await prisma.garment.update({ where: { id: row.garmentId! }, data: { measurementTemplateId: replacement.id } });
    expect((await edit(row.id)).status).toBe(200);
    expect((await view(row.id)).body.data.measurement).toMatchObject({ templateId, unit: 'cm' });
  });

  it.each(['confirmed', 'cutting', 'stitching', 'finishing', 'quality_check', 'ready', 'delivered', 'cancelled'])('locks edits in %s but allows viewing', async status => {
    const row = await fixture();
    await prisma.tailoringOrder.update({ where: { id: row.id }, data: { status } });
    const response = await edit(row.id);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MEASUREMENT_LOCKED');
    const loaded = await view(row.id);
    expect(loaded.status).toBe(200);
    expect(loaded.body.data.editable).toBe(false);
    expect(loaded.body.data.measurement.fields.chest).toBe(40);
  });

  it('rejects missing measurements and hides cross-tenant orders', async () => {
    const row = await fixture(false);
    expect((await view(row.id)).body.error.code).toBe('MEASUREMENT_REQUIRED');
    expect((await edit(row.id)).status).toBe(409);
    await prisma.tailoringOrder.update({ where: { id: row.id }, data: { tenantId: foreignTenantId } });
    expect((await view(row.id)).status).toBe(404);
    expect((await edit(row.id)).status).toBe(404);
  });

  it.each(['tenant', 'customer', 'garment', 'shared'])('rejects %s measurement linkage mismatch', async kind => {
    const row = await fixture();
    if (kind === 'shared') {
      const other = await fixture(false);
      await prisma.tailoringOrder.update({ where: { id: other.id }, data: { measurementId: row.measurementId } });
    } else {
      await prisma.measurement.update({ where: { id: row.measurementId! }, data: kind === 'tenant' ? { tenantId: foreignTenantId } : kind === 'customer' ? { customerId: otherCustomerId } : { garmentId: null } });
    }
    const response = await edit(row.id);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_MEASUREMENT');
    expect((await view(row.id)).status).toBe(409);
  });

  it.each([{ chest: '42' }, { chest: null }, { chest: 40, custom: 'bad' }, {}])('rejects invalid fields %j without modifying snapshot', async fields => {
    const row = await fixture();
    const response = await edit(row.id, fields);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('chest' in fields ? 'INVALID_MEASUREMENT_VALUE' : 'MEASUREMENT_FIELD_REQUIRED');
    expect((await view(row.id)).body.data.measurement.fields.chest).toBe(40);
  });

  it('serializes editing with Start Cutting and rejects later edits', async () => {
    const row = await fixture();
    const staff = await prisma.staff.create({ data: { tenantId, userId, jobTitle: 'Tailor' } });
    await prisma.tailoringOrder.update({ where: { id: row.id }, data: { staffId: staff.id } });
    const [editResponse, transition] = await Promise.all([
      edit(row.id),
      request(app).patch(`/api/v1/tailoring/orders/${row.id}/status`).set(auth()).send({ status: 'cutting' }),
    ]);
    expect([200, 409]).toContain(editResponse.status);
    expect(transition.status).toBe(200);
    expect((await edit(row.id)).body.error.code).toBe('MEASUREMENT_LOCKED');
    expect((await view(row.id)).body.data).toMatchObject({ editable: false, status: 'cutting' });
  });

  it('requires read/update permissions and rejects template/unit changes', async () => {
    const row = await fixture();
    expect((await request(app).get(`/api/v1/tailoring/orders/${row.id}/measurement`)).status).toBe(401);
    expect((await request(app).patch(`/api/v1/tailoring/orders/${row.id}/measurement`).set('Authorization', `Bearer ${deniedToken}`).send({ fields: { chest: 42 } })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/tailoring/orders/${row.id}/measurement`).set(auth()).send({ fields: { chest: 42 }, templateId, unit: 'inch' })).status).toBe(400);
  });

  const onboard = (body: object, bearer?: string) => request(app).post('/api/v1/staff/onboard').set('Authorization', `Bearer ${bearer ?? token}`).send(body);
  const account = () => ({ name: 'New Staff', email: `${randomUUID()}@a4.invalid`, password, roleId: readerRoleId, jobTitle: 'Tailor' });

  it('atomically creates a login, tenant membership and staff without leaking credentials', async () => {
    const body = account();
    const response = await onboard(body);
    expect(response.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: body.email } });
    users.push(user.id);
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(password);
    expect(JSON.stringify(response.body)).not.toContain(user.passwordHash);
    expect(response.body.data).toMatchObject({ userId: user.id, tenantId, status: 'active', user: { name: body.name, email: body.email } });
    expect(await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } })).toMatchObject({ roleId: readerRoleId, status: 'active' });
    expect(await prisma.auditLog.findFirst({ where: { entityId: response.body.data.id, action: 'STAFF_ONBOARDED' } })).not.toBeNull();
    expect((await request(app).post('/api/v1/auth/login').send({ email: body.email, password })).status).toBe(200);
  });

  it('rejects existing email without changing the user or leaving staff/membership records', async () => {
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email;
    const before = await prisma.staff.count({ where: { tenantId } });
    const response = await onboard({ ...account(), email: email.toUpperCase() });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_IN_USE');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash).toBe('unused');
    expect(await prisma.staff.count({ where: { tenantId } })).toBe(before);
  });

  it.each(['foreign', 'elevated'])('rejects %s role without creating a user', async kind => {
    const body = { ...account(), roleId: kind === 'foreign' ? foreignRoleId : elevatedRoleId };
    const response = await onboard(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_ROLE');
    expect(await prisma.user.findUnique({ where: { email: body.email } })).toBeNull();
  });

  it('lists only assignable tenant roles and enforces administrator permissions', async () => {
    const response = await request(app).get('/api/v1/staff/onboarding-roles').set(auth());
    expect(response.status).toBe(200);
    const ids = response.body.data.map((role: { id: string }) => role.id);
    expect(ids).toContain(readerRoleId);
    expect(ids).not.toContain(foreignRoleId);
    expect(ids).not.toContain(elevatedRoleId);
    expect((await onboard(account(), deniedToken)).status).toBe(403);
    expect((await request(app).post('/api/v1/staff/onboard').send(account())).status).toBe(401);
  });

  it.each(['short', 'é'.repeat(40)])('rejects weak or bcrypt-truncated passwords', async password => {
    const response = await onboard({ ...account(), password });
    expect(response.status).toBe(400);
  });
});

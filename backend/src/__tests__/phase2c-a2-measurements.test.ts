import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import { validateMeasurementFields } from '../services/measurementTemplate';

// JSON cannot encode NaN/Infinity; exercise their validation directly as well.
it.each([NaN, Infinity, -Infinity])('rejects non-finite numeric value %s', value => {
  expect(() => validateMeasurementFields({ chest: value }, [{ name: 'chest', required: true }]))
    .toThrow(expect.objectContaining({ status: 400, code: 'INVALID_MEASUREMENT_VALUE' }));
});

describe('Phase 2C-A2.2 real PostgreSQL order-aware measurements', () => {
  let tenantId: string;
  let foreignTenantId: string;
  let userId: string;
  let customerId: string;
  let otherCustomerId: string;
  let templateId: string;
  let secondTemplateId: string;
  let inactiveTemplateId: string;
  let foreignTemplateId: string;
  let token: string;
  let readToken: string;
  let foreignToken: string;

  beforeAll(async () => {
    const db = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
    expect(db[0].current_database).toBe('serviceos_test');
    const suffix = randomUUID();
    tenantId = (await prisma.tenant.create({ data: { name: 'A2.2 tests', slug: `measurements-${suffix}`, businessType: 'tailoring' } })).id;
    foreignTenantId = (await prisma.tenant.create({ data: { name: 'Other tenant', slug: `other-measurements-${suffix}` } })).id;
    userId = (await prisma.user.create({ data: { name: 'Measurement operator', email: `${suffix}@measurements.invalid`, passwordHash: 'unused' } })).id;
    const role = await prisma.role.create({ data: { tenantId, name: 'Operator' } });
    const readRole = await prisma.role.create({ data: { tenantId: foreignTenantId, name: 'Reader' } });
    for (const name of ['tailoring.read', 'tailoring.create', 'tailoring.update']) {
      const permission = await prisma.permission.upsert({ where: { name }, update: {}, create: { name } });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      if (name === 'tailoring.read') await prisma.rolePermission.create({ data: { roleId: readRole.id, permissionId: permission.id } });
    }
    await prisma.tenantUser.create({ data: { tenantId, userId, roleId: role.id } });
    await prisma.tenantUser.create({ data: { tenantId: foreignTenantId, userId, roleId: readRole.id } });
    token = jwt.sign({ userId, tenantId }, process.env.JWT_SECRET!);
    foreignToken = jwt.sign({ userId, tenantId: foreignTenantId }, process.env.JWT_SECRET!);
    readToken = foreignToken;
    customerId = (await prisma.customer.create({ data: { tenantId, name: 'Customer', phone: suffix } })).id;
    otherCustomerId = (await prisma.customer.create({ data: { tenantId, name: 'Other customer', phone: `other-${suffix}` } })).id;
    async function template(owner: string, code: string, status = 'active') {
      return (await prisma.measurementTemplate.create({ data: {
        tenantId: owner, name: code, code, category: 'Suit', defaultUnit: 'cm', status,
        fields: { create: [
          { name: 'waist', label: 'Waist', sortOrder: 20, required: true },
          { name: 'sleeve', label: 'Sleeve', sortOrder: 30, required: false },
          { name: 'chest', label: 'Chest', sortOrder: 10, required: true },
        ] },
      } })).id;
    }
    templateId = await template(tenantId, 'suit');
    secondTemplateId = await template(tenantId, 'kurta');
    inactiveTemplateId = await template(tenantId, 'inactive', 'inactive');
    foreignTemplateId = await template(foreignTenantId, 'foreign');
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    if (foreignTenantId) await prisma.tenant.delete({ where: { id: foreignTenantId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function fixture(options: { garment?: boolean; mapping?: string | null; services?: Array<string | null>; status?: string } = {}) {
    const status = options.status ?? 'confirmed';
    const parent = await prisma.order.create({ data: { tenantId, customerId, orderNumber: `MT-${randomUUID()}`, status } });
    const garment = options.garment === false ? null : await prisma.garment.create({ data: {
      tenantId, customerId, orderId: parent.id, name: 'Suit',
      measurementTemplateId: options.mapping === undefined ? templateId : options.mapping,
    } });
    for (const measurementTemplateId of options.services ?? []) {
      const service = await prisma.service.create({ data: { tenantId, name: 'Tailoring', price: 100, measurementTemplateId } });
      await prisma.orderItem.create({ data: { tenantId, orderId: parent.id, serviceId: service.id, quantity: 1, unitPrice: 100, total: 100 } });
    }
    return prisma.tailoringOrder.create({ data: { tenantId, customerId, orderId: parent.id, garmentId: garment?.id, status } });
  }
  function get(id: string, fallbackTemplateId?: string, auth = token) {
    return request(app).get(`/api/v1/tailoring/orders/${id}/measurement-template`)
      .set('Authorization', `Bearer ${auth}`).query(fallbackTemplateId === undefined ? {} : { fallbackTemplateId });
  }
  function post(id: string, body: object = { fields: { chest: 40, waist: 36 } }, auth = token) {
    return request(app).post(`/api/v1/tailoring/orders/${id}/measurements`).set('Authorization', `Bearer ${auth}`).send(body);
  }
  function error(response: request.Response, status: number, code: string) {
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
  }
  async function unchanged(row: Awaited<ReturnType<typeof fixture>>) {
    const stored = await prisma.tailoringOrder.findUniqueOrThrow({ where: { id: row.id }, include: { order: { include: { statusHistory: true } } } });
    expect(stored.status).toBe(row.status);
    expect(stored.measurementId).toBe(row.measurementId);
    expect(stored.order.status).toBe(row.status);
    expect(stored.order.statusHistory).toHaveLength(0);
    if (row.garmentId) {
      expect(await prisma.measurement.count({ where: { garmentId: row.garmentId } })).toBe(0);
      expect((await prisma.garment.findUniqueOrThrow({ where: { id: row.garmentId } })).status).toBe('pending');
    }
  }

  it('garment template wins over service templates and explicit fallback; fields are sorted', async () => {
    const row = await fixture({ services: [secondTemplateId] });
    const response = await get(row.id, secondTemplateId);
    expect(response.status).toBe(200);
    expect(response.body.data.source).toBe('garment');
    expect(response.body.data.template).toEqual({ id: templateId, name: 'suit', code: 'suit', category: 'Suit', defaultUnit: 'cm', status: 'active' });
    expect(response.body.data.fields.map((f: { name: string }) => f.name)).toEqual(['chest', 'waist', 'sleeve']);
  });
  it('single service template works through parent Order.items', async () => {
    const row = await fixture({ mapping: null, services: [null, templateId] });
    const response = await get(row.id, secondTemplateId);
    expect(response.status).toBe(200);
    expect(response.body.data.source).toBe('service');
    expect(response.body.data.template.id).toBe(templateId);
  });
  it('duplicate service items with the same template deduplicate', async () => {
    const row = await fixture({ mapping: null, services: [templateId, templateId] });
    const response = await get(row.id);
    expect(response.status).toBe(200);
    expect(response.body.data.source).toBe('service');
  });
  it('multiple service templates are ambiguous without fallback', async () => {
    const row = await fixture({ mapping: null, services: [templateId, secondTemplateId] });
    error(await get(row.id), 409, 'AMBIGUOUS_MEASUREMENT_TEMPLATE');
    error(await post(row.id), 409, 'AMBIGUOUS_MEASUREMENT_TEMPLATE');
    await unchanged(row);
  });
  it('valid explicit fallback resolves service ambiguity for both endpoints', async () => {
    const row = await fixture({ mapping: null, services: [templateId, secondTemplateId] });
    const response = await get(row.id, secondTemplateId);
    expect(response.status).toBe(200);
    expect(response.body.data.source).toBe('fallback');
    expect(response.body.data.template.id).toBe(secondTemplateId);
    const created = await post(row.id, { templateId: secondTemplateId, fields: { chest: 40, waist: 36 } });
    expect(created.status).toBe(201);
    expect(created.body.data.templateId).toBe(secondTemplateId);
  });
  it('fallback works with no mapping', async () => {
    const row = await fixture({ mapping: null, services: [null] });
    const response = await get(row.id, templateId);
    expect(response.status).toBe(200);
    expect(response.body.data.source).toBe('fallback');
    expect((await post(row.id, { templateId, fields: { chest: 40, waist: 36 } })).status).toBe(201);
  });
  it('no mapping and no fallback is rejected by both endpoints', async () => {
    const row = await fixture({ mapping: null });
    error(await get(row.id), 409, 'MEASUREMENT_TEMPLATE_REQUIRED');
    error(await post(row.id), 409, 'MEASUREMENT_TEMPLATE_REQUIRED');
    await unchanged(row);
  });
  it.each(['inactive', 'foreign'])('rejects %s garment template without falling back', async kind => {
    const row = await fixture({ mapping: kind === 'inactive' ? inactiveTemplateId : foreignTemplateId, services: [templateId] });
    error(await get(row.id, templateId), 409, 'INVALID_MEASUREMENT_TEMPLATE');
    error(await post(row.id, { templateId, fields: { chest: 40, waist: 36 } }), 409, 'INVALID_MEASUREMENT_TEMPLATE');
    await unchanged(row);
  });
  it.each(['inactive', 'foreign'])('rejects %s service template without falling back', async kind => {
    const row = await fixture({ mapping: null, services: [kind === 'inactive' ? inactiveTemplateId : foreignTemplateId] });
    error(await get(row.id, templateId), 409, 'INVALID_MEASUREMENT_TEMPLATE');
  });
  it.each(['inactive', 'foreign', 'missing'])('rejects %s fallback', async kind => {
    const row = await fixture({ mapping: null });
    const id = kind === 'inactive' ? inactiveTemplateId : kind === 'foreign' ? foreignTemplateId : randomUUID();
    error(await get(row.id, id), 409, 'INVALID_MEASUREMENT_TEMPLATE');
    error(await post(row.id, { templateId: id, fields: { chest: 40, waist: 36 } }), 409, 'INVALID_MEASUREMENT_TEMPLATE');
    await unchanged(row);
  });
  it('tenant-scopes orders on both endpoints', async () => {
    const row = await fixture();
    await prisma.tailoringOrder.update({ where: { id: row.id }, data: { tenantId: foreignTenantId } });
    error(await get(row.id), 404, 'NOT_FOUND');
    error(await post(row.id), 404, 'NOT_FOUND');
    await unchanged(row);
  });
  it('unknown orders return NOT_FOUND', async () => {
    error(await get(randomUUID()), 404, 'NOT_FOUND');
    error(await post(randomUUID()), 404, 'NOT_FOUND');
  });
  it('GET accepts read permission without requiring workflow update permission', async () => {
    // Missing order is reached after successful read authorization.
    error(await get(randomUUID(), undefined, readToken), 404, 'NOT_FOUND');
    error(await post(randomUUID(), { fields: {} }, readToken), 403, 'FORBIDDEN');
  });
  it('requires authentication for both endpoints', async () => {
    const id = randomUUID();
    expect((await request(app).get(`/api/v1/tailoring/orders/${id}/measurement-template`)).status).toBe(401);
    expect((await request(app).post(`/api/v1/tailoring/orders/${id}/measurements`).send({ fields: {} })).status).toBe(401);
  });
  it('creates a snapshot and atomically synchronizes all records and audit', async () => {
    const row = await fixture({ services: [secondTemplateId] });
    // Production needs parent items/services and their totals, not a direct service relation.
    const listing = await request(app).get('/api/v1/tailoring/orders').set('Authorization', `Bearer ${token}`);
    expect(listing.status).toBe(200);
    const listed = listing.body.data.find((item: { id: string }) => item.id === row.id);
    expect(listed.order.items).toHaveLength(1);
    expect(listed.order.items[0].service.name).toBe('Tailoring');
    expect(Number(listed.order.items[0].total)).toBe(100);
    const fields = { chest: 40, waist: 36, custom: 0 };
    const response = await post(row.id, { templateId: secondTemplateId, fields });
    expect(response.status).toBe(201);
    const measurement = await prisma.measurement.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(measurement).toMatchObject({ tenantId, customerId, garmentId: row.garmentId, createdBy: userId, templateId, unit: 'cm', fields });
    const updated = await prisma.tailoringOrder.findUniqueOrThrow({ where: { id: row.id }, include: { garment: true, order: { include: { statusHistory: true } } } });
    expect(updated.measurementId).toBe(measurement.id);
    expect(updated.status).toBe('measurement');
    expect(updated.order.status).toBe('measurement');
    expect(updated.garment!.status).toBe('measured');
    expect(updated.order.completedDate).toBeNull();
    expect(updated.order.statusHistory).toEqual([expect.objectContaining({ orderId: row.orderId, tenantId, status: 'measurement', changedBy: userId })]);
    expect(row.id).not.toBe(row.orderId);
    expect(await prisma.auditLog.findMany({ where: { tenantId, entityId: measurement.id } })).toEqual([
      expect.objectContaining({ action: 'TAILORING_MEASUREMENT_CREATED', userId }),
    ]);
  });
  it.each(['received', 'measurement', 'delivered', 'cancelled'])('rejects status %s', async status => {
    const row = await fixture({ status });
    error(await post(row.id), 409, 'INVALID_STATUS_TRANSITION');
    await unchanged(row);
  });
  it('requires a garment and does not update unrelated garments', async () => {
    const other = await fixture();
    const row = await fixture({ garment: false });
    error(await post(row.id), 409, 'GARMENT_REQUIRED');
    await unchanged(row);
    await unchanged(other);
  });
  it('rejects an existing measurement on a confirmed order', async () => {
    const row = await fixture();
    const measurement = await prisma.measurement.create({ data: { tenantId, customerId, createdBy: userId, fields: {} } });
    await prisma.tailoringOrder.update({ where: { id: row.id }, data: { measurementId: measurement.id } });
    error(await post(row.id), 409, 'MEASUREMENT_ALREADY_EXISTS');
    await unchanged({ ...row, measurementId: measurement.id });
  });
  it.each(['customer', 'tenant'])('rejects garment %s mismatch', async kind => {
    const row = await fixture();
    await prisma.garment.update({ where: { id: row.garmentId! }, data: kind === 'customer' ? { customerId: otherCustomerId } : { tenantId: foreignTenantId } });
    error(await post(row.id), 409, 'INVALID_GARMENT');
    await unchanged(row);
  });
  it('rejects missing required fields', async () => {
    const row = await fixture();
    error(await post(row.id, { fields: { chest: 40 } }), 400, 'MEASUREMENT_FIELD_REQUIRED');
    await unchanged(row);
  });
  it.each(['invalid', '40', null, true, {}, []])('rejects invalid numeric value %j', async value => {
    const row = await fixture();
    error(await post(row.id, { fields: { chest: value, waist: 36 } }), 400, 'INVALID_MEASUREMENT_VALUE');
    await unchanged(row);
  });
  it('rejects invalid custom numeric values', async () => {
    const row = await fixture();
    error(await post(row.id, { fields: { chest: 40, waist: 36, custom: 'bad' } }), 400, 'INVALID_MEASUREMENT_VALUE');
    await unchanged(row);
  });
  it('serializes simultaneous submissions, creating only one measurement and history entry', async () => {
    const row = await fixture();
    const responses = await Promise.all([post(row.id), post(row.id)]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.measurement.count({ where: { garmentId: row.garmentId } })).toBe(1);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: row.orderId } })).toBe(1);
  });
  it('keeps legacy GET and POST measurements operational', async () => {
    const response = await request(app).post('/api/v1/tailoring/measurements').set('Authorization', `Bearer ${token}`).send({ customerId, fields: { legacy: 'still supported' } });
    expect(response.status).toBe(201);
    expect(response.body.data.templateId).toBeNull();
    const list = await request(app).get('/api/v1/tailoring/measurements').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: response.body.data.id })]));
  });
});

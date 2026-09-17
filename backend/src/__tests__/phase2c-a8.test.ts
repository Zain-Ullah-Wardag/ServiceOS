import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import app from '../app';
import prisma from '../lib/prisma';

/**
 * A8: returning-customer measurement history/reuse and the Production
 * payment-status summary. Runs against serviceos_test only.
 */

/** Normalize a backend decimal to a canonical string for exact comparison. */
const d = (x: unknown) => new Prisma.Decimal(String(x)).toString();

describe('A8 measurement history and production payment status (real serviceos_test)', () => {
  let tenantId: string;
  let foreignTenantId: string;
  let userId: string;
  let foreignUserId: string;
  let noReadUserId: string;
  let token: string;
  let noReadToken: string;
  let customerAId: string;
  let customerBId: string;
  let foreignCustomerId: string;
  let templateSkId: string;
  let templateSuitId: string;
  let templateForeignId: string;
  const users: string[] = [];

  beforeAll(async () => {
    const db = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
    expect(db[0].current_database).toBe('serviceos_test');

    const suffix = randomUUID();
    tenantId = (await prisma.tenant.create({ data: { name: 'A8 tenant', slug: `a8-${suffix}`, businessType: 'tailoring' } })).id;
    foreignTenantId = (await prisma.tenant.create({ data: { name: 'Other A8 tenant', slug: `other-a8-${suffix}` } })).id;

    const owner = await prisma.user.create({ data: { name: 'A8 owner', email: `a8-owner-${suffix}@a8.invalid`, passwordHash: 'unused' } });
    users.push(owner.id);
    userId = owner.id;
    const ownerRole = await prisma.role.create({ data: { tenantId, name: 'A8 owner role' } });
    for (const name of ['tailoring.read', 'tailoring.update']) {
      const permission = await prisma.permission.upsert({ where: { name }, create: { name }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: ownerRole.id, permissionId: permission.id } });
    }
    await prisma.tenantUser.create({ data: { tenantId, userId, roleId: ownerRole.id } });
    token = jwt.sign({ userId, tenantId }, process.env.JWT_SECRET!);

    const noRead = await prisma.user.create({ data: { name: 'A8 no-read', email: `a8-noread-${suffix}@a8.invalid`, passwordHash: 'unused' } });
    users.push(noRead.id);
    noReadUserId = noRead.id;
    const noReadRole = await prisma.role.create({ data: { tenantId, name: 'A8 no-read role' } });
    const other = await prisma.permission.upsert({ where: { name: 'analytics.read' }, create: { name: 'analytics.read' }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: noReadRole.id, permissionId: other.id } });
    await prisma.tenantUser.create({ data: { tenantId, userId: noReadUserId, roleId: noReadRole.id } });
    noReadToken = jwt.sign({ userId: noReadUserId, tenantId }, process.env.JWT_SECRET!);

    const foreign = await prisma.user.create({ data: { name: 'A8 foreign', email: `a8-foreign-${suffix}@a8.invalid`, passwordHash: 'unused' } });
    users.push(foreign.id);
    foreignUserId = foreign.id;

    customerAId = (await prisma.customer.create({ data: { tenantId, name: 'A8 customer A', phone: 'a8-phone-a' } })).id;
    customerBId = (await prisma.customer.create({ data: { tenantId, name: 'A8 customer B', phone: 'a8-phone-b' } })).id;
    foreignCustomerId = (await prisma.customer.create({ data: { tenantId: foreignTenantId, name: 'A8 foreign customer', phone: 'a8-phone-f' } })).id;

    const mkTemplate = async (tid: string, code: string, unit: string, fields: string[]) => {
      const template = await prisma.measurementTemplate.create({ data: { tenantId: tid, name: code, code, defaultUnit: unit } });
      for (const [index, name] of fields.entries()) {
        await prisma.measurementTemplateField.create({
          data: { templateId: template.id, name, label: name, unit, required: true, sortOrder: index + 1 },
        });
      }
      return template;
    };
    templateSkId = (await mkTemplate(tenantId, 'sk-template', 'inch', ['chest', 'waist', 'length', 'sleeve'])).id;
    templateSuitId = (await mkTemplate(tenantId, 'suit-template', 'inch', ['jacket', 'torso', 'shoulder'])).id;
    templateForeignId = (await mkTemplate(foreignTenantId, 'sk-template', 'inch', ['chest', 'waist'])).id;
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    if (foreignTenantId) await prisma.tenant.delete({ where: { id: foreignTenantId } });
    if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  /* ------------------------------------------------------------
     Fixtures
  ------------------------------------------------------------ */

  async function makeOrder(opts: {
    customerId: string;
    templateId: string;
    orderNumber: string;
    status?: string;
  }) {
    const order = await prisma.order.create({
      data: { tenantId, customerId: opts.customerId, orderNumber: opts.orderNumber },
    });
    const service = await prisma.service.create({
      data: { tenantId, name: `A8 service ${opts.orderNumber}`, price: 1000, measurementTemplateId: opts.templateId },
    });
    await prisma.orderItem.create({
      data: { tenantId, orderId: order.id, serviceId: service.id, quantity: 1, unitPrice: 1000, total: 1000 },
    });
    const garment = await prisma.garment.create({
      data: {
        tenantId, customerId: opts.customerId, name: `A8 garment ${opts.orderNumber}`,
        category: 'A8', measurementTemplateId: opts.templateId, orderId: order.id,
      },
    });
    const tailoringOrder = await prisma.tailoringOrder.create({
      data: {
        tenantId, customerId: opts.customerId, orderId: order.id, garmentId: garment.id,
        status: opts.status ?? 'confirmed',
      },
    });
    return { order, garment, tailoringOrder };
  }

  const history = (tailoringOrderId: string, bearer?: string) =>
    request(app)
      .get(`/api/v1/tailoring/orders/${tailoringOrderId}/measurement-history`)
      .set('Authorization', `Bearer ${bearer ?? token}`);

  const saveMeasurement = (tailoringOrderId: string, fields: Record<string, number>, bearer?: string) =>
    request(app)
      .post(`/api/v1/tailoring/orders/${tailoringOrderId}/measurements`)
      .set('Authorization', `Bearer ${bearer ?? token}`)
      .send({ fields });

  const makePaymentOrder = async (orderNumber: string) => {
    const order = await prisma.order.create({ data: { tenantId, customerId: customerAId, orderNumber } });
    for (const total of [2500, 1500]) {
      const service = await prisma.service.create({ data: { tenantId, name: `A8 pay service ${orderNumber}`, price: total } });
      await prisma.orderItem.create({
        data: { tenantId, orderId: order.id, serviceId: service.id, quantity: 1, unitPrice: total, total },
      });
    }
    const tailoringOrder = await prisma.tailoringOrder.create({
      data: { tenantId, customerId: customerAId, orderId: order.id, status: 'received' },
    });
    return { order, tailoringOrder };
  };

  const makeInvoice = (data: {
    orderId: string;
    tenantId?: string;
    total?: number;
    paidAmount?: number;
    balance?: number;
    status?: string;
  }) =>
    prisma.invoice.create({
      data: {
        tenantId: data.tenantId ?? tenantId,
        customerId: customerAId,
        orderId: data.orderId,
        invoiceNumber: `INV-A8-${randomUUID().slice(0, 8)}`,
        subtotal: 4000,
        discount: 0,
        tax: 0,
        total: data.total ?? 4000,
        paidAmount: data.paidAmount ?? 0,
        balance: data.balance ?? 4000,
        status: data.status ?? 'issued',
        issuedAt: new Date(),
      },
    });

  const listOrders = () =>
    request(app).get('/api/v1/tailoring/orders').set('Authorization', `Bearer ${token}`);

  /* ------------------------------------------------------------
     A8.1 MEASUREMENT HISTORY
  ------------------------------------------------------------ */

  it('returns 404 for an unknown tailoring order', async () => {
    const response = await history(randomUUID());
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a cross-tenant order', async () => {
    const foreignOrder = await prisma.order.create({ data: { tenantId: foreignTenantId, customerId: foreignCustomerId, orderNumber: `A8-FOREIGN-${randomUUID()}` } });
    const foreignTailoring = await prisma.tailoringOrder.create({
      data: { tenantId: foreignTenantId, customerId: foreignCustomerId, orderId: foreignOrder.id, status: 'received' },
    });
    const response = await history(foreignTailoring.id);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('requires tailoring.read permission', async () => {
    const { tailoringOrder } = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-PERM-${randomUUID()}` });
    const response = await history(tailoringOrder.id, noReadToken);
    expect(response.status).toBe(403);
  });

  it('returns the prior compatible measurement for the same tenant/customer', async () => {
    const first = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-H1A-${randomUUID()}` });
    const saved = await saveMeasurement(first.tailoringOrder.id, { chest: 40, waist: 38, length: 42, sleeve: 24 });
    expect(saved.status).toBe(201);
    const measurementId = saved.body.data.id;

    const current = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-H1B-${randomUUID()}` });
    const response = await history(current.tailoringOrder.id);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    const entry = response.body.data[0];
    expect(entry.measurementId).toBe(measurementId);
    expect(entry.sourceTailoringOrderId).toBe(first.tailoringOrder.id);
    expect(entry.sourceOrderNumber).toBe(first.order.orderNumber);
    expect(entry.compatible).toBe(true);
    expect(entry.unit).toBe('inch');
    expect(entry.fields).toEqual({ chest: 40, waist: 38, length: 42, sleeve: 24 });
    expect(entry.garment).toMatchObject({ id: first.garment.id, name: expect.stringContaining('A8 garment') });
    expect(entry.template).toMatchObject({ id: templateSkId });
    expect(entry.createdAt).toBeTruthy();
  });

  it('excludes the current order own snapshot from its history', async () => {
    const order = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-EXCL-${randomUUID()}` });
    const saved = await saveMeasurement(order.tailoringOrder.id, { chest: 41, waist: 39, length: 43, sleeve: 25 });
    expect(saved.status).toBe(201);
    const response = await history(order.tailoringOrder.id);
    expect(response.status).toBe(200);
    expect(response.body.data.map((entry: any) => entry.measurementId)).not.toContain(saved.body.data.id);
  });

  it('orders history newest first', async () => {
    const older = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-OLD-${randomUUID()}` });
    const olderSaved = await saveMeasurement(older.tailoringOrder.id, { chest: 36, waist: 34, length: 40, sleeve: 22 });
    const olderId = olderSaved.body.data.id;
    const newer = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-NEW-${randomUUID()}` });
    const newerSaved = await saveMeasurement(newer.tailoringOrder.id, { chest: 37, waist: 35, length: 41, sleeve: 23 });
    const newerId = newerSaved.body.data.id;
    // Deterministic ordering regardless of clock resolution.
    await prisma.measurement.update({ where: { id: olderId }, data: { createdAt: new Date('2026-01-01T00:00:00Z') } });

    const view = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-VIEW-${randomUUID()}` });
    const response = await history(view.tailoringOrder.id);
    expect(response.status).toBe(200);
    const ids = response.body.data.map((entry: any) => entry.measurementId);
    expect(ids.indexOf(newerId)).toBeLessThan(ids.indexOf(olderId));
  });

  it('excludes another customer measurements', async () => {
    const otherCustomerOrder = await makeOrder({ customerId: customerBId, templateId: templateSkId, orderNumber: `A8-CB-${randomUUID()}` });
    await saveMeasurement(otherCustomerOrder.tailoringOrder.id, { chest: 44, waist: 42, length: 45, sleeve: 26 });

    const view = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-CBA-${randomUUID()}` });
    const response = await history(view.tailoringOrder.id);
    expect(response.status).toBe(200);
    expect(response.body.data.some((entry: any) => entry.garment?.name === `A8 garment ${otherCustomerOrder.order.orderNumber}`)).toBe(false);
  });

  it('excludes another tenant measurements', async () => {
    const foreignOrder = await prisma.order.create({ data: { tenantId: foreignTenantId, customerId: foreignCustomerId, orderNumber: `A8-FT-${randomUUID()}` } });
    const foreignGarment = await prisma.garment.create({
      data: { tenantId: foreignTenantId, customerId: foreignCustomerId, name: 'A8 foreign garment', measurementTemplateId: templateForeignId, orderId: foreignOrder.id },
    });
    const foreignTailoring = await prisma.tailoringOrder.create({
      data: { tenantId: foreignTenantId, customerId: foreignCustomerId, orderId: foreignOrder.id, garmentId: foreignGarment.id, status: 'measurement' },
    });
    const foreignMeasurement = await prisma.measurement.create({
      data: {
        tenantId: foreignTenantId, customerId: foreignCustomerId, garmentId: foreignGarment.id,
        createdBy: foreignUserId, templateId: templateForeignId, unit: 'inch', fields: { chest: 99, waist: 98 },
      },
    });
    await prisma.tailoringOrder.update({ where: { id: foreignTailoring.id }, data: { measurementId: foreignMeasurement.id } });

    const view = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-FTA-${randomUUID()}` });
    const response = await history(view.tailoringOrder.id);
    expect(response.status).toBe(200);
    expect(response.body.data.some((entry: any) => entry.garment?.name === 'A8 foreign garment')).toBe(false);
  });

  it('marks measurements from a different template as not reusable', async () => {
    const skOrder = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-INCOMP-SK-${randomUUID()}` });
    await saveMeasurement(skOrder.tailoringOrder.id, { chest: 40, waist: 38, length: 42, sleeve: 24 });

    const suitOrder = await makeOrder({ customerId: customerAId, templateId: templateSuitId, orderNumber: `A8-INCOMP-SUIT-${randomUUID()}` });
    const response = await history(suitOrder.tailoringOrder.id);
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    for (const entry of response.body.data) {
      expect(entry.compatible).toBe(false);
    }
  });

  it('history GET performs no writes', async () => {
    const order = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-NOOP-${randomUUID()}` });
    const before = {
      measurements: await prisma.measurement.count({ where: { tenantId } }),
      invoices: await prisma.invoice.count({ where: { tenantId } }),
      payments: await prisma.payment.count({ where: { tenantId } }),
      audits: await prisma.auditLog.count({ where: { tenantId } }),
      order: await prisma.tailoringOrder.findUniqueOrThrow({ where: { id: order.tailoringOrder.id } }),
    };
    const response = await history(order.tailoringOrder.id);
    expect(response.status).toBe(200);
    expect(await prisma.measurement.count({ where: { tenantId } })).toBe(before.measurements);
    expect(await prisma.invoice.count({ where: { tenantId } })).toBe(before.invoices);
    expect(await prisma.payment.count({ where: { tenantId } })).toBe(before.payments);
    expect(await prisma.auditLog.count({ where: { tenantId } })).toBe(before.audits);
    const after = await prisma.tailoringOrder.findUniqueOrThrow({ where: { id: order.tailoringOrder.id } });
    expect(after.measurementId).toBe(before.order.measurementId);
    expect(after.status).toBe(before.order.status);
  });

  it('reused values saved through the existing endpoint create a NEW measurement id', async () => {
    const source = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-REUSE-A-${randomUUID()}` });
    const sourceSaved = await saveMeasurement(source.tailoringOrder.id, { chest: 40, waist: 38, length: 42, sleeve: 24 });
    const sourceId = sourceSaved.body.data.id;

    const target = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-REUSE-B-${randomUUID()}` });
    const hist = await history(target.tailoringOrder.id);
    const entry = hist.body.data.find((item: any) => item.measurementId === sourceId);
    expect(entry).toBeTruthy();
    expect(entry.compatible).toBe(true);

    // Simulate "Use as Starting Values" plus one tailor adjustment.
    const reused = await saveMeasurement(target.tailoringOrder.id, {
      chest: Number(entry.fields.chest) + 1,
      waist: entry.fields.waist,
      length: entry.fields.length,
      sleeve: entry.fields.sleeve,
    });
    expect(reused.status).toBe(201);
    const newId = reused.body.data.id;
    expect(newId).not.toBe(sourceId);

    const updated = await prisma.tailoringOrder.findUniqueOrThrow({ where: { id: target.tailoringOrder.id } });
    expect(updated.measurementId).toBe(newId);
    expect(updated.status).toBe('measurement');
    expect(reused.body.data.fields).toMatchObject({ chest: 41, waist: 38, length: 42, sleeve: 24 });
  });

  it('leaves the historical measurement unchanged after the new snapshot is saved', async () => {
    const before = await prisma.measurement.findFirst({ where: { tenantId, customerId: customerAId }, orderBy: { createdAt: 'asc' } });
    expect(before).not.toBeNull();
    const snapshot = { ...before! };

    const target = await makeOrder({ customerId: customerAId, templateId: templateSkId, orderNumber: `A8-UNCH-${randomUUID()}` });
    const saved = await saveMeasurement(target.tailoringOrder.id, { chest: 50, waist: 48, length: 50, sleeve: 30 });
    expect(saved.status).toBe(201);

    const after = await prisma.measurement.findUniqueOrThrow({ where: { id: snapshot.id } });
    expect(after.fields).toEqual(snapshot.fields);
    expect(after.templateId).toBe(snapshot.templateId);
    expect(after.unit).toBe(snapshot.unit);
    expect(after.createdAt.toISOString()).toBe(snapshot.createdAt.toISOString());
  });

  /* ------------------------------------------------------------
     A8.2 PRODUCTION PAYMENT STATUS
  ------------------------------------------------------------ */

  let payOrders: { key: string; order: any; tailoringOrder: any }[] = [];

  beforeAll(async () => {
    const definitions = [
      'A', 'B', 'C', 'D', 'E', 'F', 'G',
    ];
    for (const key of definitions) {
      const created = await makePaymentOrder(`A8-PAY-${key}-${randomUUID().slice(0, 8)}`);
      payOrders.push({ key, ...created });
    }
    // B: valid invoice, nothing paid.
    await makeInvoice({ orderId: payOrders[1].order.id, paidAmount: 0, balance: 4000, status: 'issued' });
    // C: valid partial payment.
    await makeInvoice({ orderId: payOrders[2].order.id, paidAmount: 1500, balance: 2500, status: 'partially_paid' });
    // D: fully paid.
    await makeInvoice({ orderId: payOrders[3].order.id, paidAmount: 4000, balance: 0, status: 'paid' });
    // E: two invoices -> integrity issue.
    await makeInvoice({ orderId: payOrders[4].order.id, paidAmount: 0, balance: 4000 });
    await makeInvoice({ orderId: payOrders[4].order.id, paidAmount: 0, balance: 4000 });
    // F: invalid total vs authoritative OrderItems sum.
    await makeInvoice({ orderId: payOrders[5].order.id, total: 3999, paidAmount: 0, balance: 3999 });
    // G: paid + balance inconsistent with total.
    await makeInvoice({ orderId: payOrders[6].order.id, paidAmount: 1000, balance: 2000 });
  }, 30000);

  const rowFor = (body: any, key: string) =>
    body.data.find((row: any) => row.order?.orderNumber?.startsWith(`A8-PAY-${key}-`));

  it('classifies an order with no invoice as unpaid', async () => {
    const response = await listOrders();
    expect(response.status).toBe(200);
    const row = rowFor(response.body, 'A');
    expect(row.accounting.paymentStatus).toBe('unpaid');
    expect(d(row.accounting.total)).toBe('4000');
    expect(d(row.accounting.paid)).toBe('0');
    expect(d(row.accounting.balance)).toBe('4000');
  });

  it('classifies a valid zero-paid invoice as unpaid', async () => {
    const row = rowFor((await listOrders()).body, 'B');
    expect(row.accounting.paymentStatus).toBe('unpaid');
    expect(d(row.accounting.paid)).toBe('0');
    expect(d(row.accounting.balance)).toBe('4000');
  });

  it('classifies a partially paid invoice as partial', async () => {
    const row = rowFor((await listOrders()).body, 'C');
    expect(row.accounting.paymentStatus).toBe('partial');
    expect(d(row.accounting.paid)).toBe('1500');
    expect(d(row.accounting.balance)).toBe('2500');
  });

  it('classifies a zero-balance invoice as paid', async () => {
    const row = rowFor((await listOrders()).body, 'D');
    expect(row.accounting.paymentStatus).toBe('paid');
    expect(d(row.accounting.paid)).toBe('4000');
    expect(d(row.accounting.balance)).toBe('0');
  });

  it('flags an order with multiple invoices as an accounting issue', async () => {
    const row = rowFor((await listOrders()).body, 'E');
    expect(row.accounting.paymentStatus).toBe('issue');
    expect(row.accounting.paid).toBeNull();
    expect(row.accounting.balance).toBeNull();
  });

  it('flags an invoice whose total disagrees with the order items as an issue', async () => {
    const row = rowFor((await listOrders()).body, 'F');
    expect(row.accounting.paymentStatus).toBe('issue');
  });

  it('flags an invoice whose paidAmount + balance disagree with its total as an issue', async () => {
    const row = rowFor((await listOrders()).body, 'G');
    expect(row.accounting.paymentStatus).toBe('issue');
  });

  it('keeps every row in the list even when some accounting is broken', async () => {
    const response = await listOrders();
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    for (const key of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      const row = rowFor(response.body, key);
      expect(row, `row ${key} missing`).toBeTruthy();
      expect(row.accounting, `row ${key} accounting missing`).toBeTruthy();
    }
  });

  it('ignores cross-tenant invoices when summarizing', async () => {
    await makeInvoice({ orderId: payOrders[0].order.id, tenantId: foreignTenantId, paidAmount: 0, balance: 4000 });
    const row = rowFor((await listOrders()).body, 'A');
    expect(row.accounting.paymentStatus).toBe('unpaid');
    expect(d(row.accounting.balance)).toBe('4000');
  });

  it('derives the authoritative total from OrderItems, not from invoice fields', async () => {
    // F carries an invoice with total 3999; the list must still report 4000.
    const row = rowFor((await listOrders()).body, 'F');
    expect(d(row.accounting.total)).toBe('4000');
    const rowA = rowFor((await listOrders()).body, 'A');
    expect(d(rowA.accounting.total)).toBe('4000');
  });
});

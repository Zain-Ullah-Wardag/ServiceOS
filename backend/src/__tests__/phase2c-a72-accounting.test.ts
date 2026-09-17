import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import app from '../app';
import prisma from '../lib/prisma';

/**
 * Normalize a Decimal value to its canonical string form before comparing.
 * The pg driver decodes `numeric` columns as JS numbers, so the two-decimal
 * scale from the schema is not preserved in serialized form (e.g. 4000.00
 * arrives as 4000). Comparing normalized Prisma.Decimal strings keeps the
 * assertions exact and Decimal-safe.
 */
const d = (x: unknown) => new Prisma.Decimal(String(x)).toString();

/**
 * A7.2 tailoring order accounting backend foundation.
 *
 * Runs against the dedicated serviceos_test PostgreSQL database only
 * (guarded in setup.ts and re-verified below).
 */
describe('A7.2 tailoring order accounting (real serviceos_test)', () => {
  let tenantId: string;
  let foreignTenantId: string;
  let userId: string;
  let foreignUserId: string;
  let readerUserId: string;
  let customerId: string;
  let otherCustomerId: string;
  let serviceId: string;
  let ownerRoleId: string;
  let foreignRoleId: string;
  let readerRoleId: string;
  let token: string;
  let foreignToken: string;
  let readerToken: string;
  const users: string[] = [];
  const ACCOUNTING_PERMISSIONS = [
    'tailoring.read',
    'invoices.read',
    'invoices.create',
    'payments.read',
    'payments.create',
  ];

  beforeAll(async () => {
    const db = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()::text AS current_database`;
    expect(db[0].current_database).toBe('serviceos_test');

    const suffix = randomUUID();
    tenantId = (await prisma.tenant.create({ data: { name: 'A72 tenant', slug: `a72-${suffix}`, businessType: 'tailoring' } })).id;
    foreignTenantId = (await prisma.tenant.create({ data: { name: 'Other A72 tenant', slug: `other-a72-${suffix}` } })).id;

    const owner = await prisma.user.create({ data: { name: 'A72 owner', email: `a72-owner-${suffix}@a72.invalid`, passwordHash: 'unused' } });
    users.push(owner.id);
    userId = owner.id;

    ownerRoleId = (await prisma.role.create({ data: { tenantId, name: 'A72 owner role' } })).id;
    for (const name of ACCOUNTING_PERMISSIONS) {
      const permission = await prisma.permission.upsert({ where: { name }, create: { name }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: ownerRoleId, permissionId: permission.id } });
    }
    await prisma.tenantUser.create({ data: { tenantId, userId, roleId: ownerRoleId } });
    token = jwt.sign({ userId, tenantId }, process.env.JWT_SECRET!);

    const foreign = await prisma.user.create({ data: { name: 'A72 foreign', email: `a72-foreign-${suffix}@a72.invalid`, passwordHash: 'unused' } });
    users.push(foreign.id);
    foreignUserId = foreign.id;
    foreignRoleId = (await prisma.role.create({ data: { tenantId: foreignTenantId, name: 'Foreign role' } })).id;
    for (const name of ACCOUNTING_PERMISSIONS) {
      const permission = await prisma.permission.upsert({ where: { name }, create: { name }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: foreignRoleId, permissionId: permission.id } });
    }
    await prisma.tenantUser.create({ data: { tenantId: foreignTenantId, userId: foreignUserId, roleId: foreignRoleId } });
    foreignToken = jwt.sign({ userId: foreignUserId, tenantId: foreignTenantId }, process.env.JWT_SECRET!);

    const reader = await prisma.user.create({ data: { name: 'A72 reader', email: `a72-reader-${suffix}@a72.invalid`, passwordHash: 'unused' } });
    users.push(reader.id);
    readerUserId = reader.id;
    readerRoleId = (await prisma.role.create({ data: { tenantId, name: 'A72 reader role' } })).id;
    for (const name of ['tailoring.read', 'invoices.read']) {
      const permission = await prisma.permission.upsert({ where: { name }, create: { name }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: readerRoleId, permissionId: permission.id } });
    }
    await prisma.tenantUser.create({ data: { tenantId, userId: readerUserId, roleId: readerRoleId } });
    readerToken = jwt.sign({ userId: readerUserId, tenantId }, process.env.JWT_SECRET!);

    customerId = (await prisma.customer.create({ data: { tenantId, name: 'A72 customer', phone: 'a72-phone-1' } })).id;
    otherCustomerId = (await prisma.customer.create({ data: { tenantId, name: 'A72 other customer', phone: 'a72-phone-2' } })).id;
    serviceId = (await prisma.service.create({ data: { tenantId, name: 'A72 service', price: 100 } })).id;
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

  /** Order total 4000: 2500 + 1500 across two items. */
  async function makeOrder(customerIdOverride?: string) {
    const ownerCustomerId = customerIdOverride ?? customerId;
    const order = await prisma.order.create({
      data: {
        tenantId,
        customerId: ownerCustomerId,
        orderNumber: `A72-${randomUUID()}`,
      },
    });
    for (const [quantity, unitPrice, total] of [
      [1, 2500, 2500],
      [1, 1500, 1500],
    ]) {
      await prisma.orderItem.create({
        data: { tenantId, orderId: order.id, serviceId, quantity, unitPrice, total },
      });
    }
    const tailoringOrder = await prisma.tailoringOrder.create({
      data: { tenantId, customerId: ownerCustomerId, orderId: order.id },
    });
    return { order, tailoringOrder };
  }

  const accounting = (id: string, bearer?: string) =>
    request(app)
      .get(`/api/v1/tailoring/orders/${id}/accounting`)
      .set('Authorization', `Bearer ${bearer ?? token}`);

  const ensureInvoice = (id: string, body?: object, bearer?: string) =>
    request(app)
      .post(`/api/v1/tailoring/orders/${id}/accounting/invoice`)
      .set('Authorization', `Bearer ${bearer ?? token}`)
      .send(body ?? {});

  const recordPayment = (invoiceId: string, amount: number, bearer?: string, customerIdOverride?: string) =>
    request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${bearer ?? token}`)
      .send({ invoiceId, customerId: customerIdOverride ?? customerId, amount });

  const invoiceRow = (id: string) =>
    prisma.invoice.findUniqueOrThrow({ where: { id } });

  /**
   * A pre-existing invoice linked to an order (as the generic
   * POST /invoices route could create), with selectively violated
   * invariants. All amounts default to the authoritative 4000 order.
   */
  async function makeExistingInvoice(opts: {
    orderId: string;
    customerId?: string;
    total?: number;
    subtotal?: number;
    discount?: number;
    tax?: number;
    paidAmount?: number;
    balance?: number;
    status?: string;
  }) {
    return prisma.invoice.create({
      data: {
        tenantId,
        customerId: opts.customerId ?? customerId,
        orderId: opts.orderId,
        invoiceNumber: `INV-A72-PRE-${randomUUID().slice(0, 8)}`,
        subtotal: opts.subtotal ?? 4000,
        discount: opts.discount ?? 0,
        tax: opts.tax ?? 0,
        total: opts.total ?? 4000,
        paidAmount: opts.paidAmount ?? 0,
        balance: opts.balance ?? 4000,
        status: opts.status ?? 'issued',
        issuedAt: new Date(),
      },
    });
  }

  /* ------------------------------------------------------------
     ACCOUNTING READ
  ------------------------------------------------------------ */

  it('returns the authoritative total derived from OrderItem totals', async () => {
    const { order, tailoringOrder } = await makeOrder();
    const response = await accounting(tailoringOrder.id);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.orderId).toBe(order.id);
    expect(response.body.data.tailoringOrderId).toBe(tailoringOrder.id);
    expect(response.body.data.orderNumber).toBe(order.orderNumber);
    expect(d(response.body.data.total)).toBe('4000');
  });

  it('returns invoice=null and empty payments before any invoice exists', async () => {
    const { tailoringOrder } = await makeOrder();
    const response = await accounting(tailoringOrder.id);
    expect(response.status).toBe(200);
    expect(response.body.data.invoice).toBeNull();
    expect(response.body.data.payments).toEqual([]);
    expect(d(response.body.data.total)).toBe('4000');
  });

  it('returns the invoice and full payment history after records exist', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    expect(ensured.status).toBe(201);
    const invoiceId = ensured.body.data.id;

    expect((await recordPayment(invoiceId, 1500)).status).toBe(201);
    expect((await recordPayment(invoiceId, 1000)).status).toBe(201);

    const response = await accounting(tailoringOrder.id);
    expect(response.status).toBe(200);
    expect(response.body.data.invoice).toMatchObject({
      id: invoiceId,
      status: 'partially_paid',
    });
    expect(d(response.body.data.invoice.total)).toBe('4000');
    expect(d(response.body.data.invoice.paidAmount)).toBe('2500');
    expect(d(response.body.data.invoice.balance)).toBe('1500');
    expect(response.body.data.invoice.issuedAt).not.toBeNull();
    expect(response.body.data.payments).toHaveLength(2);
    expect(response.body.data.payments.map((p: any) => d(p.amount))).toEqual(['1500', '1000']);
    for (const payment of response.body.data.payments) {
      expect(payment).toHaveProperty('id');
      expect(payment).toHaveProperty('method');
      expect(payment).toHaveProperty('status');
      expect(payment).toHaveProperty('paidAt');
    }
  });

  it('hides cross-tenant tailoring orders as not found', async () => {
    const { tailoringOrder } = await makeOrder();
    const response = await accounting(tailoringOrder.id, foreignToken);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns a structured integrity error when multiple invoices exist for one order', async () => {
    const { order, tailoringOrder } = await makeOrder();
    for (const suffix of ['a', 'b']) {
      await prisma.invoice.create({
        data: {
          tenantId,
          customerId,
          orderId: order.id,
          invoiceNumber: `INV-A72-DUP-${suffix}-${randomUUID().slice(0, 8)}`,
          subtotal: 4000,
          discount: 0,
          tax: 0,
          total: 4000,
          paidAmount: 0,
          balance: 4000,
          status: 'issued',
          issuedAt: new Date(),
        },
      });
    }
    const read = await accounting(tailoringOrder.id);
    expect(read.status).toBe(409);
    expect(read.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');

    const ensure = await ensureInvoice(tailoringOrder.id);
    expect(ensure.status).toBe(409);
    expect(ensure.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');
  });

  /* ------------------------------------------------------------
     ENSURE INVOICE
  ------------------------------------------------------------ */

  it('creates the operational invoice from authoritative OrderItem totals', async () => {
    const { tailoringOrder } = await makeOrder();
    const response = await ensureInvoice(tailoringOrder.id);
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('issued');
    expect(d(response.body.data.total)).toBe('4000');
    expect(d(response.body.data.subtotal)).toBe('4000');
    expect(d(response.body.data.discount)).toBe('0');
    expect(d(response.body.data.tax)).toBe('0');
    expect(d(response.body.data.paidAmount)).toBe('0');
    expect(d(response.body.data.balance)).toBe('4000');
    expect(response.body.data.invoiceNumber).toMatch(/^INV-/);
    expect(response.body.data.issuedAt).not.toBeNull();
  });

  it('ignores any client-provided subtotal/discount/tax', async () => {
    const { tailoringOrder } = await makeOrder();
    const response = await ensureInvoice(tailoringOrder.id, {
      subtotal: 999999,
      discount: 500,
      tax: 77,
      total: 123,
      balance: 1,
    });
    expect(response.status).toBe(201);
    expect(d(response.body.data.total)).toBe('4000');
    expect(d(response.body.data.subtotal)).toBe('4000');
    expect(d(response.body.data.discount)).toBe('0');
    expect(d(response.body.data.tax)).toBe('0');
    expect(d(response.body.data.balance)).toBe('4000');
  });

  it('is idempotent: a second call returns the same invoice without creating another', async () => {
    const { order, tailoringOrder } = await makeOrder();
    const first = await ensureInvoice(tailoringOrder.id);
    expect(first.status).toBe(201);
    const second = await ensureInvoice(tailoringOrder.id);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('stamps the invoice with the authoritative tenant, customer and order', async () => {
    const { order, tailoringOrder } = await makeOrder(otherCustomerId);
    const response = await ensureInvoice(tailoringOrder.id);
    expect(response.status).toBe(201);
    const row = await invoiceRow(response.body.data.id);
    expect(row.tenantId).toBe(tenantId);
    expect(row.customerId).toBe(otherCustomerId);
    expect(row.orderId).toBe(order.id);
  });

  it('serializes concurrent ensure calls into a single operational invoice', async () => {
    const { order, tailoringOrder } = await makeOrder();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => ensureInvoice(tailoringOrder.id)),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(3);
    const ids = new Set(results.map((r) => r.body.data.id));
    expect(ids.size).toBe(1);
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });

  /* ------------------------------------------------------------
     PAYMENT HARDENING
  ------------------------------------------------------------ */

  it('records a partial payment and updates paidAmount/balance/status', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const response = await recordPayment(invoiceId, 1500);
    expect(response.status).toBe(201);
    expect(d(response.body.data.amount)).toBe('1500');

    const row = await invoiceRow(invoiceId);
    expect(d(row.paidAmount)).toBe('1500');
    expect(d(row.balance)).toBe('2500');
    expect(row.status).toBe('partially_paid');
  });

  it('records a second partial payment on the same invoice', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    expect((await recordPayment(invoiceId, 1500)).status).toBe(201);
    const second = await recordPayment(invoiceId, 1000);
    expect(second.status).toBe(201);

    const row = await invoiceRow(invoiceId);
    expect(d(row.paidAmount)).toBe('2500');
    expect(d(row.balance)).toBe('1500');
    expect(row.status).toBe('partially_paid');
  });

  it('records an exact final-balance payment to zero', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    expect((await recordPayment(invoiceId, 1500)).status).toBe(201);
    expect((await recordPayment(invoiceId, 1000)).status).toBe(201);
    const final = await recordPayment(invoiceId, 1500);
    expect(final.status).toBe(201);

    const row = await invoiceRow(invoiceId);
    expect(d(row.balance)).toBe('0');
    expect(d(row.paidAmount)).toBe('4000');
  });

  it('marks the invoice paid at zero balance', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const response = await recordPayment(invoiceId, 4000);
    expect(response.status).toBe(201);

    const row = await invoiceRow(invoiceId);
    expect(row.status).toBe('paid');
    expect(d(row.balance)).toBe('0');
    expect(d(row.paidAmount)).toBe('4000');
  });

  it('rejects a zero amount', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const response = await recordPayment(invoiceId, 0);
    expect(response.status).toBe(400);
    expect(await prisma.payment.count({ where: { invoiceId } })).toBe(0);
  });

  it('rejects a negative amount', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const response = await recordPayment(invoiceId, -100);
    expect(response.status).toBe(400);
    expect(await prisma.payment.count({ where: { invoiceId } })).toBe(0);
  });

  it('rejects an amount above the remaining balance with a structured 409', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const response = await recordPayment(invoiceId, 4001);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
    expect(response.body.error.message).toBe('Amount exceeds the outstanding balance.');
  });

  it('creates no Payment record on over-balance failure', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const response = await recordPayment(invoiceId, 999999);
    expect(response.status).toBe(409);
    expect(await prisma.payment.count({ where: { invoiceId } })).toBe(0);
  });

  it('does not modify the Invoice on over-balance failure', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;
    const before = await invoiceRow(invoiceId);

    const response = await recordPayment(invoiceId, 4500);
    expect(response.status).toBe(409);

    const after = await invoiceRow(invoiceId);
    expect(String(after.paidAmount)).toBe(String(before.paidAmount));
    expect(String(after.balance)).toBe(String(before.balance));
    expect(after.status).toBe(before.status);
  });

  it('copies Payment.orderId from Invoice.orderId', async () => {
    const { order, tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const response = await recordPayment(invoiceId, 100);
    expect(response.status).toBe(201);
    expect(response.body.data.orderId).toBe(order.id);

    const row = await prisma.payment.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(row.orderId).toBe(order.id);
    expect(row.invoiceId).toBe(invoiceId);
  });

  it('treats cross-tenant invoices as not found for payment recording', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const response = await recordPayment(invoiceId, 100, foreignToken, otherCustomerId);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await prisma.payment.count({ where: { invoiceId } })).toBe(0);
  });

  it('rejects a payment for the wrong customer', async () => {
    const { tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const response = await recordPayment(invoiceId, 100, token, otherCustomerId);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CUSTOMER');
    expect(await prisma.payment.count({ where: { invoiceId } })).toBe(0);
  });

  it('writes audit events for the ensured invoice and recorded payment', async () => {
    const { order, tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const invoiceAudit = await prisma.auditLog.findFirst({
      where: { action: 'TAILORING_INVOICE_CREATED', entityId: invoiceId, tenantId },
    });
    expect(invoiceAudit).not.toBeNull();
    expect(invoiceAudit!.userId).toBe(userId);
    const invoiceMeta = JSON.parse(invoiceAudit!.metadata!);
    expect(invoiceMeta).toMatchObject({
      tailoringOrderId: tailoringOrder.id,
      orderId: order.id,
      invoiceId,
    });

    expect((await recordPayment(invoiceId, 250)).status).toBe(201);
    const paymentAudit = await prisma.auditLog.findFirst({
      where: { action: 'PAYMENT_RECORDED', tenantId, metadata: { contains: invoiceId } },
    });
    expect(paymentAudit).not.toBeNull();
    const paymentMeta = JSON.parse(paymentAudit!.metadata!);
    expect(paymentMeta.invoiceId).toBe(invoiceId);
    expect(Number(paymentMeta.amount)).toBe(250);
  });

  it('serializes concurrent final-balance records so only one consumes the remainder', async () => {
    const { order, tailoringOrder } = await makeOrder();
    const ensured = await ensureInvoice(tailoringOrder.id);
    const invoiceId = ensured.body.data.id;

    const [first, second] = await Promise.all([
      recordPayment(invoiceId, 4000),
      recordPayment(invoiceId, 4000),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect([first.body.error?.code, second.body.error?.code].filter(Boolean)).toEqual(['PAYMENT_EXCEEDS_BALANCE']);

    const row = await invoiceRow(invoiceId);
    expect(d(row.balance)).toBe('0');
    expect(row.status).toBe('paid');
    const payments = await prisma.payment.findMany({ where: { invoiceId } });
    expect(payments).toHaveLength(1);
    expect(d(payments[0].amount)).toBe('4000');
    expect(payments[0].orderId).toBe(order.id);
  });

  /* ------------------------------------------------------------
     EXISTING INVOICE INTEGRITY
  ------------------------------------------------------------ */

  it('rejects a single existing invoice for the wrong customer (read + ensure)', async () => {
    const { order, tailoringOrder } = await makeOrder();
    await makeExistingInvoice({ orderId: order.id, customerId: otherCustomerId });

    const read = await accounting(tailoringOrder.id);
    expect(read.status).toBe(409);
    expect(read.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');

    const ensure = await ensureInvoice(tailoringOrder.id);
    expect(ensure.status).toBe(409);
    expect(ensure.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');

    // No writes on rejection: the conflicting invoice is neither repaired
    // nor replaced with a second one.
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('rejects a single existing invoice with a wrong total (read + ensure)', async () => {
    const { order, tailoringOrder } = await makeOrder();
    await makeExistingInvoice({ orderId: order.id, total: 3999, balance: 3999 });

    const read = await accounting(tailoringOrder.id);
    expect(read.status).toBe(409);
    expect(read.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');
    expect(read.body.error.message).toBe(
      'Existing invoice does not match the authoritative order accounting.',
    );

    const ensure = await ensureInvoice(tailoringOrder.id);
    expect(ensure.status).toBe(409);
    expect(ensure.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('rejects a single existing invoice with a wrong subtotal', async () => {
    const { order, tailoringOrder } = await makeOrder();
    await makeExistingInvoice({ orderId: order.id, subtotal: 3800 });

    const read = await accounting(tailoringOrder.id);
    expect(read.status).toBe(409);
    expect(read.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');

    const ensure = await ensureInvoice(tailoringOrder.id);
    expect(ensure.status).toBe(409);
    expect(ensure.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('rejects a single existing invoice whose paidAmount + balance != total', async () => {
    const { order, tailoringOrder } = await makeOrder();
    await makeExistingInvoice({ orderId: order.id, paidAmount: 1000, balance: 2000 });

    const read = await accounting(tailoringOrder.id);
    expect(read.status).toBe(409);
    expect(read.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');

    const ensure = await ensureInvoice(tailoringOrder.id);
    expect(ensure.status).toBe(409);
    expect(ensure.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('rejects a single existing invoice with a negative balance', async () => {
    const { order, tailoringOrder } = await makeOrder();
    await makeExistingInvoice({ orderId: order.id, paidAmount: 4500, balance: -500 });

    const read = await accounting(tailoringOrder.id);
    expect(read.status).toBe(409);
    expect(read.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');

    const ensure = await ensureInvoice(tailoringOrder.id);
    expect(ensure.status).toBe(409);
    expect(ensure.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('rejects a cancelled linked invoice instead of adopting it', async () => {
    const { order, tailoringOrder } = await makeOrder();
    await makeExistingInvoice({ orderId: order.id, status: 'cancelled' });

    const read = await accounting(tailoringOrder.id);
    expect(read.status).toBe(409);
    expect(read.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');

    // A7.2 never auto-creates a replacement invoice.
    const ensure = await ensureInvoice(tailoringOrder.id);
    expect(ensure.status).toBe(409);
    expect(ensure.body.error.code).toBe('ACCOUNTING_INTEGRITY_ERROR');
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('accepts a valid pre-existing operational invoice without creating another', async () => {
    const { order, tailoringOrder } = await makeOrder();
    const existing = await makeExistingInvoice({ orderId: order.id });

    const read = await accounting(tailoringOrder.id);
    expect(read.status).toBe(200);
    expect(read.body.data.invoice).toMatchObject({
      id: existing.id,
      status: 'issued',
    });
    expect(d(read.body.data.invoice.total)).toBe('4000');
    expect(d(read.body.data.invoice.balance)).toBe('4000');
    expect(read.body.data.payments).toEqual([]);

    const ensure = await ensureInvoice(tailoringOrder.id);
    expect(ensure.status).toBe(200);
    expect(ensure.body.data.id).toBe(existing.id);

    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });

  /* ------------------------------------------------------------
     AUTH / RBAC
  ------------------------------------------------------------ */

  it('requires authentication and both read permissions for the accounting read', async () => {
    const { tailoringOrder } = await makeOrder();

    const unauthenticated = await request(app).get(`/api/v1/tailoring/orders/${tailoringOrder.id}/accounting`);
    expect(unauthenticated.status).toBe(401);

    const reader = await accounting(tailoringOrder.id, readerToken);
    expect(reader.status).toBe(200);
    expect(d(reader.body.data.total)).toBe('4000');
  });

  it('requires invoices.create for the ensure-invoice endpoint', async () => {
    const { tailoringOrder } = await makeOrder();
    const response = await ensureInvoice(tailoringOrder.id, {}, readerToken);
    expect(response.status).toBe(403);
    expect(await prisma.invoice.count({ where: { orderId: tailoringOrder.orderId } })).toBe(0);
  });
});

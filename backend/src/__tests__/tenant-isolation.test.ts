import bcrypt from 'bcryptjs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';

describe('Tenant Isolation', () => {
  let tokenA = '';

  let tenantAId = '';
  let tenantBId = '';

  let customerAId = '';
  let customerBId = '';

  let serviceAId = '';
  let serviceBId = '';

  let orderAId = '';
  let orderBId = '';

  beforeAll(async () => {
    await prisma.$connect();

    const passwordHash = await bcrypt.hash('password123', 12);

    // -----------------------------------------------------
    // TENANTS
    // -----------------------------------------------------

    const tenantA = await prisma.tenant.upsert({
      where: { slug: 'test-tenant-a' },
      update: {
        name: 'Test A',
        status: 'active',
      },
      create: {
        name: 'Test A',
        slug: 'test-tenant-a',
        businessType: 'tailoring',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        status: 'active',
      },
    });

    const tenantB = await prisma.tenant.upsert({
      where: { slug: 'test-tenant-b' },
      update: {
        name: 'Test B',
        status: 'active',
      },
      create: {
        name: 'Test B',
        slug: 'test-tenant-b',
        businessType: 'tailoring',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        status: 'active',
      },
    });

    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    // -----------------------------------------------------
    // USERS
    // -----------------------------------------------------

    const userA = await prisma.user.upsert({
      where: { email: 'test-owner-a@test.local' },
      update: {
        name: 'Owner A',
        passwordHash,
        status: 'active',
        emailVerified: true,
      },
      create: {
        name: 'Owner A',
        email: 'test-owner-a@test.local',
        phone: '+0000000001',
        passwordHash,
        status: 'active',
        emailVerified: true,
      },
    });

    const userB = await prisma.user.upsert({
      where: { email: 'test-owner-b@test.local' },
      update: {
        name: 'Owner B',
        passwordHash,
        status: 'active',
        emailVerified: true,
      },
      create: {
        name: 'Owner B',
        email: 'test-owner-b@test.local',
        phone: '+0000000002',
        passwordHash,
        status: 'active',
        emailVerified: true,
      },
    });

    // -----------------------------------------------------
    // ROLES
    // -----------------------------------------------------

    let roleA = await prisma.role.findFirst({
      where: {
        tenantId: tenantAId,
        name: 'Owner',
      },
    });

    if (!roleA) {
      roleA = await prisma.role.create({
        data: {
          tenantId: tenantAId,
          name: 'Owner',
          description: 'Integration test owner',
        },
      });
    }

    let roleB = await prisma.role.findFirst({
      where: {
        tenantId: tenantBId,
        name: 'Owner',
      },
    });

    if (!roleB) {
      roleB = await prisma.role.create({
        data: {
          tenantId: tenantBId,
          name: 'Owner',
          description: 'Integration test owner',
        },
      });
    }

    // -----------------------------------------------------
    // MEMBERSHIPS
    // -----------------------------------------------------

    const membershipA = await prisma.tenantUser.findFirst({
      where: {
        tenantId: tenantAId,
        userId: userA.id,
      },
    });

    if (membershipA) {
      await prisma.tenantUser.update({
        where: { id: membershipA.id },
        data: {
          roleId: roleA.id,
          status: 'active',
        },
      });
    } else {
      await prisma.tenantUser.create({
        data: {
          tenantId: tenantAId,
          userId: userA.id,
          roleId: roleA.id,
          status: 'active',
        },
      });
    }

    const membershipB = await prisma.tenantUser.findFirst({
      where: {
        tenantId: tenantBId,
        userId: userB.id,
      },
    });

    if (membershipB) {
      await prisma.tenantUser.update({
        where: { id: membershipB.id },
        data: {
          roleId: roleB.id,
          status: 'active',
        },
      });
    } else {
      await prisma.tenantUser.create({
        data: {
          tenantId: tenantBId,
          userId: userB.id,
          roleId: roleB.id,
          status: 'active',
        },
      });
    }

    // -----------------------------------------------------
    // PERMISSIONS FOR TENANT A OWNER
    // -----------------------------------------------------

    const requiredPermissions = [
      'customers.read',
      'customers.create',
      'customers.update',
      'customers.delete',
      'services.read',
      'orders.read',
      'orders.create',
      'orders.update',
      'bookings.read',
      'bookings.create',
      'staff.read',
      'analytics.read',
    ];

    for (const permissionName of requiredPermissions) {
      const permission = await prisma.permission.findUnique({
        where: { name: permissionName },
      });

      if (!permission) {
        throw new Error(
          `Required permission "${permissionName}" is missing from serviceos_test.`
        );
      }

      const existingRolePermission =
        await prisma.rolePermission.findFirst({
          where: {
            roleId: roleA.id,
            permissionId: permission.id,
          },
        });

      if (!existingRolePermission) {
        await prisma.rolePermission.create({
          data: {
            roleId: roleA.id,
            permissionId: permission.id,
          },
        });
      }
    }

    // -----------------------------------------------------
    // REMOVE OLD RESOURCE FIXTURES
    // -----------------------------------------------------

    await prisma.order.deleteMany({
      where: {
        orderNumber: {
          in: ['ORD-TEST-A-001', 'ORD-TEST-B-001'],
        },
      },
    });

    await prisma.customer.deleteMany({
      where: {
        OR: [
          {
            tenantId: tenantAId,
            phone: '+111',
          },
          {
            tenantId: tenantBId,
            phone: '+222',
          },
        ],
      },
    });

    await prisma.service.deleteMany({
      where: {
        OR: [
          {
            tenantId: tenantAId,
            name: 'Test Service A',
          },
          {
            tenantId: tenantBId,
            name: 'Test Service B',
          },
        ],
      },
    });

    // -----------------------------------------------------
    // SERVICES
    // -----------------------------------------------------

    const serviceA = await prisma.service.create({
      data: {
        tenantId: tenantAId,
        name: 'Test Service A',
        price: 100,
        duration: 30,
        status: 'active',
        requiresBooking: false,
        requiresDelivery: false,
      },
    });

    serviceAId = serviceA.id;

    const serviceB = await prisma.service.create({
      data: {
        tenantId: tenantBId,
        name: 'Test Service B',
        price: 200,
        duration: 25,
        status: 'active',
        requiresBooking: false,
        requiresDelivery: false,
      },
    });

    serviceBId = serviceB.id;

    // -----------------------------------------------------
    // CUSTOMERS
    // -----------------------------------------------------

    const customerA = await prisma.customer.create({
      data: {
        tenantId: tenantAId,
        name: 'Customer A',
        phone: '+111',
        status: 'active',
      },
    });

    customerAId = customerA.id;

    const customerB = await prisma.customer.create({
      data: {
        tenantId: tenantBId,
        name: 'Customer B',
        phone: '+222',
        status: 'active',
      },
    });

    customerBId = customerB.id;

    // -----------------------------------------------------
    // ORDERS
    // -----------------------------------------------------

    const orderA = await prisma.order.create({
      data: {
        tenantId: tenantAId,
        customerId: customerAId,
        orderNumber: 'ORD-TEST-A-001',
        status: 'received',
      },
    });

    orderAId = orderA.id;

    const orderB = await prisma.order.create({
      data: {
        tenantId: tenantBId,
        customerId: customerBId,
        orderNumber: 'ORD-TEST-B-001',
        status: 'received',
      },
    });

    orderBId = orderB.id;

    // -----------------------------------------------------
    // REAL LOGIN FOR TENANT A
    // -----------------------------------------------------

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test-owner-a@test.local',
        password: 'password123',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data?.token).toBeDefined();

    tokenA = loginRes.body.data.token;
  }, 30000);

  afterAll(async () => {
    // Delete dependent data before parent records.
    await prisma.order.deleteMany({
      where: {
        orderNumber: {
          in: ['ORD-TEST-A-001', 'ORD-TEST-B-001'],
        },
      },
    });

    await prisma.customer.deleteMany({
      where: {
        OR: [
          {
            tenantId: tenantAId,
            phone: '+111',
          },
          {
            tenantId: tenantBId,
            phone: '+222',
          },
        ],
      },
    });

    await prisma.service.deleteMany({
      where: {
        OR: [
          {
            tenantId: tenantAId,
            name: 'Test Service A',
          },
          {
            tenantId: tenantBId,
            name: 'Test Service B',
          },
        ],
      },
    });

    await prisma.$disconnect();
  });

  // -----------------------------------------------------
  // LIST ISOLATION
  // -----------------------------------------------------

  it('Tenant A customer list contains Tenant A customer but not Tenant B customer', async () => {
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);

    const customers = res.body.data ?? [];

    expect(
      customers.some((customer: any) => customer.id === customerAId)
    ).toBe(true);

    expect(
      customers.some((customer: any) => customer.id === customerBId)
    ).toBe(false);
  });

  // -----------------------------------------------------
  // CUSTOMER READ ISOLATION
  // -----------------------------------------------------

  it('Tenant A cannot read Tenant B customer', async () => {
    const res = await request(app)
      .get(`/api/v1/customers/${customerBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([400, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  // -----------------------------------------------------
  // CUSTOMER UPDATE ISOLATION
  // -----------------------------------------------------

  it('Tenant A cannot update Tenant B customer', async () => {
    const before = await prisma.customer.findUnique({
      where: { id: customerBId },
    });

    expect(before).not.toBeNull();

    const res = await request(app)
      .patch(`/api/v1/customers/${customerBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Hacked Customer',
      });

    expect([400, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);

    const after = await prisma.customer.findUnique({
      where: { id: customerBId },
    });

    expect(after).not.toBeNull();
    expect(after?.name).toBe('Customer B');
  });

  // -----------------------------------------------------
  // CUSTOMER DELETE ISOLATION
  // -----------------------------------------------------

  it('Tenant A cannot delete Tenant B customer', async () => {
    const res = await request(app)
      .delete(`/api/v1/customers/${customerBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([400, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);

    const customerStillExists = await prisma.customer.findUnique({
      where: { id: customerBId },
    });

    expect(customerStillExists).not.toBeNull();
  });

  // -----------------------------------------------------
  // ORDER READ ISOLATION
  // -----------------------------------------------------

  it('Tenant A cannot read Tenant B order', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${orderBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([400, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  // -----------------------------------------------------
  // ORDER UPDATE ISOLATION
  // -----------------------------------------------------

  it('Tenant A cannot update Tenant B order', async () => {
    const before = await prisma.order.findUnique({
      where: { id: orderBId },
    });

    expect(before).not.toBeNull();

    const res = await request(app)
      .patch(`/api/v1/orders/${orderBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        status: 'completed',
      });

    expect([400, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);

    const after = await prisma.order.findUnique({
      where: { id: orderBId },
    });

    expect(after).not.toBeNull();
    expect(after?.tenantId).toBe(tenantBId);
  });

  // -----------------------------------------------------
  // CROSS-TENANT CUSTOMER INJECTION
  // -----------------------------------------------------

  it('Tenant A cannot create order using Tenant B customer', async () => {
    const countBefore = await prisma.order.count({
      where: { tenantId: tenantAId },
    });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        customerId: customerBId,
        items: [
          {
            serviceId: serviceAId,
            quantity: 1,
            unitPrice: 100,
          },
        ],
      });

    expect([400, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);

    const countAfter = await prisma.order.count({
      where: { tenantId: tenantAId },
    });

    expect(countAfter).toBe(countBefore);
  });

  // -----------------------------------------------------
  // CROSS-TENANT SERVICE INJECTION
  // -----------------------------------------------------

  it('Tenant A cannot create order using Tenant B service', async () => {
    const countBefore = await prisma.order.count({
      where: { tenantId: tenantAId },
    });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        customerId: customerAId,
        items: [
          {
            serviceId: serviceBId,
            quantity: 1,
            unitPrice: 200,
          },
        ],
      });

    expect([400, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);

    const countAfter = await prisma.order.count({
      where: { tenantId: tenantAId },
    });

    expect(countAfter).toBe(countBefore);
  });

  // Sanity check proving Tenant A's own fixture exists.
  it('Tenant A fixture order belongs to Tenant A', async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderAId },
    });

    expect(order).not.toBeNull();
    expect(order?.tenantId).toBe(tenantAId);
  });
});
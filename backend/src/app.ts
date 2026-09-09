import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { auditLog } from './middleware/audit.js';
import { requirePermission } from './middleware/requirePermission.js';
import { validateBody } from './middleware/validate.js';

import {
  customerCreateSchema,
  customerUpdateSchema,
  serviceCreateSchema,
  staffCreateSchema,
  bookingCreateSchema,
  orderCreateSchema,
  orderStatusUpdateSchema,
  invoiceCreateSchema,
  paymentCreateSchema,
  switchTenantSchema,
  measurementCreateSchema,
  garmentCreateSchema,
  tailoringOrderCreateSchema,
} from './validators/core.js';

import prisma from './lib/prisma.js';

/* =========================================================
   LOCAL VALIDATORS
========================================================= */

const measurementFieldCreateSchema = z
  .object({
    name: z.string().min(1).max(100),
    label: z.string().min(1).max(150),
    type: z.string().min(1).max(50).optional(),
    isCustom: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

const garmentStatusSchema = z
  .object({
    status: z.string().min(1),
  })
  .strict();

const tailoringStatusSchema = z
  .object({
    status: z.string().min(1),
    notes: z.string().optional(),
  })
  .strict();

const subscriptionSchema = z
  .object({
    planId: z.string().min(1),
  })
  .strict();

const publicOrderSchema = z
  .object({
    customerName: z.string().min(1).max(200),
    customerPhone: z.string().min(1).max(50),
    customerEmail: z.string().email().optional(),
    serviceId: z.string().optional(),
    notes: z.string().optional(),
    expectedDate: z.string().optional(),
  })
  .strict();

/* =========================================================
   APP
========================================================= */

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use(express.json());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

/* =========================================================
   HEALTH
========================================================= */

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
  });
});

/* =========================================================
   AUTH
========================================================= */

app.use('/api/v1/auth', authRoutes);

/* =========================================================
   TENANTS
========================================================= */

app.get('/api/v1/tenants/current', authMiddleware, async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: {
        id: req.tenantId!,
      },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Tenant not found',
        },
      });
    }

    return res.json({
      success: true,
      data: tenant,
    });
  } catch (error) {
    console.error('GET CURRENT TENANT ERROR:', error);

    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Unable to load tenant',
      },
    });
  }
});

app.get('/api/v1/tenants', authMiddleware, async (req, res) => {
  try {
    const memberships = await prisma.tenantUser.findMany({
      where: {
        userId: req.user!.id,
        status: 'active',
      },

      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            businessType: true,
            logoUrl: true,
            status: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      data: memberships.map((membership: any) => membership.tenant),
    });
  } catch (error) {
    console.error('LIST TENANTS ERROR:', error);

    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Unable to load tenants',
      },
    });
  }
});

/* =========================================================
   CUSTOMERS
========================================================= */

app.get(
  '/api/v1/customers',
  authMiddleware,
  requirePermission('customers.read'),
  async (req, res) => {
    try {
      const q = (req.query.q as string) || '';

      const customers = await prisma.customer.findMany({
        where: {
          tenantId: req.tenantId!,

          OR: q
            ? [
                {
                  name: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
                {
                  phone: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
              ]
            : undefined,
        },

        orderBy: {
          createdAt: 'desc',
        },

        include: {
          orders: {
            take: 3,
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      return res.json({
        success: true,
        data: customers,
      });
    } catch (error) {
      console.error('CUSTOMERS LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load customers',
        },
      });
    }
  },
);

app.post(
  '/api/v1/customers',
  authMiddleware,
  requirePermission('customers.create'),
  validateBody(customerCreateSchema),
  async (req, res) => {
    try {
      const { name, phone, email, address, notes } = req.body;

      const currentCustomers = await prisma.customer.count({
        where: {
          tenantId: req.tenantId!,
        },
      });

      const limit = await checkSubscriptionLimit(
        req.tenantId!,
        'customers',
        currentCustomers,
      );

      if (!limit.allowed) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_LIMIT_REACHED',
            message: 'Customer limit reached. Upgrade your plan.',
          },
        });
      }

      const customer = await prisma.customer.create({
        data: {
          tenantId: req.tenantId!,
          name,
          phone,
          email: email || null,
          address: address || null,
          measurementId: measurementId || null,
          notes: notes || null,
          status: 'active',
        },
      });

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'CUSTOMER_CREATED',
        entity: 'Customer',
        entityId: customer.id,
        metadata: {
          name,
          phone,
        },
      });

      return res.status(201).json({
        success: true,
        data: customer,
      });
    } catch (error) {
      console.error('CUSTOMER CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create customer',
        },
      });
    }
  },
);

app.get(
  '/api/v1/customers/:id',
  authMiddleware,
  requirePermission('customers.read'),
  async (req, res) => {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.tenantId!,
        },

        include: {
          orders: true,
          bookings: true,
          measurements: true,
        },
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Customer not found',
          },
        });
      }

      return res.json({
        success: true,
        data: customer,
      });
    } catch (error) {
      console.error('CUSTOMER GET ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load customer',
        },
      });
    }
  },
);

app.patch(
  '/api/v1/customers/:id',
  authMiddleware,
  requirePermission('customers.update'),
  validateBody(customerUpdateSchema),
  async (req, res) => {
    try {
      const { name, phone, email, address, notes, status } = req.body;

      const updated = await prisma.customer.updateMany({
        where: {
          id: req.params.id,
          tenantId: req.tenantId!,
        },

        data: {
          name,
          phone,
          email,
          address,
          notes,
          status,
        },
      });

      if (updated.count === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Customer not found',
          },
        });
      }

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'CUSTOMER_UPDATED',
        entity: 'Customer',
        entityId: req.params.id as string,
      });

      return res.json({
        success: true,
        data: {
          updated: updated.count,
        },
      });
    } catch (error) {
      console.error('CUSTOMER UPDATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to update customer',
        },
      });
    }
  },
);

app.delete(
  '/api/v1/customers/:id',
  authMiddleware,
  requirePermission('customers.delete'),
  async (req, res) => {
    try {
      const deleted = await prisma.customer.deleteMany({
        where: {
          id: req.params.id,
          tenantId: req.tenantId!,
        },
      });

      if (deleted.count === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Customer not found',
          },
        });
      }

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'CUSTOMER_DELETED',
        entity: 'Customer',
        entityId: req.params.id as string,
      });

      return res.json({
        success: true,
        data: {
          deleted: true,
        },
      });
    } catch (error) {
      console.error('CUSTOMER DELETE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to delete customer',
        },
      });
    }
  },
);

/* =========================================================
   SERVICES
========================================================= */

app.get(
  '/api/v1/services',
  authMiddleware,
  requirePermission('services.read'),
  async (req, res) => {
    try {
      const services = await prisma.service.findMany({
        where: {
          tenantId: req.tenantId!,
        },

        include: {
          category: true,
        },
      });

      return res.json({
        success: true,
        data: services,
      });
    } catch (error) {
      console.error('SERVICES LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load services',
        },
      });
    }
  },
);

app.post(
  '/api/v1/services',
  authMiddleware,
  requirePermission('services.create'),
  validateBody(serviceCreateSchema),
  async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        duration,
        categoryId,
        requiresBooking,
        requiresDelivery,
      } = req.body;

      const service = await prisma.service.create({
        data: {
          tenantId: req.tenantId!,
          name,
          description: description || null,
          price,
          duration: duration || 30,
          categoryId: categoryId || null,
          requiresBooking: requiresBooking || false,
          requiresDelivery: requiresDelivery || false,
          status: 'active',
        },
      });

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'SERVICE_CREATED',
        entity: 'Service',
        entityId: service.id,
      });

      return res.status(201).json({
        success: true,
        data: service,
      });
    } catch (error) {
      console.error('SERVICE CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create service',
        },
      });
    }
  },
);

/* =========================================================
   BOOKINGS
========================================================= */

app.get(
      return res.json({ success: true, data: users.map(u => ({ ...u.user, membershipId: u.id })) });
    } catch (e) { console.error('TENANT USERS ERROR', e); return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Unable to load users' } }); }
  },

    '/api/v1/bookings',
  authMiddleware,
  requirePermission('bookings.read'),
  async (req, res) => {
    try {
      const bookings = await prisma.booking.findMany({
        where: {
          tenantId: req.tenantId!,
        },

        include: {
          customer: true,
          service: true,
          staff: true,
        },

        orderBy: {
          bookingDate: 'desc',
        },
      });

      return res.json({
        success: true,
        data: bookings,
      });
    } catch (error) {
      console.error('BOOKINGS LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load bookings',
        },
      });
    }
  },
);

app.post(
      return res.json({ success: true, data: users.map(u => ({ ...u.user, membershipId: u.id })) });
    } catch (e) { console.error('TENANT USERS ERROR', e); return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Unable to load users' } }); }
  },

    '/api/v1/bookings',
  authMiddleware,
  requirePermission('bookings.create'),
  validateBody(bookingCreateSchema),
  async (req, res) => {
    try {
      const {
        customerId,
        serviceId,
        staffId,
        bookingDate,
        startTime,
        endTime,
        status,
        measurementId,
        notes,
      } = req.body;

      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId: req.tenantId!,
        },
      });

      if (!customer) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CUSTOMER',
            message: 'Customer does not belong to this tenant',
          },
        });
      }

      const service = await prisma.service.findFirst({
        where: {
          id: serviceId,
          tenantId: req.tenantId!,
        },
      });

      if (!service) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SERVICE',
            message: 'Service does not belong to this tenant',
          },
        });
      }

      if (staffId) {
        const staff = await prisma.staff.findFirst({
          where: {
            id: staffId,
            tenantId: req.tenantId!,
          },
        });

        if (!staff) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_STAFF',
              message: 'Staff member does not belong to this tenant',
            },
          });
        }
      }

      const booking = await prisma.booking.create({
        data: {
          tenantId: req.tenantId!,
          customerId,
          serviceId,
          staffId: staffId || null,
          bookingDate: new Date(bookingDate),
          startTime: new Date(startTime || bookingDate),
          endTime: new Date(endTime || bookingDate),
          status: status || 'pending',
          measurementId: measurementId || null,
          notes: notes || null,
        },
      });

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'BOOKING_CREATED',
        entity: 'Booking',
        entityId: booking.id,
      });

      return res.status(201).json({
        success: true,
        data: booking,
      });
    } catch (error) {
      console.error('BOOKING CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create booking',
        },
      });
    }
  },
);

/* =========================================================
   ORDERS
========================================================= */

app.get(
  '/api/v1/orders',
  authMiddleware,
  requirePermission('orders.read'),
  async (req, res) => {
    try {
      const orders = await prisma.order.findMany({
        where: {
          tenantId: req.tenantId!,
        },

        include: {
          customer: true,

          items: {
            include: {
              service: true,
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

      return res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      console.error('ORDERS LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load orders',
        },
      });
    }
  },
);

app.post(
  '/api/v1/orders',
  authMiddleware,
  requirePermission('orders.create'),
  validateBody(orderCreateSchema),
  async (req, res) => {
    try {
      const { customerId, items, priority, expectedDate, notes } = req.body;

      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId: req.tenantId!,
        },
      });

      if (!customer) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CUSTOMER',
            message: 'Customer does not belong to this tenant',
          },
        });
      }

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthlyOrderCount = await prisma.order.count({
        where: {
          tenantId: req.tenantId!,
          createdAt: {
            gte: monthStart,
          },
        },
      });

      const limit = await checkSubscriptionLimit(
        req.tenantId!,
        'orders',
        monthlyOrderCount,
      );

      if (!limit.allowed) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_LIMIT_REACHED',
            message: 'Monthly order limit reached. Upgrade your plan.',
          },
        });
      }

      for (const item of items as any[]) {
        const service = await prisma.service.findFirst({
          where: {
            id: item.serviceId,
            tenantId: req.tenantId!,
          },
        });

        if (!service) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_SERVICE',
              message: `Service ${item.serviceId} does not belong to this tenant`,
            },
          });
        }
      }

      const number =
        'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

      const order = await prisma.order.create({
        data: {
          tenantId: req.tenantId!,
          customerId,
          orderNumber: number,
          priority: priority || 'normal',
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          status: 'received',
          measurementId: measurementId || null,
          notes: notes || null,
        },
      });

      for (const item of items as any[]) {
        await prisma.orderItem.create({
          data: {
            tenantId: req.tenantId!,
            orderId: order.id,
            serviceId: item.serviceId,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice,
            total: (item.unitPrice || 0) * (item.quantity || 1),
          },
        });
      }

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'ORDER_CREATED',
        entity: 'Order',
        entityId: order.id,
      });

      return res.status(201).json({
        success: true,
        data: order,
      });
    } catch (error) {
      console.error('ORDER CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create order',
        },
      });
    }
  },
);

app.get(
  '/api/v1/orders/:id',
  authMiddleware,
  requirePermission('orders.read'),
  async (req, res) => {
    try {
      const order = await prisma.order.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.tenantId!,
        },

        include: {
          customer: true,

          items: {
            include: {
              service: true,
            },
          },

          statusHistory: true,
        },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Order not found',
          },
        });
      }

      return res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      console.error('ORDER GET ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load order',
        },
      });
    }
  },
);

app.post(
  '/api/v1/orders/:id/status',
  authMiddleware,
  requirePermission('orders.update'),
  validateBody(orderStatusUpdateSchema),
  async (req, res) => {
    try {
      const { status, notes } = req.body;

      const existing = await prisma.order.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.tenantId!,
        },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Order not found',
          },
        });
      }

      const order = await prisma.order.update({
        where: {
          id: existing.id,
        },

        data: {
          status,
          notes: notes || undefined,
        },
      });

      await prisma.orderStatusHistory.create({
        data: {
          tenantId: req.tenantId!,
          orderId: order.id,
          status,
          changedBy: req.user?.id || 'system',
          measurementId: measurementId || null,
          notes: notes || null,
        },
      });

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'ORDER_STATUS_CHANGED',
        entity: 'Order',
        entityId: order.id,
        metadata: {
          status,
          notes,
        },
      });

      return res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      console.error('ORDER STATUS ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to update order status',
        },
      });
    }
  },
);

/* =========================================================
   STAFF
========================================================= */

app.get(
  '/api/v1/staff',
  authMiddleware,
  requirePermission('staff.read'),
  async (req, res) => {
    try {
      const staff = await prisma.staff.findMany({
        where: {
          tenantId: req.tenantId!,
        },

        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: staff,
      });
    } catch (error) {
      console.error('STAFF LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load staff',
        },
      });
    }
  },
);

app.post(
  '/api/v1/staff',
  authMiddleware,
  requirePermission('staff.create'),
  validateBody(staffCreateSchema),
  async (req, res) => {
    try {
      const { userId, jobTitle, department, skills } = req.body;

      const membership = await prisma.tenantUser.findFirst({
        where: {
          tenantId: req.tenantId!,
          userId,
          status: 'active',
        },
      });

      if (!membership) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USER',
            message: 'User is not an active member of this tenant',
          },
        });
      }

      const currentStaff = await prisma.staff.count({
        where: {
          tenantId: req.tenantId!,
        },
      });

      const limit = await checkSubscriptionLimit(
        req.tenantId!,
        'staff',
        currentStaff,
      );

      if (!limit.allowed) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_LIMIT_REACHED',
            message: 'Staff limit reached. Upgrade plan.',
          },
        });
      }

      const staff = await prisma.staff.create({
        data: {
          tenantId: req.tenantId!,
          userId,
          jobTitle,
          department: department || null,
          skills: skills || null,
          status: 'active',
        },
      });

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'STAFF_CREATED',
        entity: 'Staff',
        entityId: staff.id,
        metadata: {
          userId,
          jobTitle,
        },
      });

      return res.status(201).json({
        success: true,
        data: staff,
      });
    } catch (error) {
      console.error('STAFF CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create staff member',
        },
      });
    }
  },
);

app.get(
  '/api/v1/tenant-users',
  authMiddleware,
  requirePermission('staff.read'),
  async (req, res) => {
    try {
      const users = await prisma.tenantUser.findMany({
        where: { tenantId: req.tenantId!, status: 'active' },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      return res.json({ success: true, data: users.map((u: any) => ({ ...u.user, membershipId: u.id })) });
    } catch (e) {
      console.error('TENANT USERS ERROR', e);
      return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Unable to load users' } });
    }
  },
);

/* =========================================================
   INVOICES
========================================================= */

app.get(
  '/api/v1/invoices',
  authMiddleware,
  requirePermission('invoices.read'),
  async (req, res) => {
    try {
      const invoices = await prisma.invoice.findMany({
        where: {
          tenantId: req.tenantId!,
        },

        include: {
          customer: true,
          payments: true,
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

      return res.json({
        success: true,
        data: invoices,
      });
    } catch (error) {
      console.error('INVOICE LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load invoices',
        },
      });
    }
  },
);

app.post(
  '/api/v1/invoices',
  authMiddleware,
  requirePermission('invoices.create'),
  validateBody(invoiceCreateSchema),
  async (req, res) => {
    try {
      const {
        customerId,
        orderId,
        subtotal,
        discount = 0,
        tax = 0,
      } = req.body;

      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId: req.tenantId!,
        },
      });

      if (!customer) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CUSTOMER',
            message: 'Customer does not belong to this tenant',
          },
        });
      }

      if (orderId) {
        const order = await prisma.order.findFirst({
          where: {
            id: orderId,
            tenantId: req.tenantId!,
          },
        });

        if (!order) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_ORDER',
              message: 'Order does not belong to this tenant',
            },
          });
        }
      }

      const total =
        Number(subtotal) - Number(discount || 0) + Number(tax || 0);

      const invoice = await prisma.invoice.create({
        data: {
          tenantId: req.tenantId!,
          customerId,
          orderId: orderId || null,
          invoiceNumber: 'INV-' + Date.now(),
          subtotal: Number(subtotal),
          discount: Number(discount),
          tax: Number(tax),
          total,
          balance: total,
          paidAmount: 0,
          status: 'draft',
        },
      });

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'INVOICE_CREATED',
        entity: 'Invoice',
        entityId: invoice.id,
      });

      return res.status(201).json({
        success: true,
        data: invoice,
      });
    } catch (error) {
      console.error('INVOICE CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create invoice',
        },
      });
    }
  },
);

/* =========================================================
   PAYMENTS
========================================================= */

app.get(
  '/api/v1/payments',
  authMiddleware,
  requirePermission('payments.read'),
  async (req, res) => {
    try {
      const payments = await prisma.payment.findMany({
        where: {
          tenantId: req.tenantId!,
        },

        include: {
          invoice: true,
          customer: true,
        },

        orderBy: {
          paidAt: 'desc',
        },
      });

      return res.json({
        success: true,
        data: payments,
      });
    } catch (error) {
      console.error('PAYMENT LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load payments',
        },
      });
    }
  },
);

app.post(
  '/api/v1/payments',
  authMiddleware,
  requirePermission('payments.create'),
  validateBody(paymentCreateSchema),
  async (req, res) => {
    try {
      const { invoiceId, customerId, amount, method, reference } = req.body;

      const invoice = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          tenantId: req.tenantId!,
        },
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Invoice not found',
          },
        });
      }

      if (invoice.customerId !== customerId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CUSTOMER',
            message: 'Invoice does not belong to this customer',
          },
        });
      }

      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId: req.tenantId!,
        },
      });

      if (!customer) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CUSTOMER',
            message: 'Customer does not belong to this tenant',
          },
        });
      }

      const amountNumber = Number(amount);

      const payment = await prisma.$transaction(async (tx: any) => {
        const createdPayment = await tx.payment.create({
          data: {
            tenantId: req.tenantId!,
            invoiceId,
            customerId,
            amount: amountNumber,
            method: method || 'cash',
            reference: reference || null,
            status: 'completed',
            paidAt: new Date(),
          },
        });

        const newPaidAmount = Number(invoice.paidAmount) + amountNumber;
        const newBalance = Number(invoice.balance) - amountNumber;

        await tx.invoice.update({
          where: {
            id: invoice.id,
          },

          data: {
            paidAmount: newPaidAmount,
            balance: newBalance,
            status: newBalance <= 0 ? 'paid' : 'partially_paid',
          },
        });

        return createdPayment;
      });

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'PAYMENT_RECORDED',
        entity: 'Payment',
        entityId: payment.id,
        metadata: {
          amount: amountNumber,
          method: method || 'cash',
          invoiceId,
        },
      });

      return res.status(201).json({
        success: true,
        data: payment,
      });
    } catch (error) {
      console.error('PAYMENT CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to record payment',
        },
      });
    }
  },
);

/* =========================================================
   ANALYTICS
========================================================= */

app.get(
  '/api/v1/analytics/dashboard',
  authMiddleware,
  requirePermission('analytics.read'),
  async (req, res) => {
    try {
      const [customers, orders, revenueAgg] = await Promise.all([
        prisma.customer.count({
          where: {
            tenantId: req.tenantId!,
          },
        }),

        prisma.order.count({
          where: {
            tenantId: req.tenantId!,
          },
        }),

        prisma.invoice.aggregate({
          where: {
            tenantId: req.tenantId!,
            status: 'paid',
          },

          _sum: {
            total: true,
          },
        }),
      ]);

      return res.json({
        success: true,
        data: {
          customers,
          orders,
          revenue: revenueAgg._sum.total || 0,
        },
      });
    } catch (error) {
      console.error('ANALYTICS ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load analytics',
        },
      });
    }
  },
);

/* =========================================================
   TAILORING - MEASUREMENT FIELDS
========================================================= */

app.get(
  '/api/v1/tailoring/measurement-fields',
  authMiddleware,
  requirePermission('tailoring.read'),
  async (req, res) => {
    try {
      const fields = await prisma.measurementField.findMany({
        where: {
          tenantId: req.tenantId!,
        },

        orderBy: {
          sortOrder: 'asc',
        },
      });

      return res.json({
        success: true,
        data: fields,
      });
    } catch (error) {
      console.error('MEASUREMENT FIELD LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load measurement fields',
        },
      });
    }
  },
);

app.post(
  '/api/v1/tailoring/measurement-fields',
  authMiddleware,
  requirePermission('tailoring.create'),
  validateBody(measurementFieldCreateSchema),
  async (req, res) => {
    try {
      const { name, label, type, isCustom, sortOrder } = req.body;

      const field = await prisma.measurementField.create({
        data: {
          tenantId: req.tenantId!,
          name,
          label,
          type: type || 'number',
          isCustom: isCustom ?? true,
          sortOrder: sortOrder || 0,
        },
      });

      return res.status(201).json({
        success: true,
        data: field,
      });
    } catch (error) {
      console.error('MEASUREMENT FIELD CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create measurement field',
        },
      });
    }
  },
);

/* =========================================================
   TAILORING - MEASUREMENTS
========================================================= */

app.get(
  '/api/v1/tailoring/measurements',
  authMiddleware,
  requirePermission('tailoring.read'),
  async (req, res) => {
    try {
      const measurements = await prisma.measurement.findMany({
        where: {
          tenantId: req.tenantId!,
        },

        include: {
          customer: true,
          garment: true,

          creator: {
            select: {
              id: true,
              name: true,
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

      return res.json({
        success: true,
        data: measurements,
      });
    } catch (error) {
      console.error('MEASUREMENT LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load measurements',
        },
      });
    }
  },
);

app.post(
  '/api/v1/tailoring/measurements',
  authMiddleware,
  requirePermission('tailoring.create'),
  validateBody(measurementCreateSchema),
  async (req, res) => {
    try {
      const { customerId, garmentId, fields } = req.body;

      if (customerId) {
        const customer = await prisma.customer.findFirst({
          where: {
            id: customerId,
            tenantId: req.tenantId!,
          },
        });

        if (!customer) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_CUSTOMER',
              message: 'Customer does not belong to this tenant',
            },
          });
        }
      }

      if (garmentId) {
        const garment = await prisma.garment.findFirst({
          where: {
            id: garmentId,
            tenantId: req.tenantId!,
          },
        });

        if (!garment) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_GARMENT',
              message: 'Garment does not belong to this tenant',
            },
          });
        }
      }

      const measurement = await prisma.measurement.create({
        data: {
          tenantId: req.tenantId!,
          customerId: customerId || null,
          garmentId: garmentId || null,

          // Prisma field is Json, so store the object directly.
          fields: fields ?? {},

          createdBy: req.user!.id,
        },
      });

      return res.status(201).json({
        success: true,
        data: measurement,
      });
    } catch (error) {
      console.error('MEASUREMENT CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create measurement',
        },
      });
    }
  },
);

/* =========================================================
   TAILORING - GARMENTS
========================================================= */

app.get(
  '/api/v1/tailoring/garments',
  authMiddleware,
  requirePermission('tailoring.read'),
  async (req, res) => {
    try {
      const garments = await prisma.garment.findMany({
        where: {
          tenantId: req.tenantId!,
        },

        include: {
          customer: true,
          measurements: true,
          designs: true,
          order: true,
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

      return res.json({
        success: true,
        data: garments,
      });
    } catch (error) {
      console.error('GARMENTS LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load garments',
        },
      });
    }
  },
);

app.post(
  '/api/v1/tailoring/garments',
  authMiddleware,
  requirePermission('tailoring.create'),
  validateBody(garmentCreateSchema),
  async (req, res) => {
    try {
      const {
        customerId,
        name,
        category,
        description,
        designRefUrl,
        orderId,
      } = req.body;

      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId: req.tenantId!,
        },
      });

      if (!customer) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CUSTOMER',
            message: 'Customer does not belong to this tenant',
          },
        });
      }

      if (orderId) {
        const order = await prisma.order.findFirst({
          where: {
            id: orderId,
            tenantId: req.tenantId!,
          },
        });

        if (!order) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_ORDER',
              message: 'Order does not belong to this tenant',
            },
          });
        }
      }

      const garment = await prisma.garment.create({
        data: {
          tenantId: req.tenantId!,
          customerId,
          name,
          category: category || null,
          description: description || null,
          designRefUrl: designRefUrl || null,
          orderId: orderId || null,
          status: 'pending',
        },
      });

      return res.status(201).json({
        success: true,
        data: garment,
      });
    } catch (error) {
      console.error('GARMENT CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create garment',
        },
      });
    }
  },
);

app.patch(
  '/api/v1/tailoring/garments/:id/status',
  authMiddleware,
  requirePermission('tailoring.update'),
  validateBody(garmentStatusSchema),
  async (req, res) => {
    try {
      const { status } = req.body;

      const garment = await prisma.garment.updateMany({
        where: {
          id: req.params.id,
          tenantId: req.tenantId!,
        },

        data: {
          status,
        },
      });

      if (garment.count === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Garment not found',
          },
        });
      }

      return res.json({
        success: true,
        data: {
          updated: garment.count,
        },
      });
    } catch (error) {
      console.error('GARMENT STATUS ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to update garment status',
        },
      });
    }
  },
);

/* =========================================================
   TAILORING - ORDERS
========================================================= */

app.get(
  '/api/v1/tailoring/orders',
  authMiddleware,
  requirePermission('tailoring.read'),
  async (req, res) => {
    try {
      const tailoringOrders = await prisma.tailoringOrder.findMany({
        where: {
          tenantId: req.tenantId!,
        },

        include: {
          order: true,
          customer: true,
          garment: true,

          staff: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

      return res.json({
        success: true,
        data: tailoringOrders,
      });
    } catch (error) {
      console.error('TAILORING ORDERS LIST ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to load tailoring orders',
        },
      });
    }
  },
);

app.post(
  '/api/v1/tailoring/orders',
  authMiddleware,
  requirePermission('tailoring.create'),
  validateBody(tailoringOrderCreateSchema),
  async (req, res) => {
    try {
      const {
        orderId,
        customerId,
        garmentId,
        staffId,
        status,
        deliveryDate,
        priority,
        measurementId,
        notes,
      } = req.body;

      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          tenantId: req.tenantId!,
        },
      });

      if (!order) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ORDER',
            message: 'Order does not belong to this tenant',
          },
        });
      }

      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId: req.tenantId!,
        },
      });

      if (!customer) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CUSTOMER',
            message: 'Customer does not belong to this tenant',
          },
        });
      }

      if (garmentId) {
        const garment = await prisma.garment.findFirst({
          where: {
            id: garmentId,
            tenantId: req.tenantId!,
          },
        });

        if (!garment) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_GARMENT',
              message: 'Garment does not belong to this tenant',
            },
          });
        }
      }

      if (staffId) {
        const staff = await prisma.staff.findFirst({
          where: {
            id: staffId,
            tenantId: req.tenantId!,
          },
        });

        if (!staff) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_STAFF',
              message: 'Staff member does not belong to this tenant',
            },
          });
        }
      }

      if (measurementId) {
        const measurement = await prisma.measurement.findFirst({
          where: { id: measurementId, tenantId: req.tenantId! },
        });
        if (!measurement) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_MEASUREMENT', message: 'Measurement does not belong to this tenant' },
          });
        }
      }

      let resolvedOrderId = orderId;
      if (!resolvedOrderId && customerId && items && Array.isArray(items)) {
        const order = await prisma.order.create({
          data: {
            tenantId: req.tenantId!,
            customerId,
            status: 'pending',
            items: {
              create: items.map((it: any) => ({
                serviceId: it.serviceId || it.service_id,
                quantity: it.quantity || 1,
                price: it.price || 0,
              })),
            },
          },
        });
        resolvedOrderId = order.id;
      }
      if (!resolvedOrderId) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_ORDER', message: 'orderId is required' } });
      }
      const tailoringOrder = await prisma.tailoringOrder.create({
        data: {
          tenantId: req.tenantId!,
          orderId,
          customerId,
          garmentId: garmentId || null,
          staffId: staffId || null,
          status: status || 'received',
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          priority: priority || 'normal',
          measurementId: measurementId || null,
          notes: notes || null,
        },
      });

      return res.status(201).json({
        success: true,
        data: tailoringOrder,
      });
    } catch (error) {
      console.error('TAILORING ORDER CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create tailoring order',
        },
      });
    }
  },
);

app.post(
  '/api/v1/tailoring/orders/:id/status',
  authMiddleware,
  requirePermission('tailoring.update'),
  validateBody(tailoringStatusSchema),
  async (req, res) => {
    try {
      const { status, notes } = req.body;

      const existing = await prisma.tailoringOrder.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.tenantId!,
        },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Tailoring order not found',
          },
        });
      }

      const tailoringOrder = await prisma.tailoringOrder.update({
        where: {
          id: existing.id,
        },

        data: {
          status,
          notes: notes || undefined,
        },
      });

      if (tailoringOrder.garmentId) {
        await prisma.garment.updateMany({
          where: {
            id: tailoringOrder.garmentId,
            tenantId: req.tenantId!,
          },

          data: {
            status,
          },
        });
      }

      return res.json({
        success: true,
        data: tailoringOrder,
      });
    } catch (error) {
      console.error('TAILORING ORDER STATUS ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to update tailoring order',
        },
      });
    }
  },
);

/* =========================================================
   PUBLIC BUSINESS PAGE
========================================================= */

app.get('/api/v1/public/business/:slug', async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: {
        slug: req.params.slug,
      },

      select: {
        id: true,
        name: true,
        businessType: true,
        logoUrl: true,
        address: true,
        city: true,
        country: true,
        phone: true,
        email: true,
        currency: true,
        timezone: true,
        status: true,
      },
    });

    if (!tenant || tenant.status !== 'active') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Business not found',
        },
      });
    }

    const services = await prisma.service.findMany({
      where: {
        tenantId: tenant.id,
        status: 'active',
      },
    });

    return res.json({
      success: true,
      data: {
        ...tenant,
        services,
      },
    });
  } catch (error) {
    console.error('PUBLIC BUSINESS ERROR:', error);

    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Unable to load business',
      },
    });
  }
});

app.get('/api/v1/public/business/:slug/services', async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: {
        slug: req.params.slug,
      },
    });

    if (!tenant || tenant.status !== 'active') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Business not found',
        },
      });
    }

    const services = await prisma.service.findMany({
      where: {
        tenantId: tenant.id,
        status: 'active',
      },

      include: {
        category: true,
      },
    });

    return res.json({
      success: true,
      data: services,
    });
  } catch (error) {
    console.error('PUBLIC SERVICES ERROR:', error);

    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Unable to load services',
      },
    });
  }
});

/* =========================================================
   PUBLIC GUEST ORDER
========================================================= */

app.post(
  '/api/v1/public/business/:slug/orders',
  validateBody(publicOrderSchema),
  async (req, res) => {
    try {
      const {
        customerName,
        customerPhone,
        customerEmail,
        serviceId,
        notes,
        expectedDate,
      } = req.body;

      const tenant = await prisma.tenant.findUnique({
        where: {
          slug: req.params.slug,
        },
      });

      if (!tenant || tenant.status !== 'active') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Business not found',
          },
        });
      }

      let service = null;

      if (serviceId) {
        service = await prisma.service.findFirst({
          where: {
            id: serviceId,
            tenantId: tenant.id,
            status: 'active',
          },
        });

        if (!service) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_SERVICE',
              message: 'Selected service does not belong to this business',
            },
          });
        }
      }

      let customer = await prisma.customer.findFirst({
        where: {
          tenantId: tenant.id,
          phone: customerPhone,
        },
      });

      if (!customer) {
        const currentCustomers = await prisma.customer.count({
          where: {
            tenantId: tenant.id,
          },
        });

        const customerLimit = await checkSubscriptionLimit(
          tenant.id,
          'customers',
          currentCustomers,
        );

        if (!customerLimit.allowed) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'SUBSCRIPTION_LIMIT_REACHED',
              message: 'This business cannot accept more customers right now.',
            },
          });
        }

        customer = await prisma.customer.create({
          data: {
            tenantId: tenant.id,
            name: customerName,
            phone: customerPhone,
            email: customerEmail || null,
            status: 'active',
          },
        });
      }

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthlyOrderCount = await prisma.order.count({
        where: {
          tenantId: tenant.id,
          createdAt: {
            gte: monthStart,
          },
        },
      });

      const orderLimit = await checkSubscriptionLimit(
        tenant.id,
        'orders',
        monthlyOrderCount,
      );

      if (!orderLimit.allowed) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_LIMIT_REACHED',
            message: 'This business cannot accept more orders this month.',
          },
        });
      }

      const number =
        'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

      const order = await prisma.order.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          orderNumber: number,
          status: 'received',
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          measurementId: measurementId || null,
          notes: notes || null,
        },
      });

      if (service) {
        await prisma.orderItem.create({
          data: {
            tenantId: tenant.id,
            orderId: order.id,
            serviceId: service.id,
            quantity: 1,
            unitPrice: Number(service.price),
            total: Number(service.price),
          },
        });
      }

      /*
       * Temporary MVP tracking:
       * use exact UUID so UUID hyphens are not incorrectly split.
       *
       * For production, create a dedicated random trackingToken
       * column in Order and store a cryptographically random token.
       */
      const trackingUrl = `/track/${order.id}`;

      return res.status(201).json({
        success: true,
        data: {
          orderNumber: order.orderNumber,
          trackingUrl,
        },
      });
    } catch (error) {
      console.error('PUBLIC ORDER CREATE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to create order',
        },
      });
    }
  },
);

/* =========================================================
   PUBLIC ORDER TRACKING
========================================================= */

app.get('/api/v1/public/orders/:token', async (req, res) => {
  try {
    /*
     * Current MVP token is exactly the Order UUID.
     * Do NOT split UUID by "-".
     */
    const orderId = req.params.token;

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },

      include: {
        customer: true,

        items: {
          include: {
            service: true,
          },
        },

        statusHistory: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    return res.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        customerName: order.customer.name,

        items: order.items.map((item: any) => ({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,

          service: item.service
            ? {
                id: item.service.id,
                name: item.service.name,
              }
            : null,
        })),

        timeline: order.statusHistory.map((entry: any) => ({
          status: entry.status,
          notes: entry.notes,
          createdAt: entry.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('PUBLIC TRACKING ERROR:', error);

    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Unable to track order',
      },
    });
  }
});

/* =========================================================
   TENANT SWITCHING
========================================================= */

app.post(
  '/api/v1/auth/switch-tenant',
  authMiddleware,
  validateBody(switchTenantSchema),
  async (req, res) => {
    try {
      const { tenantId } = req.body;

      const membership: any = await prisma.tenantUser.findUnique({
        where: {
          tenantId_userId: {
            tenantId,
            userId: req.user!.id,
          },
        },

        include: {
          tenant: true,
        },
      });

      if (!membership || membership.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You are not a member of this tenant',
          },
        });
      }

      const newToken = jwt.sign(
        {
          userId: req.user!.id,
          tenantId,
        },
        env.JWT_SECRET,
        {
          expiresIn: '7d',
        },
      );

      await auditLog({
        tenantId,
        userId: req.user!.id,
        action: 'TENANT_SWITCHED',
        entity: 'Tenant',
        entityId: tenantId,
        metadata: {
          previousTenantId: req.tenantId,
        },
      });

      return res.json({
        success: true,
        data: {
          token: newToken,
          tenant: membership.tenant,
        },
      });
    } catch (error) {
      console.error('TENANT SWITCH ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to switch tenant',
        },
      });
    }
  },
);

/* =========================================================
   SUBSCRIPTIONS
========================================================= */

app.get('/api/v1/subscription/plans', async (_req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: {
        status: 'active',
      },
    });

    return res.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error('SUBSCRIPTION PLANS ERROR:', error);

    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Unable to load subscription plans',
      },
    });
  }
});

app.get('/api/v1/subscription', authMiddleware, async (req, res) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: {
        tenantId: req.tenantId!,
      },

      include: {
        plan: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json({
      success: true,
      data: subscription || null,
    });
  } catch (error) {
    console.error('SUBSCRIPTION GET ERROR:', error);

    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Unable to load subscription',
      },
    });
  }
});

app.post(
  '/api/v1/subscription/subscribe',
  authMiddleware,
  requirePermission('settings.manage'),
  validateBody(subscriptionSchema),
  async (req, res) => {
    try {
      const { planId } = req.body;

      const plan = await prisma.subscriptionPlan.findUnique({
        where: {
          id: planId,
        },
      });

      if (!plan || plan.status !== 'active') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Plan not found',
          },
        });
      }

      const existing = await prisma.subscription.findFirst({
        where: {
          tenantId: req.tenantId!,
        },
      });

      if (existing) {
        await prisma.subscription.update({
          where: {
            id: existing.id,
          },

          data: {
            planId,
            status: 'active',
            startDate: new Date(),
            endDate: null,
          },
        });
      } else {
        await prisma.subscription.create({
          data: {
            tenantId: req.tenantId!,
            planId,
            status: 'active',
            startDate: new Date(),
          },
        });
      }

      await auditLog({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'SUBSCRIPTION_CHANGED',
        entity: 'Subscription',
        entityId: planId,
        metadata: {
          planName: plan.name,
        },
      });

      return res.json({
        success: true,
        data: {
          status: 'active',
          plan,
        },
      });
    } catch (error) {
      console.error('SUBSCRIPTION CHANGE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Unable to change subscription',
        },
      });
    }
  },
);

/* =========================================================
   SUBSCRIPTION LIMIT CHECK
========================================================= */

async function checkSubscriptionLimit(
  tenantId: string,
  type: 'staff' | 'customers' | 'orders',
  currentValue: number,
) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      tenantId,
      status: 'active',
    },

    include: {
      plan: true,
    },
  });

  if (!subscription || !subscription.plan) {
    return {
      allowed: true,
      limit: Infinity,
    };
  }

  const limit =
    type === 'staff'
      ? subscription.plan.maxStaff
      : type === 'customers'
        ? subscription.plan.maxCustomers
        : subscription.plan.maxOrders;

  if (limit === null || limit === undefined) {
    return {
      allowed: true,
      limit: Infinity,
    };
  }

  return {
    allowed: currentValue < limit,
    limit,
  };
}

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(errorHandler);

export default app;

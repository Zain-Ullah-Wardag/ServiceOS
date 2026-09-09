import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const customerCreateSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(50),
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export const customerUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const serviceCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  price: z.number().positive(),
  duration: z.number().int().positive().optional(),
  categoryId: z.string().optional(),
  requiresBooking: z.boolean().optional(),
  requiresDelivery: z.boolean().optional(),
});

export const staffCreateSchema = z.object({
  userId: z.string().min(1),
  jobTitle: z.string().min(1).max(100),
  department: z.string().optional(),
  skills: z.string().optional(),
});

export const bookingCreateSchema = z.object({
  customerId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().optional(),
  bookingDate: z.string().min(1),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
  notes: z.string().optional(),
});

export const orderCreateSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(z.object({ serviceId: z.string(), quantity: z.number().int().positive(), unitPrice: z.number() })).min(1),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
});

export const orderStatusUpdateSchema = z.object({
  status: z.string().min(1),
  notes: z.string().optional(),
});

export const invoiceCreateSchema = z.object({
  customerId: z.string().min(1),
  orderId: z.string().optional(),
  subtotal: z.number(),
  discount: z.number().optional(),
  tax: z.number().optional(),
});

export const paymentCreateSchema = z.object({
  invoiceId: z.string().min(1),
  customerId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(['cash', 'bank_transfer', 'mobile_wallet', 'card', 'online']).optional(),
  reference: z.string().optional(),
});

export const switchTenantSchema = z.object({
  tenantId: z.string().min(1),
});

export const measurementCreateSchema = z.object({
  customerId: z.string().optional(),
  garmentId: z.string().optional(),
  fields: z.record(z.any()).optional(),
});

export const garmentCreateSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  designRefUrl: z.string().url().optional(),
  orderId: z.string().optional(),
});

export const tailoringOrderCreateSchema = z.object({
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  garmentId: z.string().optional(),
  staffId: z.string().optional(),
  status: z.string().optional(),
  deliveryDate: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  measurementId: z.string().optional(),
  notes: z.string().optional(),
});

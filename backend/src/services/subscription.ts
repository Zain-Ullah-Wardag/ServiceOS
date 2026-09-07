import prisma from '../lib/prisma.js';

export async function checkSubscriptionLimit(tenantId: string, type: 'staff' | 'customers' | 'orders', currentValue: number) {
  const sub = await prisma.subscription.findFirst({ where: { tenantId, status: 'active' }, include: { plan: true } });
  if (!sub || !sub.plan) return { allowed: true, limit: Infinity };
  const limit = type === 'staff' ? sub.plan.maxStaff : type === 'customers' ? sub.plan.maxCustomers : sub.plan.maxOrders;
  return { allowed: currentValue < (limit ?? Infinity), limit: limit ?? Infinity };
}

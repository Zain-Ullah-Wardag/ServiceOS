import { Router } from 'express';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();
const authorized = [authMiddleware, requirePermission('staff.create'), requirePermission('settings.manage')];

class StaffOnboardingError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function assignableRoles(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
  const membership = await tx.tenantUser.findFirst({ where: { tenantId, userId, status: 'active' }, include: {
    role: { include: { rolePermissions: { include: { permission: true } } } },
  } });
  const permissions = new Set(membership?.role?.rolePermissions.map(item => item.permission.name) ?? []);
  if (!permissions.has('staff.create') || !permissions.has('settings.manage')) {
    throw new StaffOnboardingError(403, 'FORBIDDEN', 'Staff onboarding requires staff.create and settings.manage');
  }
  const roles = await tx.role.findMany({ where: { tenantId }, include: { rolePermissions: { include: { permission: true } } }, orderBy: { name: 'asc' } });
  // An administrator cannot grant permissions they do not possess.
  return roles.filter(role => role.rolePermissions.every(item => permissions.has(item.permission.name)));
}

router.get('/onboarding-roles', ...authorized, async (req, res, next) => {
  try {
    const roles = await prisma.$transaction(tx => assignableRoles(tx, req.tenantId!, req.user!.id));
    return res.json({ success: true, data: roles.map(role => ({ id: role.id, name: role.name })) });
  } catch (error) { next(error); }
});

router.post('/onboard', ...authorized, validateBody(z.object({
  name: z.string().trim().min(2).max(100), email: z.string().trim().email().transform(value => value.toLowerCase()),
  // bcrypt truncates inputs at 72 bytes: reject instead of silently truncating.
  password: z.string().min(12).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes'),
  roleId: z.string().min(1), jobTitle: z.string().trim().min(1).max(100),
  department: z.string().max(100).optional(), skills: z.string().max(1000).optional(),
}).strict()), async (req, res, next) => {
  try {
    const { name, email, password, roleId, jobTitle, department, skills } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    const data = await prisma.$transaction(async tx => {
      const roles = await assignableRoles(tx, req.tenantId!, req.user!.id);
      if (!roles.some(role => role.id === roleId)) throw new StaffOnboardingError(400, 'INVALID_ROLE', 'Choose an assignable role in this tenant');
      if (await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })) {
        throw new StaffOnboardingError(409, 'EMAIL_IN_USE', 'This email is already registered. No existing account was changed.');
      }
      const user = await tx.user.create({ data: { name, email, passwordHash, status: 'active' }, select: { id: true, name: true, email: true } });
      await tx.tenantUser.create({ data: { tenantId: req.tenantId!, userId: user.id, roleId, status: 'active' } });
      const staff = await tx.staff.create({ data: { tenantId: req.tenantId!, userId: user.id, jobTitle, department, skills, status: 'active' } });
      await tx.auditLog.create({ data: { tenantId: req.tenantId!, userId: req.user!.id, action: 'STAFF_ONBOARDED', entity: 'Staff', entityId: staff.id } });
      return { ...staff, user };
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ success: false, error: { code: 'EMAIL_IN_USE', message: 'This email is already registered. No existing account was changed.' } });
    }
    if (error instanceof StaffOnboardingError) {
      return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    }
    // Never expose a Prisma query/error containing account details or a password hash.
    console.error('Staff onboarding failed unexpectedly');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Unable to create staff account' } });
  }
});

export default router;

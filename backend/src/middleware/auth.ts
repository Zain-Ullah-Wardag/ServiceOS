import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name: string };
      tenantId?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    }
    const token = header.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string; tenantId?: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, email: true, name: true, status: true } });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or inactive user' } });
    }
    req.user = { id: user.id, email: user.email, name: user.name };

    // Derive tenant from token or first active membership if not provided
    let tenantId = decoded.tenantId;
    if (!tenantId) {
      const membership = await prisma.tenantUser.findFirst({ where: { userId: user.id, status: 'active' }, select: { tenantId: true } });
      if (membership) tenantId = membership.tenantId;
    }
    if (!tenantId) {
      return res.status(403).json({ success: false, error: { code: 'NO_TENANT', message: 'No active tenant membership' } });
    }
    // Verify membership for requested tenant
    const membership = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not a member of this tenant' } });
    }
    req.tenantId = tenantId;
    next();
  } catch (e: any) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: e.message || 'Invalid token' } });
  }
}

import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';

export function requirePermission(permissionName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      const tenantId = (req as any).tenantId;
      if (!userId || !tenantId) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing user or tenant context' } });
      }
      const membership = await prisma.tenantUser.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      });
      if (!membership || membership.status !== 'active') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not a member of this tenant' } });
      }
      const role = membership.role;
      if (!role) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No role assigned' } });
      }
      const hasPermission = role.rolePermissions.some(
        (rp: any) => rp.permission?.name === permissionName
      );
      if (!hasPermission) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: `Permission required: ${permissionName}` } });
      }
      next();
    } catch (e: any) {
      return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: e.message } });
    }
  };
}

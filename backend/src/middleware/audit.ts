import prisma from '../lib/prisma.js';

export async function auditLog({
  tenantId,
  userId,
  action,
  entity,
  entityId,
  metadata,
}: {
  tenantId: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Record<string, any>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        entity,
        entityId,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (e) {
    // Non-blocking; never break request for audit failure
    console.error('Audit log failed:', e);
  }
}

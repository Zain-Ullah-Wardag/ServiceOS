import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { measurementError, validateMeasurementFields } from '../services/measurementTemplate.js';

const router = Router();

async function snapshot(tx: Prisma.TransactionClient, id: string, tenantId: string) {
  // Serialize reads/edits with A2.1 transitions and A2.2 creation.
  await tx.$queryRaw`SELECT id FROM tailoring_orders WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE`;
  const order = await tx.tailoringOrder.findFirst({ where: { id, tenantId }, include: {
    order: true, garment: true,
    measurement: { include: { template: { include: { fields: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } } } },
  } });
  if (!order) measurementError(404, 'NOT_FOUND', 'Tailoring order not found');
  const measurement = order.measurement;
  if (!measurement) measurementError(409, 'MEASUREMENT_REQUIRED', 'Order has no linked measurement');
  if (order.order.tenantId !== tenantId || !order.garment || order.garment.tenantId !== tenantId ||
      order.garment.customerId !== order.customerId || measurement.tenantId !== tenantId ||
      measurement.customerId !== order.customerId || measurement.garmentId !== order.garmentId ||
      await tx.tailoringOrder.findFirst({ where: { measurementId: measurement.id, id: { not: order.id } } })) {
    measurementError(409, 'INVALID_MEASUREMENT', 'Measurement must belong exclusively to this order, tenant, customer and garment');
  }
  if (measurement.template && measurement.template.tenantId !== tenantId) {
    measurementError(409, 'INVALID_MEASUREMENT_TEMPLATE', 'Measurement template belongs to another tenant');
  }
  return { order, measurement };
}

router.get('/:id/measurement', authMiddleware, requirePermission('tailoring.read'), async (req, res, next) => {
  try {
    const data = await prisma.$transaction(async tx => {
      const { order, measurement } = await snapshot(tx, req.params.id, req.tenantId!);
      const { template, ...stored } = measurement;
      return { measurement: stored, template: template ? {
        id: template.id, name: template.name, code: template.code, defaultUnit: template.defaultUnit, status: template.status,
      } : null, fields: template?.fields ?? [], editable: order.status === 'measurement' && template !== null, status: order.status };
    });
    return res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.patch('/:id/measurement', authMiddleware, requirePermission('tailoring.update'),
  validateBody(z.object({ fields: z.record(z.unknown()) }).strict()), async (req, res, next) => {
    try {
      const data = await prisma.$transaction(async tx => {
        const { order, measurement } = await snapshot(tx, req.params.id, req.tenantId!);
        if (order.status !== 'measurement') measurementError(409, 'MEASUREMENT_LOCKED', 'Measurements can only be edited in Measurement, before Cutting starts');
        if (!measurement.template) measurementError(409, 'MEASUREMENT_TEMPLATE_REQUIRED', 'Linked measurement has no template definitions');
        const fields: Record<string, unknown> = req.body.fields;
        validateMeasurementFields(fields, measurement.template.fields);
        return tx.measurement.update({ where: { id: measurement.id, tenantId: req.tenantId! }, data: { fields } });
      });
      await auditLog({ tenantId: req.tenantId!, userId: req.user!.id, action: 'TAILORING_MEASUREMENT_UPDATED', entity: 'Measurement', entityId: data.id, metadata: { tailoringOrderId: req.params.id } });
      return res.json({ success: true, data });
    } catch (error) { next(error); }
  });

export default router;

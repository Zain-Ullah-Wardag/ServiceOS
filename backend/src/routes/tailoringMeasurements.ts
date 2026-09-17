import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import {
  loadMeasurementOrder, measurementError, resolveMeasurementTemplate, validateMeasurementFields,
} from '../services/measurementTemplate.js';

const router = Router();
const fallbackId = z.string().min(1).optional();

router.get('/:id/measurement-template', authMiddleware, requirePermission('tailoring.read'),
  validateQuery(z.object({ fallbackTemplateId: fallbackId }).strict()), async (req, res, next) => {
    try {
      const data = await prisma.$transaction(async tx => {
        const order = await loadMeasurementOrder(tx, req.params.id, req.tenantId!);
        return resolveMeasurementTemplate(tx, order, req.query.fallbackTemplateId as string | undefined);
      });
      return res.json({ success: true, data });
    } catch (error) { next(error); }
  });

/**
 * A8.1 GET /api/v1/tailoring/orders/:id/measurement-history
 *
 * Returns the customer's ACTUAL prior saved measurements (newest first, capped
 * at the 10 most recent) that could seed a new measurement for this order.
 *
 * Rules (A8.1, locked):
 * - Only real saved Measurement rows are listed — never template-generated
 *   values and never defaults.
 * - The current order's own snapshot (TailoringOrder.measurementId) is
 *   excluded so the list never contains the order's already-saved values.
 * - Tenant isolation: scoped to the authenticated tenant; orders, garments,
 *   templates and measurements of other tenants are invisible.
 * - Compatibility is judged by measurement-TEMPLATE identity only (never by
 *   customer name): `compatible: true` when the historical measurement used
 *   the SAME template the current order resolves to. Entries from other
 *   templates stay visible and are marked `compatible: false`. If the current
 *   order's template cannot be resolved, entries are still returned but all
 *   marked `compatible: false` (nothing is silently presented as compatible).
 * - Read-only: this endpoint never creates, links or mutates any measurement.
 */
router.get('/:id/measurement-history', authMiddleware, requirePermission('tailoring.read'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId!;
      const order = await loadMeasurementOrder(prisma, req.params.id, tenantId);

      let currentTemplateId: string | null = null;
      try {
        currentTemplateId = (await resolveMeasurementTemplate(prisma, order)).template.id;
      } catch {
        currentTemplateId = null;
      }

      const measurements = await prisma.measurement.findMany({
        where: {
          tenantId,
          customerId: order.customerId,
          ...(order.measurementId ? { id: { not: order.measurementId } } : {}),
        },
        include: {
          garment: { select: { id: true, name: true, category: true } },
          template: { select: { id: true, name: true } },
          tailoringOrders: { select: { id: true, createdAt: true, order: { select: { orderNumber: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const data = measurements.map((measurement) => {
        const source = measurement.tailoringOrders
          ? [...measurement.tailoringOrders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
          : null;
        return {
          measurementId: measurement.id,
          sourceTailoringOrderId: source?.id ?? null,
          sourceOrderNumber: source?.order?.orderNumber ?? null,
          createdAt: measurement.createdAt,
          garment: measurement.garment,
          template: measurement.template ?? { id: null, name: null },
          unit: measurement.unit,
          fields: measurement.fields,
          compatible: currentTemplateId !== null && measurement.templateId === currentTemplateId,
        };
      });

      res.json({ success: true, data });
    } catch (error) { next(error); }
  });

router.post('/:id/measurements', authMiddleware, requirePermission('tailoring.update'),
  validateBody(z.object({ templateId: fallbackId, fields: z.record(z.unknown()) }).strict()),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId!;
      const data = await prisma.$transaction(async tx => {
        // Use the same row lock as A2.1 so creation and workflow changes cannot race.
        await tx.$queryRaw`SELECT id FROM tailoring_orders
          WHERE id = ${req.params.id} AND tenant_id = ${tenantId} FOR UPDATE`;
        const order = await loadMeasurementOrder(tx, req.params.id, tenantId);
        if (order.status !== 'confirmed') measurementError(409, 'INVALID_STATUS_TRANSITION', 'Measurements require a confirmed order');
        if (!order.garmentId || !order.garment) measurementError(409, 'GARMENT_REQUIRED', 'Order requires a garment');
        if (order.measurementId !== null) measurementError(409, 'MEASUREMENT_ALREADY_EXISTS', 'Order already has a measurement');
        if (order.garment.customerId !== order.customerId) measurementError(409, 'INVALID_GARMENT', 'Garment customer must match the order customer');

        const resolved = await resolveMeasurementTemplate(tx, order, req.body.templateId);
        const fields: Record<string, unknown> = req.body.fields;
        validateMeasurementFields(fields, resolved.fields);
        const measurement = await tx.measurement.create({ data: {
          tenantId, customerId: order.customerId, garmentId: order.garmentId,
          createdBy: req.user!.id, templateId: resolved.template.id,
          unit: resolved.template.defaultUnit, fields,
        } });
        await tx.tailoringOrder.update({ where: { id: order.id, tenantId }, data: { measurementId: measurement.id, status: 'measurement' } });
        await tx.order.update({ where: { id: order.orderId, tenantId }, data: { status: 'measurement' } });
        await tx.garment.update({ where: { id: order.garmentId, tenantId, customerId: order.customerId }, data: { status: 'measured' } });
        await tx.orderStatusHistory.create({ data: {
          tenantId, orderId: order.orderId, status: 'measurement', changedBy: req.user!.id,
        } });
        return measurement;
      });
      await auditLog({ tenantId, userId: req.user!.id, action: 'TAILORING_MEASUREMENT_CREATED', entity: 'Measurement', entityId: data.id });
      return res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  });

export default router;

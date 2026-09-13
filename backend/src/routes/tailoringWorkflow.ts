import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { auditLog } from '../middleware/audit.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();
const transitions: Record<string, readonly string[]> = {
  received: ['confirmed', 'cancelled'],
  confirmed: ['measurement', 'cancelled'],
  measurement: ['cutting', 'cancelled'],
  cutting: ['stitching', 'cancelled'],
  stitching: ['finishing', 'cancelled'],
  finishing: ['quality_check', 'cancelled'],
  quality_check: ['ready', 'stitching', 'finishing', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};
const garmentStatuses: Record<string, string> = {
  received: 'pending', confirmed: 'pending', measurement: 'measured',
  cutting: 'cutting', stitching: 'stitching', finishing: 'finishing',
  quality_check: 'quality_check', ready: 'ready', delivered: 'delivered', cancelled: 'cancelled',
};
const notes = z.string().optional();
const statusSchema = z.object({ status: z.string().min(1), notes }).strict();
const confirmSchema = z.object({
  deliveryDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  priority: z.string().min(1).optional(), notes,
}).strict();
const staffSchema = z.object({ staffId: z.string().min(1).nullable() }).strict();
const qcSchema = z.object({
  result: z.enum(['pass', 'rework']), notes,
  returnTo: z.enum(['stitching', 'finishing']).optional(),
}).strict();

function fail(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code });
}

// All four endpoints lock the same row before reading its state. Concurrent
// requests therefore validate against the last committed workflow/assignment.
function workflow(action: 'status' | 'confirm' | 'staff' | 'qc'): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId!;
      const data = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM tailoring_orders
          WHERE id = ${req.params.id} AND tenant_id = ${tenantId} FOR UPDATE`;
        const order = await tx.tailoringOrder.findFirst({
          where: { id: req.params.id, tenantId }, include: { order: true },
        });
        if (!order) fail(404, 'NOT_FOUND', 'Tailoring order not found');
        if (order.order.tenantId !== tenantId) fail(409, 'INVALID_ORDER', 'Parent order belongs to another tenant');

        if (action === 'staff') {
          if (order.status === 'delivered' || order.status === 'cancelled') {
            fail(409, 'INVALID_STATUS_TRANSITION', 'Cannot assign staff in a terminal state');
          }
          const staffId = req.body.staffId as string | null;
          if (staffId !== null && !await tx.staff.findFirst({ where: { id: staffId, tenantId, status: 'active' } })) {
            fail(400, 'INVALID_STAFF', 'Staff must be active and belong to this tenant');
          }
          return tx.tailoringOrder.update({ where: { id: order.id }, data: { staffId } });
        }

        let status: string = req.body.status;
        if (action === 'confirm') status = 'confirmed';
        if (action === 'qc') {
          if (order.status !== 'quality_check') fail(409, 'INVALID_STATUS_TRANSITION', 'QC requires quality_check');
          if (req.body.result === 'rework' && !req.body.returnTo) fail(400, 'RETURN_STAGE_REQUIRED', 'returnTo is required for rework');
          status = req.body.result === 'pass' ? 'ready' : req.body.returnTo;
        }
        if (!transitions[order.status]?.includes(status)) fail(409, 'INVALID_STATUS_TRANSITION', 'Invalid workflow transition');
        const deliveryDate = action === 'confirm' && req.body.deliveryDate
          ? new Date(req.body.deliveryDate) : order.deliveryDate ?? order.order.expectedDate;
        if (status === 'confirmed' && !deliveryDate) fail(400, 'DELIVERY_DATE_REQUIRED', 'Expected delivery date required');
        if (status === 'measurement' && !order.measurementId) fail(409, 'MEASUREMENT_REQUIRED', 'Measurement required');
        if (status === 'cutting' && (!order.staffId || !await tx.staff.findFirst({
          where: { id: order.staffId, tenantId, status: 'active' },
        }))) fail(409, 'STAFF_REQUIRED', 'Active same-tenant staff required');

        const tailoringData: Prisma.TailoringOrderUpdateInput = { status };
        const parentData: Prisma.OrderUpdateInput = { status };
        if (req.body.notes !== undefined) {
          tailoringData.notes = req.body.notes;
          parentData.notes = req.body.notes;
        }
        if (status === 'confirmed') {
          tailoringData.deliveryDate = deliveryDate;
          parentData.expectedDate = deliveryDate;
          if (action === 'confirm' && req.body.priority !== undefined) {
            tailoringData.priority = req.body.priority;
            parentData.priority = req.body.priority;
          }
        }
        if (order.status === 'ready' && status === 'delivered') parentData.completedDate = new Date();
        const updated = await tx.tailoringOrder.update({ where: { id: order.id }, data: tailoringData });
        await tx.order.update({ where: { id: order.orderId, tenantId }, data: parentData });
        if (order.garmentId !== null) {
          await tx.garment.update({ where: { id: order.garmentId, tenantId }, data: { status: garmentStatuses[status] } });
        }
        await tx.orderStatusHistory.create({ data: {
          orderId: order.orderId, tenantId, status, changedBy: req.user!.id,
          notes: req.body.notes ?? (action === 'qc' ? `QC ${req.body.result}` : undefined),
        } });
        return updated;
      });
      const auditAction = action === 'status' ? 'TAILORING_STATUS_CHANGED'
        : action === 'confirm' ? 'TAILORING_ORDER_CONFIRMED'
        : action === 'staff' ? (req.body.staffId === null ? 'TAILORING_STAFF_UNASSIGNED' : 'TAILORING_STAFF_ASSIGNED')
        : req.body.result === 'pass' ? 'TAILORING_QC_PASSED' : 'TAILORING_QC_REWORK';
      await auditLog({ tenantId, userId: req.user!.id, action: auditAction, entity: 'TailoringOrder', entityId: data.id });
      return res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}

router.use(authMiddleware, requirePermission('tailoring.update'));
router.patch('/:id/status', validateBody(statusSchema), workflow('status'));
router.patch('/:id/confirm', validateBody(confirmSchema), workflow('confirm'));
router.patch('/:id/staff', validateBody(staffSchema), workflow('staff'));
router.post('/:id/qc', validateBody(qcSchema), workflow('qc'));

export default router;

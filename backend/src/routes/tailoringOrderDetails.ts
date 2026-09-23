import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { loadMeasurementOrder } from '../services/measurementTemplate.js';

/**
 * A9 — order-specific Fabric & Design details.
 *
 * Storage: TailoringOrderDetails, a 1:1 child of TailoringOrder
 * (unique tailoring_order_id, ON DELETE CASCADE). Details belong to ONE
 * specific tailoring order — historical orders permanently keep their own
 * rows. No row exists until details are first saved; GET then returns
 * `data: null`.
 *
 * Semantics (B3): PATCH
 * - omitted field      = unchanged
 * - explicit null      = clear that field
 * - empty string       = clear (same as null) for text fields
 * - designFields, when present, REPLACES the whole map
 * - on first save EVERY field is optional (design/instructions may be saved
 *   before any fabric information is known)
 *
 * Validation (B4-B6):
 * - fabricSource: optional; when non-null must be 'customer' | 'shop'
 * - fabricType / fabricColor: trimmed, 1..100 chars
 * - fabricQuantity: optional; when present finite, > 0, <= 99999.99
 *   (stored as Decimal(12,2), returned as a string)
 * - fabricUnit: optional; when non-null must be 'meter' | 'yard'
 *   (never invented — null stays null)
 * - designFields: plain object only (arrays rejected), max 30 entries,
 *   key <= 80 chars, value is a trimmed string <= 500 chars
 * - specialInstructions: trimmed, <= 5000 chars
 *
 * Audit (B7): TAILORING_DETAILS_CREATED on first save,
 * TAILORING_DETAILS_UPDATED on later edits (entity 'TailoringOrderDetails',
 * metadata carries only tailoringOrderId — never the payload).
 */

const router = Router();

function detailsError(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code });
}

// Empty string means "clear" for text/quantity fields; null clears too.
const clearableText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.union([
      z.literal(null),
      z.string().transform((value) => value.trim()).pipe(z.string().min(1).max(max)),
    ]),
  );

const clearableQuantity = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.union([
    z.literal(null),
    z.union([z.number(), z.string().transform((value) => Number(String(value).trim()))])
      .pipe(z.number().finite().positive().max(99999.99)),
  ]),
);

const designFieldsSchema = z
  .record(z.string().transform((value) => value.trim()).pipe(z.string().max(500)))
  .refine((fields) => Object.keys(fields).length <= 30, { message: 'At most 30 design fields are allowed' })
  .refine((fields) => Object.keys(fields).every((key) => key.length <= 80), { message: 'Design field names must be at most 80 characters' });

const detailsPatchSchema = z
  .object({
    fabricSource: z.union([z.literal(null), z.enum(['customer', 'shop'])]).optional(),
    fabricType: clearableText(100).optional(),
    fabricColor: clearableText(100).optional(),
    fabricQuantity: clearableQuantity.optional(),
    fabricUnit: z.union([z.literal(null), z.enum(['meter', 'yard'])]).optional(),
    designFields: designFieldsSchema.optional(),
    specialInstructions: clearableText(5000).optional(),
  })
  .strict();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Drop design keys whose value became empty after trimming — empty value
// means "not set", never an empty string in the stored map.
function cleanDesignFields(fields: Record<string, string> | undefined): Record<string, string> {
  if (!fields) return {};
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ''));
}

function toDetailsPayload(details: {
  id: string;
  fabricSource: string | null;
  fabricType: string | null;
  fabricColor: string | null;
  fabricQuantity: unknown;
  fabricUnit: string | null;
  designFields: unknown;
  specialInstructions: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: details.id,
    fabric: {
      source: details.fabricSource,
      type: details.fabricType,
      color: details.fabricColor,
      // Decimal is serialised as a fixed-precision string (project pattern).
      quantity: details.fabricQuantity != null ? new Prisma.Decimal(String(details.fabricQuantity)).toFixed(2) : null,
      unit: details.fabricUnit,
    },
    designFields: isPlainObject(details.designFields) ? details.designFields : {},
    specialInstructions: details.specialInstructions,
    createdAt: details.createdAt,
    updatedAt: details.updatedAt,
  };
}

/**
 * A9 GET /api/v1/tailoring/orders/:id/details
 * Read-only. 404 for unknown/cross-tenant orders. `data: null` when the
 * order has no details yet.
 */
router.get('/:id/details', authMiddleware, requirePermission('tailoring.read'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const order = await loadMeasurementOrder(prisma, req.params.id, tenantId);

    const details = await prisma.tailoringOrderDetails.findUnique({
      where: { tailoringOrderId: order.id },
    });

    res.json({ success: true, data: details ? toDetailsPayload(details) : null });
  } catch (error) {
    next(error);
  }
});

/**
 * A9 PATCH /api/v1/tailoring/orders/:id/details
 * Creates the order's details on first save (201) and updates the SAME row
 * afterwards (200) — a tailoring order can never accumulate duplicate detail
 * rows (unique tailoring_order_id). Never touches another order's details.
 */
router.patch(
  '/:id/details',
  authMiddleware,
  requirePermission('tailoring.update'),
  validateBody(detailsPatchSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const order = await loadMeasurementOrder(prisma, req.params.id, tenantId);
      const body = req.body as z.infer<typeof detailsPatchSchema>;

      const designFields = body.designFields !== undefined ? cleanDesignFields(body.designFields) : undefined;


      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.tailoringOrderDetails.findUnique({
          where: { tailoringOrderId: order.id },
        });

        if (!existing) {
          const created = await tx.tailoringOrderDetails.create({
            data: {
              tenantId,
              tailoringOrderId: order.id,
              // Fabric fields are optional — design/instructions can be
              // saved before any fabric information is known. Nulls are
              // stored as null, never invented.
              fabricSource: body.fabricSource ?? null,
              fabricType: body.fabricType ?? null,
              fabricColor: body.fabricColor ?? null,
              fabricQuantity: body.fabricQuantity != null ? new Prisma.Decimal(body.fabricQuantity) : null,
              fabricUnit: body.fabricUnit ?? null,
              designFields: designFields ?? {},
              specialInstructions: body.specialInstructions ?? null,
            },
          });
          return { created: created, existed: false };
        }

        const updated = await tx.tailoringOrderDetails.update({
          where: { id: existing.id },
          data: {
            ...(body.fabricSource !== undefined ? { fabricSource: body.fabricSource } : {}),
            ...(body.fabricType !== undefined ? { fabricType: body.fabricType } : {}),
            ...(body.fabricColor !== undefined ? { fabricColor: body.fabricColor } : {}),
            ...(body.fabricQuantity !== undefined
              ? { fabricQuantity: body.fabricQuantity === null ? null : new Prisma.Decimal(body.fabricQuantity) }
              : {}),
            ...(body.fabricUnit !== undefined ? { fabricUnit: body.fabricUnit } : {}),
            ...(designFields !== undefined ? { designFields } : {}),
            ...(body.specialInstructions !== undefined ? { specialInstructions: body.specialInstructions } : {}),
          },
        });
        return { created: updated, existed: true };
      });

      await auditLog({
        tenantId,
        userId,
        action: result.existed ? 'TAILORING_DETAILS_UPDATED' : 'TAILORING_DETAILS_CREATED',
        entity: 'TailoringOrderDetails',
        entityId: result.created.id,
        metadata: { tailoringOrderId: order.id },
      });

      res.status(result.existed ? 200 : 201).json({ success: true, data: toDetailsPayload(result.created) });
    } catch (error) {
      next(error);
    }
  },
);

export default router;

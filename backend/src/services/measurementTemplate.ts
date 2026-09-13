import type { Prisma } from '@prisma/client';

export function measurementError(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code });
}

export async function loadMeasurementOrder(tx: Prisma.TransactionClient, id: string, tenantId: string) {
  const order = await tx.tailoringOrder.findFirst({
    where: { id, tenantId },
    include: { garment: true, order: { include: { items: { include: { service: true } } } } },
  });
  if (!order) measurementError(404, 'NOT_FOUND', 'Tailoring order not found');
  if (order.order.tenantId !== tenantId) measurementError(409, 'INVALID_ORDER', 'Invalid parent order');
  if (order.garment && order.garment.tenantId !== tenantId) measurementError(409, 'INVALID_GARMENT', 'Garment must belong to this tenant');
  return order;
}

// Shared by preview and creation. Never choose an arbitrary OrderItem.
export async function resolveMeasurementTemplate(
  tx: Prisma.TransactionClient,
  order: Awaited<ReturnType<typeof loadMeasurementOrder>>,
  fallbackTemplateId?: string,
) {
  const tenantId = order.tenantId;
  async function activeTemplate(id: string) {
    const template = await tx.measurementTemplate.findFirst({
      where: { id, tenantId, status: 'active' },
      select: {
        id: true, name: true, code: true, category: true, defaultUnit: true, status: true,
        fields: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!template) measurementError(409, 'INVALID_MEASUREMENT_TEMPLATE', 'Template must be active and belong to this tenant');
    return template;
  }
  function result(source: 'garment' | 'service' | 'fallback', resolved: Awaited<ReturnType<typeof activeTemplate>>) {
    const { fields, ...template } = resolved;
    return { source, template, fields };
  }

  if (order.garment?.measurementTemplateId) {
    return result('garment', await activeTemplate(order.garment.measurementTemplateId));
  }
  const ids = new Set<string>();
  for (const item of order.order.items) {
    if (item.tenantId !== tenantId || item.service.tenantId !== tenantId) {
      measurementError(409, 'INVALID_SERVICE', 'Order services must belong to this tenant');
    }
    if (item.service.measurementTemplateId) ids.add(item.service.measurementTemplateId);
  }
  // Invalid mappings are rejected, not hidden behind a fallback.
  const templates = await Promise.all([...ids].map(activeTemplate));
  if (templates.length === 1) return result('service', templates[0]);
  if (fallbackTemplateId !== undefined) return result('fallback', await activeTemplate(fallbackTemplateId));
  if (templates.length > 1) measurementError(409, 'AMBIGUOUS_MEASUREMENT_TEMPLATE', 'Services specify different measurement templates');
  measurementError(409, 'MEASUREMENT_TEMPLATE_REQUIRED', 'A measurement template is required');
}

export function validateMeasurementFields(
  fields: Record<string, unknown>,
  definitions: ReadonlyArray<{ name: string; required: boolean }>,
): asserts fields is Record<string, number> {
  for (const definition of definitions) {
    if (definition.required && !Object.prototype.hasOwnProperty.call(fields, definition.name)) {
      measurementError(400, 'MEASUREMENT_FIELD_REQUIRED', `Required measurement field: ${definition.name}`);
    }
  }
  // Custom keys are allowed, but are subject to the same numeric rules.
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      measurementError(400, 'INVALID_MEASUREMENT_VALUE', `Measurement must be a finite number: ${name}`);
    }
  }
}

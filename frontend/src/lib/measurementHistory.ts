/**
 * A8.1 — returning-customer measurement history helpers.
 *
 * "Use as Starting Values" copies values from a PRIOR SAVED measurement into
 * the current, UNSAVED measurement form. Locked rules:
 *
 * - The current order's resolved template is authoritative: only fields that
 *   exist in the current template can be prefilled.
 * - Historical values for fields that are not in the current template are
 *   ignored (never copied, never shown as form fields).
 * - Required fields with no usable historical value stay EMPTY — values are
 *   never invented, defaulted or zero-filled.
 * - Only finite numeric values are copied (as strings, which is the form's
 *   state shape). Booleans, nulls, objects and non-numeric strings are
 *   ignored.
 * - Reuse never links the order to the historical measurement, never patches
 *   the historical row, and never creates anything by itself. The existing
 *   POST /measurements flow creates a brand-new snapshot when the user saves.
 *
 * Compatibility (which entries offer the button at all) is decided by the
 * backend from measurement-template identity only — never by customer name.
 */

export type HistoryEntry = {
  measurementId: string;
  sourceTailoringOrderId: string | null;
  sourceOrderNumber: string | null;
  createdAt: string;
  garment: { id: string; name: string; category: string | null } | null;
  template: { id: string | null; name: string | null };
  unit: string;
  fields: Record<string, unknown>;
  compatible: boolean;
};

/** A field from the CURRENT order's resolved measurement template. */
export type CurrentTemplateField = { name: string; label: string; required?: boolean; unit?: string | null };

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Builds the prefill map for the current (unsaved) measurement form from a
 * historical measurement's stored fields. Keys are exactly the current
 * template's field names; each value is the historical finite number as a
 * string, or '' when no usable value exists (required fields included — the
 * form's own validation then blocks saving until they are filled).
 */
export function reusableMeasurementValues(
  templateFields: CurrentTemplateField[],
  historicalFields: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const source = historicalFields ?? {};
  const values: Record<string, string> = {};
  for (const field of templateFields) {
    const numeric = toFiniteNumber(source[field.name]);
    values[field.name] = numeric === null ? '' : String(numeric);
  }
  return values;
}

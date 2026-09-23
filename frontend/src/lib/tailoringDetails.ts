/**
 * A9 — Fabric & Design details helpers (order-specific).
 *
 * All functions here are pure: they transform display data or form state and
 * never touch the network. The drawer loads details with GET (stale-response
 * gated) and saves with PATCH; after a successful save the drawer refetches
 * from the server and renders THAT response — the local form is never
 * treated as authoritative.
 *
 * Design fields are chosen per garment/service category (A5) as a small,
 * curated set; saved keys outside that set are preserved and displayed
 * safely. This is intentionally NOT a second measurement-template
 * architecture.
 */

export type FabricSource = 'customer' | 'shop';
export type FabricUnit = 'meter' | 'yard';

export const FABRIC_SOURCES: { value: FabricSource; label: string }[] = [
  { value: 'customer', label: 'Customer Provided' },
  { value: 'shop', label: 'Shop Provided' },
];

export const FABRIC_UNITS: FabricUnit[] = ['meter', 'yard'];

/** UI label for a stored fabric source; unknown values display as nothing. */
export function fabricSourceLabel(source: string | null | undefined): string | null {
  return FABRIC_SOURCES.find(option => option.value === source)?.label ?? null;
}

export type DesignFieldSpec = { key: string; label: string };

const KURTA_FIELDS: DesignFieldSpec[] = [
  { key: 'collar', label: 'Collar' },
  { key: 'cuff', label: 'Cuff' },
  { key: 'fit', label: 'Fit' },
  { key: 'chestPocket', label: 'Chest Pocket' },
  { key: 'sidePockets', label: 'Side Pockets' },
  { key: 'daman', label: 'Daman' },
  { key: 'buttons', label: 'Buttons' },
  { key: 'sleeveStyle', label: 'Sleeve Style' },
];

const SUIT_FIELDS: DesignFieldSpec[] = [
  { key: 'fit', label: 'Fit' },
  { key: 'jacketStyle', label: 'Jacket Style' },
  { key: 'lapel', label: 'Lapel' },
  { key: 'buttons', label: 'Buttons' },
  { key: 'vent', label: 'Vent' },
  { key: 'trouserFit', label: 'Trouser Fit' },
  { key: 'pocketStyle', label: 'Pocket Style' },
  { key: 'lining', label: 'Lining' },
];

const SHIRT_FIELDS: DesignFieldSpec[] = [
  { key: 'collar', label: 'Collar' },
  { key: 'cuff', label: 'Cuff' },
  { key: 'fit', label: 'Fit' },
  { key: 'pocket', label: 'Pocket' },
  { key: 'buttons', label: 'Buttons' },
];

/** Fallback generic set for Other/unknown categories (A5). */
const GENERIC_FIELDS: DesignFieldSpec[] = [
  { key: 'fit', label: 'Fit' },
  { key: 'collar', label: 'Collar' },
  { key: 'cuff', label: 'Cuff' },
  { key: 'buttons', label: 'Buttons' },
];

/** Curated design fields for the garment/service category (A5). */
export function designFieldsForCategory(category: string | null | undefined): DesignFieldSpec[] {
  const normalized = (category ?? '').trim().toLowerCase();
  if (normalized === 'kurta' || normalized === 'shalwar kameez') return KURTA_FIELDS;
  if (normalized === 'suit' || normalized === '2-piece suit' || normalized === 'waistcoat') return SUIT_FIELDS;
  if (normalized === 'shirt') return SHIRT_FIELDS;
  return GENERIC_FIELDS;
}

export type SavedFabric = {
  source: string | null;
  type: string | null;
  color: string | null;
  quantity: string | null;
  unit: string | null;
};

export type SavedDetails = {
  id: string;
  fabric: SavedFabric;
  designFields: Record<string, unknown>;
  specialInstructions: string | null;
  createdAt?: string;
  updatedAt?: string;
};

/** "4.50" + "meter" -> "4.5 meters"; missing quantity -> "". */
export function formatQuantity(quantity: string | number | null | undefined, unit: string | null | undefined): string {
  if (quantity === null || quantity === undefined || quantity === '') return '';
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${value}${unit ? ` ${unit}` : ''}`;
}

/** One compact line: "Customer Provided · Wash & Wear · White · 4.5 meters". */
export function formatFabricLine(fabric: SavedFabric | null | undefined): string {
  if (!fabric) return '';
  const parts: string[] = [];
  const source = fabricSourceLabel(fabric.source);
  if (source) parts.push(source);
  if (fabric.type) parts.push(fabric.type);
  if (fabric.color) parts.push(fabric.color);
  const quantity = formatQuantity(fabric.quantity, fabric.unit);
  if (quantity) parts.push(quantity);
  return parts.join(' · ');
}

/**
 * Design entries for display. Unknown keys are shown as-is (never
 * interpreted) and non-string values are safely stringified.
 */
export function designDisplayEntries(
  designFields: Record<string, unknown> | null | undefined,
): { key: string; label: string; value: string }[] {
  if (!designFields || typeof designFields !== 'object' || Array.isArray(designFields)) return [];
  return Object.entries(designFields).map(([key, value]) => ({
    key,
    label: key,
    value: value === null || value === undefined ? '' : typeof value === 'string' ? value : String(value),
  }));
}

/** Special instructions are trimmed for display; internal whitespace is kept. */
export function formatSpecialInstructions(text: string | null | undefined): string {
  return (text ?? '').trim();
}

/** The exact empty-state text shown when the order has no details. */
export function detailsEmptyText(): string {
  return 'No fabric or design details recorded yet.';
}

/** Read-mode action label: Add Details (none saved) vs Edit Details (saved). */
export function detailsActionLabel(saved: SavedDetails | null | undefined): 'Add Details' | 'Edit Details' {
  return saved ? 'Edit Details' : 'Add Details';
}

/**
 * A9 mobile-friendly grouping: design fields use 1 column on narrow drawers
 * (375/430px) and 2 columns on larger ones (768px and up).
 */
export function designGridColumns(viewportWidthPx: number): 1 | 2 {
  return viewportWidthPx >= 640 ? 2 : 1;
}

export type DetailsFormState = {
  fabricSource: FabricSource | '';
  fabricType: string;
  fabricColor: string;
  fabricQuantity: string;
  fabricUnit: FabricUnit | '';
  designFields: Record<string, string>;
  specialInstructions: string;
};

/** Fresh form for a garment category — every design field starts empty. */
export function emptyDetailsForm(category: string | null | undefined): DetailsFormState {
  return {
    fabricSource: '',
    fabricType: '',
    fabricColor: '',
    fabricQuantity: '',
    fabricUnit: '', // never invented — the tailor chooses when known
    designFields: Object.fromEntries(designFieldsForCategory(category).map(field => [field.key, ''])),
    specialInstructions: '',
  };
}

/** Populate the form from a SAVED details payload (null -> empty form). */
export function detailsFormFromSaved(saved: SavedDetails | null | undefined, category: string | null | undefined): DetailsFormState {
  const base = emptyDetailsForm(category);
  if (!saved) return base;
  const quantity = saved.fabric?.quantity;
  return {
    fabricSource: saved.fabric?.source === 'customer' || saved.fabric?.source === 'shop' ? saved.fabric.source : '',
    fabricType: saved.fabric?.type ?? '',
    fabricColor: saved.fabric?.color ?? '',
    fabricQuantity: quantity === null || quantity === undefined || quantity === '' ? '' : String(quantity),
    fabricUnit: saved.fabric?.unit === 'yard' ? 'yard' : saved.fabric?.unit === 'meter' ? 'meter' : '',
    // All saved keys are kept (including ones outside the current category
    // set) so nothing silently disappears when editing.
    designFields: Object.fromEntries(designDisplayEntries(saved.designFields).map(entry => [entry.key, entry.value])),
    specialInstructions: saved.specialInstructions ?? '',
  };
}

export type QuantityCheck = { ok: boolean; error?: string; value: number | null };

/** Client-side quantity check mirroring the server rules (finite, > 0, <= 99999.99). */
export function validateFabricQuantity(value: string | number | null | undefined): QuantityCheck {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { ok: true, value: null };
  }
  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) return { ok: false, error: 'Fabric quantity must be a number.', value: null };
  if (numeric <= 0) return { ok: false, error: 'Fabric quantity must be greater than zero.', value: null };
  if (numeric > 99999.99) return { ok: false, error: 'Fabric quantity is too large.', value: null };
  return { ok: true, value: numeric };
}

export type NormalizedDetails = { valid: boolean; error?: string; payload?: Record<string, unknown> };

/**
 * Normalize the form into the exact PATCH body (server semantics: empty
 * text -> null; design values are trimmed and empty keys dropped). Also
 * enforces the same limits as the server so users get immediate feedback.
 */
export function normalizeDetailsForm(form: DetailsFormState): NormalizedDetails {
  const quantity = validateFabricQuantity(form.fabricQuantity);
  if (!quantity.ok) return { valid: false, error: quantity.error };

  const fabricType = form.fabricType.trim();
  const fabricColor = form.fabricColor.trim();
  if (fabricType.length > 100) return { valid: false, error: 'Fabric type must be at most 100 characters.' };
  if (fabricColor.length > 100) return { valid: false, error: 'Fabric color must be at most 100 characters.' };

  const designFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(form.designFields)) {
    const cleanKey = key.trim();
    const cleanValue = value.trim();
    if (!cleanKey) continue;
    if (cleanKey.length > 80) return { valid: false, error: 'Design field names must be at most 80 characters.' };
    if (cleanValue.length > 500) return { valid: false, error: 'Design values must be at most 500 characters.' };
    if (cleanValue !== '') designFields[cleanKey] = cleanValue; // empty value = unset
  }
  if (Object.keys(designFields).length > 30) return { valid: false, error: 'At most 30 design fields are allowed.' };

  const specialInstructions = form.specialInstructions.trim();
  if (specialInstructions.length > 5000) return { valid: false, error: 'Special instructions must be at most 5000 characters.' };

  return {
    valid: true,
    payload: {
      fabricSource: form.fabricSource === 'customer' || form.fabricSource === 'shop' ? form.fabricSource : null,
      fabricType: fabricType === '' ? null : fabricType,
      fabricColor: fabricColor === '' ? null : fabricColor,
      fabricQuantity: quantity.value,
      fabricUnit: form.fabricUnit === 'meter' || form.fabricUnit === 'yard' ? form.fabricUnit : null,
      designFields,
      specialInstructions: specialInstructions === '' ? null : specialInstructions,
    },
  };
}

/**
 * Cancel: the draft is discarded and the previous authoritative snapshot is
 * returned UNTOUCHED (same reference — nothing is sent to the server).
 */
export function cancelDetailsForm(current: SavedDetails | null, draft: DetailsFormState): SavedDetails | null {
  void draft; // the draft is intentionally ignored
  return current;
}

/**
 * After a successful save, the displayed state is the REFETCHED server
 * payload — never the local form (D3).
 */
export function detailsAfterSave(form: DetailsFormState, refetched: SavedDetails | null): SavedDetails | null {
  void form; // the local form is deliberately not authoritative
  return refetched;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detailsActionLabel, detailsAfterSave, detailsEmptyText, detailsFormFromSaved, designDisplayEntries,
  designFieldsForCategory, designGridColumns, emptyDetailsForm, fabricSourceLabel, formatQuantity,
  formatSpecialInstructions, formatFabricLine, normalizeDetailsForm, validateFabricQuantity, cancelDetailsForm,
} from '../src/lib/tailoringDetails.ts';
import { LatestRequestGate } from '../src/lib/latestRequest.ts';

/**
 * A9 Fabric & Design helper tests (Part J scenarios 1-20, incl. nullable fabric source/unit). The drawer itself
 * loads via GET /tailoring/orders/:id/details (stale-gated) and saves via
 * PATCH, then REFETCHES — these tests pin the pure logic around that flow.
 */

const SAVED = {
  id: 'details-1',
  fabric: { source: 'customer', type: 'Wash & Wear', color: 'White', quantity: '4.50', unit: 'meter' },
  designFields: { collar: 'Ban Collar', cuff: 'Round', fit: 'Regular' },
  specialInstructions: 'Keep sleeves slightly loose.',
};

test('1. no saved details -> "Add Details" action', () => {
  assert.equal(detailsActionLabel(null), 'Add Details');
  assert.equal(detailsActionLabel(undefined), 'Add Details');
});

test('2. saved details -> "Edit Details" action', () => {
  assert.equal(detailsActionLabel(SAVED), 'Edit Details');
});

test('3. fabric source labels map to UI wording (unknown values render nothing)', () => {
  assert.equal(fabricSourceLabel('customer'), 'Customer Provided');
  assert.equal(fabricSourceLabel('shop'), 'Shop Provided');
  assert.equal(fabricSourceLabel('donor'), null);
  assert.equal(fabricSourceLabel(null), null);
});

test('4. quantity display (unit shown exactly as stored, null-safe)', () => {
  assert.equal(formatQuantity('4.50', 'meter'), '4.5 meter');
  assert.equal(formatQuantity(5, 'yard'), '5 yard');
  assert.equal(formatQuantity(null, 'meter'), '');
  assert.equal(formatQuantity('', 'meter'), '');
  assert.equal(formatQuantity('abc', 'meter'), '');
});

test('5. garment-specific design field selection (kurta vs suit vs shirt vs unknown)', () => {
  const kurta = designFieldsForCategory('Kurta').map(field => field.key);
  assert.ok(['collar', 'cuff', 'fit', 'chestPocket', 'sidePockets', 'daman', 'buttons', 'sleeveStyle'].every(key => kurta.includes(key)));
  const suit = designFieldsForCategory('2-Piece Suit').map(field => field.key);
  assert.ok(['fit', 'jacketStyle', 'lapel', 'buttons', 'vent', 'trouserFit', 'pocketStyle', 'lining'].every(key => suit.includes(key)));
  assert.ok(!suit.includes('daman'), 'suit does not show kurta-specific fields');
  const shirt = designFieldsForCategory('shirt').map(field => field.key);
  assert.ok(['collar', 'cuff', 'fit', 'pocket', 'buttons'].every(key => shirt.includes(key)));
  const generic = designFieldsForCategory('Other').map(field => field.key);
  assert.ok(generic.length >= 1, 'unknown categories fall back to a small generic set');
});

test('6. unknown design keys display safely (never crash, values stringified)', () => {
  const entries = designDisplayEntries({ collar: 'Ban Collar', weirdKey_123: 42, empty: null });
  assert.deepEqual(entries.map(entry => entry.key).sort(), ['collar', 'empty', 'weirdKey_123']);
  assert.equal(entries.find(entry => entry.key === 'weirdKey_123').value, '42');
  assert.equal(entries.find(entry => entry.key === 'empty').value, '');
  assert.deepEqual(designDisplayEntries(null), []);
  assert.deepEqual(designDisplayEntries(['array']), []);
});

test('7. form normalization (trim, empty -> null, empty design keys dropped)', () => {
  const form = detailsFormFromSaved(SAVED, 'Kurta');
  form.fabricType = '  Cotton  ';
  form.fabricColor = '   ';
  form.designFields.fit = '';
  form.designFields.extra = '  Embroidery  ';
  const normalized = normalizeDetailsForm(form);
  assert.equal(normalized.valid, true);
  assert.equal(normalized.payload.fabricType, 'Cotton');
  assert.equal(normalized.payload.fabricColor, null);
  assert.equal(normalized.payload.designFields.fit, undefined, 'empty design value is dropped, not saved');
  assert.equal(normalized.payload.designFields.extra, 'Embroidery');
  assert.equal(normalized.payload.designFields.collar, 'Ban Collar');
  assert.equal(normalized.payload.specialInstructions, 'Keep sleeves slightly loose.');
});

test('8. quantity validation (empty ok, zero/negative/non-finite rejected)', () => {
  assert.equal(validateFabricQuantity('').ok, true);
  assert.equal(validateFabricQuantity(null).value, null);
  assert.equal(validateFabricQuantity('4.5').value, 4.5);
  assert.equal(validateFabricQuantity('0').ok, false);
  assert.equal(validateFabricQuantity('-1').ok, false);
  assert.equal(validateFabricQuantity('Infinity').ok, false);
  assert.equal(validateFabricQuantity('abc').ok, false);
  assert.equal(normalizeDetailsForm({ ...detailsFormFromSaved(SAVED, 'Kurta'), fabricQuantity: '0' }).valid, false);
});

test('9. cancel discards the draft without mutating the authoritative snapshot', () => {
  const snapshot = { ...SAVED, designFields: { ...SAVED.designFields } };
  const before = JSON.stringify(snapshot);
  const draft = { ...detailsFormFromSaved(snapshot, 'Kurta'), fabricColor: 'Changed in draft' };
  const result = cancelDetailsForm(snapshot, draft);
  assert.equal(result, snapshot, 'cancel returns the SAME snapshot reference');
  assert.equal(JSON.stringify(snapshot), before, 'the snapshot is unchanged');
  assert.equal(cancelDetailsForm(null, draft), null);
});

test('10. save success relies on the refetched payload, not the local form', () => {
  const serverPayload = { ...SAVED, fabric: { ...SAVED.fabric, color: 'Navy Blue' } };
  const form = { ...detailsFormFromSaved(SAVED, 'Kurta'), fabricColor: 'stale form value' };
  assert.deepEqual(detailsAfterSave(form, serverPayload), serverPayload);
  assert.notEqual(detailsAfterSave(form, serverPayload).fabric.color, form.fabricColor);
});

test('11. stale response protection: an old order response is discarded', () => {
  const gate = new LatestRequestGate();
  const orderA = gate.begin();
  const orderB = gate.begin(); // user switched to order B
  assert.equal(gate.isCurrent(orderA), false, 'order A response must be stale');
  assert.equal(gate.isCurrent(orderB), true);
});

test('12. order switch invalidates any in-flight details request', () => {
  const gate = new LatestRequestGate();
  const request = gate.begin();
  assert.equal(gate.isCurrent(request), true);
  gate.invalidate(); // drawer closed / order switched
  assert.equal(gate.isCurrent(request), false, 'a late response after the switch must be discarded');
});

test('13. special instructions display is trimmed (internal whitespace kept)', () => {
  assert.equal(formatSpecialInstructions('  Keep sleeves slightly loose.  '), 'Keep sleeves slightly loose.');
  assert.equal(formatSpecialInstructions(null), '');
  assert.equal(formatSpecialInstructions('line one\nline two'), 'line one\nline two');
});

test('14. mobile-friendly design field grouping (1 column narrow, 2 columns wide)', () => {
  assert.equal(designGridColumns(375), 1);
  assert.equal(designGridColumns(430), 1);
  assert.equal(designGridColumns(768), 2);
  assert.equal(designGridColumns(1024), 2);
  assert.equal(designGridColumns(1440), 2);
});

test('15. no details does not break the drawer (null-safe display + empty form)', () => {
  assert.equal(detailsActionLabel(null), 'Add Details');
  assert.equal(detailsEmptyText(), 'No fabric or design details recorded yet.');
  assert.deepEqual(designDisplayEntries(null), []);
  const form = detailsFormFromSaved(null, 'Kurta');
  const normalized = normalizeDetailsForm({ ...form, fabricSource: 'shop' });
  assert.equal(normalized.valid, true);
  assert.deepEqual(normalized.payload.designFields, {}, 'no design values -> empty map');
  assert.equal(normalized.payload.specialInstructions, null);
  assert.equal(emptyDetailsForm(null).fabricSource, '');
});

test('16. fabric source is optional: a blank form normalizes to null (design-only save is valid)', () => {
  assert.equal(emptyDetailsForm('Kurta').fabricUnit, '', 'a blank form never invents a unit');
  const form = emptyDetailsForm('Kurta');
  form.designFields.collar = 'Ban Collar';
  const normalized = normalizeDetailsForm(form);
  assert.equal(normalized.valid, true);
  assert.equal(normalized.payload.fabricSource, null);
  assert.equal(normalized.payload.fabricUnit, null);
  assert.deepEqual(normalized.payload.designFields, { collar: 'Ban Collar' });
});

test('17. fabric unit is optional: a quantity can be saved while the unit is still unknown (null)', () => {
  const form = { ...detailsFormFromSaved(SAVED, 'Kurta'), fabricUnit: '', fabricQuantity: '4.5' };
  const normalized = normalizeDetailsForm(form);
  assert.equal(normalized.valid, true);
  assert.equal(normalized.payload.fabricUnit, null);
  assert.equal(normalized.payload.fabricQuantity, 4.5);
  assert.equal(normalized.payload.fabricSource, 'customer', 'unchanged fields stay as saved');
});

test('18. saved null source/unit map to empty form fields (never invented)', () => {
  const savedWithNulls = {
    id: 'details-null',
    fabric: { source: null, type: 'Cotton', color: null, quantity: '3.00', unit: null },
    designFields: { fit: 'Regular' },
    specialInstructions: null,
  };
  const form = detailsFormFromSaved(savedWithNulls, 'Kurta');
  assert.equal(form.fabricSource, '', 'null source -> empty select, not a fabricated choice');
  assert.equal(form.fabricUnit, '', 'null unit -> empty select, never "meter"');
  assert.equal(form.fabricType, 'Cotton');
  assert.equal(form.fabricQuantity, '3.00');
});

test('19. a null unit displays as a bare quantity (no invented unit)', () => {
  assert.equal(formatQuantity('4.50', null), '4.5');
  assert.equal(formatFabricLine({ source: null, type: 'Cotton', color: null, quantity: '3.00', unit: null }), 'Cotton · 3');
  assert.equal(formatFabricLine({ source: null, type: null, color: null, quantity: null, unit: null }), '');
});

test('20. re-saving a design-only order keeps source/unit null when the tailor leaves them untouched', () => {
  const saved = {
    id: 'details-design-only',
    fabric: { source: null, type: null, color: null, quantity: null, unit: null },
    designFields: { collar: 'Ban Collar' },
    specialInstructions: 'No side seams.',
  };
  const form = detailsFormFromSaved(saved, 'Kurta');
  form.designFields.collar = 'Round';
  const normalized = normalizeDetailsForm(form);
  assert.equal(normalized.valid, true);
  assert.equal(normalized.payload.fabricSource, null);
  assert.equal(normalized.payload.fabricUnit, null);
  assert.deepEqual(normalized.payload.designFields, { collar: 'Round' });
  assert.equal(normalized.payload.specialInstructions, 'No side seams.');
});

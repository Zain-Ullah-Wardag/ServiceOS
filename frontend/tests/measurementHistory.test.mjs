import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reusableMeasurementValues } from '../src/lib/measurementHistory.ts';
import { LatestRequestGate } from '../src/lib/latestRequest.ts';

/**
 * A8.1 "Use as Starting Values" prefill rules. The CURRENT order's template
 * is authoritative: only its fields are prefilled, only with finite numeric
 * historical values, and nothing is ever invented for missing required
 * fields. Reuse also never creates anything — this module is pure form
 * prefill, and the drawer's history load is stale-response safe.
 */

const fields = [
  { name: 'chest', label: 'Chest', required: true },
  { name: 'waist', label: 'Waist', required: true },
  { name: 'sleeve', label: 'Sleeve', required: false },
];

test('copies finite numeric values for current-template fields as strings', () => {
  const values = reusableMeasurementValues(fields, { chest: 40, waist: 38.5, sleeve: 24, extra: 1 });
  assert.deepEqual(values, { chest: '40', waist: '38.5', sleeve: '24' });
});

test('historical fields that are not in the current template are ignored (never copied)', () => {
  const values = reusableMeasurementValues(fields, { chest: 40, jacket: 15, torso: 14 });
  assert.deepEqual(Object.keys(values).sort(), ['chest', 'sleeve', 'waist']);
  assert.equal(values.jacket, undefined);
  assert.equal(values.torso, undefined);
});

test('missing required fields stay empty — values are never invented or zero-filled', () => {
  const values = reusableMeasurementValues(fields, { chest: 40 });
  assert.deepEqual(values, { chest: '40', waist: '', sleeve: '' });
});

test('non-numeric historical values are ignored (never coerced to numbers)', () => {
  const values = reusableMeasurementValues(fields, {
    chest: 'n/a', waist: null, sleeve: undefined,
    shoulder: { value: 18 }, collar: true, hem: Number.NaN,
  });
  assert.deepEqual(values, { chest: '', waist: '', sleeve: '' });
});

test('numeric strings are accepted as finite numeric values (defensive)', () => {
  assert.deepEqual(reusableMeasurementValues(fields, { chest: ' 40 ', waist: '38', sleeve: '24.5' }), { chest: '40', waist: '38', sleeve: '24.5' });
});

test('Infinity and empty strings are not finite numeric values', () => {
  assert.deepEqual(reusableMeasurementValues(fields, { chest: Number.POSITIVE_INFINITY, waist: '   ', sleeve: '0' }), { chest: '', waist: '', sleeve: '0' });
});

test('a zero measurement is a valid finite value and is copied', () => {
  assert.equal(reusableMeasurementValues(fields, { chest: 0, waist: 38, sleeve: 24 }).chest, '0');
});

test('null/undefined historical field maps yield all-empty prefill', () => {
  assert.deepEqual(reusableMeasurementValues(fields, null), { chest: '', waist: '', sleeve: '' });
  assert.deepEqual(reusableMeasurementValues(fields, undefined), { chest: '', waist: '', sleeve: '' });
});

test('an empty current template yields an empty prefill (no keys invented)', () => {
  assert.deepEqual(reusableMeasurementValues([], { chest: 40, waist: 38 }), {});
});

test('stale measurement-history responses are discarded by the latest-request gate', () => {
  const gate = new LatestRequestGate();
  const first = gate.begin(); // user opens order A
  const second = gate.begin(); // user quickly opens order B
  assert.equal(gate.isCurrent(first), false, 'the response for order A must be stale');
  assert.equal(gate.isCurrent(second), true, 'the response for order B is current');
  gate.invalidate(); // drawer closed
  assert.equal(gate.isCurrent(second), false, 'a late response after close must be discarded');
});

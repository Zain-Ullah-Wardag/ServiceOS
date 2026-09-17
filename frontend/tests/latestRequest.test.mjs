import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LatestRequestGate } from '../src/lib/latestRequest.ts';

test('pre-mutation response cannot overwrite authoritative measurement refresh', async () => {
  const gate = new LatestRequestGate();
  let rows;
  let completeOld;
  const oldRequest = gate.begin();
  const oldResponse = new Promise(resolve => { completeOld = resolve; }).then(data => {
    if (gate.isCurrent(oldRequest)) rows = data;
  });
  const refreshRequest = gate.begin();
  if (gate.isCurrent(refreshRequest)) rows = [{ status: 'measurement', measurementId: 'saved-measurement' }];
  completeOld([{ status: 'confirmed', measurementId: null }]);
  await oldResponse;
  assert.deepEqual(rows, [{ status: 'measurement', measurementId: 'saved-measurement' }]);
});

test('navigation invalidates requests from the previous section', () => {
  const gate = new LatestRequestGate();
  const oldRequest = gate.begin();
  gate.invalidate();
  assert.equal(gate.isCurrent(oldRequest), false);
});

test('stale errors/finalizers cannot dismiss the loading state of a newer refresh', () => {
  const gate = new LatestRequestGate();
  const old = gate.begin();
  const current = gate.begin();
  assert.equal(gate.isCurrent(old), false);
  assert.equal(gate.isCurrent(current), true);
});

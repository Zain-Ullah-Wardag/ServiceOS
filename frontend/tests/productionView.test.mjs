import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProductionOrders, paginateProductionOrders, emptyProductionFilters, productionStages } from '../src/lib/productionView.ts';
const rows = Array.from({ length: 67 }, (_, index) => ({ id: String(index), status: index % 2 ? 'confirmed' : 'measurement', staffId: index % 2 ? null : 'tailor', priority: index % 3 ? 'normal' : 'urgent', customer: { name: `Customer ${index}` }, garment: { name: index === 3 ? 'Special Kurta' : 'Suit' }, order: { orderNumber: `ORD-${1000 + index}` } }));
test('searches order, customer and garment case-insensitively', () => {
  for (const [search, id] of [[' ord-1003 ', '3'], ['CUSTOMER 23', '23'], ['special kurta', '3']]) assert.equal(filterProductionOrders(rows, { ...emptyProductionFilters, search })[0].id, id);
});
test('combines status, staff and priority filters', () => {
  const result = filterProductionOrders(rows, { search: '', status: 'measurement', staff: 'tailor', priority: 'urgent' });
  assert.ok(result.length);
  assert.ok(result.every(row => row.status === 'measurement' && row.staffId === 'tailor' && row.priority === 'urgent'));
});
test('unassigned and unmatched results remain explicit', () => {
  assert.ok(filterProductionOrders(rows, { ...emptyProductionFilters, staff: 'unassigned' }).every(row => !row.staffId));
  assert.equal(filterProductionOrders(rows, { ...emptyProductionFilters, search: 'not here' }).length, 0);
});
test('67 orders are paginated, with no duplicates or missing records', () => {
  const pages = [1, 2, 3, 4].map(page => paginateProductionOrders(rows, page, 20));
  assert.deepEqual(pages.map(page => page.rows.length), [20, 20, 20, 7]);
  assert.deepEqual(pages.flatMap(page => page.rows), rows);
});
test('a refreshed/filtered shorter list clamps the page and handles empty state', () => {
  assert.equal(paginateProductionOrders(rows.slice(0, 3), 4, 20).page, 1);
  assert.deepEqual(paginateProductionOrders([], 3, 20), { rows: [], page: 1, totalPages: 1, start: 0, end: 0 });
});
test('stepper preserves verified stage order', () => {
  assert.deepEqual(productionStages, ['received', 'confirmed', 'measurement', 'cutting', 'stitching', 'finishing', 'quality_check', 'ready', 'delivered']);
});

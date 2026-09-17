import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProductionOrders, emptyProductionFilters, matchesPaymentFilter, productionPaymentOptions } from '../src/lib/productionView.ts';

/**
 * A8.2 payment-filter scenarios. The filter is AND-combined with the
 * existing search/status/staff/priority filters, and rows whose accounting
 * is 'issue' are shown ONLY under 'all' — never as unpaid/partial/paid.
 */

const row = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  status: 'confirmed',
  staffId: 'staff-1',
  priority: 'normal',
  customer: { name: 'Customer One' },
  garment: { name: 'Suit' },
  order: { orderNumber: 'ORD-1', priority: 'normal' },
  ...over,
});

const acct = (paymentStatus, over = {}) => ({ total: '4000.00', paid: '0.00', balance: '4000.00', paymentStatus, ...over });

const filtersWith = (payment) => ({ ...emptyProductionFilters, ...(payment === undefined ? {} : { payment }) });

const mixedRows = () => [
  row({ id: 'unpaid', accounting: acct('unpaid') }),
  row({ id: 'partial', accounting: acct('partial', { paid: '1500.00', balance: '2500.00' }) }),
  row({ id: 'paid', accounting: acct('paid', { paid: '4000.00', balance: '0.00' }) }),
  row({ id: 'issue', accounting: acct('issue', { paid: null, balance: null }) }),
  row({ id: 'no-accounting' }),
];

const ids = (rows) => rows.map((r) => r.id).sort();

test('option 1: "all" (and a missing payment key) show every row, including issue and rows without accounting', () => {
  const rows = mixedRows();
  assert.deepEqual(ids(filterProductionOrders(rows, filtersWith('all'))), ['issue', 'no-accounting', 'paid', 'partial', 'unpaid']);
  assert.deepEqual(ids(filterProductionOrders(rows, { ...emptyProductionFilters })), ['issue', 'no-accounting', 'paid', 'partial', 'unpaid']);
});

test('option 2: "unpaid" shows only rows classified unpaid', () => {
  assert.deepEqual(ids(filterProductionOrders(mixedRows(), filtersWith('unpaid'))), ['unpaid']);
});

test('option 3: "partial" shows only rows classified partial', () => {
  assert.deepEqual(ids(filterProductionOrders(mixedRows(), filtersWith('partial'))), ['partial']);
});

test('option 4: "paid" shows only rows classified paid', () => {
  assert.deepEqual(ids(filterProductionOrders(mixedRows(), filtersWith('paid'))), ['paid']);
});

test('option 5: "unpaid" never includes accounting-issue rows', () => {
  const result = filterProductionOrders(mixedRows(), filtersWith('unpaid'));
  assert.ok(result.every((r) => r.accounting?.paymentStatus !== 'issue'));
});

test('option 6: "partial" never includes accounting-issue rows', () => {
  const result = filterProductionOrders(mixedRows(), filtersWith('partial'));
  assert.ok(result.every((r) => r.accounting?.paymentStatus !== 'issue'));
});

test('option 7: "paid" never includes accounting-issue rows', () => {
  const result = filterProductionOrders(mixedRows(), filtersWith('paid'));
  assert.ok(result.every((r) => r.accounting?.paymentStatus !== 'issue'));
});

test('option 8: rows without accounting data are not silently treated as unpaid', () => {
  const rows = [row({ id: 'none' }), row({ id: 'unpaid', accounting: acct('unpaid') })];
  assert.deepEqual(ids(filterProductionOrders(rows, filtersWith('unpaid'))), ['unpaid']);
});

test('option 9: a null accounting object matches no specific payment filter', () => {
  const rows = [row({ id: 'null-acct', accounting: null })];
  for (const wanted of ['unpaid', 'partial', 'paid']) {
    assert.equal(filterProductionOrders(rows, filtersWith(wanted)).length, 0, `expected no matches for ${wanted}`);
  }
  assert.equal(filterProductionOrders(rows, filtersWith('all')).length, 1);
});

test('option 10: payment filter ANDs with search', () => {
  const rows = [
    row({ id: 'a', customer: { name: 'Alice' }, accounting: acct('unpaid') }),
    row({ id: 'b', customer: { name: 'Bob' }, accounting: acct('unpaid') }),
  ];
  assert.deepEqual(ids(filterProductionOrders(rows, filtersWith('unpaid'))), ['a', 'b']);
  assert.deepEqual(ids(filterProductionOrders(rows, { ...filtersWith('unpaid'), search: 'alice' })), ['a']);
  assert.equal(filterProductionOrders(rows, { ...filtersWith('paid'), search: 'alice' }).length, 0);
});

test('option 11: payment filter ANDs with status', () => {
  const rows = [
    row({ id: 'a', status: 'confirmed', accounting: acct('partial') }),
    row({ id: 'b', status: 'cutting', accounting: acct('partial') }),
  ];
  assert.deepEqual(ids(filterProductionOrders(rows, { ...filtersWith('partial'), status: 'cutting' })), ['b']);
});

test('option 12: payment filter ANDs with staff (including unassigned)', () => {
  const rows = [
    row({ id: 'a', staffId: 'staff-1', accounting: acct('paid') }),
    row({ id: 'b', staffId: null, accounting: acct('paid') }),
  ];
  assert.deepEqual(ids(filterProductionOrders(rows, { ...filtersWith('paid'), staff: 'staff-1' })), ['a']);
  assert.deepEqual(ids(filterProductionOrders(rows, { ...filtersWith('paid'), staff: 'unassigned' })), ['b']);
});

test('option 13: payment filter ANDs with priority', () => {
  const rows = [
    row({ id: 'a', priority: 'urgent', accounting: acct('unpaid') }),
    row({ id: 'b', priority: 'low', accounting: acct('unpaid') }),
  ];
  assert.deepEqual(ids(filterProductionOrders(rows, { ...filtersWith('unpaid'), priority: 'urgent' })), ['a']);
});

test('matchesPaymentFilter treats an undefined payment value as "all" (backwards compatible)', () => {
  const issueRow = row({ accounting: acct('issue', { paid: null, balance: null }) });
  assert.equal(matchesPaymentFilter(issueRow, undefined), true);
  assert.equal(matchesPaymentFilter(issueRow, null), true);
  assert.equal(matchesPaymentFilter(issueRow, 'all'), true);
  assert.equal(matchesPaymentFilter(issueRow, 'unpaid'), false);
});

test('productionPaymentOptions exposes exactly all/unpaid/partial/paid with display labels', () => {
  assert.deepEqual(productionPaymentOptions.map((o) => o.value), ['all', 'unpaid', 'partial', 'paid']);
  assert.ok(productionPaymentOptions.every((o) => typeof o.label === 'string' && o.label.length > 0));
});

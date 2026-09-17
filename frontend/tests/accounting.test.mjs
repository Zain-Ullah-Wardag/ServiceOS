// Run with Node 20.19+/22.6+: node --experimental-strip-types --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAccountingView,
  EMPTY_PAYMENT_HISTORY_TEXT,
  fullBalanceAmount,
  formatPaymentDate,
  PAYMENT_METHODS,
  paymentHistoryLine,
  paymentMethodLabel,
  paymentStatusLabel,
  toDisplayNumber,
  validatePaymentAmount,
} from '../src/lib/accounting.ts';
import { LatestRequestGate } from '../src/lib/latestRequest.ts';

const noPaymentSnapshot = {
  orderId: 'ord-1',
  tailoringOrderId: 'to-1',
  orderNumber: 'ORD-1',
  total: '4000',
  invoice: null,
  payments: [],
};

const partialSnapshot = {
  orderId: 'ord-1',
  tailoringOrderId: 'to-1',
  orderNumber: 'ORD-1',
  total: '4000',
  invoice: {
    id: 'inv-1',
    invoiceNumber: 'INV-1',
    total: '4000',
    paidAmount: '1500',
    balance: '2500',
    status: 'partially_paid',
    issuedAt: '2026-09-17T09:00:00Z',
  },
  payments: [
    { id: 'p1', amount: '1500', method: 'cash', reference: 'Advance payment', status: 'completed', paidAt: '2026-09-17T14:15:00Z' },
  ],
};

const refreshedAfterSecondPayment = {
  ...partialSnapshot,
  invoice: {
    id: 'inv-1',
    invoiceNumber: 'INV-1',
    total: '4000',
    paidAmount: '2500',
    balance: '1500',
    status: 'partially_paid',
    issuedAt: '2026-09-17T09:00:00Z',
  },
  payments: [
    ...partialSnapshot.payments,
    { id: 'p2', amount: '1000', method: 'mobile_wallet', reference: 'ABC123', status: 'completed', paidAt: '2026-09-18T10:30:00Z' },
  ],
};

const paidSnapshot = {
  ...partialSnapshot,
  invoice: {
    ...partialSnapshot.invoice,
    paidAmount: '4000',
    balance: '0',
    status: 'paid',
  },
};

test('invoice=null shows paid 0, balance = authoritative total, label No Payment', () => {
  const view = deriveAccountingView(noPaymentSnapshot);
  assert.equal(view.total, 4000);
  assert.equal(view.paid, 0);
  assert.equal(view.balance, 4000);
  assert.equal(view.statusLabel, 'No Payment');
  assert.equal(view.hasInvoice, false);
});

test('partial invoice shows label Partially Paid with server paid/balance', () => {
  const view = deriveAccountingView(partialSnapshot);
  assert.equal(view.total, 4000);
  assert.equal(view.paid, 1500);
  assert.equal(view.balance, 2500);
  assert.equal(view.statusLabel, 'Partially Paid');
  assert.equal(paymentStatusLabel(partialSnapshot.invoice), 'Partially Paid');
});

test('zero balance shows label Paid', () => {
  assert.equal(deriveAccountingView(paidSnapshot).statusLabel, 'Paid');
  assert.equal(paymentStatusLabel(paidSnapshot.invoice), 'Paid');
});

test('invoice exists but nothing paid yet still shows No Payment', () => {
  const snapshot = {
    ...noPaymentSnapshot,
    invoice: { id: 'inv-1', invoiceNumber: 'INV-1', total: '4000', paidAmount: '0', balance: '4000', status: 'issued', issuedAt: null },
  };
  assert.equal(deriveAccountingView(snapshot).statusLabel, 'No Payment');
  assert.equal(deriveAccountingView(snapshot).canRecordPayment, true);
});

test('zero amount is rejected', () => {
  assert.deepEqual(validatePaymentAmount('0', 2500), { ok: false, message: 'Amount must be greater than zero.' });
  assert.equal(validatePaymentAmount('0.00', 2500).ok, false);
});

test('negative amount is rejected', () => {
  assert.equal(validatePaymentAmount('-100', 2500).ok, false);
  assert.equal(validatePaymentAmount('-100', 2500).message, 'Amount must be greater than zero.');
});

test('amount above the outstanding balance is rejected', () => {
  const result = validatePaymentAmount('3000', 2500);
  assert.equal(result.ok, false);
  assert.equal(result.message, 'Amount cannot exceed the outstanding balance.');
});

test('missing or non-numeric amounts are rejected with clear messages', () => {
  assert.equal(validatePaymentAmount('', 2500).message, 'Enter an amount.');
  assert.equal(validatePaymentAmount('   ', 2500).message, 'Enter an amount.');
  assert.equal(validatePaymentAmount('abc', 2500).message, 'Enter a valid amount.');
});

test('valid partial and exact-balance amounts are accepted', () => {
  assert.deepEqual(validatePaymentAmount('1500', 2500), { ok: true, amount: 1500 });
  assert.deepEqual(validatePaymentAmount(' 1500 ', 2500), { ok: true, amount: 1500 });
  assert.deepEqual(validatePaymentAmount('2500', 2500), { ok: true, amount: 2500 });
});

test('Pay Full Balance helper returns the current outstanding balance', () => {
  assert.equal(fullBalanceAmount(2500), 2500);
  assert.equal(fullBalanceAmount(1500.5), 1500.5);
  assert.equal(fullBalanceAmount('1500'), 1500);
  assert.equal(fullBalanceAmount(0), 0);
});

test('raw payment method bank_transfer displays Bank Transfer', () => {
  assert.equal(paymentMethodLabel('bank_transfer'), 'Bank Transfer');
  assert.equal(paymentMethodLabel('cash'), 'Cash');
  assert.equal(paymentMethodLabel('card'), 'Card');
  assert.equal(paymentMethodLabel('online'), 'Online');
});

test('raw payment method mobile_wallet displays Mobile Wallet', () => {
  assert.equal(paymentMethodLabel('mobile_wallet'), 'Mobile Wallet');
  const values = PAYMENT_METHODS.map(option => option.value);
  assert.deepEqual(values, ['cash', 'bank_transfer', 'mobile_wallet', 'card', 'online']);
});

test('no Record Payment action when balance is zero', () => {
  assert.equal(deriveAccountingView(paidSnapshot).canRecordPayment, false);
});

test('invoice=null state still permits Record Payment while the total is outstanding', () => {
  assert.equal(deriveAccountingView(noPaymentSnapshot).canRecordPayment, true);
  assert.equal(deriveAccountingView(null).canRecordPayment, false);
});

test('stale accounting response cannot overwrite a newer response', async () => {
  const gate = new LatestRequestGate();
  let published = null;
  const load = fetcher => {
    const request = gate.begin();
    return fetcher().then(snapshot => {
      if (gate.isCurrent(request)) published = snapshot;
    });
  };

  let resolveStale;
  const staleResponse = new Promise(resolve => { resolveStale = resolve; });
  const first = load(() => staleResponse); // starts first, finishes last
  const second = load(() => Promise.resolve(partialSnapshot)); // starts later, finishes first
  resolveStale(noPaymentSnapshot);
  await Promise.all([first, second]);

  assert.equal(published, partialSnapshot);
  assert.equal(published.invoice.id, 'inv-1');
});

test('successful payment path derives UI state from the authoritative refresh, not local arithmetic', () => {
  // Before the second payment:
  const before = deriveAccountingView(partialSnapshot);
  assert.equal(before.paid, 1500);
  assert.equal(before.balance, 2500);
  // After the server records the payment, the refreshed snapshot is the
  // only source of the displayed state:
  const after = deriveAccountingView(refreshedAfterSecondPayment);
  assert.equal(after.paid, 2500);
  assert.equal(after.balance, 1500);
  assert.equal(after.statusLabel, 'Partially Paid');
  assert.equal(after.payments.length, 2);
});

test('payment history keeps backend order and formats each line', () => {
  const view = deriveAccountingView(refreshedAfterSecondPayment);
  assert.deepEqual(view.payments.map(payment => payment.id), ['p1', 'p2']);
  const [first, second] = view.payments.map(paymentHistoryLine);
  assert.equal(first.amount, 1500);
  assert.equal(first.method, 'Cash');
  assert.equal(first.reference, 'Advance payment');
  assert.equal(second.amount, 1000);
  assert.equal(second.method, 'Mobile Wallet');
  assert.equal(second.reference, 'ABC123');
});

test('empty payment history presents the empty-state text', () => {
  const view = deriveAccountingView(noPaymentSnapshot);
  assert.deepEqual(view.payments, []);
  assert.equal(EMPTY_PAYMENT_HISTORY_TEXT, 'No payments recorded yet.');
});

test('payment dates render as "17 Sep 2026 · 2:15 PM" style labels', () => {
  assert.equal(formatPaymentDate(new Date(2026, 8, 17, 14, 15).toISOString()), '17 Sep 2026 · 2:15 PM');
  assert.equal(formatPaymentDate(new Date(2026, 8, 17, 0, 5).toISOString()), '17 Sep 2026 · 12:05 AM');
  assert.equal(formatPaymentDate(null), '-');
  assert.equal(formatPaymentDate('not-a-date'), '-');
});

test('backend decimal strings coerce to display numbers without float drift', () => {
  assert.equal(toDisplayNumber('4000.00'), 4000);
  assert.equal(toDisplayNumber(0), 0);
  assert.equal(toDisplayNumber(null), 0);
  assert.equal(toDisplayNumber(undefined), 0);
  const view = deriveAccountingView({ ...noPaymentSnapshot, total: '4000.00' });
  assert.equal(view.total, 4000);
  assert.equal(view.balance, 4000);
});

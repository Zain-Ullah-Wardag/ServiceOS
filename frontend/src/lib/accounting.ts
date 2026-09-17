/**
 * A7.3 tailoring accounting — display-side helpers only.
 *
 * The backend (GET /api/v1/tailoring/orders/:id/accounting) is the single
 * source of truth for all money. These helpers only derive DISPLAY state
 * from an authoritative snapshot; they never accumulate, repair, or
 * recalculate paid/balance locally. After a recorded payment the UI must
 * refresh from the accounting endpoint and derive everything from the new
 * snapshot.
 */

export type AccountingPayment = {
  id: string;
  amount: string | number;
  method: string;
  reference: string | null;
  status: string;
  paidAt: string;
};

export type AccountingInvoice = {
  id: string;
  invoiceNumber: string;
  total: string | number;
  paidAmount: string | number;
  balance: string | number;
  status: string;
  issuedAt: string | null;
};

export type AccountingData = {
  orderId: string;
  tailoringOrderId: string;
  orderNumber: string;
  total: string | number;
  invoice: AccountingInvoice | null;
  payments: AccountingPayment[];
};

export type PaymentMethodOption = { value: string; label: string };

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_wallet', label: 'Mobile Wallet' },
  { value: 'card', label: 'Card' },
  { value: 'online', label: 'Online' },
];

export function paymentMethodLabel(method?: string | null): string {
  const found = PAYMENT_METHODS.find(entry => entry.value === method);
  if (found) return found.label;
  if (!method) return '-';
  return method.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

/** Coerce a backend decimal (string or number) to a finite display number. */
export function toDisplayNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type AccountingStatusLabel = 'No Payment' | 'Partially Paid' | 'Paid';

/**
 * Business status from the authoritative invoice snapshot:
 * - no invoice yet                    -> No Payment
 * - balance exactly zero              -> Paid
 * - something paid, something due     -> Partially Paid
 * - invoice exists but nothing paid   -> No Payment
 */
export function paymentStatusLabel(invoice: AccountingInvoice | null): AccountingStatusLabel {
  if (!invoice) return 'No Payment';
  const balance = toDisplayNumber(invoice.balance);
  const paid = toDisplayNumber(invoice.paidAmount);
  if (balance === 0) return 'Paid';
  if (paid > 0) return 'Partially Paid';
  return 'No Payment';
}

export type AccountingView = {
  total: number;
  paid: number;
  balance: number;
  statusLabel: AccountingStatusLabel;
  hasInvoice: boolean;
  /** Record Payment is available while anything is still outstanding. */
  canRecordPayment: boolean;
  payments: AccountingPayment[];
};

export const EMPTY_PAYMENT_HISTORY_TEXT = 'No payments recorded yet.';

/**
 * Derive the display view from an authoritative accounting snapshot.
 * With no invoice yet the customer has paid 0 and the full order total is
 * outstanding; with an invoice, paid/balance come from it unchanged.
 */
export function deriveAccountingView(data: AccountingData | null): AccountingView {
  if (!data) {
    return {
      total: 0,
      paid: 0,
      balance: 0,
      statusLabel: 'No Payment',
      hasInvoice: false,
      canRecordPayment: false,
      payments: [],
    };
  }
  const total = toDisplayNumber(data.total);
  const invoice = data.invoice;
  const paid = invoice ? toDisplayNumber(invoice.paidAmount) : 0;
  const balance = invoice ? toDisplayNumber(invoice.balance) : total;
  return {
    total,
    paid,
    balance,
    statusLabel: paymentStatusLabel(invoice),
    hasInvoice: invoice !== null,
    canRecordPayment: balance > 0,
    payments: data.payments || [],
  };
}

export type PaymentAmountResult =
  | { ok: true; amount: number }
  | { ok: false; message: string };

/**
 * Validate a payment amount for display-side submission.
 * The backend remains authoritative; this only gives fast, clear feedback.
 */
export function validatePaymentAmount(raw: string, outstandingBalance: number): PaymentAmountResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: 'Enter an amount.' };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { ok: false, message: 'Enter a valid amount.' };
  if (parsed <= 0) return { ok: false, message: 'Amount must be greater than zero.' };
  const amount = Math.round(parsed * 100) / 100;
  if (amount > toDisplayNumber(outstandingBalance)) {
    return { ok: false, message: 'Amount cannot exceed the outstanding balance.' };
  }
  return { ok: true, amount };
}

/** "Pay Full Balance" fills the amount with the current outstanding balance. */
export function fullBalanceAmount(outstandingBalance: number): number {
  return Math.max(0, Math.round(toDisplayNumber(outstandingBalance) * 100) / 100);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "17 Sep 2026 · 2:15 PM" (local time). */
export function formatPaymentDate(paidAt?: string | null): string {
  if (!paidAt) return '-';
  const date = new Date(paidAt);
  if (Number.isNaN(date.getTime())) return '-';
  let hour = date.getHours() % 12;
  if (hour === 0) hour = 12;
  const minute = String(date.getMinutes()).padStart(2, '0');
  const meridiem = date.getHours() >= 12 ? 'PM' : 'AM';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} · ${hour}:${minute} ${meridiem}`;
}

/** Presentation row for one payment history entry (backend order preserved). */
export function paymentHistoryLine(payment: AccountingPayment): {
  when: string;
  amount: number;
  method: string;
  reference: string;
} {
  return {
    when: formatPaymentDate(payment.paidAt),
    amount: toDisplayNumber(payment.amount),
    method: paymentMethodLabel(payment.method),
    reference: payment.reference || '',
  };
}

import { Prisma } from '@prisma/client';

/**
 * A7/A8 shared production accounting helpers.
 *
 * This module is the SINGLE source of truth for production accounting math.
 * The A7.2 drawer endpoint, the A7.2 invoice-ensure endpoint, the A8.2
 * production order list and every test must use these functions instead of
 * re-implementing the rules (no second definition).
 *
 * Invariants (A7 policy, unchanged):
 * - The authoritative total for a garment order is SUM(OrderItem.total) —
 *   never the invoice's total field, never client-provided values.
 * - A single existing invoice is authoritative only when it matches that
 *   total exactly (subtotal too, zero discount/tax, paidAmount + balance =
 *   total, non-negative, right tenant/order/customer, not cancelled).
 * - All money math is Prisma.Decimal only; no JS float arithmetic.
 */

/**
 * Derive the authoritative order total from SUM(OrderItem.total).
 * Uses Decimal-safe arithmetic only; never trusts client-provided totals.
 */
export function sumOrderItemTotals(items: { total: unknown }[]) {
  return items.reduce(
    (sum, item) => sum.plus(new Prisma.Decimal(String(item.total))),
    new Prisma.Decimal(0),
  );
}

/**
 * Verify that a single existing invoice linked to a tailoring order matches
 * the authoritative order accounting under the current A7 policy.
 * All monetary comparisons use Prisma Decimal; authoritative values are
 * never converted to ordinary JS numbers.
 *
 * Returns false when any invariant fails. Callers must surface an
 * ACCOUNTING_INTEGRITY_ERROR — they must not adopt, repair, or replace the
 * invoice, and no second invoice may be created.
 */
export function isAuthoritativeOperationalInvoice(
  invoice: {
    tenantId: string;
    orderId: string | null;
    customerId: string;
    status: string;
    total: unknown;
    subtotal: unknown;
    discount: unknown;
    tax: unknown;
    paidAmount: unknown;
    balance: unknown;
  },
  order: { id: string; customerId: string },
  tenantId: string,
  authoritativeTotal: Prisma.Decimal,
): boolean {
  const total = new Prisma.Decimal(String(invoice.total));
  const subtotal = new Prisma.Decimal(String(invoice.subtotal));
  const discount = new Prisma.Decimal(String(invoice.discount));
  const tax = new Prisma.Decimal(String(invoice.tax));
  const paidAmount = new Prisma.Decimal(String(invoice.paidAmount));
  const balance = new Prisma.Decimal(String(invoice.balance));

  return (
    invoice.tenantId === tenantId &&
    invoice.orderId === order.id &&
    invoice.customerId === order.customerId &&
    // A cancelled invoice never silently becomes the operational invoice.
    invoice.status !== 'cancelled' &&
    total.equals(authoritativeTotal) &&
    subtotal.equals(authoritativeTotal) &&
    discount.isZero() &&
    tax.isZero() &&
    paidAmount.gte(0) &&
    balance.gte(0) &&
    paidAmount.plus(balance).equals(total)
  );
}

export type ProductionAccountingSummary = {
  total: string;
  paid: string | null;
  balance: string | null;
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'issue';
};

/**
 * A8.2 — compact, display-safe accounting summary for a production tailoring
 * order, enforcing the A7 integrity rules for the order list:
 *
 *  - 0 invoices (after tenant scoping) -> total = SUM(OrderItem.total),
 *    paid 0, balance total, status 'unpaid'.
 *  - exactly 1 invoice that passes `isAuthoritativeOperationalInvoice` ->
 *    total = authoritative order total, paid = invoice.paidAmount,
 *    balance = invoice.balance (both validated by the A7 check), status:
 *    'paid' when balance is zero, 'unpaid' when paid is zero, else 'partial'.
 *  - more than 1 invoice, or a single invoice that fails ANY A7 invariant
 *    (wrong total, cancelled, paid + balance != total, ...) -> status
 *    'issue' with paid/balance reported as null.
 *
 * `paymentStatus` 'issue' must NEVER be counted as unpaid/partial/paid; the
 * UI shows it only under "All payments". Cross-tenant invoices are ignored
 * entirely (they are not even counted toward the multiple-invoices issue).
 */
export function deriveProductionAccounting(
  items: { total: unknown }[],
  invoices: { tenantId?: unknown }[] | null | undefined,
  tenantId: string,
  orderId: string,
  customerId: string,
): ProductionAccountingSummary {
  const authoritativeTotal = sumOrderItemTotals(items);
  const total = authoritativeTotal.toFixed(2);

  // The list include is not tenant-scoped on the invoice relation, so scope
  // explicitly: cross-tenant rows must not influence the summary at all.
  const scoped = (invoices ?? []).filter((invoice) => invoice?.tenantId === tenantId);

  if (scoped.length > 1) {
    return { total, paid: null, balance: null, paymentStatus: 'issue' };
  }
  if (scoped.length === 0) {
    return { total, paid: new Prisma.Decimal(0).toFixed(2), balance: total, paymentStatus: 'unpaid' };
  }

  const invoice = scoped[0] as Parameters<typeof isAuthoritativeOperationalInvoice>[0];
  if (!isAuthoritativeOperationalInvoice(invoice, { id: orderId, customerId }, tenantId, authoritativeTotal)) {
    return { total, paid: null, balance: null, paymentStatus: 'issue' };
  }

  const paid = new Prisma.Decimal(String(invoice.paidAmount));
  const balance = new Prisma.Decimal(String(invoice.balance));
  const paymentStatus = balance.isZero() ? 'paid' : paid.isZero() ? 'unpaid' : 'partial';
  return { total, paid: paid.toFixed(2), balance: balance.toFixed(2), paymentStatus };
}

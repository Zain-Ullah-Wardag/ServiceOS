export const productionStages = ['received', 'confirmed', 'measurement', 'cutting', 'stitching', 'finishing', 'quality_check', 'ready', 'delivered'] as const;

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'issue';

/**
 * A8.2 production payment filter. The `payment` key is OPTIONAL so existing
 * callers that build filters without it keep working unchanged (backwards
 * compatible); a missing value behaves exactly like 'all'.
 */
export type ProductionFilters = { search: string; status: string; staff: string; priority: string; payment?: string };
export const emptyProductionFilters: ProductionFilters = { search: '', status: 'all', staff: 'all', priority: 'all', payment: 'all' };

export const productionPaymentOptions = [
  { value: 'all', label: 'All Payments' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
] as const;

type FilterableOrder = {
  status: string; staffId?: string | null; priority?: string;
  customer?: { name: string }; garment?: { name: string } | null;
  order?: { orderNumber: string; priority?: string };
  /** A8.2 compact summary from GET /api/v1/tailoring/orders. */
  accounting?: { total: string; paid: string | null; balance: string | null; paymentStatus: PaymentStatus } | null;
};

/**
 * A8.2 payment filter semantics (mirrors the backend classification):
 * - 'unpaid'  -> paymentStatus === 'unpaid'
 * - 'partial' -> paymentStatus === 'partial'
 * - 'paid'    -> paymentStatus === 'paid'
 * - 'all' (or missing) -> every row.
 *
 * Rows whose accounting is 'issue' (invalid/inconsistent records) are shown
 * ONLY under 'all' — they must never be counted as unpaid/partial/paid.
 * Rows without accounting data are not silently treated as unpaid either.
 */
export function matchesPaymentFilter(row: FilterableOrder, payment: string | null | undefined): boolean {
  const wanted = payment ?? 'all';
  if (wanted === 'all') return true;
  return row.accounting?.paymentStatus === wanted;
}

export function filterProductionOrders<T extends FilterableOrder>(rows: T[], filters: ProductionFilters): T[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return rows.filter(row =>
    (!query || [row.order?.orderNumber, row.customer?.name, row.garment?.name].some(value => value?.toLocaleLowerCase().includes(query))) &&
    (filters.status === 'all' || row.status === filters.status) &&
    (filters.staff === 'all' || (filters.staff === 'unassigned' ? !row.staffId : row.staffId === filters.staff)) &&
    (filters.priority === 'all' || (row.priority || row.order?.priority || 'normal') === filters.priority) &&
    matchesPaymentFilter(row, filters.payment),
  );
}

export function paginateProductionOrders<T>(rows: T[], requestedPage: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(totalPages, Math.max(1, requestedPage));
  const offset = (page - 1) * size;
  return { rows: rows.slice(offset, offset + size), page, totalPages, start: rows.length ? offset + 1 : 0, end: Math.min(offset + size, rows.length) };
}

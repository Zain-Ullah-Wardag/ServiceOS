export const productionStages = ['received', 'confirmed', 'measurement', 'cutting', 'stitching', 'finishing', 'quality_check', 'ready', 'delivered'] as const;
export type ProductionFilters = { search: string; status: string; staff: string; priority: string };
export const emptyProductionFilters: ProductionFilters = { search: '', status: 'all', staff: 'all', priority: 'all' };

type FilterableOrder = {
  status: string; staffId?: string | null; priority?: string;
  customer?: { name: string }; garment?: { name: string } | null;
  order?: { orderNumber: string; priority?: string };
};

export function filterProductionOrders<T extends FilterableOrder>(rows: T[], filters: ProductionFilters): T[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return rows.filter(row =>
    (!query || [row.order?.orderNumber, row.customer?.name, row.garment?.name].some(value => value?.toLocaleLowerCase().includes(query))) &&
    (filters.status === 'all' || row.status === filters.status) &&
    (filters.staff === 'all' || (filters.staff === 'unassigned' ? !row.staffId : row.staffId === filters.staff)) &&
    (filters.priority === 'all' || (row.priority || row.order?.priority || 'normal') === filters.priority),
  );
}

export function paginateProductionOrders<T>(rows: T[], requestedPage: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(totalPages, Math.max(1, requestedPage));
  const offset = (page - 1) * size;
  return { rows: rows.slice(offset, offset + size), page, totalPages, start: rows.length ? offset + 1 : 0, end: Math.min(offset + size, rows.length) };
}

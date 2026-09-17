export type IntakeCustomer = { id: string; name: string; phone: string; email?: string | null; status?: string | null };
export type IntakeGarment = { id: string; customerId: string; name: string; category?: string | null; description?: string | null };
export const garmentCategories = ['Kurta', 'Shalwar Kameez', '2-Piece Suit', 'Other'];
export function phoneQueryDigits(query: string) {
  const text = query.trim();
  return /^[\d\s().+-]+$/.test(text) ? text.replace(/\D/g, '') : '';
}
/** Search-first drawer: empty input and 1-character name guesses are not a search yet. */
export function isMeaningfulQuery(query: string) {
  const text = query.trim();
  return !!text && (!!phoneQueryDigits(text) || (text.length >= 2 && /\p{L}/u.test(text)));
}
export function searchCustomers(customers: IntakeCustomer[], query: string) {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return [];
  const digits = phoneQueryDigits(text);
  if (digits) return customers.filter(customer => customer.phone.replace(/\D/g, '').includes(digits));
  if (text.length < 2 || !/\p{L}/u.test(text)) return [];
  return customers.filter(customer => customer.name.toLocaleLowerCase().includes(text) || customer.phone.toLocaleLowerCase().includes(text));
}
/** Prefills the quick-registration form from a search query; ambiguous mixed input prefills nothing. */
export function registrationPrefill(query: string): { name: string; phone: string } {
  const text = query.trim();
  if (phoneQueryDigits(text)) return { name: '', phone: text };
  if (text.length >= 2 && /^[\p{L}\s.'’-]+$/u.test(text)) return { name: text, phone: '' };
  return { name: '', phone: '' };
}
export function duplicateCustomer(customers: IntakeCustomer[], phone: string, email: string) {
  const digits = phone.replace(/\D/g, '');
  return customers.find(customer => (!!digits && customer.phone.replace(/\D/g, '') === digits) || (!!email.trim() && customer.email?.toLocaleLowerCase() === email.trim().toLocaleLowerCase()));
}
export function customerGarments(garments: IntakeGarment[], customerId: string) {
  return customerId ? garments.filter(garment => garment.customerId === customerId) : [];
}
export function selectCustomerGarment(garments: IntakeGarment[], customerId: string) {
  const matches = customerGarments(garments, customerId);
  return matches.length === 1 ? matches[0] : null;
}
export function createdRecord<T extends { id: string }>(response: { success?: boolean; data?: T; error?: { message?: string } }): T {
  if (!response?.success || !response.data || typeof response.data.id !== 'string' || !response.data.id.trim()) throw new Error(response?.error?.message || 'The server did not return a saved record. Refresh before retrying.');
  return response.data;
}
export type IntakeItem = { serviceId: string; quantity: string; unitPrice: string };
export function intakeLineTotal(item: IntakeItem): number | null {
  const quantity = Number(item.quantity), unitPrice = Number(item.unitPrice), total = quantity * unitPrice;
  return item.serviceId && item.quantity.trim() && item.unitPrice.trim() && Number.isInteger(quantity) && quantity > 0 && unitPrice >= 0 && Number.isFinite(total) ? total : null;
}
export function intakeOrderPayload(draft: { customerId: string; garmentId: string; priority: string; deliveryDate: string; notes: string; items: IntakeItem[] }) {
  if (!draft.customerId || !draft.garmentId || !draft.items.length || draft.items.some(item => intakeLineTotal(item) === null)) throw new Error('Select a customer, garment and valid service items.');
  return {
    customerId: draft.customerId, garmentId: draft.garmentId, priority: draft.priority,
    deliveryDate: draft.deliveryDate || undefined, notes: draft.notes || undefined,
    items: draft.items.map(item => ({ serviceId: item.serviceId, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })),
  };
}

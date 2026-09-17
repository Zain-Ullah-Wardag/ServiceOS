// Run with Node 22.6+: node --experimental-strip-types --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCustomers, duplicateCustomer, customerGarments, selectCustomerGarment, createdRecord, intakeLineTotal, intakeOrderPayload, garmentCategories } from '../src/lib/intake.ts';
const customers = [{ id: 'c1', name: 'Ahmad Khan', phone: '0300-1234567', email: 'Ahmad@example.com' }, { id: 'c2', name: 'Bilal', phone: '03111234567' }];
const garments = [{ id: 'g1', customerId: 'c1', name: 'Kurta' }, { id: 'g2', customerId: 'c2', name: 'Suit' }];
test('returning customers can search names case-insensitively and formatted phones', () => {
  assert.equal(searchCustomers(customers, ' AHMAD ')[0].id, 'c1');
  assert.equal(searchCustomers(customers, '03001234567')[0].id, 'c1');
  assert.equal(searchCustomers(customers, 'missing').length, 0);
  assert.equal(searchCustomers(customers, 'Customer 6').length, 0); // Digits in a name are not a phone query.
});
test('duplicate check recognizes normalized phone or email, not matching name alone', () => {
  assert.equal(duplicateCustomer(customers, '0300 1234567', '')?.id, 'c1');
  assert.equal(duplicateCustomer(customers, '', 'AHMAD@example.com')?.id, 'c1');
  assert.equal(duplicateCustomer(customers, '0999999999', ''), undefined);
});
test('customer selection only exposes owned garments and auto-selects a sole garment', () => {
  assert.deepEqual(customerGarments(garments, 'c1'), [garments[0]]);
  assert.equal(selectCustomerGarment(garments, 'c1')?.id, 'g1');
  assert.equal(selectCustomerGarment(garments, 'c2')?.id, 'g2');
});
test('changing or clearing customer cannot keep an incompatible garment', () => {
  assert.equal(selectCustomerGarment(garments, 'new-customer'), null);
  assert.equal(selectCustomerGarment(garments, ''), null);
  assert.deepEqual(customerGarments(garments, ''), []);
});
test('multiple garments require explicit selection', () => {
  assert.equal(selectCustomerGarment([...garments, { id: 'g3', customerId: 'c1', name: 'Other' }], 'c1'), null);
});
test('only successfully returned records can be selected after quick creation', () => {
  assert.equal(createdRecord({ success: true, data: customers[0] }).id, 'c1');
  const saved = createdRecord({ success: true, data: garments[0] });
  assert.equal(selectCustomerGarment([saved], 'c1').id, 'g1');
});
test('failed mutations or absent IDs never advance with a fake record', () => {
  assert.throws(() => createdRecord({ success: false, data: customers[0], error: { message: 'Duplicate phone' } }), /Duplicate phone/);
  for (const data of [undefined, {}, { id: '' }, { id: 42 }]) assert.throws(() => createdRecord({ success: true, data }));
});
test('totals enforce positive integer quantity, finite price, and accept free services', () => {
  const item = { serviceId: 's1', quantity: '2', unitPrice: '2500' };
  assert.equal(intakeLineTotal(item), 5000);
  assert.equal(intakeLineTotal({ ...item, unitPrice: '0' }), 0);
  for (const quantity of ['0', '-1', '1.5', '', 'Infinity']) assert.equal(intakeLineTotal({ ...item, quantity }), null);
  for (const unitPrice of ['-1', '', 'NaN', 'Infinity']) assert.equal(intakeLineTotal({ ...item, unitPrice }), null);
});
test('final payload uses returned IDs and numeric items, never creates nested customer/garment or supplies authoritative state', () => {
  const customer = createdRecord({ success: true, data: customers[0] });
  const garment = createdRecord({ success: true, data: garments[0] });
  const payload = intakeOrderPayload({ customerId: customer.id, garmentId: garment.id, priority: 'normal', deliveryDate: '2026-09-25', notes: '', items: [{ serviceId: 's1', quantity: '1', unitPrice: '2500' }, { serviceId: 's2', quantity: '2', unitPrice: '100' }] });
  assert.deepEqual(payload, { customerId: 'c1', garmentId: 'g1', priority: 'normal', deliveryDate: '2026-09-25', notes: undefined, items: [{ serviceId: 's1', quantity: 1, unitPrice: 2500 }, { serviceId: 's2', quantity: 2, unitPrice: 100 }] });
  assert.equal(payload.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), 2700);
  assert.throws(() => intakeOrderPayload({ ...payload, customerId: '', items: [] }));
});
test('controlled categories remain descriptive, not hardcoded measurement fields', () => {
  assert.deepEqual(garmentCategories, ['Kurta', 'Shalwar Kameez', '2-Piece Suit', 'Other']);
});

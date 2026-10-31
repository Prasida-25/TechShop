const { test } = require('node:test');
const assert = require('node:assert/strict');
const { quote } = require('../src/utils/checkout');
const { createCartDatabase } = require('./helpers/cart-database.cjs');
const { createCartRepository } = require('../src/repositories/cart-repository');
const { createCartService } = require('../src/services/cart-service');

// Fixture mới cho mỗi test. Giá là chuỗi DECIMAL, không kết nối MySQL.
function item(price, quantity = 1) {
  return { product_id: 1, variant_id: 1, valid_variant: 1, stock: 10,
    product_name: 'Sản phẩm kiểm thử', price, quantity };
}

for (const [id, price, shipping, total] of [
  ['C1-01', '200000.00', '30000.00', '230000.00'],
  ['C1-02', '300000.00', '0.00', '300000.00'],
  ['C1-03', '400000.00', '0.00', '400000.00'],
]) {
  test(`${id} | unit | tiền hàng ${price}, phí ${shipping}`, () => {
    const actual = quote([item(price)]);
    assert.equal(actual.subtotal, price);
    assert.equal(actual.shipping, shipping);
    assert.equal(actual.total, total);
  });
}

test('C1-04 | unit | cộng nhiều dòng và nhân số lượng', () => {
  const actual = quote([item('100000.00', 2), { ...item('50000.00'), variant_id: 2 }]);
  assert.equal(actual.subtotal, '250000.00');
  assert.equal(actual.shipping, '30000.00');
  assert.equal(actual.total, '280000.00');
});

test('C1-05 | unit | từ chối giỏ trống', () => {
  assert.throws(() => quote([]), { status: 409 });
});

test('C1-06 | unit | từ chối số lượng vượt kho', () => {
  assert.throws(() => quote([item('100000.00', 11)]), { status: 409 });
});

test('C1-07 | unit | không làm mất phần lẻ khi tính tiền', () => {
  const actual = quote([item('100000.01', 3)]);
  assert.equal(actual.subtotal, '300000.03');
  assert.equal(actual.shipping, '0.00');
  assert.equal(actual.total, '300000.03');
});

function cartFixture() {
  const db = createCartDatabase();
  const service = createCartService(createCartRepository(db));
  return { db, service };
}

test('C1-08 | integration mock | gộp cùng biến thể, không trừ kho khi thêm giỏ', async () => {
  const { db, service } = cartFixture();
  const stockBefore = structuredClone(db.state.variants);
  await service.change(1, 'add', { variant_id: '1', quantity: '2' });
  await service.change(1, 'add', { variant_id: '1', quantity: '3' });
  const actual = await service.getCart(1);
  assert.equal(actual.items.length, 1);
  assert.equal(actual.quantity, 5);
  assert.deepEqual(db.state.variants, stockBefore);
});

test('C1-09 | integration mock | bỏ qua giá và user_id giả từ client', async () => {
  const { service } = cartFixture();
  await service.change(1, 'add', { variant_id: '1', quantity: '2', user_id: '2', price: '1', total: '2' });
  assert.equal((await service.getCart(1)).totalLabel, '200.000,02 ₫');
  assert.equal((await service.getCart(2)).items.length, 0);
});

test('C1-10 | integration mock | người khác không xóa được dòng giỏ', async () => {
  const { db, service } = cartFixture();
  await service.change(1, 'add', { variant_id: '1', quantity: '2' });
  const before = structuredClone(db.state.items);
  await assert.rejects(service.change(2, 'remove', {}, String(before[0].cart_item_id)), { status: 404 });
  assert.deepEqual(db.state.items, before);
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createProductDatabase } = require('./helpers/admin-product-database.cjs');
const { createAdminProductRepository, PRODUCT_SQL: SQL } = require('../src/repositories/admin-product-repository');
const { createAdminProductService } = require('../src/services/admin-product-service');
const { withAccountApp } = require('./helpers/account-client.cjs');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = { product_name: 'TEST', category_id: '1', brand: '', description: '', variant_name: 'Đen', sku: 'DELETE-TEST', price: '100000', stock: '5' };
async function setup() {
  const db = createProductDatabase(), repo = createAdminProductRepository(db), service = createAdminProductService(repo);
  await service.saveProduct(undefined, data);
  await service.saveProduct(undefined, { ...data, sku: 'KEEP-TEST' });
  db.state.carts = [{ user_id: 1, variant_id: 1 }, { user_id: 2, variant_id: 1 }, { user_id: 1, variant_id: 2 }];
  return { db, repo, service };
}
const snapshot = db => structuredClone({ products: db.state.products, variants: db.state.variants, options: db.state.options, links: db.state.links, carts: db.state.carts, orderItems: db.state.orderItems, reviews: db.state.reviews });

test('Hộp thoại xóa: Hủy/Escape không gửi form, Xóa gửi đúng một lần, không nhầm sản phẩm', () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/js/admin-product-delete.js'), 'utf8');
  const handlers = {}, message = { textContent: '' };
  const dialog = { open: false, returnValue: '', showModal() { this.open = true; }, addEventListener(name, fn) { handlers[name] = fn; } };
  function form(name) {
    let submit;
    return { dataset: { productName: name }, requests: 0,
      addEventListener(name, fn) { submit = fn; },
      submitEvent() { let prevented = false; submit({ preventDefault() { prevented = true; } }); return prevented; },
      requestSubmit() { if (!this.submitEvent()) this.requests++; },
    };
  }
  const a = form('<TEST>'), b = form('Khác');
  const answers = [];
  vm.runInNewContext(script, { document: {
    querySelector: selector => selector === '[data-product-delete-dialog]' ? dialog : message,
    querySelectorAll: () => [a, b],
  }, window: { confirm: () => answers.shift() } });
  const close = value => { dialog.returnValue = value; dialog.open = false; handlers.close(); };
  assert.equal(a.submitEvent(), true); assert.ok(message.textContent.includes('<TEST>'));
  close('cancel'); assert.equal(a.requests, 0);
  a.submitEvent(); b.submitEvent(); assert.ok(message.textContent.includes('<TEST>'));
  close('delete'); assert.equal(a.requests, 1); assert.equal(b.requests, 0);
  handlers.close(); assert.equal(a.requests, 1);
  b.submitEvent(); assert.equal(dialog.returnValue, 'cancel');
  close(dialog.returnValue); assert.equal(b.requests, 0); // Escape giữ cancel đã reset.
  b.submitEvent(); close('delete'); assert.equal(b.requests, 1);
  dialog.showModal = undefined;
  answers.push(false, true); assert.equal(a.submitEvent(), true); assert.equal(a.submitEvent(), false);
});

test('Xóa sản phẩm: chỉ chưa có đơn, cascade biến thể/thuộc tính/giỏ đúng sản phẩm; không xóa dữ liệu khác (mock)', async () => {
  const { db, service } = await setup();
  db.state.options.push({ product_id: 1, option_value_id: 10 }); db.state.links.push({ variant_id: 1, option_value_id: 10 });
  db.state.orderItems.push({ order_item_id: 9, product_id: 2, variant_id: 2, status: 'delivered' });
  const history = structuredClone(db.state.orderItems);
  assert.equal((await service.detail('1')).has_orders, 0);
  await service.removeProduct('1');
  assert.deepEqual(db.state.products.map(p => p.product_id), [2]); assert.deepEqual(db.state.variants.map(v => v.variant_id), [2]);
  assert.deepEqual(db.state.carts, [{ user_id: 1, variant_id: 2 }]); assert.equal(db.state.options.length, 0); assert.equal(db.state.links.length, 0);
  assert.deepEqual(db.state.orderItems, history);
  assert.ok(!db.state.calls.some(c => /^(DELETE FROM|UPDATE) (orders|order_items)/.test(c.sql)));
  await assert.rejects(service.removeProduct('1', { confirm_delete: '1' }), { status: 404 });
});

test('Xóa sản phẩm: chặn mọi trạng thái đơn, product_id NULL còn variant, và dữ liệu đánh giá bất thường', async () => {
  for (const status of ['pending', 'confirmed', 'shipping', 'delivered', 'cancelled']) {
    for (const reference of [{ product_id: 1, variant_id: null }, { product_id: null, variant_id: 1 }]) {
      const { db, service } = await setup();
      db.state.orderItems.push({ order_item_id: 1, status, ...reference });
      const before = snapshot(db);
      assert.equal((await service.detail('1')).has_orders, 1);
      assert.equal((await service.list({})).products.find(p => p.product_id === 1).has_orders, 1);
      await assert.rejects(service.removeProduct('1', { confirm_delete: '1' }), { status: 409 });
      assert.deepEqual(snapshot(db), before); assert.ok(!db.state.calls.some(c => c.sql === SQL.removeProduct));
    }
  }
  const { db, service } = await setup(); db.state.reviews.push({ product_id: 1 });
  const before = snapshot(db); await assert.rejects(service.removeProduct('1', { confirm_delete: '1' }), { status: 409 }); assert.deepEqual(snapshot(db), before);
});

test('Xóa sản phẩm: ID, đọc lại sau form cũ và rollback toàn bộ cascade khi lỗi ghi/commit', async () => {
  for (const fault of ['remove', 'commit']) {
    const { db, service } = await setup(), before = snapshot(db); db.state.fail = fault;
    await assert.rejects(service.removeProduct('1', { confirm_delete: '1' })); assert.deepEqual(snapshot(db), before);
    assert.equal(db.state.calls.at(-2).sql, 'rollback'); assert.equal(db.state.calls.at(-1).sql, 'release');
  }
  const { db, service } = await setup();
  for (const id of ['0', '-1', 'abc', '2147483648', '999']) await assert.rejects(service.removeProduct(id, { confirm_delete: '1' }), { status: 404 });
  await service.detail('1'); db.state.orderItems.push({ product_id: 1, variant_id: 1 });
  await assert.rejects(service.removeProduct('1', { confirm_delete: '1' }), { status: 409 });
  const calls = db.state.calls.map(c => c.sql);
  assert.ok(calls.indexOf(SQL.lockProduct) < calls.indexOf(SQL.lockVariants));
  assert.ok(calls.indexOf(SQL.lockVariants) < calls.indexOf(SQL.orderedProduct));
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const s = createAdminProductService({ async removeProduct() { throw Object.assign(new Error('SECRET'), { code }); } });
    await assert.rejects(s.removeProduct('1', { confirm_delete: '1' }), e => e.status === 409 && !e.errors.general.includes('SECRET'));
  }
});

test('Xóa sản phẩm HTTP: không checkbox, có hộp thoại hỏi lại, giữ quyền/CSRF và chặn sản phẩm đã có đơn', async () => {
  const { db, repo } = await setup();
  await withAccountApp(async ({ client, database }) => {
    const a = client(), url = '/admin/products/1/delete';
    await a.get('/login'); assert.equal((await a.post(url, { confirm_delete: '1' })).status, 303);
    await a.get('/register'); await a.post('/register', { full_name: 'TEST', phone: '0900000001', password: 'TestPassword123', confirm_password: 'TestPassword123' });
    await a.get('/login'); await a.post('/login', { phone: '0900000001', password: 'TestPassword123' }); await a.get('/account');
    assert.equal((await a.post(url, { confirm_delete: '1', role: 'admin' })).status, 403);
    database.state.users[0].role = 'admin';
    const before = snapshot(db), page = await a.get('/admin/products');
    assert.match(page.html, /<th>Xóa sản phẩm<\/th>/); assert.match(page.html, /action="\/admin\/products\/1\/delete"/);
    assert.doesNotMatch(page.html, /name="confirm_delete"/);
    assert.match(page.html, /data-confirm-product-delete/);
    assert.match(page.html, /data-product-delete-dialog/);
    assert.match(page.html, /value="cancel" autofocus>Hủy/);
    assert.match(page.html, /value="delete">Xóa/);
    const editPage = await a.get('/admin/products/1/edit');
    assert.match(editPage.html, /action="\/admin\/products\/1\/delete"/);
    assert.doesNotMatch(editPage.html, /name="confirm_delete"/);
    assert.match(editPage.html, /data-product-delete-dialog/);
    assert.deepEqual(snapshot(db), before); assert.equal((await a.get(url)).status, 404);
    assert.equal((await a.post(url, { confirm_delete: '1' }, '')).status, 403);
    db.state.orderItems.push({ product_id: 2, variant_id: 2, status: 'cancelled' });
    const blocked = await a.get('/admin/products'); assert.doesNotMatch(blocked.html, /action="\/admin\/products\/2\/delete"/);
    assert.equal((await a.post('/admin/products/2/delete', { confirm_delete: '1' })).status, 409);
    db.state.fail = 'remove'; const error = await a.post(url, { confirm_delete: '1' }); assert.equal(error.status, 500); assert.doesNotMatch(error.html, /PRIVATE_SQL_FIXTURE|stack/); db.state.fail = '';
    const deleted = await a.post(url, { product_id: '2' }); // Không gửi confirm_delete.
    assert.equal(deleted.status, 303); assert.equal(deleted.headers.get('location'), '/admin/products?deleted=1');
    assert.match((await a.get(deleted.headers.get('location'))).html, /Đã xóa sản phẩm và các dòng giỏ hàng liên quan/);
    assert.equal((await a.get('/admin/products/1/edit')).status, 404); assert.equal(db.state.carts.length, 1);
  }, undefined, undefined, undefined, undefined, repo);
});

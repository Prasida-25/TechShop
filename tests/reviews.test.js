const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createReviewDatabase } = require('./helpers/review-database.cjs');
const { createReviewRepository, REVIEW_SQL: SQL } = require('../src/repositories/review-repository');
const { createReviewService } = require('../src/services/review-service');
const { withAccountApp } = require('./helpers/account-client.cjs');
const { createOrderRepository } = require('../src/repositories/order-repository');
const { createOrderDatabase } = require('./helpers/order-database.cjs');
function setup() { const db = createReviewDatabase(), repo = createReviewRepository(db); return { db, repo, service: createReviewService(repo) }; }
const input = { rating: '5', comment: 'Tốt <script>alert(1)</script>', user_id: '2', product_id: '999', order_item_id: '2', role: 'admin' };

test('Đánh giá: sản phẩm/danh tính suy ra từ đơn đã giao, không tin body; UNIQUE mỗi sản phẩm qua nhiều đơn', async () => {
  const { db, service } = setup();
  assert.equal((await service.form(1, '1', '1')).review, null);
  const before = structuredClone({ orders: db.state.orders, items: db.state.items, products: db.state.products });
  await service.create(1, '1', '1', input);
  assert.deepEqual(db.state.reviews.map(r => [r.user_id, r.product_id, r.order_item_id, r.rating, r.comment]), [[1, 1, 1, 5, input.comment]]);
  assert.equal((await service.form(1, '3', '3')).review.rating, 5);
  for (const [order, item] of [['1', '1'], ['3', '3']]) await assert.rejects(service.create(1, order, item, input), { status: 409 });
  assert.deepEqual({ orders: db.state.orders, items: db.state.items, products: db.state.products }, before);
  assert.equal(db.state.reviews.length, 1);
});

test('Đánh giá: chặn chưa mua, chủ đơn khác, dòng không thuộc đơn, trạng thái chưa giao, sản phẩm đã mất', async () => {
  const { db, service } = setup();
  for (const [user, order, item] of [[3, '1', '1'], [1, '2', '2'], [1, '1', '2'], [1, '999', '1'], [1, '1', '999']]) {
    await assert.rejects(service.form(user, order, item), { status: 404 });
    await assert.rejects(service.create(user, order, item, input), { status: 404 });
  }
  for (const status of ['pending', 'confirmed', 'shipping', 'cancelled', 'unknown']) {
    db.state.orders[0].status = status;
    await assert.rejects(service.create(1, '1', '1', input), { status: 409 });
  }
  db.state.orders[0].status = 'delivered'; db.state.items[0].product_id = null;
  await assert.rejects(service.create(1, '1', '1', input), { status: 404 });
  assert.equal(db.state.reviews.length, 0);
});

test('Đánh giá: validation điểm 1–5 nguyên, chuỗi/độ dài nội dung và ID bất thường', async () => {
  const { service, db } = setup();
  for (const rating of ['', '0', '6', '-1', '1.5', '01', 'toString', ['5'], 5]) await assert.rejects(service.create(1, '1', '1', { rating }), { status: 422 });
  for (const comment of [['abc'], 'a'.repeat(2001), '\u0000bad']) await assert.rejects(service.create(1, '1', '1', { rating: '1', comment }), { status: 422 });
  for (const id of ['0', '-1', '2147483648', '1 OR 1=1', ['1']]) await assert.rejects(service.create(1, id, '1', input), { status: 404 });
  assert.equal(db.state.calls.length, 0);
  await service.create(1, '1', '1', { rating: '1', comment: '  ' }); assert.equal(db.state.reviews[0].comment, null);
  await service.create(2, '2', '2', { rating: '5', comment: 'a'.repeat(2000) }); assert.equal(db.state.reviews[1].comment.length, 2000);
});

test('Đánh giá: kiểm tra lại trạng thái khi POST, rollback lỗi insert/commit; duplicate DB thành 409', async () => {
  for (const fail of ['insert', 'commit']) {
    const { db, service } = setup(); db.state.fail = fail;
    await assert.rejects(service.create(1, '1', '1', input)); assert.equal(db.state.reviews.length, 0);
    assert.equal(db.state.calls.at(-2).sql, 'rollback'); assert.equal(db.state.calls.at(-1).sql, 'release');
  }
  const { db, service } = setup(); await service.form(1, '1', '1'); db.state.orders[0].status = 'cancelled';
  await assert.rejects(service.create(1, '1', '1', input), { status: 409 });
  for (const code of ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const adapter = { async getConnection() { return { async beginTransaction() {}, async execute() { throw Object.assign(new Error('SECRET'), { code }); }, async rollback() {}, release() {} }; } };
    await assert.rejects(createReviewService(createReviewRepository(adapter)).create(1, '1', '1', input), e => e.status === 409 && !e.message.includes('SECRET'));
  }
});

test('Đánh giá: hai request/các đơn khác nhau cho cùng sản phẩm chỉ ghi một (mock, không chứng minh InnoDB)', async () => {
  const { db, service } = setup();
  const results = await Promise.allSettled([service.create(1, '1', '1', input), service.create(1, '3', '3', input)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409); assert.equal(db.state.reviews.length, 1);
});

test('Đánh giá công khai: rỗng/phân trang/thứ tự, chỉ SELECT tên hiển thị, không lấy điện thoại/mật khẩu', async () => {
  const { db, service } = setup(); assert.equal((await service.list('1', {})).total, 0);
  for (let i = 1; i <= 25; i++) db.state.reviews.push({ review_id: i, product_id: 1, rating: 5, comment: 'TEST' });
  const a = await service.list('1', {}), b = await service.list('1', { page: '2' });
  assert.equal(a.reviews.length, 20); assert.equal(b.reviews.length, 5); assert.equal(b.reviews[0].review_id, 5);
  assert.equal((await service.list('1', { page: '999' })).page, 2);
  for (const page of ['0', '-1', 'abc', ['2'], '1 OR 1=1']) assert.equal((await service.list('1', { page })).page, 1);
  await assert.rejects(service.list('999', {}), { status: 404 });
  assert.ok(db.state.calls.every(c => c.sql.startsWith('SELECT')));
  assert.match(SQL.list, /u.full_name AS buyer_name/);
  assert.doesNotMatch(SQL.list, /phone|password|SELECT\s+\*/);
});

test('Đánh giá HTTP/EJS: đăng nhập/CSRF, lỗi gần trường, chống XSS, không tin ID/role, không có sửa/xóa', async () => {
  const { db, repo } = setup(), orders = createOrderDatabase();
  await withAccountApp(async ({ client, database }) => {
    const a = client(), url = '/orders/1/items/1/review';
    assert.equal((await a.get(url)).status, 303);
    const empty = await a.get('/products/1/reviews'); assert.equal(empty.status, 200); assert.match(empty.html, /Chưa có đánh giá/);
    await a.get('/register'); await a.post('/register', { full_name: 'Khách TEST', phone: '0900000001', password: 'TestUser123', confirm_password: 'TestUser123' });
    await a.get('/login'); await a.post('/login', { phone: '0900000001', password: 'TestUser123' });
    const page = await a.get(url); assert.equal(page.status, 200); assert.match(page.html, /name="rating"/);
    assert.equal((await a.post(url, input, '')).status, 403);
    assert.equal((await a.get('/orders/2/items/2/review')).status, 404);
    const invalid = await a.post(url, { rating: '7', comment: '<script>TEST</script>' });
    assert.equal(invalid.status, 422); assert.match(invalid.html, /Chọn điểm đánh giá từ 1 đến 5/); assert.doesNotMatch(invalid.html, /<script>TEST/);
    const posted = await a.post(url, input); assert.equal(posted.status, 303); assert.equal(posted.headers.get('location'), url);
    const saved = await a.get(url); assert.match(saved.html, /Đã ghi nhận đánh giá/); assert.doesNotMatch(saved.html, /name="rating"|<script>alert/);
    const publicPage = await a.get('/products/1/reviews'); assert.match(publicPage.html, /5\/5/); assert.match(publicPage.html, /&lt;script&gt;/); assert.doesNotMatch(publicPage.html, /0900000001|Khách TEST/);
    assert.equal((await a.post(url, input)).status, 409);
    assert.equal((await a.post(url + '/delete', {})).status, 404);
    assert.equal(database.state.users[0].role, 'user'); assert.equal(db.state.reviews[0].user_id, 1); assert.equal(db.state.reviews[0].product_id, 1);
    const delivered = await a.get('/orders/4'); assert.match(delivered.html, /\/orders\/4\/items\/4\/review/);
    assert.doesNotMatch((await a.get('/orders/1')).html, /\/items\/1\/review/);
    db.state.fail = 'all'; const error = await a.get('/products/1/reviews'); assert.equal(error.status, 500); assert.doesNotMatch(error.html, /PRIVATE SQL|stack/);
  }, undefined, undefined, undefined, createOrderRepository(orders), undefined, undefined, repo);
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCategoryDatabase } = require('./helpers/admin-category-database.cjs');
const { createAdminCategoryRepository, CATEGORY_SQL: SQL } = require('../src/repositories/admin-category-repository');
const { createAdminCategoryService } = require('../src/services/admin-category-service');
const { withAccountApp } = require('./helpers/account-client.cjs');
function setup() { const db = createCategoryDatabase(), repo = createAdminCategoryRepository(db); return { db, repo, service: createAdminCategoryService(repo) }; }

test('Danh mục: thêm/sửa đúng trường, validation và tên trùng được xử lý an toàn', async () => {
  const { db, service } = setup();
  const id = await service.save(undefined, { category_name: '  Phụ kiện TEST  ', description: '  Mô tả  ', category_id: '1', role: 'admin' });
  assert.equal(id, 3); assert.equal((await service.detail('3')).description, 'Mô tả');
  await service.save('3', { category_name: 'Tên mới' }); assert.equal((await service.detail('3')).description, null);
  await assert.rejects(service.save(undefined, { category_name: 'tên mới' }), { status: 409 });
  await assert.rejects(service.save('3', { category_name: 'Rỗng' }), { status: 409 });
  for (const data of [{ category_name: '' }, { category_name: ['A'] }, { category_name: 'x'.repeat(101) }, { category_name: 'Tên', description: [] }, { category_name: 'Tên', description: 'x'.repeat(4001) }, { category_name: 'A\nB' }]) await assert.rejects(service.save(undefined, data), { status: 422 });
  await service.save('3', { category_name: 'x'.repeat(100), description: 'a'.repeat(4000) });
  assert.equal(db.state.categories.length, 3);
  for (const id of ['0', '-1', '1 OR 1=1', '2147483648', '999']) await assert.rejects(service.detail(id), { status: 404 });
  await assert.rejects(service.save('999', { category_name: 'Tên' }), { status: 404 });
});

test('Danh mục: tìm kiếm/phân trang SQL tham số, rỗng và input không hợp lệ', async () => {
  const { db, service } = setup();
  for (let i = 3; i <= 25; i++) db.state.categories.push({ category_id: i, category_name: 'TEST' + i, description: null });
  const a = await service.list({}), b = await service.list({ page: '2' });
  assert.equal(a.categories.length, 20); assert.equal(b.categories.length, 5);
  assert.ok(b.categories.every(c => !a.categories.some(x => x.category_id === c.category_id)));
  assert.equal((await service.list({ page: '999' })).page, 2);
  assert.equal((await service.list({ page: '-1' })).page, 1);
  const q = "100% _ ' OR 1=1 --"; assert.equal((await service.list({ q })).total, 0);
  const call = db.state.calls.at(-1); assert.equal(call.params[0], "%100!% !_ ' OR 1=1 --%"); assert.ok(!call.sql.includes(q));
  for (const query of [{ q: ['a'] }, { q: 'x'.repeat(101) }]) await assert.rejects(service.list(query), { status: 400 });
  assert.ok(db.state.calls.every(c => c.sql.startsWith('SELECT')));
});

test('Danh mục: chỉ xóa khi rỗng, kiểm tra lại dưới lock và không sửa sản phẩm', async () => {
  const { db, service } = setup(); const products = structuredClone(db.state.products);
  await assert.rejects(service.remove('2', {}), { status: 422 });
  await assert.rejects(service.remove('1', { confirm_delete: '1' }), { status: 409 });
  assert.equal(db.state.categories.length, 2);
  await service.detail('2'); db.state.products.push({ product_id: 2, category_id: 2 });
  await assert.rejects(service.remove('2', { confirm_delete: '1' }), { status: 409 });
  db.state.products.pop();
  await service.remove('2', { confirm_delete: '1' });
  await assert.rejects(service.remove('2', { confirm_delete: '1' }), { status: 404 });
  assert.deepEqual(db.state.products, products);
  assert.ok(!db.state.calls.some(c => /^(UPDATE|DELETE FROM) (products|orders|order_items)/.test(c.sql)));
  const lockIndex = db.state.calls.findIndex(c => c.sql === SQL.lock), usedIndex = db.state.calls.findIndex(c => c.sql === SQL.used);
  assert.ok(lockIndex < usedIndex); assert.match(SQL.used, /FOR UPDATE$/);
});

test('Danh mục: rollback lỗi ghi/commit, timeout và gửi xóa đồng thời (mock)', async () => {
  for (const fail of ['update', 'remove', 'commit']) {
    const { db, service } = setup(), before = structuredClone(db.state.categories); db.state.fail = fail;
    await assert.rejects(fail === 'update' ? service.save('2', { category_name: 'Đổi tên' }) : service.remove('2', { confirm_delete: '1' }));
    assert.deepEqual(db.state.categories, before); assert.equal(db.state.calls.at(-2).sql, 'rollback'); assert.equal(db.state.calls.at(-1).sql, 'release');
  }
  const { db, service } = setup();
  const result = await Promise.allSettled([service.remove('2', { confirm_delete: '1' }), service.remove('2', { confirm_delete: '1' })]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1); assert.equal(result.find(r => r.status === 'rejected').reason.status, 404); assert.equal(db.state.categories.length, 1);
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const x = createAdminCategoryService({ async remove() { throw Object.assign(new Error('SECRET'), { code }); } });
    await assert.rejects(x.remove('1', { confirm_delete: '1' }), e => e.status === 409 && !e.errors.general.includes('SECRET'));
  }
});

test('Danh mục HTTP: admin/CSRF, EJS/validation, thêm/sửa/xóa, danh mục có sản phẩm bị chặn', async () => {
  const { db, repo } = setup();
  await withAccountApp(async ({ client, database }) => {
    const a = client(); assert.equal((await a.get('/admin/categories')).status, 303);
    await a.get('/register'); await a.post('/register', { full_name: 'Khách TEST', phone: '0900000001', password: 'TestPassword123', confirm_password: 'TestPassword123' });
    await a.get('/login'); await a.post('/login', { phone: '0900000001', password: 'TestPassword123' }); await a.get('/account');
    for (const route of ['/admin/categories', '/admin/categories/2/update', '/admin/categories/2/delete']) assert.equal((await a.post(route, { category_name: 'Giả quyền', role: 'admin', confirm_delete: '1' })).status, 403);
    database.state.users[0].role = 'admin';
    const page = await a.get('/admin/categories'); assert.equal(page.status, 200); assert.match(page.html, /href="\/admin\/categories"/);
    assert.match(page.html, /<th>Xóa danh mục<\/th>/);
    assert.match(page.html, /action="\/admin\/categories\/2\/delete"/);
    assert.match(page.html, /name="confirm_delete" value="1" required/);
    assert.match(page.html, /disabled title="Danh mục đang có sản phẩm nên không thể xóa"/);
    assert.doesNotMatch(page.html, /action="\/admin\/categories\/1\/delete"/);
    assert.equal(db.state.categories.length, 2);
    assert.equal((await a.post('/admin/categories', { category_name: 'Tên' }, '')).status, 403);
    const invalid = await a.post('/admin/categories', { category_name: '' }); assert.equal(invalid.status, 422); assert.match(invalid.html, /category-name-error/);
    assert.equal((await a.post('/admin/categories', { category_name: '<script>TEST</script>' })).status, 303);
    const edit = await a.get('/admin/categories/3/edit'); assert.match(edit.html, /&lt;script&gt;TEST&lt;\/script&gt;/); assert.doesNotMatch(edit.html, /<script>TEST/);
    assert.equal((await a.post('/admin/categories/3/update', { category_name: 'Rỗng' })).status, 409);
    assert.equal((await a.post('/admin/categories/3/update', { category_name: 'Tên mới', description: 'Mô tả' })).status, 303);
    const used = await a.get('/admin/categories/1/edit'); assert.match(used.html, /Không thể xóa/); assert.doesNotMatch(used.html, /action="\/admin\/categories\/1\/delete"/);
    assert.equal((await a.post('/admin/categories/1/delete', { confirm_delete: '1' })).status, 409);
    assert.equal((await a.post('/admin/categories/3/delete', {})).status, 422);
    assert.equal((await a.post('/admin/categories/3/delete', { confirm_delete: '1' }, '')).status, 403);
    assert.equal((await a.get('/admin/categories/3/delete')).status, 404);
    assert.equal((await a.post('/admin/categories/3/delete', { confirm_delete: '1' })).status, 303);
    assert.equal((await a.get('/admin/categories/3/edit')).status, 404);
    db.state.fail = 'all'; const failed = await a.get('/admin/categories'); assert.equal(failed.status, 500); assert.doesNotMatch(failed.html, /PRIVATE_CATEGORY_SQL|stack/);
    assert.equal(db.state.products[0].category_id, 1);
  }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, repo);
});

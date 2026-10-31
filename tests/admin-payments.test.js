const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAdminOrderDatabase } = require('./helpers/admin-order-database.cjs');
const { createAdminOrderRepository, ADMIN_ORDER_SQL: SQL } = require('../src/repositories/admin-order-repository');
const { createAdminOrderService } = require('../src/services/admin-order-service');
const { withAccountApp } = require('./helpers/account-client.cjs');

function setup() {
  const db = createAdminOrderDatabase(), repo = createAdminOrderRepository(db);
  db.state.orders[0].status = 'delivered';
  return { db, repo, service: createAdminOrderService(repo) };
}

test('COD: xác nhận riêng sau giao, chỉ cập nhật payment_status; request lặp không ghi lần hai', async () => {
  const { db, service } = setup();
  const before = structuredClone(db.state);
  assert.equal((await service.detail('1')).canConfirmCod, true);
  assert.equal(await service.confirmCod('1', { confirm: '1', payment_status: 'refund', status: 'cancelled', total_amount: '1', user_id: '999' }), true);
  assert.deepEqual(db.state.orders, before.orders.map(o => o.order_id === 1 ? { ...o, payment_status: 'paid' } : o));
  assert.deepEqual(db.state.variants, before.variants);
  assert.deepEqual(db.state.items, before.items);
  assert.equal((await service.detail('1')).canConfirmCod, false);
  assert.equal(await service.confirmCod('1', { confirm: '1' }), false);
  assert.equal(db.state.calls.filter(c => c.sql === SQL.confirmCod).length, 1);
  assert.match(SQL.confirmCod, /status='delivered' AND payment_method='cod' AND payment_status='unpaid'/);
});

test('COD: từ chối sai ID, chưa xác nhận, chưa giao, đã hủy, bank, refund và trạng thái không biết', async () => {
  const { db, service } = setup();
  for (const id of ['0', '-1', 'x', '999', '2147483648']) await assert.rejects(service.confirmCod(id, { confirm: '1' }), { status: 404 });
  for (const confirm of [undefined, '0', ['1']]) await assert.rejects(service.confirmCod('1', { confirm }), { status: 422 });
  for (const patch of [
    ...['pending', 'confirmed', 'shipping', 'cancelled', 'unknown'].map(status => ({ status })),
    { payment_method: 'bank' }, { payment_method: 'unknown' }, { payment_status: 'refund' }, { payment_status: 'unknown' },
  ]) {
    const x = setup(); Object.assign(x.db.state.orders[0], patch);
    const before = structuredClone(x.db.state.orders);
    assert.equal((await x.service.detail('1')).canConfirmCod, false);
    await assert.rejects(x.service.confirmCod('1', { confirm: '1' }), { status: 409 });
    assert.deepEqual(x.db.state.orders, before);
    assert.ok(!x.db.state.calls.some(c => c.sql === SQL.confirmCod));
  }
  assert.equal(db.state.orders[0].payment_status, 'unpaid');
});

test('COD: hai yêu cầu cùng xác nhận chỉ ghi một lần (mutex giả lập, không phải InnoDB)', async () => {
  const { db, service } = setup();
  const results = await Promise.all([service.confirmCod('1', { confirm: '1' }), service.confirmCod('1', { confirm: '1' })]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(db.state.calls.filter(c => c.sql === SQL.confirmCod).length, 1);
  assert.equal(db.state.orders[0].payment_status, 'paid');
});

test('COD: lỗi ghi/affectedRows=0 và lỗi trước commit rollback; lock timeout trả thông báo an toàn', async () => {
  for (const fault of ['write', 'zero', 'commit']) {
    const { db } = setup(), before = structuredClone(db.state.orders);
    const adapter = { async getConnection() {
      const c = await db.getConnection();
      return { ...c,
        async execute(sql, params) {
          if (sql === SQL.confirmCod && fault === 'write') throw new Error('PRIVATE_SQL');
          if (sql === SQL.confirmCod && fault === 'zero') return [{ affectedRows: 0 }];
          return c.execute(sql, params);
        },
        async commit() { if (fault === 'commit') throw new Error('TEST_BEFORE_COMMIT'); return c.commit(); },
      };
    } };
    const service = createAdminOrderService(createAdminOrderRepository(adapter));
    await assert.rejects(service.confirmCod('1', { confirm: '1' }));
    assert.deepEqual(db.state.orders, before);
    assert.equal(db.state.calls.at(-2).sql, 'rollback');
    assert.equal(db.state.calls.at(-1).sql, 'release');
  }
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const service = createAdminOrderService({ async confirmCod() { throw Object.assign(new Error('PRIVATE_SQL'), { code }); } });
    await assert.rejects(service.confirmCod('1', { confirm: '1' }), e => e.status === 409 && !e.message.includes('PRIVATE_SQL'));
  }
});

test('COD HTTP/EJS: admin/CSRF, GET không ghi, nút chỉ cho đơn đủ điều kiện, không lộ lỗi, gửi lại an toàn', async () => {
  const { db, repo } = setup();
  await withAccountApp(async ({ client, database }) => {
    const a = client(), url = '/admin/orders/1/confirm-cod';
    await a.get('/login');
    assert.equal((await a.post(url, { confirm: '1' })).status, 303);
    await a.get('/register'); await a.post('/register', { full_name: 'Admin TEST', phone: '0900000001', password: 'AdminTest123', confirm_password: 'AdminTest123' });
    await a.get('/login'); await a.post('/login', { phone: '0900000001', password: 'AdminTest123' }); await a.get('/account');
    assert.equal((await a.post(url, { confirm: '1', role: 'admin', user_id: '999' })).status, 403);
    database.state.users[0].role = 'admin'; // Chỉ fixture bộ nhớ, không tạo admin MySQL.
    const before = structuredClone(db.state.orders);
    const detail = await a.get('/admin/orders/1?payment=1');
    assert.equal(detail.status, 200); assert.match(detail.html, /action="\/admin\/orders\/1\/confirm-cod"/);
    assert.doesNotMatch(detail.html, /Đơn đã được ghi nhận thu tiền COD/);
    assert.deepEqual(db.state.orders, before);
    assert.equal((await a.get(url)).status, 404);
    assert.equal((await a.post(url, { confirm: '1' }, '')).status, 403);
    assert.equal((await a.post(url, {})).status, 422);
    assert.equal((await a.post('/admin/orders/2/confirm-cod', { confirm: '1' })).status, 409);
    db.state.fail = 'confirmCod';
    const failed = await a.post(url, { confirm: '1' });
    assert.equal(failed.status, 500); assert.doesNotMatch(failed.html, /PRIVATE SQL|stack/);
    assert.equal(db.state.orders[0].payment_status, 'unpaid'); db.state.fail = '';
    const paid = await a.post(url, { confirm: '1', total_amount: '1', payment_status: 'refund', status: 'cancelled' });
    assert.equal(paid.status, 303); assert.equal(paid.headers.get('location'), '/admin/orders/1?payment=1');
    assert.equal((await a.post(url, { confirm: '1' })).status, 303);
    const after = await a.get(paid.headers.get('location'));
    assert.match(after.html, /Đơn đã được ghi nhận thu tiền COD/); assert.doesNotMatch(after.html, /action="[^\"]+\/confirm-cod"/);
    assert.equal(db.state.calls.filter(c => c.sql === SQL.confirmCod).length, 2); // Một lỗi giả lập, một ghi thành công.
    database.state.users[0].role = 'user';
    assert.equal((await a.post(url, { confirm: '1' })).status, 403);
    await a.post('/logout', {});
    assert.equal((await a.post(url, { confirm: '1' })).status, 403); // Token phiên cũ không hợp lệ.
    await a.get('/login');
    assert.equal((await a.post(url, { confirm: '1' })).status, 303);
  }, undefined, undefined, undefined, undefined, undefined, repo);
});

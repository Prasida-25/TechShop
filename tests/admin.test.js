const assert = require('node:assert/strict');
const { test } = require('node:test');
const { withAccountApp } = require('./helpers/account-client.cjs');
const { safeReturnTo } = require('../src/utils/account-validation');
const { requireAdmin } = require('../src/middleware/admin-auth');

// Tài khoản và role chỉ tồn tại trong database giả lập của test, không ghi MySQL.
const password = 'AdminFixture123';
async function registered(client, database) {
  const browser = client();
  await browser.get('/register');
  assert.equal((await browser.post('/register', {
    full_name: 'Người thử <script>TEST</script>', phone: '0900000001', password,
    confirm_password: password, role: 'admin', is_admin: '1', user_id: '999',
  })).status, 303);
  assert.equal(database.state.users[0].role, 'user');
  return browser;
}
async function login(browser, extra = {}) {
  await browser.get('/login?returnTo=%2Fadmin');
  const response = await browser.post('/login', { phone: '0900000001', password, returnTo: '/admin', ...extra });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/admin');
  await browser.get('/account'); // Session/CSRF được tạo lại khi đăng nhập.
}
function mutation(browser, method, route, data = {}) {
  return browser.request(route, { method,
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-role': 'admin' },
    body: new URLSearchParams({ ...data, _csrf: browser.token }),
  });
}

test('Admin: khách chưa đăng nhập, cookie sai và returnTo chỉ cho URL nội bộ đã duyệt', async () => {
  await withAccountApp(async ({ client, database }) => {
    const guest = client();
    let page = await guest.get('/admin');
    assert.equal(page.status, 303);
    assert.equal(page.headers.get('location'), '/login?returnTo=%2Fadmin');
    const loginPage = await guest.get(page.headers.get('location'));
    assert.match(loginPage.html, /name="returnTo" value="\/admin"/);
    for (const route of ['/admin/products', '/admin/orders/1', '/ADMIN']) {
      assert.equal((await guest.get(route)).status, 303);
    }
    guest.cookie = 'techzone.sid=s%3Ainvalid.invalid';
    assert.equal((await guest.get('/admin')).status, 303);
    assert.equal(database.state.users.length, 0);
    assert.equal(safeReturnTo('/admin'), '/admin');
    for (const target of ['//evil.test', 'https://evil.test', '/admin?role=admin', '/admin/../account', '/admin%0d%0aLocation:evil', ['/admin']]) {
      assert.equal(safeReturnTo(target), '/');
    }
  });
});

test('Admin: user bị chặn cả GET/POST/PUT/PATCH/DELETE, không nâng quyền từ request', async () => {
  await withAccountApp(async ({ client, database, store }) => {
    const browser = await registered(client, database);
    await login(browser, { role: 'admin', is_admin: '1', user_id: '999' });
    for (const route of ['/admin', '/admin/products', '/admin/orders/1', '/ADMIN', '/admin?role=admin&user_id=999']) {
      const page = await browser.get(route);
      assert.equal(page.status, 403);
      assert.match(page.html, /Bạn không có quyền truy cập/);
      assert.doesNotMatch(page.html, /Phạm vi triển khai|AdminFixture123|\$argon2|stack/);
      assert.match(page.headers.get('cache-control'), /no-store/);
    }
    // Kể cả một field role tùy ý trong store cũng không thay thế role đọc từ DB.
    const sessions = await new Promise((resolve, reject) => store.all((err, rows) => err ? reject(err) : resolve(rows)));
    for (const [id, value] of Object.entries(sessions)) {
      await new Promise((resolve, reject) => store.set(id, { ...value, role: 'admin', is_admin: true }, err => err ? reject(err) : resolve()));
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await mutation(browser, method, '/admin/products/1', { role: 'admin', is_admin: '1', user_id: '999' });
      assert.equal(response.status, 403);
      assert.match(response.html, /Bạn không có quyền truy cập/); // Đã qua CSRF, bị chặn ở guard.
    }
    assert.equal(database.state.users[0].role, 'user');
    assert.notEqual(database.state.users[0].user_id, 999);
  });
});

test('Admin: role admin từ repository render nền EJS, CSS/font và 404 trong khu vực quản trị', async () => {
  await withAccountApp(async ({ client, database }) => {
    const browser = await registered(client, database);
    database.state.users[0].role = 'admin'; // Fixture trong bộ nhớ, không phải chức năng nâng quyền.
    await login(browser);
    const page = await browser.get('/admin');
    assert.equal(page.status, 200);
    assert.match(page.html, /Khu vực quản trị TechZone/);
    assert.match(page.html, /Người thử &lt;script&gt;TEST&lt;\/script&gt;/);
    assert.match(page.html, /action="\/logout" method="post"/);
    assert.match(page.html, /name="_csrf" value="[a-f0-9]+"/);
    assert.doesNotMatch(page.html, /<script>TEST<\/script>|AdminFixture123|\$argon2|href="\/admin\/reviews"/);
    assert.match(page.html, /href="\/admin\/products"/);
    assert.match(page.headers.get('cache-control'), /no-store/);
    assert.equal((await browser.get('/admin/')).status, 200);
    for (const route of ['/admin/reviews', '/admin/not-found']) {
      const missing = await browser.get(route);
      assert.equal(missing.status, 404);
      assert.match(missing.html, /Trang hoặc thao tác quản trị này không tồn tại/);
    }
    const css = await browser.get('/css/admin.css');
    assert.equal(css.status, 200);
    assert.match(css.html, /@media \(max-width: 640px\)/);
    assert.equal((await browser.get('/fonts/Inter.ttf')).status, 200);
    assert.equal((await browser.get('/')).status, 200);
    const accountRedirect = await browser.get('/account');
    assert.equal(accountRedirect.status, 303);
    assert.equal(accountRedirect.headers.get('location'), '/admin');
    assert.equal((await browser.get('/adminx')).status, 404);
    const writesBefore = database.state.calls.filter(call => /^(INSERT|UPDATE|DELETE)/.test(call.sql)).length;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await mutation(browser, method, '/admin/products/1', { price: '0', stock: '-1' });
      assert.equal(response.status, 404); // Chưa có bất kỳ handler sửa dữ liệu admin nào.
    }
    assert.equal(database.state.calls.filter(call => /^(INSERT|UPDATE|DELETE)/.test(call.sql)).length, writesBefore);
  });
});

test('Admin: CSRF bắt buộc, logout hủy session và cookie cũ không vào được', async () => {
  await withAccountApp(async ({ client, database }) => {
    const browser = await registered(client, database);
    database.state.users[0].role = 'admin';
    await login(browser); await browser.get('/admin');
    const other = client(); await other.get('/login');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const token of ['', other.token]) {
        const response = await browser.request('/admin/products/1', { method,
          headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: token }),
        });
        assert.equal(response.status, 403);
        assert.match(response.html, /Biểu mẫu không hợp lệ/);
      }
    }
    assert.equal((await browser.post('/logout', {}, '')).status, 403);
    assert.equal((await browser.get('/admin')).status, 200);
    const cookie = browser.cookie;
    assert.equal((await browser.post('/logout')).status, 303);
    const stale = client(); stale.cookie = cookie;
    assert.equal((await stale.get('/admin')).status, 303);
  });
});

test('Admin: đọc lại role mỗi request, mất quyền/đổi mật khẩu/xóa fixture thì session cũ bị chặn', async () => {
  await withAccountApp(async ({ client, database }) => {
    const browser = await registered(client, database), user = database.state.users[0];
    user.role = 'admin'; await login(browser);
    assert.equal((await browser.get('/admin')).status, 200);
    user.role = 'user';
    assert.equal((await browser.get('/admin')).status, 403);
    assert.equal((await mutation(browser, 'POST', '/admin/products/1')).status, 403);
    user.role = 'admin'; assert.equal((await browser.get('/admin')).status, 200);
    user.password += 'changed-in-test';
    assert.equal((await browser.get('/admin')).status, 303);
  });
  await withAccountApp(async ({ client, database }) => {
    const browser = await registered(client, database);
    database.state.users[0].role = 'admin'; await login(browser);
    database.state.users = [];
    assert.equal((await browser.get('/admin')).status, 303);
  });
});

test('Admin: guard mặc định từ chối thiếu user hoặc role không chính xác', () => {
  for (const user of [undefined, {}, { role: 'user' }, { role: 'ADMIN' }, { role: ['admin'] }]) {
    let status;
    requireAdmin({ user, body: { role: 'admin' } }, {
      status(code) { status = code; return this; }, render() {},
    }, () => assert.fail('Không được gọi handler admin'));
    assert.equal(status, 403);
  }
});

test('Admin: không có trang tài khoản hoặc quyền sửa hồ sơ/địa chỉ/mật khẩu, không ghi dữ liệu', async () => {
  await withAccountApp(async ({ client, database }) => {
    const browser = await registered(client, database);
    database.state.users[0].role = 'admin';
    await browser.get('/login');
    const signedIn = await browser.post('/login', { phone: '0900000001', password, returnTo: '/account/change-password' });
    assert.equal(signedIn.status, 303);
    assert.equal(signedIn.headers.get('location'), '/admin');
    const adminPage = await browser.get('/admin');
    assert.doesNotMatch(adminPage.html, /href="\/account(?:["/])/);
    const home = await browser.get('/');
    assert.match(home.html, /href="\/admin">Quản trị/);
    assert.doesNotMatch(home.html, /href="\/account"|href="\/orders"/);
    for (const route of ['/account', '/account/addresses', '/account/change-password']) {
      const page = await browser.get(route);
      assert.equal(page.status, 303); assert.equal(page.headers.get('location'), '/admin');
      assert.doesNotMatch(page.html, /Hồ Sơ Của Tôi|name="new_password"/);
    }
    const before = structuredClone(database.state.users);
    const calls = database.state.calls.length;
    for (const route of ['/account/profile', '/account/addresses', '/account/addresses/1/update', '/account/addresses/1/delete', '/account/addresses/1/default', '/account/change-password']) {
      const response = await browser.post(route, { full_name: 'Không được sửa', phone: '0900000099', role: 'user', user_id: '999', current_password: password, new_password: 'ChangedPassword123', confirm_password: 'ChangedPassword123' });
      assert.equal(response.status, 403);
      assert.match(response.html, /không được chỉnh sửa/);
    }
    assert.deepEqual(database.state.users, before);
    assert.ok(!database.state.calls.slice(calls).some(c => /^(INSERT|UPDATE|DELETE)/i.test(c.sql)));
    for (const route of ['/login', '/register']) assert.equal((await browser.get(route)).headers.get('location'), '/admin');
    assert.equal((await browser.post('/logout')).status, 303);
  });
});

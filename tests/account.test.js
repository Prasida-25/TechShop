const assert = require('node:assert/strict');
const { test } = require('node:test');
const argon2 = require('argon2');
const { withAccountApp } = require('./helpers/account-client.cjs');
const { createAccountDatabase } = require('./helpers/account-database.cjs');
const { createUserRepository } = require('../src/repositories/user-repository');
const { createAddressRepository } = require('../src/repositories/address-repository');
const { createAccountService } = require('../src/services/account-service');
const { normalizePhone, addressInput, safeReturnTo } = require('../src/utils/account-validation');
const { createSessionConfig } = require('../src/config/session');

// Chỉ là thông tin thử trong bộ nhớ; không phải tài khoản/mật khẩu thật.
const password = 'TestPassword123';
const registration = (phone = '0900000001') => ({ full_name: 'Người thử A', phone, password, confirm_password: password });
const address = { receiver_name: 'Người nhận A', phone: '0900000001', address_detail: 'Số 1 Đường thử', ward: 'Phường thử', province: 'Thành phố thử' };

async function register(client, phone = '0900000001') {
  assert.equal((await client.get('/register')).status, 200);
  const result = await client.post('/register', registration(phone));
  assert.equal(result.status, 303);
  return result;
}
async function login(client, phone = '0900000001', value = password) {
  await client.get('/login');
  const response = await client.post('/login', { phone, password: value });
  assert.equal(response.status, 303);
  await client.get('/account');
}

test('Định dạng điện thoại, địa chỉ district rỗng và returnTo chỉ tới route hợp lệ', () => {
  assert.equal(normalizePhone(' +84 900 000 001 '), '0900000001');
  assert.equal(normalizePhone('84900000001'), '0900000001');
  for (const input of ['email@example.com', '123', '0200000000', ['0900000001']]) assert.equal(normalizePhone(input), '');
  assert.equal(addressInput(address).district, '');
  for (const target of ['https://bad.test', '//bad.test', '/account/profile', '/account/unknown', ['x'],
    '/products/0', '/products/2147483648', '/products/1?variant=2147483648', '/products/1?variant=0',
    '/products/1\n', '/products/1?next=https://bad.test', '/products/1/../../admin', '/\\bad.test']) assert.equal(safeReturnTo(target), '/');
  for (const target of ['/', '/products/1', '/products/123?variant=456']) assert.equal(safeReturnTo(target), target);
  assert.equal(safeReturnTo('/account/addresses'), '/account/addresses');
});

test('Đăng nhập thường về trang chủ, giữ đích nội bộ và admin vẫn về quản trị', async () => {
  await withAccountApp(async ({ client, database }) => {
    const browser = client();
    await register(browser);
    for (const [returnTo, expected] of [[undefined, '/'], ['https://bad.test', '/'], ['/cart', '/cart'], ['/products/12?variant=34', '/products/12?variant=34']]) {
      await browser.get('/login');
      const response = await browser.post('/login', { phone: '0900000001', password, ...(returnTo ? { returnTo } : {}) });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), expected);
      assert.equal((await browser.get('/login')).headers.get('location'), '/');
      await browser.get('/account');
      assert.equal((await browser.post('/logout')).status, 303);
    }
    database.state.users[0].role = 'admin';
    await browser.get('/login');
    const admin = await browser.post('/login', { phone: '0900000001', password, returnTo: '/products/12?variant=34' });
    assert.equal(admin.headers.get('location'), '/admin');
  });
});

test('Thêm giỏ khi chưa đăng nhập: quay lại sản phẩm và biến thể, giữ đích khi nhập sai mật khẩu', async () => {
  // Không thao tác MySQL hoặc tự thêm giỏ sau khi đăng nhập.
  const cartRepository = new Proxy({}, { get() { throw new Error('Không được gọi repository giỏ hàng'); } });
  await withAccountApp(async ({ client }) => {
    const browser = client();
    await register(browser);
    const target = '/products/12?variant=34';
    const prompt = await browser.post('/cart/items', { variant_id: '34', quantity: '1', returnTo: target });
    assert.equal(prompt.status, 303);
    assert.equal(prompt.headers.get('location'), `/login?returnTo=${encodeURIComponent(target)}`);
    const loginPage = await browser.get(prompt.headers.get('location'));
    assert.match(loginPage.html, /name="returnTo" value="\/products\/12\?variant=34"/);
    const wrong = await browser.post('/login', { phone: '0900000001', password: 'Wrong1234', returnTo: target });
    assert.equal(wrong.status, 401);
    assert.match(wrong.html, /name="returnTo" value="\/products\/12\?variant=34"/);
    const success = await browser.post('/login', { phone: '0900000001', password, returnTo: target });
    assert.equal(success.headers.get('location'), target);
    const guest = client();
    await guest.get('/login');
    for (const returnTo of ['https://bad.test', '/products/0', '/products/1\n', '/account']) {
      const rejected = await guest.post('/cart/items', { variant_id: '34', quantity: '1', returnTo });
      assert.equal(rejected.headers.get('location'), '/login?returnTo=%2Fcart');
    }
  }, undefined, cartRepository);
});

test('Đăng ký: validate từng trường, Argon2id, số duy nhất và không tự tạo admin', async () => {
  await withAccountApp(async ({ database, client }) => {
    const browser = client();
    await browser.get('/register');
    for (const [data, field] of [
      [{ full_name: ' ' }, 'full_name'], [{ phone: 'email@example.com' }, 'phone'],
      [{ password: 'short', confirm_password: 'short' }, 'password'], [{ confirm_password: 'mismatch' }, 'confirm_password'],
    ]) {
      const result = await browser.post('/register', { ...registration(), ...data });
      assert.equal(result.status, 422);
      assert.match(result.html, new RegExp(`id="${field}-error">[^<]+`));
    }
    assert.equal(database.state.users.length, 0);
    const result = await browser.post('/register', { ...registration(), role: 'admin', user_id: '999' });
    assert.equal(result.status, 303);
    assert.equal(database.state.users.length, 1);
    const user = database.state.users[0];
    assert.equal(user.role, 'user'); assert.notEqual(user.user_id, 999);
    assert.match(user.password, /^\$argon2id\$/);
    assert.ok(await argon2.verify(user.password, password));
    assert.doesNotMatch(result.html, /TestPassword123|\$argon2/);
    assert.equal((await browser.get('/account')).status, 303); // Không tự đăng nhập.
    await browser.get('/register');
    assert.equal((await browser.post('/register', { ...registration(), phone: '+84900000001' })).status, 409);
    assert.equal(database.state.users.length, 1);
  });
});

test('Đăng ký đồng thời trùng số: UNIQUE được xử lý thành 409, không mất tài khoản', async () => {
  await withAccountApp(async ({ client, database }) => {
    const a = client(), b = client();
    await Promise.all([a.get('/register'), b.get('/register')]);
    const results = await Promise.all([a.post('/register', registration()), b.post('/register', registration())]);
    assert.deepEqual(results.map((r) => r.status).sort(), [303, 409]);
    assert.equal(database.state.users.length, 1);
  });
});

test('Đăng nhập/đăng xuất: thông báo chung, cookie, regenerate, session cũ và header Catalog', async () => {
  await withAccountApp(async ({ client, store, database }) => {
    const browser = client();
    const anonymous = await browser.get('/account/addresses');
    assert.equal(anonymous.status, 303);
    assert.equal(anonymous.headers.get('location'), '/login?returnTo=%2Faccount%2Faddresses');
    await register(browser);
    for (const [phone, value] of [['0900000001', 'wrong123'], ['0900000002', password], ['email@example.com', password]]) {
      await browser.get('/login');
      const response = await browser.post('/login', { phone, password: value });
      assert.equal(response.status, 401);
      assert.match(response.html, /Số điện thoại hoặc mật khẩu không đúng/);
      assert.doesNotMatch(response.html, /TestPassword123|wrong123|\$argon2/);
    }
    await browser.get('/login');
    const oldCookie = browser.cookie;
    const response = await browser.post('/login', { phone: '+84900000001', password, returnTo: '/account/addresses', role: 'admin', user_id: '999' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/account/addresses');
    assert.notEqual(browser.cookie, oldCookie);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /; Secure/); // HTTP local.
    const old = client(); old.cookie = oldCookie;
    assert.equal((await old.get('/account')).status, 303);
    const profile = await browser.get('/account');
    assert.equal(profile.status, 200);
    assert.match(profile.html, /Người thử A/); assert.doesNotMatch(profile.html, /\$argon2/);
    const home = await browser.get('/');
    assert.equal(home.status, 200); assert.match(home.html, /action="\/logout"/);
    const sessions = await new Promise((resolve) => store.all((err, rows) => resolve(rows)));
    const data = JSON.stringify(sessions);
    assert.doesNotMatch(data, /TestPassword123|\$argon2|"password"/);
    assert.equal(database.state.users[0].role, 'user');
    assert.equal((await browser.get('/logout')).status, 404);
    const signedCookie = browser.cookie;
    assert.equal((await browser.post('/logout')).status, 303);
    const stale = client(); stale.cookie = signedCookie;
    assert.equal((await stale.get('/account')).status, 303);
    assert.equal((await browser.get('/account')).status, 303);
  });
});

test('Giới hạn đăng nhập thất bại trả 429 và Retry-After, không khóa vĩnh viễn trong DB', async () => {
  await withAccountApp(async ({ client, database }) => {
    const browser = client(); await browser.get('/login');
    for (let attempt = 0; attempt < 2; attempt++) assert.equal((await browser.post('/login', { phone: '0900000001', password })).status, 401);
    const blocked = await browser.post('/login', { phone: '0900000001', password });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) <= 900);
    assert.equal(database.state.users.length, 0);
  }, { ipMax: 30, pairMax: 2, registerMax: 10 });
});

test('CSRF bắt buộc cho tất cả POST tài khoản và token không dùng được giữa hai client', async () => {
  await withAccountApp(async ({ client, database }) => {
    const a = client(), b = client();
    await a.get('/register'); await b.get('/register');
    assert.equal((await a.post('/register', registration(), b.token)).status, 403);
    for (const path of ['/register', '/login', '/logout', '/account/profile', '/account/addresses', '/account/addresses/1/update', '/account/addresses/1/delete', '/account/addresses/1/default', '/account/change-password']) {
      assert.equal((await a.post(path, {}, 'not-the-token')).status, 403);
    }
    assert.equal(database.state.users.length, 0);
    assert.equal(database.state.addresses.length, 0);
  });
});

test('Hồ sơ: sửa của mình, đổi số không OTP, UNIQUE và không thay role/mật khẩu/user_id', async () => {
  await withAccountApp(async ({ client, database }) => {
    const a = client(), b = client(); await register(a); await register(b, '0900000002'); await login(a);
    const oldHash = database.state.users[0].password;
    const update = await a.post('/account/profile', { full_name: 'Tên mới', phone: '+84900000003', user_id: '2', role: 'admin', password: 'BadPassword999' });
    assert.equal(update.status, 303);
    assert.equal(database.state.users[0].full_name, 'Tên mới');
    assert.equal(database.state.users[0].phone, '0900000003');
    assert.equal(database.state.users[0].role, 'user');
    assert.equal(database.state.users[0].password, oldHash);
    assert.equal(database.state.users[1].full_name, 'Người thử A');
    await a.get('/account');
    assert.equal((await a.post('/account/profile', { full_name: 'Tên mới', phone: '0900000002' })).status, 409);
    assert.equal(database.state.users[0].phone, '0900000003');
    assert.equal((await a.post('/account/profile', { full_name: ' ', phone: 'invalid' })).status, 422);
    await a.post('/logout');
    await login(a, '0900000003');
  });
});

test('Địa chỉ: CRUD, district rỗng, chuyển mặc định, không truy cập địa chỉ người khác', async () => {
  await withAccountApp(async ({ client, database }) => {
    const a = client(), b = client(); await register(a); await register(b, '0900000002'); await login(a); await login(b, '0900000002');
    const empty = await a.get('/account/addresses'); assert.match(empty.html, /Bạn chưa có địa chỉ giao hàng/);
    assert.doesNotMatch(empty.html, /name="district"|Quận\/Huyện/);
    assert.equal((await a.post('/account/addresses', { ...address, user_id: '2' })).status, 303);
    const first = database.state.addresses[0];
    assert.equal(first.user_id, 1); assert.equal(first.is_default, 1); assert.equal(first.district, '');
    await a.get('/account/addresses');
    assert.equal((await a.post('/account/addresses', { ...address, receiver_name: 'Người nhận B', district: 'Huyện thử' })).status, 303);
    const second = database.state.addresses[1];
    assert.equal(second.district, ''); // Backend bỏ qua cả district tự gửi từ trình duyệt.
    second.district = 'Quận cũ';
    const edit = await a.get(`/account/addresses?edit=${second.address_id}`);
    assert.doesNotMatch(edit.html, /name="district"/);
    await a.get('/account/addresses');
    assert.equal((await a.post(`/account/addresses/${second.address_id}/default`)).status, 303);
    assert.equal(first.is_default, 0); assert.equal(second.is_default, 1);
    await a.get('/account/addresses');
    assert.equal((await a.post(`/account/addresses/${second.address_id}/update`, { ...address, receiver_name: 'Đã sửa', user_id: '2' })).status, 303);
    assert.equal(second.receiver_name, 'Đã sửa'); assert.equal(second.user_id, 1);
    assert.equal(second.district, '');
    await b.get('/account/addresses');
    for (const action of ['update','delete','default']) {
      const response = await b.post(`/account/addresses/${first.address_id}/${action}`, { ...address, confirm_delete: '1' });
      assert.equal(response.status, 404);
      assert.doesNotMatch(response.html, /Người nhận A|Số 1 Đường thử/);
    }
    assert.equal((await b.get(`/account/addresses?edit=${first.address_id}`)).status, 404);
    assert.equal((await a.get('/account/addresses?edit=abc')).status, 404);
    await a.get('/account/addresses');
    const invalid = await a.post('/account/addresses', { ...address, ward: '' }); assert.equal(invalid.status, 422);
    const noConfirm = await a.post(`/account/addresses/${second.address_id}/delete`); assert.equal(noConfirm.status, 422);
    database.state.orders.push({ order_id: 1, user_id: 1, address_id: second.address_id, receiver_name: 'Tên lúc đặt', address_detail: 'Địa chỉ lúc đặt', total_amount: 123 });
    const snapshot = { ...database.state.orders[0], address_id: null };
    assert.equal((await a.post(`/account/addresses/${second.address_id}/delete`, { confirm_delete: '1' })).status, 303);
    assert.deepEqual(database.state.orders[0], snapshot);
    assert.equal(database.state.addresses.length, 1); assert.equal(database.state.addresses[0].is_default, 1);
  });
});

test('Địa chỉ: khóa theo người dùng ngăn nhiều mặc định và rollback cập nhật dở dang', async () => {
  const db = createAccountDatabase();
  db.state.users.push({ user_id: 1 });
  const repository = createAddressRepository(db);
  const data = addressInput({ ...address, is_default: '1' });
  await Promise.all([repository.save(1, data), repository.save(1, data)]);
  assert.equal(db.state.addresses.length, 2);
  assert.equal(db.state.addresses.filter((row) => row.is_default).length, 1);
  const before = structuredClone(db.state.addresses);
  db.state.failNextClear = true;
  await assert.rejects(repository.makeDefault(1, before[0].address_id));
  assert.deepEqual(db.state.addresses.sort((a,b) => a.address_id-b.address_id), before.sort((a,b) => a.address_id-b.address_id));
  assert.ok(db.state.calls.some((call) => /FOR UPDATE/.test(call.sql)));
});

test('Đổi mật khẩu: validate, không nhận user_id khác và hủy mọi session cũ', async () => {
  await withAccountApp(async ({ client, database }) => {
    const a = client(), otherSession = client(), b = client();
    await register(a); await register(b, '0900000002');
    await login(a); await login(otherSession); await login(b, '0900000002');
    const otherHash = database.state.users[1].password;
    await a.get('/account/change-password');
    for (const body of [
      { current_password: 'wrong123', new_password: 'NewPassword456', confirm_password: 'NewPassword456' },
      { current_password: password, new_password: 'short', confirm_password: 'short' },
      { current_password: password, new_password: 'NewPassword456', confirm_password: 'different' },
      { current_password: password, new_password: password, confirm_password: password },
    ]) assert.equal((await a.post('/account/change-password', body)).status, 422);
    const oldCookie = a.cookie;
    const changed = await a.post('/account/change-password', { current_password: password, new_password: 'NewPassword456', confirm_password: 'NewPassword456', user_id: '2' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/login?changed=1');
    assert.ok(await argon2.verify(database.state.users[0].password, 'NewPassword456'));
    assert.equal(database.state.users[1].password, otherHash);
    const stale = client(); stale.cookie = oldCookie;
    assert.equal((await stale.get('/account')).status, 303);
    assert.equal((await otherSession.get('/account')).status, 303);
    assert.equal((await a.get('/account')).status, 303);
    assert.equal((await b.get('/account')).status, 200);
    await a.get('/login'); assert.equal((await a.post('/login', { phone: '0900000001', password })).status, 401);
    await login(a, '0900000001', 'NewPassword456');
  });
});

test('Version HMAC từ chối session cũ cả khi bỏ lỡ lần destroy store; không nhận hash thuần', async () => {
  const db = createAccountDatabase(); const users = createUserRepository(db);
  const service = createAccountService(users, createAddressRepository(db), 'x'.repeat(64));
  await service.register(registration());
  const auth = await service.login({ phone: '0900000001', password });
  const session = { userId: auth.user.user_id, authVersion: auth.authVersion };
  assert.ok(await service.sessionUser(session));
  await service.changePassword(auth.user.user_id, { current_password: password, new_password: 'OtherPassword456', confirm_password: 'OtherPassword456' });
  assert.equal(await service.sessionUser(session), null);
  assert.equal(await service.sessionUser({ userId: auth.user.user_id, authVersion: db.state.users[0].password }), null);
});

test('Cấu hình session demo không cho dùng MemoryStore trong production', () => {
  const previous = process.env.NODE_ENV;
  try { process.env.NODE_ENV = 'production'; assert.throws(() => createSessionConfig(), /store production/); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

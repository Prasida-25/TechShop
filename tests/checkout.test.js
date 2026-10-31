const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCheckoutDatabase } = require('./helpers/checkout-database.cjs');
const { createCheckoutRepository, CHECKOUT_SQL } = require('../src/repositories/checkout-repository');
const { createCheckoutService } = require('../src/services/checkout-service');
const { quote } = require('../src/utils/checkout');
const { withAccountApp } = require('./helpers/account-client.cjs');
const path = require('node:path');
const ejs = require('ejs');

function setup(options) {
  const db = createCheckoutDatabase();
  const repository = createCheckoutRepository(db);
  return { db, repository, service: createCheckoutService(repository, options) };
}
const body = (review) => ({ checkout_token: review.token, address_id: String(review.address.address_id), confirm: '1', total: '0', price: '-1', user_id: '999', payment_status: 'paid' });

test('Checkout: phí đúng ngưỡng, tiền chính xác và giới hạn DECIMAL', () => {
  const item = { product_id: 1, valid_variant: 1, stock: 99, quantity: 1 };
  assert.equal(quote([{ ...item, price: '299999.99' }]).total, '329999.99');
  assert.equal(quote([{ ...item, price: '300000.00' }]).shippingLabel, '0 ₫');
  assert.equal(quote([{ ...item, price: '300000.01' }]).total, '300000.01');
  assert.throws(() => quote([{ ...item, price: '9999999999.99', quantity: 2 }]));
  assert.throws(() => quote([]));
  assert.throws(() => quote([{ ...item, price: '0.00' }]));
});

test('Checkout: thành công atomic, snapshot, COD pending/unpaid; bỏ qua giá/user frontend', async () => {
  const { db, service } = setup();
  const review = await service.preview(1);
  assert.equal(review.total, '130000.01');
  const id = await service.place(1, body(review));
  assert.equal(id, 1);
  assert.equal(db.state.variants[0].stock, 4);
  assert.equal(db.state.carts.filter((c) => c.user_id === 1).length, 0);
  assert.equal(db.state.carts.filter((c) => c.user_id === 2).length, 1);
  assert.equal(db.state.orders[0].user_id, 1);
  assert.equal(db.state.orders[0].total_amount, '130000.01');
  assert.equal(db.state.orders[0].payment_status, 'unpaid');
  assert.equal(db.state.orders[0].payment_method, 'cod');
  assert.equal(db.state.orders[0].status, 'pending');
  assert.equal(db.state.orders[0].district, '');
  assert.equal(db.state.orderItems[0].unit_price, '100000.01');
  db.state.variants[0].product_name = 'Tên mới'; db.state.variants[0].price = '1.00'; db.state.addresses[0].address_detail = 'Địa chỉ mới';
  assert.equal(db.state.orderItems[0].product_name, 'Tai nghe <thử>');
  assert.equal(db.state.orderItems[0].unit_price, '100000.01');
  assert.equal(db.state.orders[0].address_detail, 'Đường thử');
  assert.equal((await service.confirmation(1, '1')).totalLabel, '130.000,01 ₫');
  await assert.rejects(service.confirmation(2, '1'), { status: 404 });
});

test('Checkout chọn dòng: chỉ đặt/xóa dòng đã chọn, giữ món còn lại và không tin danh sách POST (mock DB)', async () => {
  const { db, service } = setup();
  db.state.carts.push({ cart_item_id:3, user_id:1, variant_id:2, quantity:2 });
  const review = await service.preview(1, undefined, '1');
  assert.equal(review.items.length,1);
  assert.equal(review.selection,'1');
  db.state.variants[1].price = '0.00'; // Món chưa chọn không được ảnh hưởng đơn này.
  await service.place(1, { ...body(review), items:'3' });
  assert.equal(db.state.orderItems.length,1);
  assert.equal(db.state.orderItems[0].variant_id,1);
  assert.equal(db.state.variants[0].stock,4);
  assert.equal(db.state.variants[1].stock,5);
  assert.equal(db.state.carts.filter(c=>c.user_id===1).length,1);
  assert.equal(db.state.carts.find(c=>c.user_id===1).cart_item_id,3);
});

test('Checkout chọn dòng: input lạ, ID người khác, thay giỏ, rollback và gửi trùng (mock DB)', async () => {
  const { parseCartSelection } = require('../src/utils/checkout');
  for (const input of ['', '0','-1','1,1','1.2', ['1'], '1,2x','2147483648', Array.from({length:201},(_,i)=>i+1).join(',')]) assert.throws(()=>parseCartSelection(input), { status:400 });
  const { db, service } = setup();
  await assert.rejects(service.preview(1, undefined, '2'), { status:409 });
  await assert.rejects(service.preview(1, undefined, '1,999'), { status:409 });
  const a=await service.preview(1,undefined,'1'),b=await service.preview(1,undefined,'1');
  const concurrent=await Promise.allSettled([service.place(1,body(a)),service.place(1,body(b))]);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(db.state.orders.length,1);
  const rollback=setup();
  const review=await rollback.service.preview(1,undefined,'1');
  rollback.db.state.fail='removeCart';
  await assert.rejects(rollback.service.place(1,body(review)));
  assert.equal(rollback.db.state.orders.length,0);
  assert.equal(rollback.db.state.variants[0].stock,5);
  assert.equal(rollback.db.state.carts.length,2);
});

test('Checkout: từ chối giỏ/giá/kho/địa chỉ thay đổi và xác nhận lại giá mới', async () => {
  for (const change of ['price','quantity','address','deleted','invalid','out']) {
    const { db, service } = setup(); const review = await service.preview(1);
    if (change === 'price') db.state.variants[0].price = '200000.00';
    if (change === 'quantity') db.state.carts[0].quantity = 2;
    if (change === 'address') db.state.addresses[0].address_detail = 'Địa chỉ mới';
    if (change === 'deleted') db.state.addresses.shift();
    if (change === 'invalid') db.state.variants[0].valid_variant = 0;
    if (change === 'out') db.state.variants[0].stock = 0;
    await assert.rejects(service.place(1, body(review)), { status: 409 });
    assert.equal(db.state.orders.length, 0); assert.equal(db.state.carts.length, 2);
    if (change === 'price') {
      const next = await service.preview(1); assert.equal(next.total, '230000.00');
      await service.place(1, body(next)); assert.equal(db.state.orderItems[0].unit_price, '200000.00');
    }
  }
});

test('Checkout: địa chỉ người khác, thiếu địa chỉ, ID sai và không xác nhận', async () => {
  const { db, service } = setup();
  await assert.rejects(service.preview(1, '2'), { status: 409 });
  await assert.rejects(service.preview(1, '1 OR 1=1'));
  const review = await service.preview(1);
  await assert.rejects(service.place(2, body(review)), { status: 409 });
  await assert.rejects(service.place(1, { ...body(review), address_id: '2' }), { status: 409 });
  await assert.rejects(service.place(1, { ...body(review), confirm: '0' }), { status: 422 });
  db.state.addresses = [];
  const missing = await service.preview(1); assert.equal(missing.token, ''); assert.equal(missing.address, null);
});

test('Checkout: rollback khi trừ kho, tạo đơn, chi tiết, xóa giỏ hoặc commit lỗi', async () => {
  for (const failure of ['stock','order','item','clear','commit']) {
    const { db, service } = setup();
    // Hai biến thể: lỗi trừ biến thể thứ hai phải hoàn biến thể thứ nhất.
    db.state.carts.push({ cart_item_id: 3, user_id: 1, variant_id: 2, quantity: 1 });
    const review = await service.preview(1);
    if (failure === 'stock') db.state.failStockId = 2; else db.state.fail = failure;
    await assert.rejects(service.place(1, body(review)));
    assert.deepEqual(db.state.variants.map((v) => v.stock), [5, 5]);
    assert.equal(db.state.orders.length, 0); assert.equal(db.state.orderItems.length, 0); assert.equal(db.state.carts.length, 3);
    assert.equal(db.state.calls.at(-2).name, 'rollback'); assert.equal(db.state.calls.at(-1).name, 'release');
    await assert.rejects(service.place(1, body(review)), { status: 409 });
  }
});

test('Checkout: gửi trùng token/khác token cùng giỏ và tranh mua kho thấp (giả lập)', async () => {
  {
    const { db, service } = setup(); const review = await service.preview(1);
    const results = await Promise.allSettled([service.place(1, body(review)), service.place(1, body(review))]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await service.place(1, body(review)), 1); assert.equal(db.state.orders.length, 1);
  }
  {
    const { db, service } = setup(); const a = await service.preview(1), b = await service.preview(1);
    const results = await Promise.allSettled([service.place(1, body(a)), service.place(1, body(b))]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1); assert.equal(db.state.orders.length, 1);
  }
  {
    const { db, service } = setup(); db.state.variants[0].stock = 1;
    const a = await service.preview(1), b = await service.preview(2);
    const results = await Promise.allSettled([service.place(1, body(a)), service.place(2, body(b))]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(db.state.variants[0].stock, 0); assert.equal(db.state.orders.length, 1); assert.equal(db.state.carts.length, 1);
  }
});

test('Checkout: token hết hạn và thứ tự khóa/SQL có điều kiện', async () => {
  let time = 0;
  const { service } = setup({ now: () => time }); const review = await service.preview(1);
  time = 21 * 60 * 1000;
  await assert.rejects(service.place(1, body(review)), { status: 409 });
  assert.match(CHECKOUT_SQL.stock, /stock >= \?/);
  assert.match(CHECKOUT_SQL.cart, /ORDER BY variant_id FOR UPDATE/);
  assert.match(CHECKOUT_SQL.confirmation, /order_id = \? AND user_id = \?/);
});

test('Checkout: giữ kết quả khi commit xong nhưng response bị mất; không tự gửi lại câu ghi', async () => {
  const { db, service } = setup();
  const review = await service.preview(1);
  const first = await service.place(1, body(review));
  const writesBefore = db.state.calls.filter((c) => ['order','item','stock','clear'].includes(c.name)).length;
  assert.equal(await service.place(1, body(review)), first);
  assert.equal(db.state.calls.filter((c) => ['order','item','stock','clear'].includes(c.name)).length, writesBefore);
});

test('Checkout HTTP/EJS: đăng nhập, CSRF, checkout, thành công, lặp và không lộ đơn khác', async () => {
  const { db, repository } = setup();
  await withAccountApp(async ({ client }) => {
    const browser = client();
    assert.equal((await browser.get('/checkout')).headers.get('location'), '/login?returnTo=%2Fcheckout');
    await browser.get('/register');
    await browser.post('/register', { full_name: 'Người thử', phone: '0900000001', password: 'Password123', confirm_password: 'Password123' });
    await browser.get('/login'); await browser.post('/login', { phone: '0900000001', password: 'Password123', returnTo: '/checkout' });
    let page = await browser.get('/checkout'); assert.equal(page.status, 200);
    assert.match(page.html, /Tai nghe &lt;thử&gt;/); assert.match(page.html, /130.000,01/);
    const token = page.html.match(/name="checkout_token" value="([a-f0-9]+)"/)[1];
    const data = { checkout_token: token, address_id: '1', confirm: '1', total_amount: '0' };
    assert.equal((await browser.post('/checkout', data, '')).status, 403);
    const placed = await browser.post('/checkout', data); assert.equal(placed.status, 303);
    assert.equal(placed.headers.get('location'), '/checkout/success/1');
    assert.equal((await browser.post('/checkout', data)).headers.get('location'), '/checkout/success/1');
    page = await browser.get('/checkout/success/1'); assert.equal(page.status, 200); assert.match(page.html, /Đặt hàng thành công/);
    assert.equal((await browser.get('/checkout/success/999')).status, 404);
    assert.equal((await browser.get('/checkout')).status, 409);
    db.state.orders.push({ order_id: 2, user_id: 2, total_amount: '500.00' });
    assert.equal((await browser.get('/checkout/success/2')).status, 404);
    assert.equal((await browser.get('/js/checkout.js')).status, 200);
    assert.equal(db.state.orders.filter((o) => o.user_id === 1).length, 1);
    // Dữ liệu giả lập mới để kiểm tra trang thiếu địa chỉ và lỗi DB an toàn.
    db.state.carts.push({ cart_item_id: 3, user_id: 1, variant_id: 1, quantity: 1 });
    db.state.addresses = [];
    page = await browser.get('/checkout');
    assert.equal(page.status, 200); assert.match(page.html, /Bạn chưa có địa chỉ/);
    assert.doesNotMatch(page.html, /name="checkout_token"/);
    db.state.fail = 'list';
    page = await browser.get('/checkout');
    assert.equal(page.status, 500); assert.doesNotMatch(page.html, /Private SQL\/config test error|SELECT|stack/);
  }, undefined, undefined, repository);
});

test('Xác nhận EJS: hiển thị đúng dữ liệu thanh toán/trạng thái bằng fixture, không dùng MySQL', async (t) => {
  // bank/refund có trong enum SQL; fixture không chứng minh đã có luồng chuyển khoản/hoàn tiền.
  const cases = [
    { name: 'COD chưa thu tiền', method: 'cod', payment: 'unpaid', status: 'pending',
      expected: ['Thanh toán khi nhận hàng (COD)', 'Chưa thanh toán', 'Chờ xác nhận'], instruction: true },
    { name: 'Chuyển khoản đã thanh toán', method: 'bank', payment: 'paid', status: 'confirmed',
      expected: ['Chuyển khoản', 'Đã thanh toán', 'Đã xác nhận'] },
    { name: 'COD đã thanh toán', method: 'cod', payment: 'paid', status: 'delivered',
      expected: ['Thanh toán khi nhận hàng (COD)', 'Đã thanh toán', 'Đã giao hàng'] },
    { name: 'Đơn hủy, chưa thanh toán', method: 'cod', payment: 'unpaid', status: 'cancelled',
      expected: ['Đã hủy', 'Chưa thanh toán'] },
    { name: 'Đơn hủy, trạng thái hoàn tiền đã lưu', method: 'bank', payment: 'refund', status: 'cancelled',
      expected: ['Chuyển khoản', 'Đã hoàn tiền', 'Đã hủy'] },
    { name: 'Giá trị lạ không được suy ra đã thanh toán', method: '<script>unknown</script>', payment: 'unknown', status: 'unknown',
      expected: ['Chưa xác định'] },
    { name: 'Không tra nhầm thuộc tính prototype', method: 'toString', payment: '__proto__', status: 'constructor',
      expected: ['Chưa xác định'] },
    { name: 'Thiếu giá trị', method: null, payment: undefined, status: null, expected: ['Chưa xác định'] },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const order = { order_id: 1, totalLabel: '130.000 ₫', payment_method: fixture.method,
        payment_status: fixture.payment, status: fixture.status };
      const before = { ...order };
      const html = await ejs.renderFile(path.join(__dirname, '..', 'src', 'views', 'checkout', 'success.ejs'), {
        title: 'Đặt hàng thành công — TechZone', currentUser: null, csrfToken: '', filters: {}, order,
      });
      for (const expected of fixture.expected) assert.ok(html.includes(expected), expected);
      assert.doesNotMatch(html, /Đã ghi nhận đơn COD|<script>unknown<\/script>|function toString|\[object Object\]/);
      if (fixture.instruction) assert.match(html, /Vui lòng thanh toán khi nhận hàng/);
      else assert.doesNotMatch(html, /Vui lòng thanh toán khi nhận hàng/);
      if (fixture.status === 'cancelled' || !['pending', 'confirmed', 'shipping', 'delivered'].includes(fixture.status)) {
        assert.doesNotMatch(html, /<h1>Đặt hàng thành công<\/h1>/);
        assert.doesNotMatch(html, /<title>Đặt hàng thành công/);
      }
      if (fixture.payment !== 'paid') assert.doesNotMatch(html, /Trạng thái thanh toán đã lưu: <strong>Đã thanh toán/);
      assert.deepEqual(order, before);
    });
  }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCheckoutDatabase } = require('./helpers/checkout-database.cjs');
const { withAccountApp } = require('./helpers/account-client.cjs');
const { createCartRepository } = require('../src/repositories/cart-repository');
const { createCheckoutRepository } = require('../src/repositories/checkout-repository');
const { createOrderRepository } = require('../src/repositories/order-repository');
const { createCheckoutService } = require('../src/services/checkout-service');

async function signIn(browser, phone) {
  await browser.get('/register');
  assert.equal((await browser.post('/register', { full_name: 'Khách thử riêng', phone, password: 'TestPassword123', confirm_password: 'TestPassword123' })).status, 303);
  await browser.get('/login');
  assert.equal((await browser.post('/login', { phone, password: 'TestPassword123' })).status, 303);
}
function confirmation(page) {
  assert.equal(page.status, 200);
  return { checkout_token: page.html.match(/name="checkout_token" value="([a-f0-9]+)"/)[1],
    address_id: page.html.match(/name="address_id" value="(\d+)"/)[1], confirm: '1' };
}

test('Mua ngay HTTP/session/mock: đăng nhập/CSRF, chỉ checkout dòng chọn, đặt xong giữ giỏ khác',async()=>{
  const db=createCheckoutDatabase();
  db.state.carts=[{cart_item_id:1,user_id:1,variant_id:2,quantity:1},{cart_item_id:2,user_id:2,variant_id:1,quantity:1}];
  await withAccountApp(async({client})=>{
    const guest=client();await guest.get('/login');
    const redirect=await guest.post('/cart/buy-now',{variant_id:'1',quantity:'2',returnTo:'/products/1?variant=1'});
    assert.equal(redirect.status,303);assert.equal(redirect.headers.get('location'),'/login?returnTo=%2Fproducts%2F1%3Fvariant%3D1');
    assert.equal(db.state.carts.length,2);
    const a=client();await signIn(a,'0900000001');await a.get('/account');
    assert.equal((await a.post('/cart/buy-now',{variant_id:'1',quantity:'2'},'invalid')).status,403);
    const response=await a.post('/cart/buy-now',{variant_id:'1',quantity:'2',user_id:'2',price:'0',total:'0'});
    assert.equal(response.status,303);assert.match(response.headers.get('location'),/^\/checkout\?items=\d+$/);
    const id=Number(new URL(response.headers.get('location'),'http://test').searchParams.get('items'));
    assert.equal(db.state.carts.find(c=>c.cart_item_id===id).user_id,1);
    // Gửi lại Mua ngay không tăng gấp đôi số lượng hoặc tạo thêm dòng giỏ.
    const repeated=await a.post('/cart/buy-now',{variant_id:'1',quantity:'2'});
    assert.equal(repeated.headers.get('location'),response.headers.get('location'));
    assert.equal(db.state.carts.length,3);
    const page=await a.get(response.headers.get('location'));
    assert.equal(page.status,200);assert.match(page.html,/200\.000,02/);
    assert.match(page.html,new RegExp(`name="items" value="${id}"`));
    const order=await a.post('/checkout',{...confirmation(page),payment_method:'cod'});
    assert.equal(order.status,303);assert.equal(db.state.orders.length,1);
    assert.equal(db.state.orderItems.length,1);assert.equal(db.state.orderItems[0].variant_id,1);
    assert.equal(db.state.orderItems[0].quantity,2);
    assert.deepEqual(db.state.carts.map(c=>[c.user_id,c.variant_id,c.quantity]),[[1,2,1],[2,1,1]]);
  },undefined,createCartRepository(db),createCheckoutRepository(db),createOrderRepository(db));
});

test('Luồng mua HTTP: giỏ → xác nhận lại giá → 12 request lặp → lịch sử snapshot', async () => {
  const db = createCheckoutDatabase(); db.state.carts = [];
  await withAccountApp(async ({ client }) => {
    const a = client(), b = client(), guest = client();
    for (const route of ['/cart','/checkout','/orders','/orders/1']) assert.equal((await guest.get(route)).status, 303);
    await guest.get('/login');
    assert.equal((await guest.post('/cart/items', { variant_id: '1', quantity: '1' })).status, 303);
    assert.equal(db.state.carts.length, 0);
    await signIn(a, '0900000001'); await signIn(b, '0900000002');
    await a.get('/cart');
    for (const variant_id of ['1','1','2']) assert.equal((await a.post('/cart/items', { variant_id, quantity: '1', user_id: '2', price: '0' })).status, 303);
    assert.equal(db.state.carts.length, 2); assert.equal(db.state.carts[0].quantity, 2);
    const firstId = db.state.carts[0].cart_item_id, secondId = db.state.carts[1].cart_item_id;
    assert.equal((await a.post(`/cart/items/${firstId}/update`, { quantity: '6' })).status, 422);
    assert.equal((await a.post(`/cart/items/${firstId}/update`, { quantity: '1' })).status, 303);
    assert.equal((await a.post(`/cart/items/${secondId}/delete`)).status, 303);
    assert.equal(db.state.carts.length, 1);
    db.state.variants[0].price = '150000.02';
    let page = await a.get('/checkout'); assert.match(page.html, /180.000,02/);
    const old = confirmation(page);
    db.state.variants[0].price = '180000.03';
    assert.equal((await a.post('/checkout', old)).status, 409);
    assert.equal(db.state.orders.length, 0); assert.equal(db.state.variants[0].stock, 5);
    assert.equal((await a.get('/checkout?address_id=2')).status, 409);
    page = await a.get('/checkout'); const data = confirmation(page);
    assert.equal((await a.post('/checkout', { ...data, address_id: '2' })).status, 409);
    const results = await Promise.all(Array.from({ length: 12 }, () => a.post('/checkout', data)));
    assert.ok(results.every((r) => [303,409].includes(r.status)));
    assert.ok(results.some((r) => r.status === 303));
    assert.equal(db.state.orders.length, 1); assert.equal(db.state.variants[0].stock, 4); assert.equal(db.state.carts.length, 0);
    assert.match((await a.get('/cart')).html, /đang trống/);
    // Đổi/xóa dữ liệu hiện tại trong fixture; snapshot của đơn phải giữ nguyên.
    db.state.variants[0].product_name = 'Tên mới không được dùng'; db.state.variants[0].price = '999.00';
    db.state.addresses[0].address_detail = 'Địa chỉ mới không được dùng';
    db.state.orders[0].address_id = null; db.state.orderItems[0].product_id = null; db.state.orderItems[0].variant_id = null;
    db.state.addresses = []; db.state.variants = [];
    assert.equal((await a.get('/orders')).status, 200);
    page = await a.get('/orders/1'); assert.equal(page.status, 200);
    assert.match(page.html, /Tai nghe &lt;thử&gt;/); assert.match(page.html, /180.000,03/); assert.match(page.html, /Đường thử/);
    assert.doesNotMatch(page.html, /Tên mới không được dùng|Địa chỉ mới không được dùng/);
    assert.equal((await b.get('/orders/1?user_id=1')).status, 404);
    assert.match((await b.get('/orders')).html, /Bạn chưa có đơn hàng nào/);
  }, undefined, createCartRepository(db), createCheckoutRepository(db), createOrderRepository(db));
});

test('Luồng mua HTTP: hai khách đồng thời tranh kho 1 (DB giả lập, không chứng minh InnoDB)', async () => {
  const db = createCheckoutDatabase(); db.state.variants[0].stock = 1;
  await withAccountApp(async ({ client }) => {
    const a = client(), b = client(); await signIn(a, '0900000001'); await signIn(b, '0900000002');
    const one = confirmation(await a.get('/checkout')), two = confirmation(await b.get('/checkout'));
    const results = await Promise.all([a.post('/checkout', one), b.post('/checkout', two)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [303,409]);
    assert.equal(db.state.orders.length, 1); assert.equal(db.state.variants[0].stock, 0);
    assert.equal(db.state.carts.length, 1); assert.equal(db.state.orderItems.length, 1);
  }, undefined, createCartRepository(db), createCheckoutRepository(db), createOrderRepository(db));
});

test('Rollback sau khi order_items thứ nhất đã ghi và dòng thứ hai thất bại (giả lập)', async () => {
  const db = createCheckoutDatabase();
  db.state.carts.push({ cart_item_id: 3, user_id: 1, variant_id: 2, quantity: 1 });
  const original = structuredClone({ carts: db.state.carts, variants: db.state.variants });
  const service = createCheckoutService(createCheckoutRepository(db)); const review = await service.preview(1);
  db.state.failItemAt = 2;
  await assert.rejects(service.place(1, { checkout_token: review.token, address_id: '1', confirm: '1' }));
  assert.equal(db.state.calls.filter((c) => c.name === 'item').length, 2);
  assert.equal(db.state.orders.length, 0); assert.equal(db.state.orderItems.length, 0);
  assert.deepEqual(db.state.carts, original.carts); assert.deepEqual(db.state.variants, original.variants);
  assert.equal(db.state.calls.at(-2).name, 'rollback'); assert.equal(db.state.calls.at(-1).name, 'release');
});

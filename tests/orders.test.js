const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOrderDatabase } = require('./helpers/order-database.cjs');
const { createOrderRepository, ORDER_SQL } = require('../src/repositories/order-repository');
const { createOrderService } = require('../src/services/order-service');
const { withAccountApp } = require('./helpers/account-client.cjs');

function setup() {
  const db = createOrderDatabase(); const repository = createOrderRepository(db);
  return { db, repository, service: createOrderService(repository) };
}

test('Thanh toán sau đặt hàng: chỉ bank/pending/unpaid trong 72 giờ; GET không xác nhận tiền',async()=>{
  const {db,repository,service}=setup();
  const row=db.state.orders[0];
  Object.assign(row,{payment_method:'bank',status:'pending',payment_status:'unpaid',payment_window_open:1});
  assert.equal((await service.payment(1,'1')).canPayBank,true);
  for(const change of [{payment_method:'cod'},{status:'cancelled'},{status:'confirmed'},{payment_status:'paid'},{payment_status:'refund'},{payment_window_open:0}]){
    const before={...row};Object.assign(row,change);
    await assert.rejects(service.payment(1,'1'),{status:409});
    Object.assign(row,before);
  }
  await assert.rejects(service.payment(2,'1'),{status:404});
  assert.match(ORDER_SQL.own,/created_at > CURRENT_TIMESTAMP - INTERVAL 72 HOUR/);
  await withAccountApp(async({client})=>{
    const browser=client();assert.equal((await browser.get('/orders/1/payment')).status,303);
    await browser.get('/register');await browser.post('/register',{full_name:'Payment test',phone:'0900000001',password:'Payment123',confirm_password:'Payment123'});
    await browser.get('/login');await browser.post('/login',{phone:'0900000001',password:'Payment123'});
    let page=await browser.get('/orders?page=3');assert.match(page.html,/href="\/orders\/1\/payment">Thanh toán/);
    page=await browser.get('/orders/1');assert.match(page.html,/href="\/orders\/1\/payment">Thanh toán/);assert.doesNotMatch(page.html,/Số tài khoản/);
    page=await browser.get('/orders/1/payment?user_id=2&payment_status=paid');
    assert.equal(page.status,200);assert.match(page.html,/TZ1/);assert.match(page.html,/0878250056/);assert.match(page.html,/145\.000,01/);
    assert.equal(row.payment_status,'unpaid');
    assert.equal((await browser.get('/orders/999/payment')).status,404);
    assert.equal((await browser.get('/orders/abc/payment')).status,404);
    row.payment_window_open=0;
    assert.equal((await browser.get('/orders/1/payment')).status,409);
    assert.doesNotMatch((await browser.get('/orders/1')).html,/href="\/orders\/1\/payment"/);
    row.payment_window_open=1;row.payment_status='paid';
    assert.equal((await browser.get('/orders/1/payment')).status,409);
    assert.ok(db.state.calls.every(c=>c.sql.startsWith('SELECT')));
  },undefined,undefined,undefined,repository);
});

test('Đơn mua mới: lọc thật, snapshot sản phẩm theo trang, một lần đọc items và input an toàn',async()=>{
  const {db,service}=setup();
  let history=await service.list(1,{status:'delivered',page:'999'});
  assert.equal(history.total,4);assert.equal(history.page,1);
  assert.deepEqual(history.orders.map(o=>o.order_id),[19,14,9,4]);
  assert.ok(history.orders.every(o=>o.items.length===1 && o.items[0].product_name==='Tai nghe <script>thử</script>' && o.items[0].priceLabel==='100.000,01 ₫'));
  assert.equal(db.state.calls.filter(c=>c.sql.startsWith(ORDER_SQL.listItems)).length,1);
  const pending=db.state.orders[0];Object.assign(pending,{payment_method:'bank',payment_status:'unpaid',payment_window_open:1});
  history=await service.list(1,{status:'unpaid'});assert.equal(history.total,1);assert.equal(history.orders[0].order_id,1);
  assert.equal(history.orders[0].canPayBank,true);
  for(const status of ['DROP TABLE orders','toString',['pending'],'refund'])await assert.rejects(service.list(1,{status}),{status:400});
  assert.doesNotMatch(ORDER_SQL.listItems,/image_data|\.price\b|p\.product_name/);
  assert.match(ORDER_SQL.listItems,/p.brand/);
  assert.match(ORDER_SQL.listItems,/o.user_id=\?/);
  db.state.items.find(item=>item.order_id===19).brand='Ugreen';
  await withAccountApp(async({client})=>{
    const a=client();await a.get('/register');await a.post('/register',{full_name:'Order layout test',phone:'0900000001',password:'OrderLayout123',confirm_password:'OrderLayout123'});
    await a.get('/login');await a.post('/login',{phone:'0900000001',password:'OrderLayout123'});
    const page=await a.get('/orders?status=delivered&user_id=2');
    assert.equal(page.status,200);assert.match(page.html,/href="\/orders\?status=delivered" aria-current="page"/);
    assert.match(page.html,/Tai nghe &lt;script&gt;thử&lt;\/script&gt;/);assert.doesNotMatch(page.html,/PRIVATE OTHER USER|<script>thử/);
    assert.match(page.html,/purchase-item/);assert.match(page.html,/product-placeholder.svg/);
    assert.match(page.html,/<strong>Ugreen<\/strong>/);assert.doesNotMatch(page.html,/Tổng số đơn:/);
    assert.equal((await a.get('/orders?status=invalid')).status,400);
    const empty=await a.get('/orders?status=unpaid');assert.match(empty.html,/href="\/orders\/1\/payment">Thanh toán/);
  },undefined,undefined,undefined,createOrderRepository(db));
});

test('Đơn hàng: lịch sử đúng chủ sở hữu, thứ tự và phân trang thật/giá trị sai', async () => {
  const { service } = setup();
  const first = await service.list(1, {});
  assert.equal(first.total, 22); assert.equal(first.totalPages, 3);
  assert.deepEqual(first.orders.map((o) => o.order_id), [22,21,20,19,18,17,16,15,14,13]);
  const next = await service.list(1, { page: '2', user_id: '2' });
  assert.equal(next.orders[0].order_id, 12); assert.equal(next.orders.length, 10);
  const last = await service.list(1, { page: '999' });
  assert.equal(last.page, 3); assert.equal(last.orders.length, 2);
  for (const page of ['0','-1','abc','1.5','1; DROP TABLE orders', ['2'],'999999999999']) {
    assert.equal((await service.list(1, { page })).page, 1);
  }
  const empty = await service.list(3, {});
  assert.equal(empty.total, 0); assert.equal(empty.totalPages, 0); assert.equal(empty.page, 1); assert.deepEqual(empty.orders, []);
});

test('Đơn hàng: snapshot độc lập catalog/địa chỉ đã xóa; phí lịch sử không tính lại', async () => {
  const { service, db } = setup();
  // Các FK đã NULL; không còn sản phẩm/biến thể/địa chỉ để JOIN.
  const order = await service.detail(1, '1');
  assert.equal(order.items[0].product_name, 'Tai nghe <script>thử</script>');
  assert.equal(order.receiver_name, 'Người nhận lúc đặt');
  assert.equal(order.address_detail, 'Địa chỉ lúc đặt');
  assert.equal(order.items[0].priceLabel, '100.000,01 ₫');
  assert.equal(order.items[0].lineLabel, '100.000,01 ₫');
  assert.equal(order.subtotalLabel, '100.000,01 ₫');
  assert.equal(order.shippingLabel, '45.000 ₫');
  assert.equal(order.totalLabel, '145.000,01 ₫');
  assert.equal(order.statusLabel, 'Chờ xác nhận'); assert.equal(order.paymentLabel, 'Chưa thanh toán');
  assert.equal(order.warning, '');
  for (const call of db.state.calls) assert.doesNotMatch(call.sql, /\bproducts\b|\bproduct_variants\b|\buser_addresses\b/);
});

test('Đơn hàng: ID sai/không tồn tại/người khác đều 404, không đọc items trái quyền', async () => {
  const { service, db } = setup();
  for (const id of ['0','-1','abc','1 OR 1=1','2147483648','999','123456', ['1']]) await assert.rejects(service.detail(1, id), { status: 404 });
  assert.equal(db.state.calls.filter((c) => c.sql === ORDER_SQL.items).length, 0);
  const own = await service.detail(2, '999'); assert.equal(own.order_id, 999);
});

test('Đơn hàng: dữ liệu thiếu/không khớp không tạo phí giả; trạng thái theo dữ liệu', async () => {
  const { service, db } = setup();
  db.state.items = [];
  let order = await service.detail(1, '1');
  assert.equal(order.shippingLabel, 'Không xác định'); assert.match(order.warning, /chưa đủ/);
  assert.equal(order.totalLabel, '145.000,01 ₫');
  db.state.items.push({ order_id: 1, quantity: 2, unit_price: '100000.01', product_name: 'Đã mua' });
  order = await service.detail(1, '1'); assert.equal(order.shippingLabel, 'Không xác định');
  db.state.orders[0].status = 'cancelled'; db.state.orders[0].payment_method = 'bank'; db.state.orders[0].payment_status = 'paid';
  order = await service.detail(1, '1');
  assert.equal(order.statusLabel, 'Đã hủy'); assert.equal(order.methodLabel, 'Chuyển khoản'); assert.equal(order.paymentLabel, 'Đã thanh toán');
});

test('Đơn hàng: repository chỉ SELECT có tham số, offset không nhận SQL tùy ý', async () => {
  const { repository, db } = setup();
  for (const sql of Object.values(ORDER_SQL)) assert.match(sql, /^SELECT\b/);
  await assert.rejects(repository.list(1, '0; DELETE FROM orders'));
  await repository.detail(1, 1);
  for (const c of db.state.calls) assert.deepEqual(c.params, [1,1]);
  assert.match(ORDER_SQL.items, /o.user_id = \?/);
});

test('Đơn hàng HTTP/EJS: session, quyền, phân trang, snapshot, rỗng, lỗi an toàn và CSS', async () => {
  const { repository, db } = setup();
  await withAccountApp(async ({ client }) => {
    const browser = client();
    for (const route of ['/orders','/orders/1']) assert.equal((await browser.get(route)).headers.get('location'), '/login?returnTo=%2Forders');
    await browser.get('/register');
    await browser.post('/register', { full_name: 'Người thử', phone: '0900000001', password: 'Password123', confirm_password: 'Password123' });
    await browser.get('/login');
    assert.equal((await browser.post('/login', { phone: '0900000001', password: 'Password123', returnTo: '/orders' })).headers.get('location'), '/orders');
    let page = await browser.get('/orders?user_id=2');
    assert.equal(page.status, 200); assert.doesNotMatch(page.html, /Tổng số đơn:/); assert.match(page.html, /Trang 1\/3/);
    assert.match(page.html, /\/orders\?page=2/); assert.doesNotMatch(page.html, /Đơn #999|PRIVATE OTHER USER/);
    page = await browser.get('/orders?page=2'); assert.match(page.html, /Trang 2\/3/);
    page = await browser.get('/orders?page=999'); assert.match(page.html, /Trang 3\/3/);
    page = await browser.get('/orders/1?user_id=2');
    assert.equal(page.status, 200); assert.match(page.html, /Tai nghe &lt;script&gt;thử&lt;\/script&gt;/);
    assert.doesNotMatch(page.html, /<script>thử<\/script>|action="\/orders/);
    assert.match(page.html, /Địa chỉ lúc đặt/); assert.match(page.html, /45.000 ₫/); assert.match(page.html, /22\/10\/2026 10:00/);
    for (const route of ['/orders/999','/orders/abc','/orders/0','/orders/123456','/orders/2147483648']) {
      const denied = await browser.get(route); assert.equal(denied.status, 404); assert.doesNotMatch(denied.html, /PRIVATE OTHER USER/);
    }
    assert.match((await browser.get('/account')).html, /href="\/orders"/);
    assert.equal((await browser.get('/css/orders.css')).status, 200);
    db.state.orders = [];
    page = await browser.get('/orders'); assert.equal(page.status, 200); assert.match(page.html, /Bạn chưa có đơn hàng nào/); assert.doesNotMatch(page.html, /Trang 1\/0/);
    db.state.fail = true;
    page = await browser.get('/orders'); assert.equal(page.status, 500); assert.doesNotMatch(page.html, /PRIVATE SQL\/password\/config|stack/);
  }, undefined, undefined, undefined, repository);
});

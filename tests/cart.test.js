const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCartDatabase } = require('./helpers/cart-database.cjs');
const { createCartRepository, CART_SQL } = require('../src/repositories/cart-repository');
const { createCartService } = require('../src/services/cart-service');
const { priceUnits, money } = require('../src/utils/cart-validation');
const { withAccountApp } = require('./helpers/account-client.cjs');

function setup() {
  const db = createCartDatabase();
  const repository = createCartRepository(db);
  return { db, repository, service: createCartService(repository) };
}

test('Mua ngay: đúng số lượng chọn, không cộng giỏ cũ, giữ dòng khác và rollback lỗi',async()=>{
  const {service,db}=setup();
  await service.change(1,'add',{variant_id:'1',quantity:'5'});
  await service.change(1,'add',{variant_id:'2',quantity:'1'});
  await service.change(2,'add',{variant_id:'1',quantity:'4'});
  const beforeStock=structuredClone(db.state.variants);
  const id=await service.change(1,'buyNow',{variant_id:'1',quantity:'2',user_id:'2',price:'0'});
  assert.equal(db.state.items.find(i=>i.cart_item_id===id).quantity,2);
  assert.equal(db.state.items.find(i=>i.user_id===1&&i.variant_id===2).quantity,1);
  assert.equal(db.state.items.find(i=>i.user_id===2).quantity,4);
  const before=structuredClone(db.state.items);
  for(const body of [{quantity:'0'},{quantity:'-1'},{quantity:'1.2'},{quantity:'100'},{variant_id:'999'},{variant_id:'3'},{variant_id:'4'},{variant_id:'5'},{variant_id:'2',quantity:'3'}]) {
    await assert.rejects(service.change(1,'buyNow',{variant_id:'1',quantity:'1',...body}));
    assert.deepEqual(db.state.items,before);
  }
  db.state.fail='commit';
  await assert.rejects(service.change(1,'buyNow',{variant_id:'1',quantity:'1'}));
  assert.deepEqual(db.state.items,before);assert.deepEqual(db.state.variants,beforeStock);
});

test('Giỏ: dòng mới tạo đứng đầu, thêm lại cùng biến thể vẫn một dòng',async()=>{
  const {service}=setup();
  await service.change(1,'add',{variant_id:'1',quantity:'1'});
  await service.change(1,'add',{variant_id:'2',quantity:'1'});
  let cart=await service.getCart(1);
  assert.deepEqual(cart.items.map(item=>item.variant_id),[2,1]);
  await service.change(1,'add',{variant_id:'1',quantity:'1'});
  cart=await service.getCart(1);assert.equal(cart.items.length,2);
  assert.equal(cart.items.find(item=>item.variant_id===1).quantity,2);
  assert.match(CART_SQL.list,/ORDER BY c\.cart_item_id DESC/);
});

test('Giỏ xem nhanh HTTP: yêu cầu session, chỉ đọc giỏ của mình, giới hạn 5, logout/giỏ rỗng/lỗi an toàn', async () => {
  const { repository, db, service } = setup();
  await withAccountApp(async ({ client }) => {
    const a=client();
    const anonymous=await a.get('/cart/preview?user_id=1');
    assert.equal(anonymous.status,401);
    assert.equal(JSON.parse(anonymous.html).items,undefined);
    await a.get('/register');
    await a.post('/register',{full_name:'Header TEST',phone:'0900000001',password:'TestPassword123',confirm_password:'TestPassword123'});
    await a.get('/login');await a.post('/login',{phone:'0900000001',password:'TestPassword123'});
    const page=await a.get('/');
    assert.match(page.html,/data-header-cart data-authenticated="1"/);
    assert.doesNotMatch(page.html,/header-cart-toggle|fas fa-chevron-down/);
    assert.match(page.html,/href="\/cart" class="header__cart-link"[^>]*aria-controls="header-cart-preview"/);
    assert.match(page.html,/\/js\/header-cart.js/);
    let response=await a.get('/cart/preview');
    assert.equal(response.status,200);assert.deepEqual(JSON.parse(response.html).items,[]);
    await service.change(1,'add',{variant_id:'1',quantity:'2'});
    await service.change(1,'add',{variant_id:'2',quantity:'1'});
    await service.change(2,'add',{variant_id:'1',quantity:'4'});
    response=await a.get('/cart/preview?user_id=2');
    const cart=JSON.parse(response.html);
    assert.equal(cart.quantity,3);assert.equal(cart.items[0].variantId,2);
    assert.equal(cart.items[1].quantity,2);
    assert.equal(cart.items[1].priceLabel,'100.000,01 ₫');
    assert.match(response.headers.get('cache-control'),/no-store/);
    for(const key of ['user_id','password','role','stock','valid_variant']) assert.ok(!Object.hasOwn(cart.items[0],key));
    for(let id=6;id<=11;id++) {
      db.state.variants.push({ ...db.state.variants[0],variant_id:id,product_name:'Tên <script>TEST</script> '+id });
      await service.change(1,'add',{variant_id:String(id),quantity:'1'});
    }
    const limited=JSON.parse((await a.get('/cart/preview')).html);
    assert.equal(limited.items.length,5);assert.equal(limited.lineCount,8);assert.equal(limited.quantity,9);
    assert.equal(limited.items[0].variantId,11);
    db.state.fail='list';const error=await a.get('/cart/preview');
    assert.equal(error.status,503);assert.doesNotMatch(error.html,/Injected|SQL|password|stack/);
    db.state.fail='';await a.post('/logout');
    assert.equal((await a.get('/cart/preview')).status,401);
    assert.equal((await a.get('/js/header-cart.js')).status,200);
    assert.equal((await a.get('/css/header-cart.css')).status,200);
  },undefined,repository);
});

test('Giỏ: gộp cùng biến thể, tách biến thể khác; bỏ qua giá/user_id trình duyệt', async () => {
  const { db, service } = setup();
  await service.change(1, 'add', { variant_id: '1', quantity: '2', user_id: '2', price: '-1', total: '0' });
  await service.change(1, 'add', { variant_id: '1', quantity: '3' });
  await service.change(1, 'add', { variant_id: '2', quantity: '1' });
  assert.equal(db.state.items.length, 2);
  assert.equal(db.state.items[0].user_id, 1);
  assert.equal(db.state.items[0].quantity, 5);
  const cart = await service.getCart(1);
  assert.equal(cart.quantity, 6);
  assert.equal(cart.totalLabel, '700.000,07 ₫');
  assert.equal(cart.hasProblems, false);
});

test('Giỏ: kiểm tra số lượng, ID, giá dương, biến thể hợp lệ và tồn kho ở backend', async () => {
  const { service, db } = setup();
  for (const quantity of ['0', '-1', '1.5', 'abc', '100', '1e1', ['1'], undefined]) {
    await assert.rejects(service.change(1, 'add', { variant_id: '1', quantity }), { status: 422 });
  }
  for (const variant_id of ['0', '-1', '1 OR 1=1', ['1'], '2147483648']) {
    await assert.rejects(service.change(1, 'add', { variant_id, quantity: '1' }));
  }
  for (const variant_id of ['3', '4', '5', '999']) await assert.rejects(service.change(1, 'add', { variant_id, quantity: '1' }));
  await assert.rejects(service.change(1, 'add', { variant_id: '2', quantity: '3' }));
  await service.change(1, 'add', { variant_id: '1', quantity: '99' });
  await assert.rejects(service.change(1, 'add', { variant_id: '1', quantity: '1' }));
  assert.equal(db.state.items[0].quantity, 99);
});

test('Giỏ: tăng/giảm, xóa dòng/xóa giỏ và kiểm tra quyền sở hữu', async () => {
  const { service, db } = setup();
  await service.change(1, 'add', { variant_id: '1', quantity: '3' });
  const id = String(db.state.items[0].cart_item_id);
  await service.change(1, 'update', { quantity: '4' }, id);
  await service.change(1, 'update', { quantity: '2' }, id);
  assert.equal(db.state.items[0].quantity, 2);
  await assert.rejects(service.change(2, 'update', { quantity: '1' }, id), { status: 404 });
  await assert.rejects(service.change(2, 'remove', {}, id), { status: 404 });
  assert.equal((await service.getCart(2)).items.length, 0);
  await service.change(2, 'add', { variant_id: '1', quantity: '1' });
  await service.change(1, 'clear', {});
  assert.equal(db.state.items.length, 1);
  assert.equal(db.state.items[0].user_id, 2);
  await service.change(2, 'remove', {}, String(db.state.items[0].cart_item_id));
  assert.equal((await service.getCart(2)).totalLabel, '0 ₫');
});

test('Giỏ: luôn đọc giá/kho mới, thông báo lỗi nhưng không tự xóa dòng', async () => {
  const { service, db } = setup();
  await service.change(1, 'add', { variant_id: '1', quantity: '3' });
  db.state.variants[0].price = '999.99';
  assert.equal((await service.getCart(1)).totalLabel, '2.999,97 ₫');
  db.state.variants[0].stock = 2;
  assert.match((await service.getCart(1)).items[0].problem, /vượt tồn kho/);
  await assert.rejects(service.change(1, 'update', { quantity: '3' }, '1'));
  await service.change(1, 'update', { quantity: '2' }, '1');
  db.state.variants[0].stock = 0;
  assert.match((await service.getCart(1)).items[0].problem, /hết hàng/);
  db.state.variants[0].price = '-1.00';
  assert.match((await service.getCart(1)).items[0].problem, /giá bán/);
  db.state.variants.shift();
  assert.match((await service.getCart(1)).items[0].problem, /không còn hợp lệ/);
  assert.equal(db.state.items.length, 1);
});

test('Giỏ: mô phỏng thêm đồng thời không mất cập nhật; rollback/release khi lỗi', async () => {
  const { service, db } = setup();
  await Promise.all(Array.from({ length: 10 }, () => service.change(1, 'add', { variant_id: '1', quantity: '1' })));
  assert.equal(db.state.items.length, 1);
  assert.equal(db.state.items[0].quantity, 10);
  assert.equal(db.state.calls.filter((c) => c.name === 'lockUser').length, 10);
  db.state.fail = 'update';
  await assert.rejects(service.change(1, 'add', { variant_id: '1', quantity: '2' }));
  assert.equal(db.state.items[0].quantity, 10);
  assert.equal(db.state.calls.at(-2).name, 'rollback');
  assert.equal(db.state.calls.at(-1).name, 'release');
  db.state.fail = 'commit';
  await assert.rejects(service.change(1, 'update', { quantity: '2' }, '1'));
  assert.equal(db.state.items[0].quantity, 10);
  assert.equal(db.state.variants[0].stock, 120);
});

test('Giỏ: SQL giới hạn theo user, không tải BLOB, không ghi stock/đơn; tiền không sai số', () => {
  assert.match(CART_SQL.list, /c.user_id = \?/);
  for (const sql of Object.values(CART_SQL)) {
    assert.doesNotMatch(sql, /image_data|\borders\b|\border_items\b|UPDATE\s+product_variants/i);
  }
  assert.equal(priceUnits('9999999999.99'), 999999999999n);
  assert.equal(money(priceUnits('0.10') * 3n), '0,30 ₫');
  for (const price of ['-1', '1.234', 'NaN', null]) assert.equal(priceUnits(price), null);
});

test('Giỏ HTTP/EJS: đăng nhập, CSRF, CRUD, giả mạo ID/giá, trạng thái trống và CSS', async () => {
  const { repository, db } = setup();
  await withAccountApp(async ({ client }) => {
    const browser = client();
    assert.equal((await browser.get('/cart')).headers.get('location'), '/login?returnTo=%2Fcart');
    await browser.get('/register');
    assert.equal((await browser.post('/cart/items', { variant_id: '1', quantity: '1' })).status, 303);
    await browser.post('/register', { full_name: 'Người thử', phone: '0900000001', password: 'Password123', confirm_password: 'Password123' });
    await browser.get('/login');
    const login = await browser.post('/login', { phone: '0900000001', password: 'Password123', returnTo: '/cart' });
    assert.equal(login.headers.get('location'), '/cart');
    let page = await browser.get('/cart');
    assert.match(page.html, /Giỏ hàng của bạn đang trống/);
    assert.equal((await browser.post('/cart/items', { variant_id: '1', quantity: '1' }, '')).status, 403);
    assert.equal((await browser.post('/cart/items', { variant_id: '1', quantity: '2', user_id: '999', price: '0' })).status, 303);
    page = await browser.get('/cart');
    assert.match(page.html, /Tai nghe &lt;test&gt;/);
    assert.match(page.html, /200.000,02/);
    assert.match(page.html, /action="\/checkout" method="get"/);
    assert.match(page.html, /data-cart-checkout/);
    assert.match(page.html, /cart-buy-button" type="submit" disabled/);
    assert.equal((await browser.post('/cart/items/1/update', { quantity: '1' })).status, 303);
    assert.equal((await browser.post('/cart/items/999/delete', {})).status, 404);
    assert.equal((await browser.post('/cart/items/1/update', { quantity: '100' })).status, 422);
    assert.equal((await browser.post('/cart/items/1/delete')).status, 303);
    await browser.post('/cart/items', { variant_id: '2', quantity: '1' });
    assert.equal((await browser.post('/cart/clear')).status, 303);
    assert.equal(db.state.items.length, 0);
    assert.equal((await browser.get('/css/cart.css')).status, 200);
    assert.equal((await browser.get('/cart/clear')).status, 404);
    db.state.fail = 'list';
    const failure = await browser.get('/cart');
    assert.equal(failure.status, 500);
    assert.doesNotMatch(failure.html, /Injected database failure|SELECT|password|stack/i);
  }, undefined, repository);
});

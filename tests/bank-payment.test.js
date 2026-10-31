const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCheckoutDatabase}=require('./helpers/checkout-database.cjs');
const {createCheckoutRepository}=require('../src/repositories/checkout-repository');
const {createCheckoutService}=require('../src/services/checkout-service');
const {createAdminOrderDatabase}=require('./helpers/admin-order-database.cjs');
const {createAdminOrderRepository}=require('../src/repositories/admin-order-repository');
const {createAdminOrderService}=require('../src/services/admin-order-service');
const {withAccountApp}=require('./helpers/account-client.cjs');

test('Ngân hàng mock: lưu bank/unpaid từ token; input giả và đổi phương thức bị chặn',async()=>{
  const db=createCheckoutDatabase(),service=createCheckoutService(createCheckoutRepository(db));
  await assert.rejects(service.preview(1,undefined,undefined,undefined,'online'),{status:422});
  const r=await service.preview(1,undefined,'1',undefined,'bank');
  assert.equal(r.bankDetails.account,'0878250056');
  const body={checkout_token:r.token,address_id:'1',confirm:'1',payment_method:'cod',payment_status:'paid',total:'0'};
  await assert.rejects(service.place(1,body),{status:409});
  const id=await service.place(1,{...body,payment_method:'bank'});
  assert.equal(db.state.orders[0].payment_method,'bank');assert.equal(db.state.orders[0].payment_status,'unpaid');
  assert.equal(db.state.orders[0].total_amount,'130000.01');assert.equal(await service.place(1,body),id);
});

test('Ngân hàng mock: đối soát riêng, CS kiểm tra trạng thái và không tự chuyển giao hàng',async()=>{
  const db=createAdminOrderDatabase();db.state.orders[0].payment_method='bank';
  const service=createAdminOrderService(createAdminOrderRepository(db));
  assert.equal((await service.detail('1')).nextStatus,null);
  await assert.rejects(service.change('1',{expected_status:'pending',next_status:'confirmed',confirm:'1'}),{status:409});
  await assert.rejects(service.confirmBank('1',{}),{status:422});
  const results=await Promise.all([service.confirmBank('1',{confirm:'1'}),service.confirmBank('1',{confirm:'1'})]);
  assert.equal(results.filter(Boolean).length,1);assert.equal(db.state.orders[0].status,'pending');assert.equal(db.state.orders[0].payment_status,'paid');
  db.state.orders[0].expired=1;assert.equal((await service.expireBatch()).cancelled,0);
  assert.equal((await service.detail('1')).nextStatus,'confirmed');
  await service.change('1',{expected_status:'pending',next_status:'confirmed',confirm:'1'});
  await assert.rejects(service.change('1',{expected_status:'pending',confirm:'1'},true),{status:409});
  assert.equal(db.state.variants[0].stock,3);
});

test('Ngân hàng mock: quá 72h hủy và hoàn kho/lượt đúng một lần; không nhận tiền đơn hủy/quá hạn',async()=>{
  const db=createAdminOrderDatabase();Object.assign(db.state.orders[0],{payment_method:'bank',expired:1,coupon_id:1});db.state.coupons.push({coupon_id:1,used_count:1});
  const service=createAdminOrderService(createAdminOrderRepository(db));
  await assert.rejects(service.confirmBank('1',{confirm:'1'}),{status:409});
  await Promise.all([service.expireBatch(),service.expireBatch()]);
  assert.equal(db.state.orders[0].status,'cancelled');assert.equal(db.state.variants[0].stock,4);assert.equal(db.state.coupons[0].used_count,0);
  await assert.rejects(service.confirmBank('1',{confirm:'1'}),{status:409});
  const other=createAdminOrderDatabase();other.state.orders[0].payment_method='bank';other.state.fail='confirmBank';
  await assert.rejects(createAdminOrderService(createAdminOrderRepository(other)).confirmBank('1',{confirm:'1'}));
  assert.equal(other.state.orders[0].payment_status,'unpaid');
});

test('Ngân hàng HTTP/session/mock: chọn phương thức/giữ khi đổi voucher/đặt đơn; admin quyền/CSRF/đối soát',async()=>{
  const db=createCheckoutDatabase(),adminDb=createAdminOrderDatabase();adminDb.state.orders[0].payment_method='bank';
  await withAccountApp(async({client,database})=>{
    const a=client();await a.get('/register');await a.post('/register',{full_name:'Bank TEST',phone:'0900000001',password:'TestPassword123',confirm_password:'TestPassword123'});await a.get('/login');await a.post('/login',{phone:'0900000001',password:'TestPassword123'});
    await a.get('/checkout?items=1');assert.equal((await a.post('/checkout/payment',{payment_method:'bank'},'')).status,403);
    assert.equal((await a.post('/checkout/payment',{payment_method:'fake'})).status,422);
    assert.equal((await a.post('/checkout/payment',{payment_method:'bank',items:'1',address_id:'1'})).status,303);
    let page=await a.get('/checkout?items=1&address_id=1');assert.doesNotMatch(page.html,/0878250056|Thông tin chuyển khoản/);
    await a.post('/checkout/coupon/remove',{items:'1',address_id:'1'});page=await a.get('/checkout?items=1');assert.match(page.html,/value="bank" class="checkout-payment-option" aria-pressed="true"/);
    const token=page.html.match(/name="checkout_token" value="([a-f0-9]+)"/)[1];
    assert.equal((await a.post('/checkout',{checkout_token:token,address_id:'1',confirm:'1',payment_method:'bank',payment_status:'paid'})).status,303);
    page=await a.get('/checkout/success/1');assert.match(page.html,/chọn “Thanh toán”/);assert.match(page.html,/Chưa thanh toán/);assert.doesNotMatch(page.html,/0878250056/);
    assert.equal((await a.post('/admin/orders/1/confirm-bank',{confirm:'1'})).status,403);
    database.state.users[0].role='admin';page=await a.get('/admin/orders/1');assert.match(page.html,/confirm-bank/);
    assert.equal((await a.post('/admin/orders/1/confirm-bank',{confirm:'1'},'')).status,403);
    assert.equal((await a.post('/admin/orders/1/confirm-bank',{confirm:'1',payment_status:'refund',total:'0'})).status,303);
    assert.equal(adminDb.state.orders[0].payment_status,'paid');assert.equal(adminDb.state.orders[0].status,'pending');
  },undefined,undefined,createCheckoutRepository(db),undefined,undefined,createAdminOrderRepository(adminDb));
});

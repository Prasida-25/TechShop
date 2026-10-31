const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyCoupon}=require('../src/utils/coupon-pricing');
const {quote}=require('../src/utils/checkout');
const {createCheckoutDatabase}=require('./helpers/checkout-database.cjs');
const {createCheckoutRepository}=require('../src/repositories/checkout-repository');
const {createCheckoutService}=require('../src/services/checkout-service');
const {createAdminOrderDatabase}=require('./helpers/admin-order-database.cjs');
const {createAdminOrderRepository}=require('../src/repositories/admin-order-repository');
const {formatOrderDetail}=require('../src/services/order-service');
const {withAccountApp}=require('./helpers/account-client.cjs');
const fixture=()=>({coupon_id:1,code:'TEST10',discount_type:'percent',discount_value:'10.00',min_order_amount:'0.00',max_discount_amount:null,
  starts_at:'2026-01-01 00:00:00',ends_at:'2027-01-01 00:00:00',max_uses:1,used_count:0,is_active:1,not_started:0,expired:0});
const body=r=>({checkout_token:r.token,address_id:String(r.address.address_id),confirm:'1',discount:'999999',total:'0',coupon_code:'FAKE'});
function setup(){const db=createCheckoutDatabase();db.state.coupons.push(fixture());return {db,service:createCheckoutService(createCheckoutRepository(db))};}

test('Coupon unit: percent/fixed/cap/rounding, không giảm phí hoặc đổi ngưỡng miễn phí',()=>{
  const pricing=price=>quote([{product_id:1,valid_variant:1,stock:1,quantity:1,price}]);
  assert.equal(applyCoupon(pricing('100000.01'),fixture(),true).total,'120000.01');
  assert.equal(applyCoupon(pricing('300000.00'),fixture(),true).shipping,'0.00');
  assert.equal(applyCoupon(pricing('300000.00'),fixture(),true).total,'270000.00');
  assert.equal(applyCoupon(pricing('300000.00'),{...fixture(),max_discount_amount:'5000'},true).discount,'5000.00');
  assert.equal(applyCoupon(pricing('100.00'),{...fixture(),discount_type:'fixed',discount_value:'999'},true).total,'30000.00');
  for(const change of [null,{...fixture(),is_active:0},{...fixture(),expired:1},{...fixture(),not_started:1},
    {...fixture(),used_count:1},{...fixture(),min_order_amount:'200000'}])assert.throws(()=>applyCoupon(pricing('100000'),change,true),{status:409});
});

test('Coupon mock transaction: snapshot, không tin discount request, chỉ dùng một lượt, giữ dòng chưa chọn',async()=>{
  const {db,service}=setup();db.state.carts.push({cart_item_id:3,user_id:1,variant_id:2,quantity:1});
  const review=await service.preview(1,undefined,'1','test10');
  assert.equal(db.state.coupons[0].used_count,0);
  const id=await service.place(1,body(review));assert.equal(await service.place(1,body(review)),id);
  const o=db.state.orders[0];assert.equal(o.discount_amount,'10000.00');assert.equal(o.shipping_fee,'30000.00');assert.equal(o.total_amount,'120000.01');
  assert.equal(o.coupon_code,'TEST10');assert.equal(db.state.coupons[0].used_count,1);assert.equal(db.state.carts.filter(c=>c.user_id===1).length,1);
  db.state.coupons[0].discount_value='99';db.state.coupons[0].is_active=0;
  const detail=formatOrderDetail({...o,items:db.state.orderItems});assert.equal(detail.warning,'');assert.equal(detail.discountLabel,'10.000 ₫');
});

test('Coupon mock: thay mã/điều kiện/giá/kho sau preview bị từ chối; rollback hoàn lượt',async()=>{
  for(const change of ['disabled','expired','terms','price','stock','order','item','clear','commit']){
    const {db,service}=setup();const r=await service.preview(1,undefined,undefined,'TEST10');
    if(change==='disabled')db.state.coupons[0].is_active=0;
    if(change==='expired')db.state.coupons[0].expired=1;
    if(change==='terms')db.state.coupons[0].discount_value='20.00';
    if(change==='price')db.state.variants[0].price='200000';
    if(change==='stock')db.state.failStockId=1;
    if(['order','item','clear','commit'].includes(change))db.state.fail=change;
    await assert.rejects(service.place(1,body(r)));assert.equal(db.state.coupons[0].used_count,0,change);
    assert.equal(db.state.orders.length,0,change);assert.equal(db.state.variants[0].stock,5,change);assert.equal(db.state.carts.length,2,change);
  }
});

test('Coupon mock concurrency: hai khách cùng mã một lượt chỉ một đơn',async()=>{
  const {db,service}=setup();const a=await service.preview(1,undefined,undefined,'TEST10'),b=await service.preview(2,undefined,undefined,'TEST10');
  const results=await Promise.allSettled([service.place(1,body(a)),service.place(2,body(b))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(db.state.orders.length,1);assert.equal(db.state.coupons[0].used_count,1);
});

test('Coupon cancellation mock: admin/tự hủy hoàn đúng một lần và rollback khi dữ liệu lệch',async()=>{
  for(const automatic of [false,true]){
    const db=createAdminOrderDatabase();db.state.orders[0].coupon_id=1;db.state.orders[0].expired=1;db.state.coupons.push({...fixture(),used_count:1});
    const repo=createAdminOrderRepository(db);
    const results=await Promise.allSettled([repo.change(1,'pending','cancelled',automatic),repo.change(1,'pending','cancelled',automatic)]);
    assert.equal(db.state.orders[0].status,'cancelled');assert.equal(db.state.coupons[0].used_count,0);assert.equal(db.state.variants[0].stock,4);
    assert.ok(results.some(r=>r.status==='fulfilled'));
  }
  const db=createAdminOrderDatabase();db.state.orders[0].coupon_id=1;db.state.coupons.push(fixture());
  await assert.rejects(createAdminOrderRepository(db).change(1,'pending','cancelled'),{status:409});
  assert.equal(db.state.orders[0].status,'pending');assert.equal(db.state.variants[0].stock,3);
});

test('Coupon HTTP/session/mock: áp dụng/gỡ/thay mã, CSRF và lỗi chặn nút đặt hàng',async()=>{
  const {db}=setup();
  await withAccountApp(async({client})=>{
    const a=client();await a.get('/register');await a.post('/register',{full_name:'Khách test',phone:'0900000001',password:'TestPassword123',confirm_password:'TestPassword123'});
    await a.get('/login');await a.post('/login',{phone:'0900000001',password:'TestPassword123'});
    assert.equal((await a.get('/checkout?items=1')).status,200);
    assert.equal((await a.post('/checkout/coupon',{code:'TEST10',items:'1'},'')).status,403);
    assert.equal((await a.post('/checkout/coupon',{code:'test10',items:'1',address_id:'1'})).status,303);
    let page=await a.get('/checkout?items=1&address_id=1');assert.match(page.html,/120\.000,01/);assert.match(page.html,/name="checkout_token"/);
    page=await a.post('/checkout/coupon',{code:'INVALID',items:'1',address_id:'1'});assert.equal(page.status,409);assert.doesNotMatch(page.html,/name="checkout_token"/);
    page=await a.post('/checkout/coupon',{code:'',items:'1'});assert.equal(page.status,422);assert.match(page.html,/Gỡ mã giảm giá/);assert.doesNotMatch(page.html,/name="checkout_token"/);
    assert.equal((await a.post('/checkout/coupon/remove',{items:'1',address_id:'1'})).headers.get('location'),'/checkout?items=1&address_id=1');
    page=await a.get('/checkout?items=1');assert.match(page.html,/130\.000,01/);
    assert.equal(db.state.coupons[0].used_count,0);assert.equal(db.state.orders.length,0);
  },undefined,undefined,createCheckoutRepository(db));
});

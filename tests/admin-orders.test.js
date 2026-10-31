const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAdminOrderDatabase } = require('./helpers/admin-order-database.cjs');
const { createAdminOrderRepository, ADMIN_ORDER_SQL: SQL } = require('../src/repositories/admin-order-repository');
const { createAdminOrderService } = require('../src/services/admin-order-service');
const { startOrderExpiry } = require('../src/services/order-expiry');
const { withAccountApp } = require('./helpers/account-client.cjs');
const body = (expected, next) => ({expected_status:expected,next_status:next,confirm:'1',payment_status:'paid',stock:'999',user_id:'999'});
function setup(){const db=createAdminOrderDatabase(),repo=createAdminOrderRepository(db);return{db,repo,service:createAdminOrderService(repo)};}

test('Đơn admin: danh sách/tìm/lọc/phân trang, input an toàn và chỉ SELECT khi đọc',async()=>{
  const {db,service}=setup();
  const first=db.state.orders[0];
  for(let i=3;i<=25;i++)db.state.orders.push({...first,order_id:i});
  const a=await service.list({page:'1'}),b=await service.list({page:'2'});
  assert.equal(a.total,25);assert.equal(a.orders.length,20);assert.equal(b.orders.length,5);
  assert.ok(b.orders.every(o=>!a.orders.some(x=>x.order_id===o.order_id)));
  assert.equal((await service.list({page:'999'})).page,2);
  assert.equal((await service.list({page:'-1'})).page,1);
  assert.equal((await service.list({q:'#2'})).orders[0].order_id,2);
  assert.equal((await service.list({q:"' OR 1=1 --"})).total,0);
  assert.equal((await service.list({status:'delivered'})).total,0);
  for(const query of [{q:['x']},{q:'x'.repeat(101)},{status:'toString'},{status:['pending']}])await assert.rejects(service.list(query),{status:400});
  assert.ok(db.state.calls.every(c=>c.sql.startsWith('SELECT')));
  assert.ok(db.state.calls.some(c=>c.params?.includes("%' OR 1=1 --%")));
});

test('Đơn admin: snapshot không lấy giá/địa chỉ hiện tại, thiếu dữ liệu không tạo phí giả; ID lỗi 404',async()=>{
  const {db,service}=setup();const detail=await service.detail('1');
  assert.equal(detail.items[0].priceLabel,'100.000,01 ₫');assert.equal(detail.shippingLabel,'30.000 ₫');assert.equal(detail.address_detail,'Địa chỉ cũ');
  assert.ok(!db.state.calls.some(c=>/JOIN (products|product_variants|user_addresses)/.test(c.sql)));
  db.state.items=[];const missing=await service.detail('1');assert.equal(missing.shippingLabel,'Không xác định');assert.ok(missing.warning);
  db.state.orders[0].status='unknown';assert.equal((await service.detail('1')).statusLabel,'Chưa xác định');
  for(const id of ['0','-1','x','999','2147483648'])await assert.rejects(service.detail(id),{status:404});
});

test('Đơn admin: chuyển tuần tự, không bỏ/quay bước; không ghi payment/giá/khách hàng/kho khi giao',async()=>{
  const {db,service}=setup();const original=structuredClone(db.state.variants);
  await assert.rejects(service.change('1',body('pending','shipping')),{status:409});
  await assert.rejects(service.change('1',{...body('pending','confirmed'),confirm:'0'}),{status:422});
  for(const [from,to]of [['pending','confirmed'],['confirmed','shipping'],['shipping','delivered']])await service.change('1',body(from,to));
  assert.equal(db.state.orders[0].status,'delivered');assert.equal(db.state.orders[0].payment_status,'unpaid');
  assert.equal(db.state.orders[0].user_id,1);assert.equal(db.state.orders[0].total_amount,'130000.01');assert.deepEqual(db.state.variants,original);
  await assert.rejects(service.change('1',body('pending','confirmed')),{status:409});
  await assert.rejects(service.change('1',body('delivered','pending')),{status:409});
  await assert.rejects(service.change('1',body('delivered','cancelled'),true),{status:409});
});

test('Hủy admin: hai yêu cầu đồng thời hoàn kho một lần; từ chối đơn đã thu tiền/khác COD/đã xác nhận',async()=>{
  const {db,service}=setup();
  const result=await Promise.allSettled([service.change('1',body('pending','cancelled'),true),service.change('1',body('pending','cancelled'),true)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.status,409);
  assert.equal(db.state.variants[0].stock,4);assert.equal(db.state.orders[0].status,'cancelled');
  await assert.rejects(service.change('1',body('pending','cancelled'),true),{status:409});assert.equal(db.state.variants[0].stock,4);
  for(const change of [{payment_status:'paid'},{payment_method:'unsupported'},{status:'confirmed'}]){
    const x=setup();Object.assign(x.db.state.orders[0],change);
    await assert.rejects(x.service.change('1',body('pending','cancelled'),true),{status:409});assert.equal(x.db.state.variants[0].stock,3);
  }
});

test('Hủy admin: gộp variant trùng, rollback khi hoàn kho hoặc status lỗi; chặn thiếu variant/overflow',async()=>{
  {
    const{db,service}=setup();db.state.items.push({...db.state.items[0],order_item_id:3,quantity:2});
    await service.change('1',body('pending','cancelled'),true);assert.equal(db.state.variants[0].stock,6);
  }
  for(const fault of ['second','status','missing','overflow','empty']){
    const{db,service}=setup();
    if(fault==='second'){db.state.variants.push({variant_id:2,product_id:2,stock:0});db.state.items.push({...db.state.items[0],order_item_id:3,variant_id:2,product_id:2});db.state.failVariant=2;}
    if(fault==='status')db.state.fail='status';
    if(fault==='missing')db.state.items[0].variant_id=null;
    if(fault==='overflow')db.state.variants[0].stock=2147483647;
    if(fault==='empty')db.state.items=db.state.items.filter(i=>i.order_id!==1);
    const before=structuredClone({orders:db.state.orders,variants:db.state.variants});
    await assert.rejects(service.change('1',body('pending','cancelled'),true));
    assert.deepEqual({orders:db.state.orders,variants:db.state.variants},before);
    assert.equal(db.state.calls.at(-2).sql,'rollback');assert.equal(db.state.calls.at(-1).sql,'release');
  }
});

test('Tự hủy: chỉ pending quá 72h/cod/unpaid; cạnh tranh admin không hoàn hai lần; lỗi một đơn không bỏ toàn batch',async()=>{
  const{db,service}=setup();db.state.orders[0].expired=1;
  assert.equal((await service.detail('1')).nextStatus,null);
  await assert.rejects(service.change('1',body('pending','confirmed')),{status:409});
  const result=await Promise.all([service.expireBatch(),service.expireBatch()]);
  assert.equal(result.reduce((n,r)=>n+r.cancelled,0),1);assert.equal(db.state.variants[0].stock,4);
  const direct=await createAdminOrderRepository(db).change(2,'pending','cancelled',true);assert.equal(direct,false);
  assert.match(SQL.expired,/INTERVAL 72 HOUR/);
  const x=setup();x.db.state.orders.forEach(o=>{o.expired=1;});x.db.state.items[0].variant_id=null;
  const batch=await x.service.expireBatch();assert.deepEqual(batch,{selected:2,cancelled:1,failed:1,skipped:0});
  assert.equal(x.db.state.orders[0].status,'pending');assert.equal(x.db.state.orders[1].status,'cancelled');
});

test('Worker tự hủy: chạy lúc start, không chồng tick, dừng chờ lượt đang chạy; log không lộ lỗi gốc',async()=>{
  let calls=0,resolve;const gate=new Promise(r=>{resolve=r;});const logs=[];
  const worker=startOrderExpiry({async expireBatch(){calls++;await gate;return{cancelled:1,failed:0};}},{intervalMs:100000,log:{info:m=>logs.push(m),error:m=>logs.push(m)}});
  await worker.tick();assert.equal(calls,1);
  const stopped=worker.stop();resolve();await stopped;await worker.tick();assert.equal(calls,1);assert.equal(logs.length,1);
  const bad=startOrderExpiry({async expireBatch(){throw new Error('PRIVATE_SQL_SECRET');}},{intervalMs:100000,log:{info:m=>logs.push(m),error:m=>logs.push(m)}});
  await bad.stop();assert.ok(!logs.join('').includes('PRIVATE_SQL_SECRET'));
});

test('Đơn admin HTTP: quyền/CSRF, snapshot/EJS, POST trạng thái và hủy, không thay dữ liệu bằng GET',async()=>{
  const{db,repo}=setup();
  await withAccountApp(async({client,database})=>{
    const a=client();assert.equal((await a.get('/admin/orders')).status,303);
    await a.get('/register');await a.post('/register',{full_name:'Admin TEST',phone:'0900000001',password:'AdminTest123',confirm_password:'AdminTest123'});
    await a.get('/login');await a.post('/login',{phone:'0900000001',password:'AdminTest123'});await a.get('/account');
    assert.equal((await a.get('/admin/orders')).status,403);assert.equal((await a.post('/admin/orders/1/cancel',body('pending','cancelled'))).status,403);
    database.state.users[0].role='admin';
    const page=await a.get('/admin/orders');assert.equal(page.status,200);assert.match(page.html,/2 đơn hàng phù hợp/);
    const before=structuredClone(db.state.orders);const detail=await a.get('/admin/orders/1');assert.equal(detail.status,200);assert.match(detail.html,/Tai nghe &lt;TEST&gt; lúc mua/);assert.match(detail.html,/Địa chỉ cũ/);assert.deepEqual(db.state.orders,before);
    assert.equal((await a.get('/admin/orders/bad')).status,404);
    assert.equal((await a.post('/admin/orders/1/status',body('pending','confirmed'),'')).status,403);
    assert.equal((await a.post('/admin/orders/1/status',body('pending','shipping'))).status,409);
    assert.equal((await a.post('/admin/orders/1/status',body('pending','confirmed'))).status,303);
    assert.equal((await a.post('/admin/orders/1/cancel',body('pending','cancelled'))).status,409);
    assert.equal((await a.post('/admin/orders/2/cancel',body('pending','cancelled'))).status,303);
    assert.equal((await a.post('/admin/orders/2/cancel',body('pending','cancelled'))).status,409);assert.equal(db.state.variants[0].stock,4);
    db.state.fail='detail';const failed=await a.get('/admin/orders/1');assert.equal(failed.status,500);assert.doesNotMatch(failed.html,/PRIVATE SQL|password|stack/);
  },undefined,undefined,undefined,undefined,undefined,repo);
});

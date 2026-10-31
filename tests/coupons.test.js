const {test}=require('node:test');
const assert=require('node:assert/strict');
const {couponInput,couponCode}=require('../src/utils/coupon-validation');
const {createCouponService}=require('../src/services/coupon-service');
const {withAccountApp}=require('./helpers/account-client.cjs');
const valid={code:' test10 ',discount_type:'percent',discount_value:'10',min_order_amount:'100000',max_discount_amount:'50000',starts_at:'2026-01-01T00:00',ends_at:'2027-01-01T00:00',max_uses:'10',is_active:'1'};

test('Mã admin: chuẩn hóa/tiền/phần trăm/ngày/hạn mức, không nhận used_count hoặc ID từ body',()=>{
  const data=couponInput({...valid,used_count:'999',coupon_id:'3',role:'admin'});
  assert.equal(data.code,'TEST10');assert.equal(data.used_count,undefined);assert.equal(data.coupon_id,undefined);
  assert.equal(couponCode('TeSt10'),'TEST10');assert.equal(data.starts_at,'2026-01-01 00:00:00');
  for(const change of [{code:'a'},{code:'<script>'},{code:['ABC']},{discount_value:'0'},{discount_value:'101'},{discount_value:'1.001'},
    {min_order_amount:'-1'},{max_discount_amount:'0'},{max_uses:'0'},{max_uses:'1.5'},{starts_at:'2026-02-30T00:00'},
    {ends_at:'2025-01-01T00:00'},{is_active:'2'},{discount_type:'fixed',max_discount_amount:'2'}])assert.throws(()=>couponInput({...valid,...change}));
  assert.equal(couponInput({...valid,max_uses:'',max_discount_amount:''}).max_uses,null);
});

test('Mã admin HTTP/mock: quyền/CSRF/tạo/sửa/trùng/kích hoạt/danh sách đơn',async()=>{
  const state=[];
  const repository={
    list:async(q,page)=>({coupons:state.filter(c=>c.code.includes(q.toUpperCase())),q,page:1,pages:state.length?1:0,total:state.length}),
    detail:async id=>{const row=state.find(c=>c.coupon_id===id);if(!row)throw new (require('../src/utils/coupon-validation').CouponError)({general:'Không tìm thấy mã.'},404);return row;},
    save:async(id,data)=>{if(!id&&state.some(c=>c.code===data.code))throw Object.assign(new Error('fixture'),{code:'ER_DUP_ENTRY'});if(id)Object.assign(state.find(c=>c.coupon_id===id),data);else state.push({...data,coupon_id:state.length+1,used_count:0,not_started:0,expired:0});return id||state.length;},
    status:async(id,active)=>{state.find(c=>c.coupon_id===id).is_active=active;},
    orders:async id=>({coupon:state.find(c=>c.coupon_id===id),orders:[],page:1,pages:0,total:0}),
  };
  await withAccountApp(async({client,database})=>{
    const a=client();assert.equal((await a.get('/admin/coupons')).status,303);
    await a.get('/register');await a.post('/register',{full_name:'Coupon TEST',phone:'0900000001',password:'TestPassword123',confirm_password:'TestPassword123'});
    await a.get('/login');await a.post('/login',{phone:'0900000001',password:'TestPassword123'});await a.get('/');
    assert.equal((await a.post('/admin/coupons',{...valid,role:'admin'})).status,403);
    database.state.users[0].role='admin';await a.get('/admin/coupons/new');
    assert.equal((await a.post('/admin/coupons',valid,'')).status,403);
    assert.equal((await a.post('/admin/coupons',{...valid,discount_value:'101'})).status,422);
    assert.equal((await a.post('/admin/coupons',valid)).status,303);
    assert.equal((await a.post('/admin/coupons',valid)).status,409);
    assert.match((await a.get('/admin/coupons')).html,/TEST10/);
    assert.equal((await a.get('/admin/coupons/1/edit')).status,200);
    assert.equal((await a.post('/admin/coupons/1/update',{...valid,discount_value:'20'})).status,303);
    assert.equal((await a.post('/admin/coupons/1/status',{is_active:'0'})).status,303);assert.equal(state[0].is_active,0);
    assert.match((await a.get('/admin/coupons/1/orders')).html,/Chưa có đơn/);
  },undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,repository);
});

module.exports={valid};

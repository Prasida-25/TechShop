// Opt-in: chỉ ghi fixture tự tạo trên instance MySQL test đã xác minh.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const argon2=require('argon2');
const {openTestPool}=require('./test-db-config.cjs');
const {createUserRepository}=require('../src/repositories/user-repository');
const {ADDRESS_SQL}=require('../src/repositories/address-repository');
const {createAdminProductService}=require('../src/services/admin-product-service');
const {createAdminProductRepository}=require('../src/repositories/admin-product-repository');
const {createCartService}=require('../src/services/cart-service');
const {createCartRepository}=require('../src/repositories/cart-repository');
const {createCheckoutService}=require('../src/services/checkout-service');
const {createCheckoutRepository,CHECKOUT_SQL}=require('../src/repositories/checkout-repository');
const {createCouponService}=require('../src/services/coupon-service');
const {createCouponRepository}=require('../src/repositories/coupon-repository');
const {createAdminOrderRepository,ADMIN_ORDER_SQL}=require('../src/repositories/admin-order-repository');
const {createOrderRepository}=require('../src/repositories/order-repository');
const {formatOrderDetail}=require('../src/services/order-service');

async function main(){
  const pool=await openTestPool(),tag='COUPON-'+crypto.randomBytes(8).toString('hex').toUpperCase();
  const users=[],coupons=[];let productId;
  const tables=['users','user_addresses','products','product_variants','cart_items','orders','order_items','coupons'];
  const counts=async()=>{const out={};for(const t of tables){const [[r]]=await pool.query('SELECT COUNT(*) n FROM '+t);out[t]=Number(r.n);}return out;};
  const before=await counts();let passed=0;
  const pass=name=>{passed++;console.log('PASS MySQL InnoDB:',name);};
  const cart=createCartService(createCartRepository(pool)),repo=createCouponRepository(pool),codes=createCouponService(repo);
  const checkout=createCheckoutService(createCheckoutRepository(pool)),admin=createAdminOrderRepository(pool);
  const body=r=>({checkout_token:r.token,address_id:String(r.address.address_id),confirm:'1',discount:'999999999',total:'0',user_id:'999'});
  const state=async()=>{
    const [orders]=await pool.execute('SELECT * FROM orders WHERE user_id IN (?,?) ORDER BY order_id',users);
    const [items]=await pool.execute('SELECT oi.* FROM order_items oi JOIN orders o ON o.order_id=oi.order_id WHERE o.user_id IN (?,?) ORDER BY oi.order_item_id',users);
    const [carts]=await pool.execute('SELECT * FROM cart_items WHERE user_id IN (?,?) ORDER BY cart_item_id',users);
    const [variants]=await pool.execute('SELECT variant_id,stock FROM product_variants WHERE product_id=? ORDER BY variant_id',[productId]);
    const [usage]=await pool.execute('SELECT coupon_id,used_count FROM coupons WHERE coupon_id IN (?,?) ORDER BY coupon_id',coupons);
    return {orders,items,carts,variants,usage};
  };
  try{
    const [engines]=await pool.query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('coupons','orders','order_items','product_variants','cart_items')");
    assert.equal(engines.length,5);assert.ok(engines.every(r=>r.ENGINE==='InnoDB'));
    const [[clock]]=await pool.query("SELECT DATE_FORMAT(NOW()-INTERVAL 1 DAY,'%Y-%m-%dT%H:%i:%s') start, DATE_FORMAT(NOW()+INTERVAL 1 DAY,'%Y-%m-%dT%H:%i:%s') end");
    const input={code:tag+'-P',discount_type:'percent',discount_value:'10',min_order_amount:'0',max_discount_amount:'50000',starts_at:clock.start,ends_at:clock.end,max_uses:'1',is_active:'1'};
    coupons.push(await codes.save(undefined,input));
    coupons.push(await codes.save(undefined,{...input,code:tag+'-F',discount_type:'fixed',discount_value:'5000',max_discount_amount:'',max_uses:''}));
    await assert.rejects(codes.save(undefined,{...input,code:input.code.toLowerCase()}),{status:409});pass('mã UNIQUE không phân biệt hoa/thường, CRUD admin thật');
    const hash=await argon2.hash(crypto.randomBytes(20).toString('hex'));
    for(let i=0;i<2;i++){
      const phone='09'+String(crypto.randomInt(10000000,99999999));
      const id=await createUserRepository(pool).create({full_name:tag,phone},hash);users.push(id);
      await pool.execute(ADDRESS_SQL.insert,[id,tag,phone,'Địa chỉ fixture','Phường fixture','','Tỉnh fixture',1]);
    }
    const products=createAdminProductService(createAdminProductRepository(pool));
    const product={product_name:tag,category_id:'',brand:'TEST',description:'Fixture coupon',variant_name:'A',sku:tag+'-A',price:'100000.01',stock:'10'};
    productId=await products.saveProduct(undefined,product);
    await products.saveVariant(String(productId),undefined,{...product,variant_name:'B',sku:tag+'-B'});
    const variants=(await products.detail(String(productId))).variants;
    const add=(user,v=variants[0])=>cart.change(user,'add',{variant_id:String(v.variant_id),quantity:'1'});
    await add(users[0]);await add(users[0],variants[1]);
    const line=(await cart.getCart(users[0])).items.find(i=>i.variant_id===variants[0].variant_id);
    const review=await checkout.preview(users[0],undefined,String(line.cart_item_id),input.code.toLowerCase());
    assert.equal((await repo.detail(coupons[0])).used_count,0);
    const id=await checkout.place(users[0],body(review));assert.equal(await checkout.place(users[0],body(review)),id);
    let data=await state();const order=data.orders[0];
    assert.equal(order.total_amount,'120000.01');assert.equal(order.discount_amount,'10000.00');assert.equal(order.shipping_fee,'30000.00');
    assert.equal(order.coupon_code,input.code);assert.equal(data.items.length,1);assert.equal(data.carts.length,1);assert.equal(data.variants[0].stock,9);assert.equal(data.usage[0].used_count,1);
    pass('commit lưu snapshot/giảm lượt/kho/dòng đã chọn; gửi lại token không thêm đơn');
    await assert.rejects(codes.save(String(coupons[0]),{...input,max_uses:'0'}));
    await assert.rejects(codes.save(String(coupons[0]),{...input,code:tag+'-CHANGED'}));
    await codes.save(String(coupons[0]),{...input,discount_value:'20'});await codes.status(String(coupons[0]),{is_active:'0'});
    const historical=formatOrderDetail(await createOrderRepository(pool).detail(users[0],id));
    assert.equal(historical.discountLabel,'10.000 ₫');assert.equal(historical.warning,'');assert.equal((await repo.orders(coupons[0],1)).orders.length,1);
    pass('sửa/vô hiệu hóa mã không đổi snapshot lịch sử, danh sách đơn theo mã');
    const cancel=await Promise.allSettled([admin.change(id,'pending','cancelled'),admin.change(id,'pending','cancelled')]);
    assert.equal(cancel.filter(r=>r.status==='fulfilled').length,1);data=await state();assert.equal(data.usage[0].used_count,0);assert.equal(data.variants[0].stock,10);
    pass('hai yêu cầu hủy cùng đơn chỉ hoàn kho/lượt một lần, kể cả mã vô hiệu hóa');
    await codes.save(String(coupons[0]),input);
    await add(users[0]);await add(users[1]);
    const a=await checkout.preview(users[0],undefined,undefined,input.code),b=await checkout.preview(users[1],undefined,undefined,input.code);
    const results=await Promise.allSettled([checkout.place(users[0],body(a)),checkout.place(users[1],body(b))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
    data=await state();assert.equal(data.orders.filter(o=>o.status==='pending').length,1);assert.equal(data.usage[0].used_count,1);
    pass('hai khách thực sự đồng thời, cùng mã còn một lượt: đúng một đơn, một lượt');
    const pending=data.orders.find(o=>o.status==='pending');
    await pool.execute('UPDATE orders SET created_at=NOW()-INTERVAL 73 HOUR WHERE order_id=? AND user_id IN (?,?)',[pending.order_id,...users]);
    assert.equal(await admin.change(pending.order_id,'pending','cancelled',true),true);
    assert.equal(await admin.change(pending.order_id,'pending','cancelled',true),false);assert.equal((await repo.detail(coupons[0])).used_count,0);
    pass('tự hủy 72h hoàn lượt đúng một lần');
    // Fault injection chỉ ở adapter test; SQL thật vẫn chạy trong transaction thật.
    for(const point of ['stock','order','item','clear','commit']){
      if(!(await cart.getCart(users[0])).items.length)await add(users[0]);
      const adapter={execute:(...a)=>pool.execute(...a),async getConnection(){const c=await pool.getConnection();return {
        beginTransaction:()=>c.beginTransaction(),rollback:()=>c.rollback(),release:()=>c.release(),
        commit:()=>{if(point==='commit')throw new Error('TEST_BEFORE_COMMIT');return c.commit();},
        async execute(sql,p){const result=await c.execute(sql,p);if(sql===CHECKOUT_SQL[point]||(point==='clear'&&sql.includes('DELETE FROM cart_items')))throw new Error('TEST_AFTER_'+point);return result;},
      };}};
      const faulty=createCheckoutService(createCheckoutRepository(adapter)),r=await faulty.preview(users[0],undefined,undefined,input.code),initial=await state();
      await assert.rejects(faulty.place(users[0],body(r)));assert.deepEqual(await state(),initial);
      pass('rollback sau '+point+': order/items/kho/giỏ/lượt trở về trước test');
    }
    const fixed=await checkout.preview(users[0],undefined,undefined,tag+'-F');
    assert.equal(fixed.discount,'5000.00');
    await codes.status(String(coupons[1]),{is_active:'0'});
    const unchanged=await state();await assert.rejects(checkout.place(users[0],body(fixed)),{status:409});assert.deepEqual(await state(),unchanged);
    pass('vô hiệu hóa sau báo giá từ chối đặt hàng, không đổi kho hoặc lượt');
    await codes.status(String(coupons[1]),{is_active:'1'});
    const changed=await checkout.preview(users[0],undefined,undefined,tag+'-F');
    await codes.save(String(coupons[1]),{...input,code:tag+'-F',discount_type:'fixed',discount_value:'6000',max_discount_amount:'',max_uses:''});
    await assert.rejects(checkout.place(users[0],body(changed)),{status:409});
    pass('thay điều kiện sau báo giá yêu cầu xác nhận lại');
    // Rollback cả hoàn lượt nếu cập nhật trạng thái đơn thất bại.
    const fresh=await checkout.preview(users[0],undefined,undefined,tag+'-F'),cancelId=await checkout.place(users[0],body(fresh));
    const initial=await state();
    const failedAdmin=createAdminOrderRepository({execute:(...a)=>pool.execute(...a),async getConnection(){const c=await pool.getConnection();return {
      beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release(),
      async execute(sql,p){const result=await c.execute(sql,p);if(sql===ADMIN_ORDER_SQL.status)throw new Error('TEST_CANCEL_STATUS');return result;},
    };}});
    await assert.rejects(failedAdmin.change(cancelId,'pending','cancelled'));assert.deepEqual(await state(),initial);
    pass('rollback hủy đơn khôi phục đồng thời trạng thái/kho/lượt');
    if(!(await cart.getCart(users[0])).items.length)await add(users[0]);
    const bankReview=await checkout.preview(users[0],undefined,undefined,input.code,'bank');
    const bankId=await checkout.place(users[0],{...body(bankReview),payment_method:'bank',payment_status:'paid'});
    let [[bankOrder]]=await pool.execute('SELECT payment_method,payment_status,status FROM orders WHERE order_id=?',[bankId]);
    assert.equal(bankOrder.payment_method,'bank');assert.equal(bankOrder.payment_status,'unpaid');
    await assert.rejects(admin.change(bankId,'pending','confirmed'),{status:409});
    const payments=await Promise.all([admin.confirmBank(bankId),admin.confirmBank(bankId)]);
    assert.equal(payments.filter(Boolean).length,1);
    await pool.execute('UPDATE orders SET created_at=NOW()-INTERVAL 73 HOUR WHERE order_id=? AND user_id=?',[bankId,users[0]]);
    assert.equal(await admin.change(bankId,'pending','cancelled',true),false);
    await admin.change(bankId,'pending','confirmed');
    [[bankOrder]]=await pool.execute('SELECT payment_status,status FROM orders WHERE order_id=?',[bankId]);
    assert.equal(bankOrder.payment_status,'paid');assert.equal(bankOrder.status,'confirmed');
    pass('Ngân hàng: bank/unpaid, chặn giao trước nhận tiền, đối soát đồng thời một lần; paid không tự hủy sau 72h');

    if(!(await cart.getCart(users[1])).items.length)await add(users[1]);
    const pendingBank=await checkout.preview(users[1],undefined,undefined,tag+'-F','bank');
    const pendingBankId=await checkout.place(users[1],{...body(pendingBank),payment_method:'bank'});
    const beforeBankConfirmation=await state();
    const faultyBank=createAdminOrderRepository({execute:(...a)=>pool.execute(...a),async getConnection(){const c=await pool.getConnection();return {
      beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release(),
      async execute(sql,p){const result=await c.execute(sql,p);if(sql===ADMIN_ORDER_SQL.confirmBank)throw new Error('TEST_BANK_AFTER_UPDATE');return result;},
    };}});
    await assert.rejects(faultyBank.confirmBank(pendingBankId));assert.deepEqual(await state(),beforeBankConfirmation);
    pass('Ngân hàng: rollback lỗi sau cập nhật paid giữ nguyên đơn/kho/lượt');
    const usedBefore=(await repo.detail(coupons[1])).used_count;
    await pool.execute('UPDATE orders SET created_at=NOW()-INTERVAL 73 HOUR WHERE order_id=? AND user_id=?',[pendingBankId,users[1]]);
    assert.ok((await admin.expired(0)).includes(pendingBankId));
    const expiry=await Promise.all([admin.change(pendingBankId,'pending','cancelled',true),admin.change(pendingBankId,'pending','cancelled',true)]);
    assert.equal(expiry.filter(Boolean).length,1);assert.equal((await repo.detail(coupons[1])).used_count,usedBefore-1);
    await assert.rejects(admin.confirmBank(pendingBankId),{status:409});
    const afterBankExpiry=await state();
    for(const v of beforeBankConfirmation.variants){const restored=beforeBankConfirmation.items.filter(i=>i.order_id===pendingBankId&&i.variant_id===v.variant_id).reduce((n,i)=>n+i.quantity,0);assert.equal(afterBankExpiry.variants.find(x=>x.variant_id===v.variant_id).stock,v.stock+restored);}
    pass('Ngân hàng: pending/unpaid quá 72h hoàn kho/lượt đúng một lần; không đối soát đơn đã hủy');
    console.log('COUPON_BANK_MYSQL_RESULTS',passed,'PASS; service/repository thật + SELECT đối chiếu, không phải HTTP end-to-end.');
  } finally {
    const c=await pool.getConnection();
    try{
      await c.beginTransaction();
      for(const id of users){
        const [[u]]=await c.execute('SELECT full_name FROM users WHERE user_id=? FOR UPDATE',[id]);assert.equal(u.full_name,tag);
        await c.execute('DELETE oi FROM order_items oi JOIN orders o ON o.order_id=oi.order_id WHERE o.user_id=?',[id]);
        await c.execute('DELETE FROM orders WHERE user_id=?',[id]);await c.execute('DELETE FROM cart_items WHERE user_id=?',[id]);
        await c.execute('DELETE FROM user_addresses WHERE user_id=?',[id]);await c.execute('DELETE FROM users WHERE user_id=?',[id]);
      }
      if(productId){const [[p]]=await c.execute('SELECT product_name FROM products WHERE product_id=?',[productId]);assert.equal(p.product_name,tag);await c.execute('DELETE FROM products WHERE product_id=?',[productId]);}
      for(const id of coupons){const [[code]]=await c.execute('SELECT code FROM coupons WHERE coupon_id=?',[id]);assert.ok(code.code.startsWith(tag+'-'));await c.execute('DELETE FROM coupons WHERE coupon_id=?',[id]);}
      await c.commit();assert.deepEqual(await counts(),before);console.log('PASS cleanup: chỉ fixture của lần chạy; số dòng trở về ban đầu.');
    }catch(error){await c.rollback();throw error;}finally{c.release();await pool.end();}
  }
}
if(process.argv.includes('--run'))main().catch(error=>{console.error('COUPON_MYSQL_FAILED',error.code||error.name);console.error((error.stack||'').split('\n').filter(line=>line.includes('check-coupons.cjs')).join('\n'));process.exitCode=1;});

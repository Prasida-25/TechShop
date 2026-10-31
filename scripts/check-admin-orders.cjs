// Chỉ chạy --run với database test đã được openTestPool xác minh; không chạy server.js.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const argon2 = require('argon2');
const { openTestPool } = require('./test-db-config.cjs');
const { createAdminOrderRepository, ADMIN_ORDER_SQL: SQL } = require('../src/repositories/admin-order-repository');
const { createAdminOrderService } = require('../src/services/admin-order-service');
const { startOrderExpiry } = require('../src/services/order-expiry');
const { createCartRepository } = require('../src/repositories/cart-repository');
const { createCartService } = require('../src/services/cart-service');
const { createCheckoutRepository } = require('../src/repositories/checkout-repository');
const { createCheckoutService } = require('../src/services/checkout-service');
const { createReviewRepository, REVIEW_SQL } = require('../src/repositories/review-repository');
const { createReviewService } = require('../src/services/review-service');
const pause = ms => new Promise(r=>setTimeout(r,ms));
const body = (from,to) => ({expected_status:from,next_status:to,confirm:'1',payment_status:'paid',user_id:'999'});
function barrier(count) { let arrived=0,resolve;const gate=new Promise(r=>{resolve=r;});return async()=>{if(++arrived===count)resolve();await gate;}; }

async function main(){
  if(!process.argv.includes('--run'))throw new Error('RUN_FLAG_REQUIRED');
  const pool=await openTestPool(),repo=createAdminOrderRepository(pool),service=createAdminOrderService(repo);
  const hash=await argon2.hash('TestCustomer123',{type:argon2.argon2id});
  const evidence={runId:crypto.randomBytes(8).toString('hex'),results:[]};let current;
  const save=()=>fs.writeFileSync(path.join(__dirname,'..','.test-runtime','admin-orders-results.json'),JSON.stringify(evidence,null,2));
  const[tables]=await pool.query("SELECT TABLE_NAME name,ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  assert.equal(tables.length,12);assert.ok(tables.every(t=>t.engine==='InnoDB'));
  async function digest(){const out={};for(const{name}of tables){const[rows]=await pool.query('SELECT * FROM `'+name+'`');out[name]={count:rows.length,hash:crypto.createHash('sha256').update(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort())).digest('hex')};}return out;}
  evidence.before=await digest();
  async function fixture(){
    const f={user:null,address:null,category:null,product:null,variants:[],orders:[]};current.fixtures.push(f);save();
    const tag='ITO-'+crypto.randomBytes(8).toString('hex'),phone='09'+crypto.randomInt(10000000,99999999);
    const[u]=await pool.execute("INSERT INTO users(full_name,phone,password,role)VALUES(?,?,?,'user')",[tag,phone,hash]);f.user=Number(u.insertId);save();
    const[a]=await pool.execute('INSERT INTO user_addresses(user_id,receiver_name,phone,address_detail,ward,district,province,is_default)VALUES(?,?,?,?,?,?,?,1)',[f.user,'Người TEST',phone,'Đường TEST','Phường TEST','','Tỉnh TEST']);f.address=Number(a.insertId);save();
    const[c]=await pool.execute('INSERT INTO categories(category_name)VALUES(?)',[tag]);f.category=Number(c.insertId);save();
    const[p]=await pool.execute('INSERT INTO products(product_name,category_id)VALUES(?,?)',[tag,f.category]);f.product=Number(p.insertId);save();
    for(let i=0;i<2;i++){const[v]=await pool.execute('INSERT INTO product_variants(product_id,sku,variant_name,price,stock)VALUES(?,?,?,?,10)',[f.product,tag+'-'+i,'TEST '+i,'100000.01']);f.variants.push(Number(v.insertId));save();}
    return f;
  }
  async function place(f,both=false){
    const cart=createCartService(createCartRepository(pool)),checkout=createCheckoutService(createCheckoutRepository(pool));
    await cart.change(f.user,'add',{variant_id:String(f.variants[0]),quantity:'1'});
    if(both)await cart.change(f.user,'add',{variant_id:String(f.variants[1]),quantity:'1'});
    const review=await checkout.preview(f.user);
    const id=await checkout.place(f.user,{checkout_token:review.token,address_id:String(f.address),confirm:'1'});f.orders.push(id);save();return id;
  }
  async function snapshot(f){
    const[stocks]=await pool.execute('SELECT variant_id,stock FROM product_variants WHERE product_id=? ORDER BY variant_id',[f.product]);
    const[orders]=await pool.execute('SELECT order_id,status,total_amount,payment_method,payment_status FROM orders WHERE user_id=? ORDER BY order_id',[f.user]);
    const[items]=await pool.execute('SELECT oi.* FROM order_items oi JOIN orders o ON o.order_id=oi.order_id WHERE o.user_id=? ORDER BY oi.order_item_id',[f.user]);
    return{stocks,orders,items};
  }
  async function clean(){
    const c=await pool.getConnection();
    try{await c.beginTransaction();for(const f of current.fixtures){
      if(f.user){const[orders]=await c.execute('SELECT order_id FROM orders WHERE user_id=?',[f.user]);f.cleanedOrderIds=orders.map(o=>o.order_id);for(const o of orders){await c.execute('DELETE FROM order_items WHERE order_id=?',[o.order_id]);await c.execute('DELETE FROM orders WHERE order_id=? AND user_id=?',[o.order_id,f.user]);}
        await c.execute('DELETE FROM cart_items WHERE user_id=?',[f.user]);await c.execute('DELETE FROM user_addresses WHERE user_id=?',[f.user]);await c.execute('DELETE FROM users WHERE user_id=?',[f.user]);}
      if(f.product)await c.execute('DELETE FROM products WHERE product_id=? AND category_id=?',[f.product,f.category]);
      if(f.category)await c.execute('DELETE FROM categories WHERE category_id=?',[f.category]);
    }await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}
  }
  async function run(name,work){
    current={name,status:'RUNNING',fixtures:[],actual:{}};evidence.results.push(current);save();
    try{await work(current.actual);current.status='PASS';}
    catch(e){current.status='FAIL';current.code=e.code||e.name;if(e instanceof assert.AssertionError)current.assertion={actual:e.actual,expected:e.expected};throw e;}
    finally{try{for(const f of current.fixtures)if(f.product&&f.user)f.final=await snapshot(f);await clean();assert.deepEqual(await digest(),evidence.before);current.cleanup='PASS';}
      catch(e){current.cleanup='FAIL';throw e;}finally{save();console.log(current.status,current.name,'cleanup='+current.cleanup);}}
  }
  // Fault injection chỉ nằm tại adapter test, transaction và các câu ghi còn lại là MySQL thật.
  function instrument(hooks,out){
    out.connections=[];return{execute:(...a)=>pool.execute(...a),async getConnection(){
      const c=await pool.getConnection();const[[r]]=await c.query('SELECT CONNECTION_ID() id');out.connections.push(r.id);
      return{async beginTransaction(){if(hooks.begin)await hooks.begin();await c.beginTransaction();},async execute(sql,params){if(hooks.execute){const v=await hooks.execute(sql,params);if(v)return v;}return c.execute(sql,params);},async commit(){if(hooks.commit)await hooks.commit();return c.commit();},rollback:()=>c.rollback(),release:()=>c.release()};
    }};
  }
  function scopedExpiry(f,database=repo){
    const min=Math.min(...f.orders)-1,allowed=new Set(f.orders);
    return createAdminOrderService({...database,async expired(cursor){return(await repo.expired(Math.max(min,cursor))).filter(id=>allowed.has(id));},change:(id,...args)=>{assert.ok(allowed.has(id));return database.change(id,...args);}});
  }
  try{
    await run('sequential-status-and-historical-detail',async out=>{
      const f=await fixture(),id=await place(f);const original=await service.detail(String(id));
      assert.equal((await service.list({q:'#'+id})).orders[0].order_id,id);
      const before=await snapshot(f);await assert.rejects(service.change(String(id),body('pending','shipping')),{status:409});assert.deepEqual(await snapshot(f),before);
      for(const[from,to]of[['pending','confirmed'],['confirmed','shipping'],['shipping','delivered']])await service.change(String(id),body(from,to));
      const after=await service.detail(String(id));assert.equal(after.status,'delivered');assert.equal(after.payment_status,'unpaid');assert.equal(after.total_amount,original.total_amount);assert.deepEqual(after.items,original.items);assert.equal(after.address_detail,original.address_detail);
      await assert.rejects(service.change(String(id),body('delivered','cancelled'),true),{status:409});out.before=before;out.after=await snapshot(f);
    });
    await run('two-admin-cancellations-real-connections-restore-once',async out=>{
      const f=await fixture(),id=await place(f),begin=barrier(2);
      const concurrent=createAdminOrderService(createAdminOrderRepository(instrument({begin},out)));
      const results=await Promise.allSettled([concurrent.change(String(id),body('pending','cancelled'),true),concurrent.change(String(id),body('pending','cancelled'),true)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);assert.equal(new Set(out.connections).size,2);
      const after=await snapshot(f);assert.equal(after.orders[0].status,'cancelled');assert.equal(after.stocks[0].stock,10);
      await assert.rejects(service.change(String(id),body('pending','cancelled'),true),{status:409});assert.deepEqual(await snapshot(f),after);out.after=after;
    });
    await run('admin-cancel-vs-expiry-restore-once',async out=>{
      const f=await fixture(),id=await place(f);await pool.execute('UPDATE orders SET created_at=CURRENT_TIMESTAMP-INTERVAL 73 HOUR WHERE order_id=?',[id]);
      await assert.rejects(service.change(String(id),body('pending','confirmed')),{status:409});
      const begin=barrier(2),concurrentRepo=createAdminOrderRepository(instrument({begin},out));
      const expiry=scopedExpiry(f,concurrentRepo),manual=createAdminOrderService(concurrentRepo);
      const result=await Promise.allSettled([manual.change(String(id),body('pending','cancelled'),true),expiry.expireBatch()]);
      assert.ok(result.some(r=>r.status==='fulfilled'));const after=await snapshot(f);assert.equal(after.orders[0].status,'cancelled');assert.equal(after.stocks[0].stock,10);assert.equal(new Set(out.connections).size,2);out.after=after;
    });
    await run('72-hour-boundary-and-payment-status-exclusions',async out=>{
      const f=await fixture(),ids=[];for(let i=0;i<6;i++)ids.push(await place(f));
      await service.change(String(ids[3]),body('pending','confirmed'));
      for(const id of ids)await pool.execute('UPDATE orders SET created_at=CURRENT_TIMESTAMP-INTERVAL 73 HOUR WHERE order_id=?',[id]);
      await pool.execute('UPDATE orders SET created_at=CURRENT_TIMESTAMP-INTERVAL 72 HOUR WHERE order_id=?',[ids[1]]);
      await pool.execute('UPDATE orders SET created_at=CURRENT_TIMESTAMP-INTERVAL 71 HOUR WHERE order_id=?',[ids[2]]);
      await pool.execute("UPDATE orders SET payment_status='paid' WHERE order_id=?",[ids[4]]);
      await pool.execute("UPDATE orders SET payment_method='bank' WHERE order_id=?",[ids[5]]);
      const result=await scopedExpiry(f).expireBatch();assert.equal(result.cancelled,2);
      const after=await snapshot(f);assert.deepEqual(after.orders.map(o=>o.status),['cancelled','cancelled','pending','confirmed','pending','pending']);assert.equal(after.stocks[0].stock,6);out.result=result;out.after=after;
    });
    for(const failure of['second-restore','status'])await run('real-rollback-'+failure,async out=>{
      const f=await fixture(),id=await place(f,true),before=await snapshot(f);let restore=0;
      const db=instrument({execute:async sql=>{if(sql===SQL.restore&&++restore===2&&failure==='second-restore')return[{affectedRows:0}];if(sql===SQL.status&&failure==='status')throw new Error('TEST_STATUS_FAULT');}},out);
      const broken=createAdminOrderService(createAdminOrderRepository(db));await assert.rejects(broken.change(String(id),body('pending','cancelled'),true));assert.deepEqual(await snapshot(f),before);out.before=before;out.after=await snapshot(f);
    });
    await run('missing-variant-and-stock-overflow-remain-pending',async out=>{
      const f=await fixture(),id=await place(f);
      await pool.execute('UPDATE product_variants SET stock=2147483647 WHERE variant_id=?',[f.variants[0]]);
      let before=await snapshot(f);await assert.rejects(service.change(String(id),body('pending','cancelled'),true),{status:409});assert.deepEqual(await snapshot(f),before);
      await pool.execute('UPDATE order_items SET variant_id=NULL WHERE order_id=?',[id]);await pool.execute('UPDATE orders SET created_at=CURRENT_TIMESTAMP-INTERVAL 73 HOUR WHERE order_id=?',[id]);
      before=await snapshot(f);const result=await scopedExpiry(f).expireBatch();assert.equal(result.failed,1);assert.equal(result.cancelled,0);assert.deepEqual(await snapshot(f),before);out.result=result;out.after=before;
    });
    await run('confirm-vs-cancel-real-row-lock',async out=>{
      const f=await fixture(),id=await place(f),begin=barrier(2),parallel=createAdminOrderService(createAdminOrderRepository(instrument({begin},out)));
      const result=await Promise.allSettled([parallel.change(String(id),body('pending','confirmed')),parallel.change(String(id),body('pending','cancelled'),true)]);
      assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.status,409);
      const after=await snapshot(f),state=after.orders[0].status;assert.ok(['confirmed','cancelled'].includes(state));assert.equal(after.stocks[0].stock,state==='confirmed'?9:10);out.after=after;
    });
    await run('actual-worker-rescan-cancels-newly-expired-fixture',async out=>{
      const f=await fixture(),id=await place(f),expiry=scopedExpiry(f),logs=[];let scans=0;
      const worker=startOrderExpiry({async expireBatch(){scans++;return expiry.expireBatch();}},{intervalMs:30,log:{info:m=>logs.push(m),error:m=>logs.push(m)}});
      try{
        for(let i=0;i<50&&scans<1;i++)await pause(10);
        await pause(20);await pool.execute('UPDATE orders SET created_at=CURRENT_TIMESTAMP-INTERVAL 73 HOUR WHERE order_id=?',[id]);
        let cancelled=false;for(let i=0;i<100;i++){const after=await snapshot(f);if(after.orders[0].status==='cancelled'){cancelled=true;break;}await pause(10);}
        assert.equal(cancelled,true);assert.ok(scans>=2);
      }finally{await worker.stop();}
      out.scans=scans;out.logs=logs;out.after=await snapshot(f);assert.equal(out.after.stocks[0].stock,10);
    });
    await run('cod-receipt-after-delivery-and-repeated-concurrent-requests',async out=>{
      const f=await fixture(),id=await place(f);
      for(const[from,to]of[['pending','confirmed'],['confirmed','shipping'],['shipping','delivered']])await service.change(String(id),body(from,to));
      const before=await snapshot(f);out.before=before;
      assert.equal((await service.detail(String(id))).canConfirmCod,true);
      assert.deepEqual(await snapshot(f),before); // GET/detail chỉ đọc.
      const begin=barrier(2),parallel=createAdminOrderService(createAdminOrderRepository(instrument({begin},out)));
      const results=await Promise.all([parallel.confirmCod(String(id),{confirm:'1',total_amount:'1',payment_status:'refund'}),parallel.confirmCod(String(id),{confirm:'1'})]);
      assert.deepEqual(results.sort(),[false,true]);assert.equal(new Set(out.connections).size,2);
      assert.equal(await service.confirmCod(String(id),{confirm:'1'}),false);
      const after=await snapshot(f);
      assert.deepEqual(after,{...before,orders:before.orders.map(o=>({...o,payment_status:'paid'}))});
      assert.equal((await service.detail(String(id))).canConfirmCod,false);out.after=after;out.results=results;
    });
    await run('cod-receipt-rejects-ineligible-orders-without-changing-data',async out=>{
      const f=await fixture(),id=await place(f);
      for(const status of['pending','confirmed','shipping','cancelled']){
        await pool.execute('UPDATE orders SET status=? WHERE order_id=?',[status,id]);
        const before=await snapshot(f);await assert.rejects(service.confirmCod(String(id),{confirm:'1'}),{status:409});assert.deepEqual(await snapshot(f),before);
      }
      await pool.execute("UPDATE orders SET status='delivered',payment_method='bank' WHERE order_id=?",[id]);
      let before=await snapshot(f);await assert.rejects(service.confirmCod(String(id),{confirm:'1'}),{status:409});assert.deepEqual(await snapshot(f),before);
      await pool.execute("UPDATE orders SET payment_method='cod',payment_status='refund' WHERE order_id=?",[id]);
      before=await snapshot(f);await assert.rejects(service.confirmCod(String(id),{confirm:'1'}),{status:409});assert.deepEqual(await snapshot(f),before);out.after=before;
    });
    await run('cod-receipt-real-rollback-before-commit',async out=>{
      const f=await fixture(),id=await place(f);
      for(const[from,to]of[['pending','confirmed'],['confirmed','shipping'],['shipping','delivered']])await service.change(String(id),body(from,to));
      const before=await snapshot(f);let updated=false;
      const db=instrument({execute:async sql=>{if(sql===SQL.confirmCod)updated=true;},commit:async()=>{throw new Error('TEST_BEFORE_COMMIT');}},out);
      const broken=createAdminOrderService(createAdminOrderRepository(db));
      await assert.rejects(broken.confirmCod(String(id),{confirm:'1'}));assert.equal(updated,true);
      assert.deepEqual(await snapshot(f),before);out.before=before;out.after=await snapshot(f);
    });
    const reviews=createReviewService(createReviewRepository(pool));
    async function deliver(id){for(const[from,to]of[['pending','confirmed'],['confirmed','shipping'],['shipping','delivered']])await service.change(String(id),body(from,to));}
    async function firstItem(id){const[[row]]=await pool.execute('SELECT order_item_id FROM order_items WHERE order_id=? ORDER BY order_item_id LIMIT 1',[id]);return String(row.order_item_id);}
    async function reviewRows(f){const[rows]=await pool.execute('SELECT review_id,user_id,product_id,order_item_id,rating,comment FROM reviews WHERE user_id=? ORDER BY review_id',[f.user]);return rows;}
    await run('reviews-real-insert-derived-product-and-user-without-changing-order-stock',async out=>{
      const f=await fixture(),id=await place(f);await deliver(id);const item=await firstItem(id),before=await snapshot(f);
      assert.equal((await reviews.form(f.user,String(id),item)).review,null);
      await reviews.create(f.user,String(id),item,{rating:'5',comment:'TEST <script>chỉ là nội dung</script>',product_id:'999999',user_id:'999999',role:'admin'});
      const rows=await reviewRows(f);assert.equal(rows.length,1);assert.equal(rows[0].user_id,f.user);assert.equal(rows[0].product_id,f.product);assert.equal(rows[0].order_item_id,Number(item));assert.equal(rows[0].rating,5);
      assert.deepEqual(await snapshot(f),before);assert.equal((await reviews.form(f.user,String(id),item)).review.rating,5);
      const page=await reviews.list(String(f.product),{});assert.equal(page.total,1);assert.equal(page.reviews[0].comment,rows[0].comment);
      await assert.rejects(reviews.create(f.user,String(id),item,{rating:'1'}),{status:409});out.rows=rows;out.orderStockPreserved=true;
    });
    await run('reviews-real-ownership-status-item-and-deleted-product-validation',async out=>{
      const a=await fixture(),b=await fixture(),id=await place(a),other=await place(b),item=await firstItem(id),otherItem=await firstItem(other);
      const beforeA=await snapshot(a),beforeB=await snapshot(b);
      await assert.rejects(reviews.create(a.user,String(id),item,{rating:'5'}),{status:409});
      await deliver(id);await deliver(other);
      await assert.rejects(reviews.create(a.user,String(other),otherItem,{rating:'5',user_id:String(b.user)}),{status:404});
      await assert.rejects(reviews.create(a.user,String(id),otherItem,{rating:'5'}),{status:404});
      for(const rating of['0','6','1.5'])await assert.rejects(reviews.create(a.user,String(id),item,{rating}),{status:422});
      await pool.execute('UPDATE order_items SET product_id=NULL WHERE order_item_id=?',[item]);
      await assert.rejects(reviews.create(a.user,String(id),item,{rating:'5'}),{status:404});
      assert.equal((await reviewRows(a)).length,0);assert.equal((await reviewRows(b)).length,0);
      assert.deepEqual((await snapshot(a)).stocks,beforeA.stocks);assert.deepEqual((await snapshot(b)).stocks,beforeB.stocks);out.reviewsCreated=0;
    });
    await run('reviews-real-two-connections-different-orders-same-user-product',async out=>{
      const f=await fixture(),a=await place(f),b=await place(f);await deliver(a);await deliver(b);
      const ai=await firstItem(a),bi=await firstItem(b),before=await snapshot(f),begin=barrier(2);
      const parallel=createReviewService(createReviewRepository(instrument({begin},out)));
      const result=await Promise.allSettled([parallel.create(f.user,String(a),ai,{rating:'5'}),parallel.create(f.user,String(b),bi,{rating:'4'})]);
      assert.equal(new Set(out.connections).size,2);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.status,409);
      assert.equal((await reviewRows(f)).length,1);assert.deepEqual(await snapshot(f),before);out.rows=await reviewRows(f);
      // Kiểm chứng UNIQUE bằng DML trực tiếp chỉ trên fixture test, không dựa riêng vào kiểm tra service.
      const row=out.rows[0],unused=row.order_item_id===Number(ai)?bi:ai;
      await assert.rejects(pool.execute(REVIEW_SQL.insert,[f.user,f.product,Number(unused),3,null]),{code:'ER_DUP_ENTRY'});
      assert.equal((await reviewRows(f)).length,1);out.uniqueConstraint='PASS';
    });
    await run('reviews-real-insert-rollback-before-commit',async out=>{
      const f=await fixture(),id=await place(f);await deliver(id);const item=await firstItem(id),before=await snapshot(f);let inserted=false;
      const db=instrument({execute:async sql=>{if(sql===REVIEW_SQL.insert)inserted=true;},commit:async()=>{throw new Error('TEST_REVIEW_BEFORE_COMMIT');}},out);
      const broken=createReviewService(createReviewRepository(db));await assert.rejects(broken.create(f.user,String(id),item,{rating:'5',comment:'TEST rollback'}));
      assert.equal(inserted,true);assert.equal((await reviewRows(f)).length,0);assert.deepEqual(await snapshot(f),before);out.rowsAfterRollback=0;
    });
    evidence.after=await digest();assert.deepEqual(evidence.after,evidence.before);evidence.cleanup='PASS';
  }finally{save();await pool.end();}
  console.log('ADMIN_ORDERS_MYSQL',evidence.results.length+'/'+evidence.results.length);
}
if(process.argv.includes('--run'))main().catch(e=>{console.error('Admin order integration stopped:',e.code||e.name);process.exitCode=1;});

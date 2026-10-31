// Opt-in: tất cả câu ghi chỉ dùng pool test có quyền giới hạn, không pool ứng dụng.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { fork } = require('node:child_process');
const argon2 = require('argon2');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { openTestPool, assertIsolatedInstance } = require('./test-db-config.cjs');
const { createCartRepository, CART_SQL } = require('../src/repositories/cart-repository');
const { createCartService } = require('../src/services/cart-service');
const { createCheckoutRepository, CHECKOUT_SQL } = require('../src/repositories/checkout-repository');
const { createCheckoutService } = require('../src/services/checkout-service');
const { createOrderRepository } = require('../src/repositories/order-repository');
const { createOrderService } = require('../src/services/order-service');
const { createUserRepository } = require('../src/repositories/user-repository');
const { createAddressRepository } = require('../src/repositories/address-repository');
const { createCatalogRepository } = require('../src/repositories/catalog-repository');
const { createApp } = require('../src/app');
const password = 'OnlyTestPassword123'; // Chỉ fixture nhân tạo trong database test.

function testApp(pool, checkoutDatabase = pool) {
  return createApp({ userRepository: createUserRepository(pool), addressRepository: createAddressRepository(pool),
    cartRepository: createCartRepository(pool), checkoutRepository: createCheckoutRepository(checkoutDatabase),
    orderRepository: createOrderRepository(pool), catalogRepository: createCatalogRepository(pool),
    limitOptions: { ipMax: 1000, pairMax: 1000, registerMax: 1000 } });
}
function gate() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function bounded(promise, ms, name) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(name)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function startChild() {
  const child = fork(__filename, ['--http-child'], { cwd: path.join(__dirname, '..'), silent: true, windowsHide: true });
  child.stdout.resume(); child.stderr.resume();
  try {
    const [ready] = await bounded(Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error('CHILD_EARLY_EXIT'); })]), 15000, 'CHILD_TIMEOUT');
    assert.equal(ready.ready, true);
    return { base: ready.base, async close() { const exited = once(child, 'exit'); child.send('stop'); await bounded(exited, 10000, 'CHILD_STOP_TIMEOUT'); } };
  } catch (error) { child.kill(); throw error; }
}
async function childMain() {
  const pool = await openTestPool();
  const server = testApp(pool).listen(0, '127.0.0.1'); await once(server, 'listening');
  process.send({ ready: true, base: 'http://127.0.0.1:' + server.address().port });
  process.once('message', async message => {
    if (message !== 'stop') return;
    server.closeAllConnections(); await new Promise(r => server.close(r)); await pool.end(); process.disconnect();
  });
}

async function main() {
  if (!process.argv.includes('--run')) throw new Error('RUN_FLAG_REQUIRED');
  const pool = await openTestPool();
  const results = [];
  const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex');
  const evidenceFile = path.join(__dirname, '..', '.test-runtime', 'integration-results.json');
  const evidence = { runId, started: new Date().toISOString(), results };
  let current;
  const save = () => {
    const json = JSON.stringify(evidence, (key, value) =>
      ['phone', 'password', 'cookie', 'token'].includes(key) ? undefined : value, 2);
    fs.writeFileSync(evidenceFile, json);
    fs.writeFileSync(path.join(path.dirname(evidenceFile), 'integration-' + runId + '.json'), json);
  };
  const [tables] = await pool.query("SELECT TABLE_NAME name,ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  async function digest() {
    const out = {};
    for (const { name } of tables) {
      const [rows] = await pool.query('SELECT * FROM `' + name + '`');
      out[name] = { count: rows.length, hash: crypto.createHash('sha256').update(JSON.stringify(rows.map(r => JSON.stringify(r)).sort())).digest('hex') };
    }
    return out;
  }
  evidence.before = await digest();
  const [[metadata]] = await pool.query('SELECT DATABASE() db, @@version version, @@transaction_isolation isolation');
  evidence.environment = { ...metadata, engines: tables, restrictedGrantsValidated: true };
  async function cleanup(record) {
    const c = await pool.getConnection();
    const remove = async (table, column, ids) => {
      if (!ids.length) return;
      const clause = '`' + column + '` IN (' + ids.map(() => '?').join(',') + ')';
      await c.execute('DELETE FROM `' + table + '` WHERE ' + clause, ids);
      const [[row]] = await c.execute('SELECT COUNT(*) n FROM `' + table + '` WHERE ' + clause, ids);
      assert.equal(Number(row.n), 0, 'Cleanup must remove tracked rows');
    };
    try {
      await c.beginTransaction();
      for (const f of record.fixtures) {
        const ids = f.users.map(u => u.id);
        const marks = ids.map(() => '?').join(',');
        const [placed] = ids.length ? await c.execute('SELECT order_id FROM orders WHERE user_id IN (' + marks + ')', ids) : [[]];
        f.cleanedOrderIds = placed.map(o => o.order_id);
        const [addresses] = ids.length ? await c.execute('SELECT address_id FROM user_addresses WHERE user_id IN (' + marks + ')', ids) : [[]];
        const [cartRows] = ids.length ? await c.execute('SELECT cart_item_id FROM cart_items WHERE user_id IN (' + marks + ')', ids) : [[]];
        f.cleanedAddressIds = addresses.map(a => a.address_id);
        f.cleanedCartItemIds = cartRows.map(i => i.cart_item_id);
        await remove('order_items', 'order_id', f.cleanedOrderIds);
        await remove('orders', 'order_id', f.cleanedOrderIds);
        await remove('cart_items', 'user_id', ids);
        await remove('user_addresses', 'user_id', ids);
        await remove('product_options', 'option_id', f.optionIds || []);
        await remove('product_variants', 'variant_id', f.variants);
        await remove('products', 'product_id', f.product ? [f.product] : []);
        await remove('categories', 'category_id', f.category ? [f.category] : []);
        await remove('users', 'user_id', ids);
      }
      await c.commit();
    } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
  }
  const cart = createCartService(createCartRepository(pool));
  const orders = createOrderService(createOrderRepository(pool));
  const checkout = createCheckoutService(createCheckoutRepository(pool));
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  async function fixture() {
    const users = [], addresses = [];
    const f = { users, addresses, variants: [], category: null, product: null };
    current.fixtures.push(f); save();
    for (let i=0;i<2;i++) {
      const phone = '09' + crypto.randomInt(10000000,99999999);
      const [u] = await pool.execute("INSERT INTO users (full_name,phone,password,role) VALUES (?,?,?,'user')", ['Khách TEST '+i,phone,hash]);
      users.push({ id:u.insertId,phone });
      save();
      const [a] = await pool.execute('INSERT INTO user_addresses (user_id,receiver_name,phone,address_detail,ward,district,province,is_default) VALUES (?,?,?,?,?,?,?,1)', [u.insertId,'Người nhận TEST',phone,'Đường TEST','Phường TEST','','Tỉnh TEST']);
      addresses.push(a.insertId);
      save();
    }
    const tag=crypto.randomBytes(6).toString('hex');
    const [cat]=await pool.execute('INSERT INTO categories (category_name) VALUES (?)',['TEST-'+tag]);
    f.category = cat.insertId; save();
    const [p]=await pool.execute('INSERT INTO products (category_id,product_name,brand,description) VALUES (?,?,?,?)',[cat.insertId,'Sản phẩm TEST '+tag,'TechZone TEST','Dữ liệu nhân tạo, không phải sản phẩm thật.']);
    f.product = p.insertId; save();
    const variants=f.variants;
    for(let i=0;i<2;i++){const [v]=await pool.execute('INSERT INTO product_variants (product_id,sku,variant_name,price,stock) VALUES (?,?,?,?,?)',[p.insertId,'TEST-'+tag+'-'+i,'Phiên bản TEST '+i,i?'200000.00':'100000.01',5]);variants.push(v.insertId);}
    f.initial = await snapshot(f); save(); return f;
  }
  const add=(f,who=0,variant=0,quantity='1')=>cart.change(f.users[who].id,'add',{variant_id:String(f.variants[variant]),quantity});
  const confirm=(review)=>({checkout_token:review.token,address_id:String(review.address.address_id),confirm:'1',total_amount:'0',user_id:'999',payment_status:'paid'});
  async function run(name, fn) {
    current = { name, status: 'RUNNING', fixtures: [], observations: {}, cleanup: 'NOT_STARTED' };
    results.push(current); save();
    try { await fn(current.observations); current.status = 'PASS'; current.pass = true; }
    catch (e) {
      current.status = 'FAIL'; current.pass = false; current.code = e.code || e.name;
      if (e instanceof assert.AssertionError) current.assertion = { actual: e.actual, expected: e.expected, operator: e.operator };
      process.exitCode = 1; throw e; // Stop on first failure, particularly ownership failures.
    } finally {
      try {
        for (const f of current.fixtures) if (f.product && f.users.length === 2) f.final = await snapshot(f);
        await cleanup(current); current.cleanup = 'PASS';
        assert.deepEqual(await digest(), evidence.before, 'Old test data must remain unchanged');
        current.oldDataUnchanged = true;
      } catch (error) { current.cleanup = 'FAIL'; save(); throw error; }
      finally { save(); console.log(current.status, name, 'cleanup=' + current.cleanup); }
    }
  }
  async function snapshot(f) {
    const [stock]=await pool.execute('SELECT variant_id,stock FROM product_variants WHERE product_id=? ORDER BY variant_id',[f.product]);
    const [items]=await pool.execute('SELECT cart_item_id,user_id,variant_id,quantity FROM cart_items WHERE user_id IN (?,?) ORDER BY user_id,variant_id',f.users.map(u=>u.id));
    const [[n]]=await pool.execute('SELECT COUNT(*) n FROM orders WHERE user_id IN (?,?)',f.users.map(u=>u.id));
    const [orderRows] = await pool.execute('SELECT order_id,user_id,total_amount,status,payment_method,payment_status FROM orders WHERE user_id IN (?,?) ORDER BY order_id', f.users.map(u => u.id));
    const [orderItems] = await pool.execute('SELECT oi.* FROM order_items oi JOIN orders o ON o.order_id=oi.order_id WHERE o.user_id IN (?,?) ORDER BY oi.order_item_id', f.users.map(u => u.id));
    return {stock,items,orders:Number(n.n),orderRows,orderItems};
  }
  function instrument(hooks, observations) {
    observations.transactions = [];
    return { execute: (...args) => pool.execute(...args), async getConnection() {
      const c = await pool.getConnection(); const [[row]] = await c.query('SELECT CONNECTION_ID() id');
      const trace = { connectionId: row.id, steps: [] }; observations.transactions.push(trace);
      return {
        async beginTransaction() { if (hooks.beforeBegin) await hooks.beforeBegin(trace); await c.beginTransaction(); trace.steps.push('begin'); },
        async execute(sql, params) {
          const step = Object.entries(CHECKOUT_SQL).find(([, value]) => value === sql)?.[0] || (sql === CART_SQL.clear ? 'clear' : 'lockUser');
          if (hooks.execute) await hooks.execute(sql, params, trace);
          try { const result = await c.execute(sql, params); trace.steps.push(step); return result; }
          catch (error) { trace.error = error.code || error.name; throw error; }
        },
        async commit() { await c.commit(); trace.steps.push('commit'); if (hooks.afterCommit) await hooks.afterCommit(trace); },
        async rollback() { await c.rollback(); trace.steps.push('rollback'); },
        release() { c.release(); trace.steps.push('release'); },
      };
    } };
  }
  async function extraServer(db) {
    const s = testApp(pool, db).listen(0, '127.0.0.1'); await once(s, 'listening');
    return { base: 'http://127.0.0.1:' + s.address().port, async close() { s.closeAllConnections(); await new Promise(r => s.close(r)); } };
  }
  let server;
  try {
    await run('isolation-and-InnoDB',async()=>{
      const [engines]=await pool.query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'");
      assert.equal(engines.length,14);assert.ok(engines.every(e=>e.ENGINE==='InnoDB'));
      const [a,b]=await Promise.all([pool.getConnection(),pool.getConnection()]);
      try{const [[x]]=await a.query('SELECT CONNECTION_ID() id');const [[y]]=await b.query('SELECT CONNECTION_ID() id');assert.notEqual(x.id,y.id);}finally{a.release();b.release();}
    });
    await run('cart-CRUD-and-owner',async()=>{
      const f=await fixture();await add(f);await add(f);await add(f,0,1);
      let data=await cart.getCart(f.users[0].id);assert.equal(data.items.length,2);assert.equal(data.quantity,3);assert.equal(data.totalLabel,'400.000,02 ₫');
      const id=String(data.items[0].cart_item_id);
      await assert.rejects(cart.change(f.users[0].id,'update',{quantity:'6'},id));
      await assert.rejects(cart.change(f.users[1].id,'remove',{},id),{status:404});
      await cart.change(f.users[0].id,'update',{quantity:'1'},id);
      await cart.change(f.users[0].id,'remove',{},id);await cart.change(f.users[0].id,'clear',{});
      assert.equal((await cart.getCart(f.users[0].id)).items.length,0);
    });
    await run('cart-concurrent-add-unique',async()=>{
      const f=await fixture();await Promise.all(Array.from({length:5},()=>add(f)));
      const view=await cart.getCart(f.users[0].id);assert.equal(view.items.length,1);assert.equal(view.quantity,5);
    });
    await run('shipping-price-and-snapshot',async()=>{
      for(const [price,total] of [['299999.99','329999.99'],['300000.00','300000.00']]){
        const f=await fixture();await pool.execute('UPDATE product_variants SET price=? WHERE variant_id=?',[price,f.variants[0]]);await add(f);
        const review=await checkout.preview(f.users[0].id);const id=await checkout.place(f.users[0].id,confirm(review));
        const [rows]=await pool.execute('SELECT total_amount,status,payment_method,payment_status FROM orders WHERE order_id=?',[id]);
        assert.equal(rows[0].total_amount,total);assert.equal(rows[0].status,'pending');assert.equal(rows[0].payment_method,'cod');assert.equal(rows[0].payment_status,'unpaid');
        await pool.execute('UPDATE products SET product_name=? WHERE product_id=?',['Tên TEST mới',f.product]);
        await pool.execute('UPDATE product_variants SET price=1 WHERE variant_id=?',[f.variants[0]]);
        await pool.execute('UPDATE user_addresses SET address_detail=? WHERE address_id=?',['Địa chỉ TEST mới',f.addresses[0]]);
        const history=await orders.detail(f.users[0].id,String(id));assert.equal(history.items[0].unit_price,price);assert.equal(history.address_detail,'Đường TEST');assert.notEqual(history.items[0].product_name,'Tên TEST mới');
        await assert.rejects(orders.detail(f.users[1].id,String(id)),{status:404});
      }
    });
    await run('price-change-foreign-address-and-empty',async()=>{
      const f=await fixture();await assert.rejects(checkout.preview(f.users[0].id));await add(f);
      await assert.rejects(checkout.preview(f.users[0].id,String(f.addresses[1])),{status:409});
      const r=await checkout.preview(f.users[0].id);const before=await snapshot(f);
      await pool.execute('UPDATE product_variants SET price=150000 WHERE variant_id=?',[f.variants[0]]);
      await assert.rejects(checkout.place(f.users[0].id,confirm(r)),{status:409});assert.deepEqual(await snapshot(f),before);
      const next=await checkout.preview(f.users[0].id);assert.equal(next.total,'180000.00');await checkout.place(f.users[0].id,confirm(next));
    });
    for(const failure of ['stock-second','order','item-second','clear','before-commit']) await run('real-rollback-'+failure,async(o)=>{
      const f=await fixture();await add(f);await add(f,0,1);const before=await snapshot(f);let stock=0,item=0;
      const injected={execute:(...a)=>pool.execute(...a),async getConnection(){const c=await pool.getConnection();return {
        beginTransaction:()=>c.beginTransaction(),commit:()=>{if(failure==='before-commit')throw new Error('TEST_BEFORE_COMMIT_FAULT');return c.commit();},rollback:()=>c.rollback(),release:()=>c.release(),
        async execute(sql,params){
          if(sql===CHECKOUT_SQL.stock&&++stock===2&&failure==='stock-second')return [{affectedRows:0}];
          if(sql===CHECKOUT_SQL.order&&failure==='order'){params=[...params];params[2]=null;}
          if(sql===CHECKOUT_SQL.item&&++item===2&&failure==='item-second'){params=[...params];params[6]=0;}
          if(sql==='DELETE FROM cart_items WHERE user_id = ?'&&failure==='clear')throw new Error('TEST_CLEAR_FAULT');
          return c.execute(sql,params);
        }
      };}};
      const service=createCheckoutService(createCheckoutRepository(injected));const r=await service.preview(f.users[0].id);
      await assert.rejects(service.place(f.users[0].id,confirm(r)),e=>{o.error=e.code||e.name;return true;});
      o.before=before;o.after=await snapshot(f);assert.deepEqual(o.after,before);
      if(failure==='order')assert.equal(o.error,'ER_BAD_NULL_ERROR');
      if(failure==='item-second')assert.equal(o.error,'ER_CHECK_CONSTRAINT_VIOLATED');
      const [[count]]=await pool.execute('SELECT COUNT(*) n FROM order_items oi JOIN orders o ON o.order_id=oi.order_id WHERE o.user_id=?',[f.users[0].id]);assert.equal(Number(count.n),0);
    });
    await run('real-InnoDB-last-stock-race-5-rounds',async()=>{
      for(let round=0;round<5;round++){
        const f=await fixture();await pool.execute('UPDATE product_variants SET stock=1 WHERE variant_id=?',[f.variants[0]]);await add(f);await add(f,1);
        const a=await checkout.preview(f.users[0].id),b=await checkout.preview(f.users[1].id);
        const results=await Promise.allSettled([checkout.place(f.users[0].id,confirm(a)),checkout.place(f.users[1].id,confirm(b))]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
        const s=await snapshot(f);assert.equal(s.orders,1);assert.equal(s.stock[0].stock,0);assert.equal(s.items.length,1);
      }
    });
    await run('duplicate-tokens-same-cart',async()=>{
      const f=await fixture();await add(f);const a=await checkout.preview(f.users[0].id),b=await checkout.preview(f.users[0].id);
      const result=await Promise.allSettled([checkout.place(f.users[0].id,confirm(a)),checkout.place(f.users[0].id,confirm(b))]);
      assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal((await snapshot(f)).orders,1);
    });
    const app=testApp(pool);
    server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
    function browser(baseUrl=base){return {cookie:'',token:'',async get(route){return this.request(route);},async post(route,data,csrf=true,options={}){return this.request(route,{...options,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...data,...(csrf?{_csrf:this.token}:{})})});},async request(route,options={}){const r=await fetch(baseUrl+route,{...options,signal:options.signal||AbortSignal.timeout(15000),redirect:'manual',headers:{...options.headers,...(this.cookie?{Cookie:this.cookie}:{})}});const cookie=r.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];const html=await r.text();const token=html.match(/name="_csrf" value="([a-f0-9]+)"/);if(token)this.token=token[1];return {status:r.status,html,location:r.headers.get('location')};}};}
    async function login(user, baseUrl=base) {
      const client=browser(baseUrl); await client.get('/login');
      assert.equal((await client.post('/login',{phone:user.phone,password})).status,303);
      // Login regenerates session/CSRF; fetch a new form before the first mutation.
      assert.equal((await client.get('/cart')).status,200); return client;
    }
    function bodyFrom(page,addressId) {
      const token=page.html.match(/name="checkout_token" value="([a-f0-9]+)"/);
      assert.ok(token,'Checkout token required'); return {checkout_token:token[1],address_id:String(addressId),confirm:'1'};
    }
    await run('real-HTTP-account-catalog-and-purchase',async()=>{
      const guest=browser();for(const url of ['/cart','/checkout','/orders'])assert.equal((await guest.get(url)).status,303);
      assert.equal((await guest.get('/')).status,200);assert.equal((await guest.get('/products')).status,200);
      const f=await fixture(),a=browser(),b=browser();
      for(const [i,client]of [[0,a],[1,b]]){await client.get('/login');assert.equal((await client.post('/login',{phone:f.users[i].phone,password})).status,303);}
      await a.get('/cart');assert.equal((await a.post('/cart/items',{variant_id:String(f.variants[0]),quantity:'1'},false)).status,403);
      assert.equal((await a.post('/cart/items',{variant_id:String(f.variants[0]),quantity:'1',user_id:String(f.users[1].id),price:'0'})).status,303);
      const page=await a.get('/checkout');assert.equal(page.status,200);const token=page.html.match(/name="checkout_token" value="([a-f0-9]+)"/)[1];
      const body={checkout_token:token,address_id:String(f.addresses[0]),confirm:'1'};
      const rs=await Promise.all(Array.from({length:12},()=>a.post('/checkout',body)));assert.ok(rs.every(r=>[303,409].includes(r.status)));
      const s=await snapshot(f);assert.equal(s.orders,1);assert.equal(s.stock[0].stock,4);
      const [[o]]=await pool.execute('SELECT order_id FROM orders WHERE user_id=?',[f.users[0].id]);
      assert.equal((await a.get('/orders/'+o.order_id)).status,200);assert.equal((await b.get('/orders/'+o.order_id)).status,404);
      assert.equal((await a.get('/orders')).status,200);assert.equal((await a.post('/logout',{})).status,303);assert.equal((await a.get('/orders')).status,303);
    });
    await run('real-HTTP-profile-address-password',async()=>{
      const f=await fixture(),a=browser(),phone=f.users[0].phone;
      await a.get('/login');assert.equal((await a.post('/login',{phone,password})).status,303);await a.get('/account');
      assert.equal((await a.post('/account/profile',{full_name:'Khách TEST cập nhật',phone,role:'admin'})).status,303);
      await a.get('/account/addresses');assert.equal((await a.post('/account/addresses',{receiver_name:'Người TEST',phone,address_detail:'Địa chỉ TEST',ward:'Phường TEST',province:'Tỉnh TEST',district:''})).status,303);
      const [[u]]=await pool.execute('SELECT user_id,role FROM users WHERE user_id=?',[f.users[0].id]);assert.equal(u.role,'user');
      const [addr]=await pool.execute('SELECT district,is_default FROM user_addresses WHERE user_id=?',[u.user_id]);assert.equal(addr[0].district,'');assert.equal(addr[0].is_default,1);
      await a.get('/account/change-password');assert.equal((await a.post('/account/change-password',{current_password:password,new_password:'ChangedTestPassword123',confirm_password:'ChangedTestPassword123'})).status,303);
      assert.equal((await a.get('/account')).status,303);
    });
    await run('HTTP-COD-commit-SQL-details-and-cart',async(o)=>{
      const f=await fixture(),a=await login(f.users[0]);
      assert.equal((await a.post('/cart/items',{variant_id:String(f.variants[0]),quantity:'2',price:'0',user_id:String(f.users[1].id)})).status,303);
      o.before=await snapshot(f);
      const body=bodyFrom(await a.get('/checkout'),f.addresses[0]);
      const response=await a.post('/checkout',{...body,total_amount:'0',payment_status:'paid'});
      assert.equal(response.status,303);o.response={status:response.status,location:response.location};
      const s=await snapshot(f);o.after=s;
      assert.equal(s.orders,1);assert.equal(s.orderRows[0].user_id,f.users[0].id);
      assert.equal(s.orderRows[0].total_amount,'230000.02');assert.equal(s.orderRows[0].status,'pending');
      assert.equal(s.orderRows[0].payment_method,'cod');assert.equal(s.orderRows[0].payment_status,'unpaid');
      assert.equal(s.stock[0].stock,3);assert.equal(s.items.length,0);assert.equal(s.orderItems.length,1);
      assert.equal(s.orderItems[0].quantity,2);assert.equal(s.orderItems[0].unit_price,'100000.01');
      assert.equal(s.orderItems[0].product_id,f.product);assert.equal(s.orderItems[0].variant_id,f.variants[0]);
      const detail=await orders.detail(f.users[0].id,String(s.orderRows[0].order_id));
      assert.equal(detail.address_detail,'Đường TEST');assert.equal(detail.district,'');
      assert.equal((await a.get(response.location)).status,200);
    });
    await run('HTTP-two-customers-last-stock-overlapping-InnoDB-5-rounds',async(o)=>{
      o.rounds=[];
      for(let round=0;round<5;round++){
        const f=await fixture();await pool.execute('UPDATE product_variants SET stock=1 WHERE variant_id=?',[f.variants[0]]);
        await add(f);await add(f,1);const before=await snapshot(f),barrier=gate(),trace={};let arrived=0;
        // Synchronize before acquiring any locks. Waiting for both requests at
        // a later lock would create a test-only cycle if MySQL serializes earlier.
        const db=instrument({beforeBegin:async()=>{
          if(++arrived===2)barrier.resolve();await bounded(barrier.promise,5000,'RACE_BARRIER_TIMEOUT');
        }},trace);
        const race=await extraServer(db);
        try{
          const [a,b]=await Promise.all(f.users.map(user=>login(user,race.base)));
          const pages=await Promise.all([a.get('/checkout'),b.get('/checkout')]);
          const replies=await Promise.all([a.post('/checkout',bodyFrom(pages[0],f.addresses[0])),b.post('/checkout',bodyFrom(pages[1],f.addresses[1]))]);
          const after=await snapshot(f);
          o.rounds.push({before,after,statuses:replies.map(r=>r.status),transactions:trace.transactions});save();
          assert.deepEqual(replies.map(r=>r.status).sort(),[303,409]);
          assert.equal(after.orders,1);assert.equal(after.stock[0].stock,0);
          assert.equal(after.orderItems.reduce((sum,row)=>sum+row.quantity,0),1);assert.equal(after.items.length,1);
          assert.notEqual(after.items[0].user_id,after.orderRows[0].user_id);
          assert.equal(new Set(trace.transactions.map(t=>t.connectionId)).size,2);
        }finally{await race.close();}
      }
    });
    await run('HTTP-replay-after-success-and-12-parallel-same-token',async(o)=>{
      const f=await fixture();await add(f);const a=await login(f.users[0]);const body=bodyFrom(await a.get('/checkout'),f.addresses[0]);
      const replies=await Promise.all(Array.from({length:12},()=>a.post('/checkout',body)));
      assert.ok(replies.every(r=>[303,409].includes(r.status)));o.statuses=replies.map(r=>r.status);
      const before=await snapshot(f);assert.equal(before.orders,1);assert.equal(before.stock[0].stock,4);
      const retry=await a.post('/checkout',body);assert.equal(retry.status,303);
      assert.equal(retry.location,'/checkout/success/'+before.orderRows[0].order_id);assert.deepEqual(await snapshot(f),before);o.after=before;
    });
    await run('HTTP-client-abort-after-real-commit-and-retry',async(o)=>{
      const f=await fixture();await add(f);const committed=gate(),resume=gate();
      const db=instrument({afterCommit:async()=>{committed.resolve();await bounded(resume.promise,10000,'RESUME_TIMEOUT');}},o);
      const loss=await extraServer(db);
      try{
        const a=await login(f.users[0],loss.base),body=bodyFrom(await a.get('/checkout'),f.addresses[0]);
        const abort=new AbortController();const pending=a.post('/checkout',body,true,{signal:abort.signal}).catch(e=>e.name);
        try{await bounded(committed.promise,10000,'COMMIT_SIGNAL_TIMEOUT');o.atCommit=await snapshot(f);
          assert.equal(o.atCommit.orders,1);abort.abort();o.clientResult=await pending;
        }finally{resume.resolve();}
        assert.equal(o.clientResult,'AbortError');
        let retry;for(let i=0;i<30;i++){retry=await a.post('/checkout',body);if(retry.status===303)break;await new Promise(r=>setTimeout(r,20));}
        assert.equal(retry.status,303);assert.deepEqual(await snapshot(f),o.atCommit);o.retryStatus=retry.status;
      }finally{resume.resolve();await loss.close();}
    });
    await run('real-commit-adapter-response-error-then-retry-refused',async(o)=>{
      const f=await fixture();await add(f);
      const db=instrument({afterCommit:async()=>{throw new Error('TEST_COMMIT_REPLY_LOST');}},o);
      const fault=await extraServer(db);
      try{
        const a=await login(f.users[0],fault.base),body=bodyFrom(await a.get('/checkout'),f.addresses[0]);
        const first=await a.post('/checkout',body);assert.equal(first.status,500);
        o.afterCommitError=await snapshot(f);assert.equal(o.afterCommitError.orders,1);assert.equal(o.afterCommitError.stock[0].stock,4);
        assert.equal((await a.post('/checkout',body)).status,409);assert.deepEqual(await snapshot(f),o.afterCommitError);
        assert.equal((await a.get('/orders/'+o.afterCommitError.orderRows[0].order_id)).status,200);o.statuses=[500,409];
      }finally{await fault.close();}
    });
    await run('actual-Express-child-restart-old-token-and-history',async(o)=>{
      const f=await fixture();await add(f);let child=await startChild();
      try{
        const a=await login(f.users[0],child.base),body=bodyFrom(await a.get('/checkout'),f.addresses[0]);
        assert.equal((await a.post('/checkout',body)).status,303);const before=await snapshot(f);
        await child.close();child=null;child=await startChild();
        const b=await login(f.users[0],child.base);assert.equal((await b.post('/checkout',body)).status,409);
        assert.equal((await b.get('/orders/'+before.orderRows[0].order_id)).status,200);
        assert.equal((await b.get('/checkout')).status,409);assert.deepEqual(await snapshot(f),before);
        o.after=before;o.oldTokenStatus=409;o.note='Actual Node child restarted; new login; token not durable.';
      }finally{if(child)await child.close();}
    });
    await run('HTTP-frontend-total-low-high-ignored',async(o)=>{
      o.orders=[];
      for(const amount of ['0.01','9999999999.99']){
        const f=await fixture();await add(f);const a=await login(f.users[0]);const body=bodyFrom(await a.get('/checkout'),f.addresses[0]);
        assert.equal((await a.post('/checkout',{...body,total_amount:amount,price:amount,shipping_fee:'0'})).status,303);
        const s=await snapshot(f);assert.equal(s.orderRows[0].total_amount,'130000.01');assert.equal(s.orderItems[0].unit_price,'100000.01');o.orders.push(s);
      }
    });
    await run('price-change-before-preview-current-database-price',async(o)=>{
      const f=await fixture();await add(f);await pool.execute('UPDATE product_variants SET price=150000 WHERE variant_id=?',[f.variants[0]]);
      const review=await checkout.preview(f.users[0].id);assert.equal(review.total,'180000.00');
      await checkout.place(f.users[0].id,confirm(review));o.after=await snapshot(f);assert.equal(o.after.orderItems[0].unit_price,'150000.00');
      o.note='Uses current database price; no price-at-add marker.';
    });
    await run('HTTP-price-change-after-preview-reconfirm',async(o)=>{
      const f=await fixture();await add(f);const a=await login(f.users[0]),body=bodyFrom(await a.get('/checkout'),f.addresses[0]);
      await pool.execute('UPDATE product_variants SET price=150000 WHERE variant_id=?',[f.variants[0]]);const before=await snapshot(f);
      assert.equal((await a.post('/checkout',body)).status,409);assert.deepEqual(await snapshot(f),before);
      const next=await a.get('/checkout');assert.match(next.html,/180\.000/);
      assert.equal((await a.post('/checkout',bodyFrom(next,f.addresses[0]))).status,303);
      o.after=await snapshot(f);assert.equal(o.after.orderItems[0].unit_price,'150000.00');
    });
    await run('zero-price-refused-negative-price-CHECK',async(o)=>{
      const f=await fixture();await add(f);await pool.execute('UPDATE product_variants SET price=0 WHERE variant_id=?',[f.variants[0]]);
      const before=await snapshot(f);await assert.rejects(checkout.preview(f.users[0].id),{status:409});await assert.rejects(add(f),{status:422});
      assert.deepEqual(await snapshot(f),before);
      await assert.rejects(pool.execute('UPDATE product_variants SET price=-1 WHERE variant_id=?',[f.variants[0]]),{code:'ER_CHECK_CONSTRAINT_VIOLATED'});
      assert.deepEqual(await snapshot(f),before);o.after=before;
      o.note='Schema disallows persisted negative prices; only CHECK rejection tested for negative value.';
    });
    await run('HTTP-quantity-invalid-boundary-and-empty-cart',async(o)=>{
      const f=await fixture(),a=await login(f.users[0]);await a.get('/cart');const before=await snapshot(f);o.statuses=[];
      for(const quantity of ['0','-1','1.5','100','6','abc']){
        const r=await a.post('/cart/items',{variant_id:String(f.variants[0]),quantity});assert.equal(r.status,422);
        assert.deepEqual(await snapshot(f),before);o.statuses.push({quantity,status:r.status});
      }
      assert.equal((await a.get('/checkout')).status,409);
      await pool.execute('UPDATE product_variants SET stock=120 WHERE variant_id=?',[f.variants[0]]);
      assert.equal((await a.post('/cart/items',{variant_id:String(f.variants[0]),quantity:'99'})).status,303);
      const boundary=await snapshot(f);assert.equal(boundary.items[0].quantity,99);
      assert.equal((await a.post('/cart/items',{variant_id:String(f.variants[0]),quantity:'1'})).status,422);
      assert.deepEqual(await snapshot(f),boundary);o.boundary=boundary;
    });
    await run('HTTP-unknown-invalid-variant-spoofed-product',async(o)=>{
      const f=await fixture(),a=await login(f.users[0]);await a.get('/cart');const before=await snapshot(f);
      for(const id of ['2147483647','0','-1','bad']){
        assert.equal((await a.post('/cart/items',{variant_id:id,quantity:'1'})).status,422);assert.deepEqual(await snapshot(f),before);
      }
      const other=await fixture();
      assert.equal((await a.post('/cart/items',{variant_id:String(f.variants[0]),product_id:String(other.product),quantity:'1'})).status,303);
      assert.equal((await a.post('/checkout',bodyFrom(await a.get('/checkout'),f.addresses[0]))).status,303);
      o.after=await snapshot(f);assert.equal(o.after.orderItems[0].product_id,f.product);assert.equal(o.after.orderItems[0].variant_id,f.variants[0]);
      const g=await fixture();const [option]=await pool.execute('INSERT INTO product_options (product_id,option_name) VALUES (?,?)',[g.product,'Màu TEST']);
      g.optionIds=[option.insertId];save();await assert.rejects(add(g),{status:422});
    });
    await run('HTTP-owner-address-cart-order-and-spoofed-user',async(o)=>{
      const f=await fixture();const [a,b]=await Promise.all(f.users.map(user=>login(user)));await add(f);await add(f,1);
      const before=await snapshot(f),foreign=before.items.find(i=>i.user_id===f.users[1].id);
      assert.equal((await a.post('/cart/items/'+foreign.cart_item_id+'/update',{quantity:'2',user_id:String(f.users[1].id)})).status,404);
      assert.equal((await a.post('/cart/items/'+foreign.cart_item_id+'/delete',{})).status,404);assert.deepEqual(await snapshot(f),before);
      assert.equal((await a.get('/checkout?address_id='+f.addresses[1])).status,409);
      const body=bodyFrom(await a.get('/checkout'),f.addresses[0]);
      assert.equal((await a.post('/checkout',{...body,address_id:String(f.addresses[1])})).status,409);assert.deepEqual(await snapshot(f),before);
      assert.equal((await a.post('/checkout',{...body,user_id:String(f.users[1].id)})).status,303);
      const s=await snapshot(f);assert.equal(s.orderRows[0].user_id,f.users[0].id);assert.equal(s.items.length,1);assert.equal(s.items[0].user_id,f.users[1].id);
      assert.equal((await b.get('/orders/'+s.orderRows[0].order_id)).status,404);
      assert.equal((await b.get('/checkout/success/'+s.orderRows[0].order_id)).status,404);o.after=s;
    });
    await run('history-snapshots-after-edit-and-FK-SET-NULL',async(o)=>{
      const f=await fixture();await add(f);const review=await checkout.preview(f.users[0].id),id=await checkout.place(f.users[0].id,confirm(review));
      const before=await orders.detail(f.users[0].id,String(id));
      await pool.execute('UPDATE products SET product_name=? WHERE product_id=?',['Tên TEST mới',f.product]);
      await pool.execute('UPDATE product_variants SET price=1,variant_name=? WHERE variant_id=?',['Biến thể TEST mới',f.variants[0]]);
      await pool.execute('UPDATE user_addresses SET address_detail=? WHERE address_id=?',['Địa chỉ TEST mới',f.addresses[0]]);
      assert.deepEqual(await orders.detail(f.users[0].id,String(id)),before);
      await pool.execute('DELETE FROM user_addresses WHERE address_id=? AND user_id=?',[f.addresses[0],f.users[0].id]);
      await pool.execute('DELETE FROM product_variants WHERE variant_id=? AND product_id=?',[f.variants[0],f.product]);
      await pool.execute('DELETE FROM products WHERE product_id=?',[f.product]);
      const after=await orders.detail(f.users[0].id,String(id));assert.deepEqual(after,before);
      const [[links]]=await pool.execute('SELECT o.address_id,oi.product_id,oi.variant_id FROM orders o JOIN order_items oi ON oi.order_id=o.order_id WHERE o.order_id=?',[id]);
      assert.deepEqual(links,{address_id:null,product_id:null,variant_id:null});o.snapshot=after;o.links=links;
      const a=await login(f.users[0]),page=await a.get('/orders/'+id);assert.equal(page.status,200);assert.ok(page.html.includes(before.items[0].product_name));assert.match(page.html,/Đường TEST/);
    });
    evidence.after=await digest();assert.deepEqual(evidence.after,evidence.before);
    // Borrow the entire test pool and inspect each session before closing it.
    const connections=await Promise.all(Array.from({length:10},()=>pool.getConnection()));
    try{
      evidence.connections=[];
      for(const c of connections){const [[row]]=await c.query('SELECT CONNECTION_ID() id');evidence.connections.push(row);}
    }finally{connections.forEach(c=>c.release());}
    // Runner account has no PROCESS privilege. Use the existing isolated admin only
    // for this read-only inspection, after validating its instance identity again.
    const monitorConfig=dotenv.parse(fs.readFileSync(path.join(__dirname,'..','.env.test-admin.local')));
    const monitor=await mysql.createConnection({host:'127.0.0.1',port:Number(monitorConfig.PORT),user:'root',password:monitorConfig.PASSWORD});
    try{
      await assertIsolatedInstance(monitor);
      const [[row]]=await monitor.query('SELECT COUNT(*) n FROM information_schema.innodb_trx');
      assert.equal(Number(row.n),0);evidence.activeInnoDBTransactions=Number(row.n);
    }finally{await monitor.end();}
    evidence.cleanupAndOldDataVerified=true;
  } finally {
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    fs.mkdirSync(path.join(__dirname,'..','.test-runtime'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'..','.test-runtime','results.json'),JSON.stringify({results,passed:results.filter(r=>r.pass).length,total:results.length},null,2));
    evidence.finished=new Date().toISOString();evidence.passed=results.filter(r=>r.pass).length;evidence.total=results.length;save();
    await pool.end();
  }
  console.log('MYSQL_TEST_SUMMARY',results.filter(r=>r.pass).length+'/'+results.length);
}
if(process.argv.includes('--http-child'))childMain().catch(()=>{process.exitCode=1;if(process.connected)process.disconnect();});
else if(process.argv.includes('--run'))main().catch(e=>{console.error('MySQL test stopped:',e.code||(/^[A-Z_]+$/.test(e.message)?e.message:e.name));process.exitCode=1;});

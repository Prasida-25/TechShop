// Opt-in: không dùng pool website; chỉ ghi fixture mới trên instance test đã xác minh.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const { openTestPool } = require('./test-db-config.cjs');
const { createAdminProductRepository } = require('../src/repositories/admin-product-repository');
const { createAdminProductService } = require('../src/services/admin-product-service');
const { createCartRepository } = require('../src/repositories/cart-repository');
const { createCartService } = require('../src/services/cart-service');
const { createCheckoutRepository } = require('../src/repositories/checkout-repository');
const { createCheckoutService } = require('../src/services/checkout-service');
const { createOrderRepository } = require('../src/repositories/order-repository');
const { createOrderService } = require('../src/services/order-service');
const { png } = require('../tests/helpers/catalog-fixtures.cjs');

async function main() {
  if (!process.argv.includes('--run')) throw new Error('RUN_FLAG_REQUIRED');
  const pool = await openTestPool();
  const service = createAdminProductService(createAdminProductRepository(pool));
  const tag = 'ITP2-' + crypto.randomBytes(8).toString('hex');
  const evidence = { tag, results: [], products: [], category: null, user: null, address: null };
  const save = () => fs.writeFileSync(path.join(__dirname, '..', '.test-runtime', 'admin-products-results.json'), JSON.stringify(evidence, null, 2));
  const [tables] = await pool.query("SELECT TABLE_NAME name, ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  assert.equal(tables.length, 14); assert.ok(tables.some(t => t.name === 'product_images')); assert.ok(tables.some(t => t.name === 'coupons'));
  assert.ok(tables.every(t => t.engine === 'InnoDB'));
  async function digest() {
    const out = {};
    for (const { name } of tables) {
      const [rows] = await pool.query('SELECT * FROM `' + name + '`');
      out[name] = { count: rows.length, hash: crypto.createHash('sha256').update(JSON.stringify(rows.map(r => JSON.stringify(r)).sort())).digest('hex') };
    }
    return out;
  }
  evidence.before = await digest();
  async function run(name, work) {
    try { const actual = await work(); evidence.results.push({ name, status: 'PASS', actual }); console.log('PASS', name); }
    catch (e) { evidence.results.push({ name, status: 'FAIL', code: e.code || e.name,
      ...(e instanceof assert.AssertionError ? { actual: e.actual, expected: e.expected } : {}) }); throw e; }
    finally { save(); }
  }
  let serial = 0;
  const input = change => ({ product_name: tag + ' Tai nghe', category_id: String(evidence.category), brand: 'TEST', description: 'Fixture nhân tạo',
    variant_name: 'Mặc định', sku: tag + '-' + (++serial), price: '100000.01', stock: '5', confirm_stock: '1', ...change });
  async function create(body, image) {
    const id = await service.saveProduct(undefined, body, image); evidence.products.push(id); save(); return id;
  }
  let product, variant;
  try {
    const [category] = await pool.execute('INSERT INTO categories (category_name) VALUES (?)', [tag]); evidence.category = Number(category.insertId); save();
    await run('create-product-default-variant-and-BLOB', async () => {
      product = await create(input(), { data: png, type: 'image/png' });
      const p = await service.detail(String(product)); assert.equal(p.variants.length, 1); variant = p.variants[0];
      assert.equal(variant.price, '100000.01'); assert.equal(variant.stock, 5);
      const [[image]] = await pool.execute('SELECT image_data,image_mime_type FROM products WHERE product_id=?', [product]);
      assert.deepEqual(image.image_data, png); assert.equal(image.image_mime_type, 'image/png');
      return { productId: product, variantId: variant.variant_id, price: variant.price, stock: variant.stock, imageBytes: image.image_data.length };
    });
    await run('unique-SKU-rolls-back-new-product', async () => {
      const before = await digest();
      await assert.rejects(service.saveProduct(undefined, input({ sku: variant.sku.toLowerCase() })), { status: 409 });
      assert.deepEqual(await digest(), before); return { duplicate: 409, allRowsRestored: true };
    });
    await run('options-ownership-links-and-wrong-parent', async () => {
      const other = await create(input());
      const [option] = await pool.execute('INSERT INTO product_options (product_id,option_name) VALUES (?,?)', [other, 'Màu TEST']);
      const [value] = await pool.execute('INSERT INTO product_option_values (option_id,value_name) VALUES (?,?)', [option.insertId, 'Đen TEST']);
      const body = input({ ['option_' + option.insertId]: String(value.insertId) });
      const id = await service.saveVariant(String(other), undefined, body, { data: png, type: 'image/png' });
      const [[link]] = await pool.execute('SELECT option_value_id FROM variant_option_values WHERE variant_id=?', [id]);
      assert.equal(link.option_value_id, value.insertId);
      const before = await digest();
      await assert.rejects(service.saveVariant(String(other), undefined, input({ ['option_' + option.insertId]: '2147483647' })), { status: 422 });
      await assert.rejects(service.saveVariant(String(product), String(id), { ...body, expected_stock: '5' }), { status: 404 });
      assert.deepEqual(await digest(), before); return { product: other, option: option.insertId, value: value.insertId, variant: id, invalidValueStatus: 422, wrongParentStatus: 404 };
    });
    await run('checkout-stock-change-rejects-stale-admin-form', async () => {
      // Chỉ tài khoản khách fixture, không tạo tài khoản admin.
      const phone = '09' + crypto.randomInt(10000000, 99999999);
      const hash = await argon2.hash('IntegrationCustomer123', { type: argon2.argon2id });
      const [u] = await pool.execute("INSERT INTO users (full_name,phone,password,role) VALUES (?,?,?,'user')", [tag, phone, hash]); evidence.user = Number(u.insertId); save();
      const [a] = await pool.execute('INSERT INTO user_addresses (user_id,receiver_name,phone,address_detail,ward,district,province,is_default) VALUES (?,?,?,?,?,?,?,1)', [evidence.user, 'Người nhận TEST', phone, 'Đường TEST', 'Phường TEST', '', 'Tỉnh TEST']); evidence.address = Number(a.insertId); save();
      const cart = createCartService(createCartRepository(pool));
      const checkout = createCheckoutService(createCheckoutRepository(pool));
      await cart.change(evidence.user, 'add', { variant_id: String(variant.variant_id), quantity: '1' });
      const review = await checkout.preview(evidence.user);
      evidence.order = await checkout.place(evidence.user, { checkout_token: review.token, address_id: String(evidence.address), confirm: '1' }); save();
      const before = await digest();
      await assert.rejects(service.saveVariant(String(product), String(variant.variant_id), input({ sku: variant.sku, expected_stock: '5', stock: '9' })), { status: 409 });
      assert.deepEqual(await digest(), before);
      const [[stock]] = await pool.execute('SELECT stock FROM product_variants WHERE variant_id=?', [variant.variant_id]); assert.equal(stock.stock, 4);
      return { orderId: evidence.order, stockBeforeCheckout: 5, stockAfterCheckout: 4, staleFormStatus: 409 };
    });
    await run('edit-traded-product-price-stock-keeps-history-and-image', async () => {
      const orders = createOrderService(createOrderRepository(pool));
      const before = await orders.detail(evidence.user, String(evidence.order));
      await service.saveProduct(String(product), input({ product_name: tag + ' Tên mới' }));
      await service.saveVariant(String(product), String(variant.variant_id), input({ sku: variant.sku, expected_stock: '4', stock: '0', price: '200000.00', variant_name: 'Tên biến thể mới' }));
      assert.deepEqual(await orders.detail(evidence.user, String(evidence.order)), before);
      const [[image]] = await pool.execute('SELECT image_data FROM products WHERE product_id=?', [product]); assert.deepEqual(image.image_data, png);
      const p = await service.detail(String(product)); assert.equal(p.variants[0].stock, 0); assert.equal(p.variants[0].price, '200000.00');
      return { oldUnitPrice: before.items[0].unit_price, newPrice: p.variants[0].price, stock: 0, historyUnchanged: true, imagePreserved: true };
    });
    await run('price-stock-invalid-no-writes', async () => {
      const before = await digest();
      for (const change of [{ price: '0' }, { price: '-1' }, { price: '1e3' }, { stock: '-1' }, { stock: '1.5' }]) {
        assert.throws(() => service.saveVariant(String(product), String(variant.variant_id), input({ sku: variant.sku, expected_stock: '0', ...change })), { status: 422 });
      }
      assert.deepEqual(await digest(), before); return { invalidInputs: 5, allRowsUnchanged: true };
    });
    await run('real-search-escaping-and-pagination', async () => {
      while (evidence.products.length < 23) await create(input());
      const first = await service.list({ q: tag, page: '1' }); const second = await service.list({ q: tag, page: '2' });
      assert.equal(first.total, 23); assert.equal(first.products.length, 20); assert.equal(second.products.length, 3);
      assert.ok(second.products.every(p => !first.products.some(x => x.product_id === p.product_id)));
      assert.equal((await service.list({ q: tag, page: '999' })).page, 2);
      assert.equal((await service.list({ q: "' OR 1=1 --" })).total, 0);
      assert.equal((await service.list({ q: tag + '%' })).total, 0);
      return { total: 23, page1: 20, page2: 3, overlap: 0, injectionResults: 0, literalPercentResults: 0 };
    });
    await run('delete-unordered-product-real-FK-cascade-cart-options', async () => {
      const target = await create(input()), keep = await create(input());
      const t = (await service.detail(String(target))).variants[0], k = (await service.detail(String(keep))).variants[0];
      const [op] = await pool.execute('INSERT INTO product_options(product_id,option_name) VALUES(?,?)', [target, 'Màu TEST']);
      const [value] = await pool.execute('INSERT INTO product_option_values(option_id,value_name) VALUES(?,?)', [op.insertId, 'Đen TEST']);
      await pool.execute('INSERT INTO variant_option_values(variant_id,option_value_id) VALUES(?,?)', [t.variant_id, value.insertId]);
      const cart = createCartService(createCartRepository(pool));
      await cart.change(evidence.user, 'add', { variant_id: String(t.variant_id), quantity: '1' });
      await cart.change(evidence.user, 'add', { variant_id: String(k.variant_id), quantity: '1' });
      const [history] = await pool.execute('SELECT * FROM order_items WHERE order_id=? ORDER BY order_item_id', [evidence.order]);
      assert.equal(Number((await service.detail(String(target))).has_orders), 0);
      await service.removeProduct(String(target), { confirm_delete: '1' });
      for (const [table, field, id] of [['products','product_id',target],['product_variants','variant_id',t.variant_id],['cart_items','variant_id',t.variant_id],['product_options','option_id',op.insertId],['product_option_values','option_value_id',value.insertId],['variant_option_values','variant_id',t.variant_id]]) {
        const [[row]] = await pool.execute('SELECT COUNT(*) total FROM '+table+' WHERE '+field+'=?', [id]); assert.equal(Number(row.total), 0);
      }
      const [[kept]] = await pool.execute('SELECT COUNT(*) total FROM cart_items WHERE user_id=? AND variant_id=?', [evidence.user, k.variant_id]); assert.equal(Number(kept.total), 1);
      const [after] = await pool.execute('SELECT * FROM order_items WHERE order_id=? ORDER BY order_item_id', [evidence.order]); assert.deepEqual(after, history);
      await assert.rejects(service.detail(String(target)), { status: 404 });
      return { target, variant: t.variant_id, keptProduct: keep, cascadedRowsGone: true, otherCartPreserved: true, historyPreserved: true };
    });
    await run('delete-refused-pending-cancelled-and-product-FK-null', async () => {
      for (const status of ['pending','cancelled']) {
        await pool.execute('UPDATE orders SET status=? WHERE order_id=?', [status, evidence.order]);
        const before = await digest(); await assert.rejects(service.removeProduct(String(product), { confirm_delete:'1' }), { status:409 }); assert.deepEqual(await digest(), before);
      }
      await pool.execute('UPDATE order_items SET product_id=NULL WHERE order_id=?', [evidence.order]);
      const before = await digest(); assert.equal(Number((await service.detail(String(product))).has_orders), 1);
      await assert.rejects(service.removeProduct(String(product), { confirm_delete:'1' }), { status:409 }); assert.deepEqual(await digest(), before);
      return { product, cancelledBlocked:true, variantReferenceBlocked:true, allRowsUnchanged:true };
    });
    await run('delete-real-cascade-rollback-before-commit', async () => {
      const target = await create(input()), v = (await service.detail(String(target))).variants[0];
      await createCartService(createCartRepository(pool)).change(evidence.user,'add',{ variant_id:String(v.variant_id),quantity:'1' });
      const before = await digest();
      const database = { async getConnection() { const c = await pool.getConnection(); return {
        beginTransaction:()=>c.beginTransaction(), execute:(...args)=>c.execute(...args),
        async commit(){throw new Error('TEST_DELETE_BEFORE_COMMIT');}, rollback:()=>c.rollback(), release:()=>c.release(),
      }; } };
      const broken = createAdminProductService(createAdminProductRepository(database));
      await assert.rejects(broken.removeProduct(String(target),{confirm_delete:'1'})); assert.deepEqual(await digest(),before);
      return { target, productVariantCartRestored:true };
    });
    await run('delete-vs-checkout-real-connections', async () => {
      const cart=createCartService(createCartRepository(pool)); await cart.change(evidence.user,'clear',{});
      const target=await create(input()),v=(await service.detail(String(target))).variants[0];
      await cart.change(evidence.user,'add',{variant_id:String(v.variant_id),quantity:'1'});
      let arrivals=0,resolve;const gate=new Promise(r=>{resolve=r;}),connections=[];
      const db={execute:(...args)=>pool.execute(...args),async getConnection(){const c=await pool.getConnection();const [[id]]=await c.query('SELECT CONNECTION_ID() id');connections.push(id.id);return{
        async beginTransaction(){if(++arrivals===2)resolve();await gate;await c.beginTransaction();},execute:(...args)=>c.execute(...args),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release(),
      };}};
      const deleting=createAdminProductService(createAdminProductRepository(db)),placing=createCheckoutService(createCheckoutRepository(db));
      const review=await placing.preview(evidence.user);
      const [[before]]=await pool.execute('SELECT COUNT(*) total FROM orders WHERE user_id=?',[evidence.user]);
      const results=await Promise.allSettled([deleting.removeProduct(String(target),{confirm_delete:'1'}),placing.place(evidence.user,{checkout_token:review.token,address_id:String(evidence.address),confirm:'1'})]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(new Set(connections).size,2);
      const failed=results.find(r=>r.status==='rejected').reason;assert.ok(failed.status===409||['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(failed.code));
      const [[after]]=await pool.execute('SELECT COUNT(*) total FROM orders WHERE user_id=?',[evidence.user]);
      const [products]=await pool.execute('SELECT product_id FROM products WHERE product_id=?',[target]);
      const [variants]=await pool.execute('SELECT stock FROM product_variants WHERE variant_id=?',[v.variant_id]);
      const deleted=results[0].status==='fulfilled';assert.equal(products.length,deleted?0:1);assert.equal(Number(after.total)-Number(before.total),deleted?0:1);
      if(!deleted)assert.equal(variants[0].stock,4);else assert.equal(variants.length,0);
      return{target,connections,deleted,ordersAdded:Number(after.total)-Number(before.total),stock:variants[0]?.stock??null};
    });
  } finally {
    try {
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        if (evidence.user) {
          const [rows] = await c.execute('SELECT order_id FROM orders WHERE user_id=?', [evidence.user]);
          evidence.cleanedOrderIds = rows.map(r => r.order_id);
          for (const row of rows) { await c.execute('DELETE FROM order_items WHERE order_id=?', [row.order_id]); await c.execute('DELETE FROM orders WHERE order_id=? AND user_id=?', [row.order_id, evidence.user]); }
          await c.execute('DELETE FROM cart_items WHERE user_id=?', [evidence.user]);
          await c.execute('DELETE FROM user_addresses WHERE user_id=?', [evidence.user]);
          await c.execute('DELETE FROM users WHERE user_id=?', [evidence.user]);
        }
        for (const id of evidence.products) {
          // Chỉ các product IDs do service trả trong lần chạy này, không xóa theo tên TEST.
          await c.execute('DELETE FROM products WHERE product_id=? AND category_id=?', [id, evidence.category]);
        }
        if (evidence.category) await c.execute('DELETE FROM categories WHERE category_id=?', [evidence.category]);
        await c.commit();
      } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
      evidence.after = await digest(); assert.deepEqual(evidence.after, evidence.before);
      evidence.cleanup = 'PASS'; console.log('PASS cleanup-and-old-data-hashes');
    } catch (error) { evidence.cleanup = 'FAIL'; throw error; }
    finally { save(); await pool.end(); }
  }
  console.log('ADMIN_PRODUCTS_MYSQL', evidence.results.length + '/' + evidence.results.length);
}
if (process.argv.includes('--run')) main().catch(e => { console.error('Admin product integration stopped:', e.code || e.name); process.exitCode = 1; });

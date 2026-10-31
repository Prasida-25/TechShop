// Test opt-in trên instance test riêng; không dùng cấu hình pool website.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const { openTestPool } = require('./test-db-config.cjs');
const { createUserRepository } = require('../src/repositories/user-repository');
const { ADDRESS_SQL } = require('../src/repositories/address-repository');
const { createAdminProductService } = require('../src/services/admin-product-service');
const { createAdminProductRepository } = require('../src/repositories/admin-product-repository');
const { createCartService } = require('../src/services/cart-service');
const { createCartRepository } = require('../src/repositories/cart-repository');
const { createCheckoutService } = require('../src/services/checkout-service');
const { createCheckoutRepository } = require('../src/repositories/checkout-repository');

async function main() {
  const pool = await openTestPool();
  let userId, productId;
  const tag = 'SELECTED-' + crypto.randomBytes(8).toString('hex');
  const productRepo = createAdminProductRepository(pool);
  const products = createAdminProductService(productRepo);
  const cart = createCartService(createCartRepository(pool));
  const checkout = createCheckoutService(createCheckoutRepository(pool));
  const counts = async () => {
    const out = {};
    for (const table of ['users','user_addresses','products','product_variants','cart_items','orders','order_items']) {
      const [[row]] = await pool.query(`SELECT COUNT(*) n FROM ${table}`);
      out[table] = Number(row.n);
    }
    return out;
  };
  try {
    const before = await counts();
    try {
      const phone = '09' + String(crypto.randomInt(10000000,99999999));
      userId = await createUserRepository(pool).create({ full_name:tag, phone }, await argon2.hash(crypto.randomBytes(20).toString('hex')));
      await pool.execute(ADDRESS_SQL.insert, [userId,tag,phone,'Địa chỉ thử','Phường thử','','Tỉnh thử',1]);
      const input = { product_name:tag,category_id:'',brand:'TEST',description:'Fixture riêng',variant_name:'A',sku:tag+'-A',price:'100000',stock:'5' };
      productId = await products.saveProduct(undefined,input);
      await products.saveVariant(String(productId),undefined,{...input,variant_name:'B',sku:tag+'-B',price:'200000'});
      const variants=(await products.detail(String(productId))).variants;
      for(const v of variants) await cart.change(userId,'add',{variant_id:String(v.variant_id),quantity:'1'});
      const lines=(await cart.getCart(userId)).items;
      const selection=String(lines.find(line=>line.variant_id===variants[0].variant_id).cart_item_id);
      const a=await checkout.preview(userId,undefined,selection),b=await checkout.preview(userId,undefined,selection);
      assert.equal(a.total,'130000.00');
      const body=r=>({checkout_token:r.token,address_id:String(r.address.address_id),confirm:'1',items:String(lines.find(line=>line.variant_id===variants[1].variant_id).cart_item_id),total:'0'});
      const results=await Promise.allSettled([checkout.place(userId,body(a)),checkout.place(userId,body(b))]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      const orderId=results.find(r=>r.status==='fulfilled').value;
      const [items]=await pool.execute('SELECT variant_id,quantity,unit_price FROM order_items WHERE order_id=?',[orderId]);
      assert.equal(items.length,1); assert.equal(items[0].variant_id,variants[0].variant_id);
      const remaining=(await cart.getCart(userId)).items;
      assert.equal(remaining.length,1); assert.equal(remaining[0].variant_id,variants[1].variant_id);
      const stocks=(await products.detail(String(productId))).variants.map(v=>v.stock);
      assert.deepEqual(stocks,[4,5]);
      console.log('PASS MySQL InnoDB: chỉ tạo order_items/trừ kho/xóa giỏ cho dòng đã chọn; giữ dòng chưa chọn.');
      console.log('PASS MySQL InnoDB: hai token đồng thời cùng lựa chọn chỉ tạo một đơn, bỏ qua items/giá giả trong POST.');
    } finally {
      // Chỉ dọn dữ liệu gắn với user/product do chính lần chạy này tạo, trong transaction.
      const c=await pool.getConnection();
      try {
        await c.beginTransaction();
        if(userId) {
          const [[user]]=await c.execute('SELECT full_name FROM users WHERE user_id=? FOR UPDATE',[userId]);
          assert.equal(user.full_name,tag);
          await c.execute('DELETE oi FROM order_items oi JOIN orders o ON o.order_id=oi.order_id WHERE o.user_id=?',[userId]);
          await c.execute('DELETE FROM orders WHERE user_id=?',[userId]);
          await c.execute('DELETE FROM cart_items WHERE user_id=?',[userId]);
          await c.execute('DELETE FROM user_addresses WHERE user_id=?',[userId]);
          await c.execute('DELETE FROM users WHERE user_id=?',[userId]);
        }
        if(productId) {
          const [[product]]=await c.execute('SELECT product_name FROM products WHERE product_id=? FOR UPDATE',[productId]);
          assert.equal(product.product_name,tag);
          await c.execute('DELETE FROM products WHERE product_id=?',[productId]);
        }
        await c.commit();
      } catch(error) { await c.rollback(); throw error; }
      finally { c.release(); }
      assert.deepEqual(await counts(),before);
      console.log('PASS cleanup: số dòng test trở về ban đầu, không thao tác database website.');
    }
  } finally { await pool.end(); }
}
if(process.argv.includes('--run')) main().catch(error=>{console.error('SELECTED_CHECKOUT_TEST_FAILED',error.code||error.name);process.exitCode=1;});

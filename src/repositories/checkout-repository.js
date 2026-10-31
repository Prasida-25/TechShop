const { getPool } = require('../config/database');
const { CART_SQL } = require('./cart-repository');
const { ADDRESS_SQL } = require('./address-repository');
const { VALID_VARIANT } = require('./catalog-repository');
const { CartError } = require('../utils/cart-validation');
const { quote, shippingAddress, fingerprint, selectCartItems } = require('../utils/checkout');
const {COUPON_SQL}=require('./coupon-repository');
const {applyCoupon}=require('../utils/coupon-pricing');
const {paymentMethod}=require('../config/payment');

const CHECKOUT_SQL = {
  cart: 'SELECT cart_item_id, variant_id, quantity FROM cart_items WHERE user_id = ? ORDER BY variant_id FOR UPDATE',
  variant: `SELECT v.variant_id, v.product_id, p.product_name, v.variant_name, v.sku, v.price, v.stock,
    (${VALID_VARIANT}) AS valid_variant FROM product_variants v JOIN products p ON p.product_id = v.product_id
    WHERE v.variant_id = ? FOR UPDATE`,
  address: ADDRESS_SQL.own + ' FOR UPDATE',
  stock: 'UPDATE product_variants SET stock = stock - ? WHERE variant_id = ? AND stock >= ?',
  order: `INSERT INTO orders (user_id, address_id, receiver_name, phone, address_detail, ward, district, province,
    total_amount,coupon_id,coupon_code,discount_amount,shipping_fee, status, payment_method, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'unpaid')`,
  item: `INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name, sku, quantity, unit_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  confirmation: 'SELECT order_id, total_amount, status, payment_method, payment_status, created_at FROM orders WHERE order_id = ? AND user_id = ?',
};

function createCheckoutRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args), getConnection: () => getPool().getConnection() };
  async function preview(userId,code) {
    const [items] = await db.execute(CART_SQL.list, [userId]);
    const [addresses] = await db.execute(ADDRESS_SQL.list, [userId]);
    const [[coupon]]=code?await db.execute(COUPON_SQL.byCode,[code]):[[]];
    return { items, addresses,coupon };
  }
  async function confirmation(userId, orderId) {
    const [[row]] = await db.execute(CHECKOUT_SQL.confirmation, [orderId, userId]);
    return row || null;
  }
  async function place(userId, review) {
    const connection = await db.getConnection();
    let began = false;
    try {
      await connection.beginTransaction(); began = true;
      const [[user]] = await connection.execute(CART_SQL.lockUser, [userId]);
      if (!user) throw new CartError('Vui lòng đăng nhập lại.', 401);
      const [cart] = await connection.execute(CHECKOUT_SQL.cart, [userId]);
      const selectedCart = selectCartItems(cart, review.cartItemIds);
      const items = [];
      // Khóa từng biến thể theo ID tăng dần, dùng cùng thứ tự giữa các khách.
      for (const item of selectedCart) {
        const [[variant]] = await connection.execute(CHECKOUT_SQL.variant, [item.variant_id]);
        items.push({ ...variant, ...item });
      }
      const [[row]] = await connection.execute(CHECKOUT_SQL.address, [review.addressId, userId]);
      const address = shippingAddress(row);
      let coupon=null;
      if(review.couponId) {
        [[coupon]]=await connection.execute(COUPON_SQL.lock,[review.couponId]);
        if(coupon) {const [[clock]]=await connection.execute(COUPON_SQL.clock,[review.couponId]);Object.assign(coupon,clock);}
      }
      const pricing = applyCoupon(quote(items),coupon,Boolean(review.couponId));
      if (fingerprint(pricing, address) !== review.fingerprint) {
        throw new CartError('Giá, giỏ hàng hoặc địa chỉ đã thay đổi. Vui lòng kiểm tra và xác nhận lại tại checkout.', 409);
      }
      if(review.couponId) {
        const [consumed]=await connection.execute(COUPON_SQL.consume,[review.couponId]);
        if(consumed.affectedRows!==1)throw new CartError('Mã giảm giá không còn áp dụng được. Vui lòng kiểm tra lại.',409);
      }
      for (const item of pricing.items) {
        const [result] = await connection.execute(CHECKOUT_SQL.stock, [item.quantity, item.variant_id, item.quantity]);
        if (result.affectedRows !== 1) throw new CartError('Tồn kho đã thay đổi. Vui lòng kiểm tra lại giỏ hàng.', 409);
      }
      const [order] = await connection.execute(CHECKOUT_SQL.order, [userId, address.address_id, address.receiver_name,
        address.phone, address.address_detail, address.ward, address.district, address.province, pricing.total,
        pricing.couponId,pricing.couponCode,pricing.discount,pricing.shipping,paymentMethod(review.paymentMethod)]);
      for (const item of pricing.items) {
        await connection.execute(CHECKOUT_SQL.item, [order.insertId, item.product_id, item.variant_id,
          item.product_name, item.variant_name, item.sku, item.quantity, item.price]);
      }
      if (review.cartItemIds) {
        for (const item of selectedCart) {
          const [removed] = await connection.execute(CART_SQL.remove, [item.cart_item_id, userId]);
          if (removed.affectedRows !== 1) throw new CartError('Giỏ hàng đã thay đổi. Vui lòng thử lại.', 409);
        }
      } else {
        const [cleared] = await connection.execute(CART_SQL.clear, [userId]);
        if (cleared.affectedRows !== cart.length) throw new CartError('Giỏ hàng đã thay đổi. Vui lòng thử lại.', 409);
      }
      await connection.commit();
      return Number(order.insertId);
    } catch (error) {
      if (began) {
        try { await connection.rollback(); }
        catch { console.error('[Checkout] Không thể xác nhận rollback.'); }
      }
      throw error;
    } finally { connection.release(); }
  }
  return { preview, place, confirmation };
}

module.exports = { createCheckoutRepository, CHECKOUT_SQL };

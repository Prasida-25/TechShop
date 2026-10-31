const { getPool } = require('../config/database');
const ORDER_FILTER = `user_id = ? AND (? = 'all' OR status = ? OR
  (? = 'unpaid' AND status='pending' AND payment_method='bank' AND payment_status='unpaid'))`;
const filterParams = (userId, status) => [userId, status, status, status];

const ORDER_SQL = {
  count: `SELECT COUNT(*) AS total FROM orders WHERE ${ORDER_FILTER}`,
  list: `SELECT order_id, total_amount, status, payment_method, payment_status,
    (created_at > CURRENT_TIMESTAMP - INTERVAL 72 HOUR) AS payment_window_open,
    DATE_FORMAT(created_at, '%d/%m/%Y %H:%i') AS created_at_label
    FROM orders WHERE ${ORDER_FILTER} ORDER BY created_at DESC, order_id DESC LIMIT 10 OFFSET `,
  listItems: `SELECT oi.order_id,oi.order_item_id,oi.product_id,oi.variant_id,oi.product_name,oi.variant_name,oi.sku,oi.quantity,oi.unit_price,p.brand
    FROM order_items oi JOIN orders o ON o.order_id=oi.order_id
    LEFT JOIN products p ON p.product_id=oi.product_id
    WHERE o.user_id=? AND oi.order_id IN (`,
  own: `SELECT order_id, receiver_name, phone, address_detail, ward, district, province,
    total_amount,coupon_id,coupon_code,discount_amount,shipping_fee, status, payment_method, payment_status,
    (created_at > CURRENT_TIMESTAMP - INTERVAL 72 HOUR) AS payment_window_open,
    DATE_FORMAT(created_at, '%d/%m/%Y %H:%i') AS created_at_label
    FROM orders WHERE order_id = ? AND user_id = ?`,
  items: `SELECT oi.order_item_id, oi.product_name, oi.variant_name, oi.sku, oi.quantity, oi.unit_price
    FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
    WHERE oi.order_id = ? AND o.user_id = ? ORDER BY oi.order_item_id`,
};

function createOrderRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args) };
  async function count(userId, status = 'all') { const [[row]] = await db.execute(ORDER_SQL.count, filterParams(userId, status)); return Number(row.total); }
  async function list(userId, offset, status = 'all') {
    // OFFSET chỉ được tạo từ số nguyên nội bộ; không nối query string vào SQL.
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid order offset');
    const [rows] = await db.execute(ORDER_SQL.list + offset, filterParams(userId, status)); return rows;
  }
  async function listItems(userId, ids) {
    if (!ids.length) return [];
    if (ids.length > 10 || ids.some(id => !Number.isInteger(id) || id <= 0)) throw new Error('Invalid order IDs');
    const [rows] = await db.execute(ORDER_SQL.listItems + ids.map(() => '?').join(',') + ') ORDER BY oi.order_id,oi.order_item_id', [userId, ...ids]);
    return rows;
  }
  async function detail(userId, orderId) {
    const [[order]] = await db.execute(ORDER_SQL.own, [orderId, userId]);
    if (!order) return null;
    // Lọc chủ sở hữu cả ở truy vấn chi tiết, không dựa vào ID frontend.
    const [items] = await db.execute(ORDER_SQL.items, [orderId, userId]);
    return { ...order, items };
  }
  return { count, list, listItems, detail };
}

module.exports = { createOrderRepository, ORDER_SQL };

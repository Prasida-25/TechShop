const { getPool } = require('../config/database');
const { AdminOrderError, NEXT_STATUS } = require('../utils/admin-order-rules');
const {COUPON_SQL}=require('./coupon-repository');

const ADMIN_ORDER_SQL = {
  detail: `SELECT o.order_id,o.user_id,u.full_name AS buyer_name,o.receiver_name,o.phone,
    o.address_detail,o.ward,o.district,o.province,o.total_amount,o.coupon_id,o.coupon_code,o.discount_amount,o.shipping_fee,o.status,o.payment_method,o.payment_status,
    (o.created_at <= CURRENT_TIMESTAMP - INTERVAL 72 HOUR) AS expired,
    DATE_FORMAT(o.created_at,'%d/%m/%Y %H:%i') AS created_at_label,
    DATE_FORMAT(o.updated_at,'%d/%m/%Y %H:%i') AS updated_at_label
    FROM orders o LEFT JOIN users u ON u.user_id=o.user_id WHERE o.order_id=?`,
  items: `SELECT order_item_id,product_name,variant_name,sku,quantity,unit_price
    FROM order_items WHERE order_id=? ORDER BY order_item_id`,
  lock: `SELECT order_id,status,payment_method,payment_status,coupon_id,
    (created_at <= CURRENT_TIMESTAMP - INTERVAL 72 HOUR) AS expired
    FROM orders WHERE order_id=? FOR UPDATE`,
  age: 'SELECT (created_at <= CURRENT_TIMESTAMP - INTERVAL 72 HOUR) AS expired FROM orders WHERE order_id=?',
  restoreItems: 'SELECT order_item_id,variant_id,product_id,quantity FROM order_items WHERE order_id=? ORDER BY variant_id,order_item_id FOR UPDATE',
  variant: 'SELECT variant_id,product_id,stock FROM product_variants WHERE variant_id=? FOR UPDATE',
  restore: 'UPDATE product_variants SET stock=stock+? WHERE variant_id=? AND stock<=2147483647-?',
  status: 'UPDATE orders SET status=? WHERE order_id=? AND status=?',
  confirmCod: `UPDATE orders SET payment_status='paid' WHERE order_id=?
    AND status='delivered' AND payment_method='cod' AND payment_status='unpaid'`,
  confirmBank: `UPDATE orders SET payment_status='paid' WHERE order_id=?
    AND status='pending' AND payment_method='bank' AND payment_status='unpaid'
    AND created_at>CURRENT_TIMESTAMP-INTERVAL 72 HOUR`,
  expired: `SELECT order_id FROM orders WHERE status='pending' AND payment_method IN ('cod','bank') AND payment_status='unpaid'
    AND created_at <= CURRENT_TIMESTAMP - INTERVAL 72 HOUR AND order_id>? ORDER BY order_id LIMIT 50`,
};
function createAdminOrderRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args), getConnection: () => getPool().getConnection() };
  async function list(filters) {
    const where = [], params = [];
    if (filters.status) { where.push('o.status=?'); params.push(filters.status); }
    if (filters.q) {
      const keyword = '%' + filters.q.replace(/[!%_]/g, '!$&') + '%';
      const numeric = /^#?[1-9]\d{0,9}$/.test(filters.q) && Number(filters.q.replace('#','')) <= 2147483647;
      where.push("(o.order_id=? OR o.receiver_name LIKE ? ESCAPE '!' OR o.phone LIKE ? ESCAPE '!' OR u.full_name LIKE ? ESCAPE '!')");
      params.push(numeric ? Number(filters.q.replace('#','')) : null, keyword, keyword, keyword);
    }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const from = ' FROM orders o LEFT JOIN users u ON u.user_id=o.user_id';
    const [[count]] = await db.execute('SELECT COUNT(*) total' + from + clause, params);
    const total = Number(count.total), totalPages = Math.ceil(total / 20);
    if (!Number.isSafeInteger(filters.page) || filters.page < 1) throw new Error('Invalid admin order page');
    const page = Math.min(filters.page, Math.max(1, totalPages));
    const [orders] = await db.execute(`SELECT o.order_id,o.user_id,u.full_name AS buyer_name,o.receiver_name,
      o.total_amount,o.status,o.payment_method,o.payment_status,
      DATE_FORMAT(o.created_at,'%d/%m/%Y %H:%i') AS created_at_label,
      (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.order_id=o.order_id) AS quantity
      ${from} ${clause} ORDER BY o.created_at DESC,o.order_id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`, params);
    return { orders, total, totalPages, page };
  }
  async function detail(orderId) {
    const [[order]] = await db.execute(ADMIN_ORDER_SQL.detail, [orderId]);
    if (!order) return null;
    const [items] = await db.execute(ADMIN_ORDER_SQL.items, [orderId]);
    return { ...order, items };
  }
  async function restoreStock(c, orderId) {
    const [items] = await c.execute(ADMIN_ORDER_SQL.restoreItems, [orderId]);
    if (!items.length) throw new AdminOrderError('Đơn không có chi tiết sản phẩm để hoàn kho. Cần kiểm tra dữ liệu.', 409);
    const quantities = new Map();
    for (const item of items) {
      if (!Number.isSafeInteger(item.variant_id) || !Number.isSafeInteger(item.product_id) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
        throw new AdminOrderError('Thiếu biến thể hoặc dữ liệu số lượng để hoàn kho. Không thay đổi đơn; cần kiểm tra dữ liệu.', 409);
      }
      const total = (quantities.get(item.variant_id)?.quantity || 0) + item.quantity;
      if (total > 2147483647 || (quantities.has(item.variant_id) && quantities.get(item.variant_id).productId !== item.product_id)) {
        throw new AdminOrderError('Dữ liệu chi tiết đơn không hợp lệ để hoàn kho.', 409);
      }
      quantities.set(item.variant_id, { quantity: total, productId: item.product_id });
    }
    for (const [variantId, item] of [...quantities].sort((a,b) => a[0]-b[0])) {
      const [[v]] = await c.execute(ADMIN_ORDER_SQL.variant, [variantId]);
      if (!v || v.product_id !== item.productId) throw new AdminOrderError('Biến thể không còn tồn tại hoặc không khớp sản phẩm. Chưa hủy đơn.', 409);
      const [updated] = await c.execute(ADMIN_ORDER_SQL.restore, [item.quantity, variantId, item.quantity]);
      if (updated.affectedRows !== 1) throw new AdminOrderError('Tồn kho vượt giới hạn cho phép khi hoàn hàng. Chưa hủy đơn.', 409);
    }
  }
  async function change(orderId, expected, target, automatic = false) {
    const c = await db.getConnection();
    try {
      await c.beginTransaction();
      const [[order]] = await c.execute(ADMIN_ORDER_SQL.lock, [orderId]);
      if (!order) throw new AdminOrderError('Không tìm thấy đơn hàng.', 404);
      if (order.status === 'pending' && (automatic || target === 'confirmed')) {
        // CURRENT_TIMESTAMP thuộc thời điểm bắt đầu statement. Đọc lại sau khi
        // đã lấy được lock để không xác nhận nhầm nếu vừa chờ lock qua mốc 72h.
        const [[age]] = await c.execute(ADMIN_ORDER_SQL.age, [orderId]);
        order.expired = age.expired;
      }
      if (automatic && (order.status !== 'pending' || !Number(order.expired) || !['cod','bank'].includes(order.payment_method) || order.payment_status !== 'unpaid')) {
        await c.commit(); return false;
      }
      if (order.status !== expected) throw new AdminOrderError('Trạng thái đơn đã thay đổi. Tải lại trang trước khi thao tác.', 409);
      if (!['cod','bank'].includes(order.payment_method) || !['unpaid','paid'].includes(order.payment_status)) {
        throw new AdminOrderError('Phương thức hoặc trạng thái thanh toán không hợp lệ; không tự hoàn tiền.', 409);
      }
      if (target === 'cancelled') {
        if (order.status !== 'pending' || order.payment_status !== 'unpaid') throw new AdminOrderError('Chỉ hủy đơn chờ xác nhận và chưa thanh toán; không tự hoàn tiền.', 409);
        await restoreStock(c, orderId);
        if(order.coupon_id) {
          // Cùng thứ tự tài nguyên với checkout: biến thể trước, mã sau.
          const [[coupon]]=await c.execute(COUPON_SQL.lock,[order.coupon_id]);
          if(!coupon)throw new AdminOrderError('Không tìm thấy mã để hoàn lượt. Chưa hủy đơn.',409);
          const [released]=await c.execute(COUPON_SQL.release,[order.coupon_id]);
          if(released.affectedRows!==1)throw new AdminOrderError('Lượt sử dụng mã không nhất quán. Chưa hủy đơn.',409);
        }
      } else {
        if (NEXT_STATUS[order.status] !== target) throw new AdminOrderError('Chuyển trạng thái không hợp lệ. Không bỏ bước hoặc quay lùi.', 409);
        if(order.payment_method==='bank'&&order.payment_status!=='paid')throw new AdminOrderError('Cần xác nhận đã nhận đủ tiền chuyển khoản trước khi xử lý giao hàng.',409);
        if (order.status === 'pending' && Number(order.expired) && !(order.payment_method==='bank'&&order.payment_status==='paid')) throw new AdminOrderError('Đơn đã quá 72 giờ chờ xác nhận nên không thể xác nhận. Hãy hủy đơn hoặc chờ tác vụ tự hủy.', 409);
      }
      const [updated] = await c.execute(ADMIN_ORDER_SQL.status, [target, orderId, expected]);
      if (updated.affectedRows !== 1) throw new AdminOrderError('Trạng thái đơn đã thay đổi. Vui lòng tải lại.', 409);
      await c.commit(); return true;
    } catch (error) { await c.rollback(); throw error; }
    finally { c.release(); }
  }
  async function confirmCod(orderId) {
    const c = await db.getConnection();
    try {
      await c.beginTransaction();
      const [[order]] = await c.execute(ADMIN_ORDER_SQL.lock, [orderId]);
      if (!order) throw new AdminOrderError('Không tìm thấy đơn hàng.', 404);
      if (order.status !== 'delivered' || order.payment_method !== 'cod') {
        throw new AdminOrderError('Chỉ xác nhận thu COD cho đơn đã giao thành công.', 409);
      }
      // Request lặp không ghi lại hoặc đổi các thông tin khác của đơn.
      if (order.payment_status === 'paid') { await c.commit(); return false; }
      if (order.payment_status !== 'unpaid') {
        throw new AdminOrderError('Trạng thái thanh toán không cho phép xác nhận thu COD.', 409);
      }
      const [updated] = await c.execute(ADMIN_ORDER_SQL.confirmCod, [orderId]);
      if (updated.affectedRows !== 1) throw new AdminOrderError('Dữ liệu đơn đã thay đổi. Vui lòng tải lại trang.', 409);
      await c.commit();
      return true;
    } catch (error) { await c.rollback(); throw error; }
    finally { c.release(); }
  }
  async function expired(afterId) {
    const [rows] = await db.execute(ADMIN_ORDER_SQL.expired, [afterId]); return rows.map(r => r.order_id);
  }
  async function confirmBank(orderId) {
    const c=await db.getConnection();
    try {
      await c.beginTransaction();
      const [[order]]=await c.execute(ADMIN_ORDER_SQL.lock,[orderId]);
      if(!order)throw new AdminOrderError('Không tìm thấy đơn hàng.',404);
      if(order.payment_method!=='bank'||order.status==='cancelled')throw new AdminOrderError('Chỉ xác nhận chuyển khoản cho đơn Ngân hàng chưa hủy.',409);
      if(order.payment_status==='paid'){await c.commit();return false;}
      const [[age]]=await c.execute(ADMIN_ORDER_SQL.age,[orderId]);
      if(order.status!=='pending'||order.payment_status!=='unpaid'||Number(age.expired))throw new AdminOrderError('Chỉ xác nhận chuyển khoản cho đơn chờ xác nhận, chưa thanh toán và còn trong 72 giờ.',409);
      const [updated]=await c.execute(ADMIN_ORDER_SQL.confirmBank,[orderId]);
      if(updated.affectedRows!==1)throw new AdminOrderError('Dữ liệu đơn đã thay đổi hoặc đã quá hạn. Vui lòng tải lại.',409);
      await c.commit();return true;
    }catch(error){await c.rollback();throw error;}finally{c.release();}
  }
  return { list, detail, change, confirmCod, confirmBank, expired };
}
module.exports = { createAdminOrderRepository, ADMIN_ORDER_SQL };

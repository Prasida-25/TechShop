const { getPool } = require('../config/database');
const { ReviewError } = require('../utils/review-validation');

const REVIEW_SQL = {
  target: `SELECT oi.order_item_id,oi.product_id,oi.product_name,oi.variant_name,o.status
    FROM orders o JOIN order_items oi ON oi.order_id=o.order_id
    JOIN products p ON p.product_id=oi.product_id
    WHERE o.order_id=? AND oi.order_item_id=? AND o.user_id=?`,
  existing: `SELECT review_id,rating,comment,DATE_FORMAT(created_at,'%d/%m/%Y %H:%i') AS created_at_label
    FROM reviews WHERE user_id=? AND product_id=?`,
  insert: 'INSERT INTO reviews(user_id,product_id,order_item_id,rating,comment) VALUES(?,?,?,?,?)',
  product: 'SELECT product_id,product_name FROM products WHERE product_id=?',
  count: 'SELECT COUNT(*) AS total FROM reviews WHERE product_id=?',
  list: `SELECT r.rating,r.comment,u.full_name AS buyer_name,DATE_FORMAT(r.created_at,'%d/%m/%Y %H:%i') AS created_at_label
    FROM reviews r LEFT JOIN users u ON u.user_id=r.user_id
    WHERE r.product_id=? ORDER BY r.created_at DESC,r.review_id DESC LIMIT 20 OFFSET `,
};
function createReviewRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args), getConnection: () => getPool().getConnection() };
  async function target(userId, orderId, itemId, connection = db, lock = false) {
    const [[row]] = await connection.execute(REVIEW_SQL.target + (lock ? ' FOR UPDATE' : ''), [orderId, itemId, userId]);
    if (!row) throw new ReviewError('Không tìm thấy sản phẩm còn tồn tại trong đơn hàng của bạn.', 404);
    if (row.status !== 'delivered') throw new ReviewError('Chỉ được đánh giá sản phẩm trong đơn đã giao thành công.', 409);
    return row;
  }
  async function form(userId, orderId, itemId) {
    const item = await target(userId, orderId, itemId);
    const [[review]] = await db.execute(REVIEW_SQL.existing, [userId, item.product_id]);
    return { item, review: review || null };
  }
  async function create(userId, orderId, itemId, input) {
    const c = await db.getConnection();
    try {
      await c.beginTransaction();
      // Khóa dữ liệu gốc rồi suy ra product_id; không nhận product_id từ form.
      const item = await target(userId, orderId, itemId, c, true);
      const [[existing]] = await c.execute(REVIEW_SQL.existing, [userId, item.product_id]);
      if (existing) throw new ReviewError('Bạn đã đánh giá sản phẩm này. Mỗi sản phẩm chỉ được đánh giá một lần.', 409);
      await c.execute(REVIEW_SQL.insert, [userId, item.product_id, item.order_item_id, input.rating, input.comment]);
      await c.commit();
    } catch (error) {
      await c.rollback();
      // UNIQUE(user_id,product_id) và UNIQUE(order_item_id) bảo vệ cả request đồng thời.
      if (error.code === 'ER_DUP_ENTRY') throw new ReviewError('Bạn đã đánh giá sản phẩm này. Mỗi sản phẩm chỉ được đánh giá một lần.', 409);
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new ReviewError('Dữ liệu đang được cập nhật. Hãy tải lại trang để kiểm tra rồi thử lại.', 409);
      throw error;
    } finally { c.release(); }
  }
  async function list(productId, requestedPage) {
    const [[product]] = await db.execute(REVIEW_SQL.product, [productId]);
    if (!product) throw new ReviewError('Sản phẩm không tồn tại.', 404);
    const [[count]] = await db.execute(REVIEW_SQL.count, [productId]);
    const total = Number(count.total), totalPages = Math.ceil(total / 20);
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new Error('Invalid review page');
    const page = Math.min(requestedPage, Math.max(1, totalPages));
    const [reviews] = await db.execute(REVIEW_SQL.list + ((page - 1) * 20), [productId]);
    return { product, reviews, total, totalPages, page };
  }
  return { form, create, list };
}
module.exports = { createReviewRepository, REVIEW_SQL };

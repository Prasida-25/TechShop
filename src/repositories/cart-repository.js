const { getPool } = require('../config/database');
const { VALID_VARIANT } = require('./catalog-repository');
const { CartError } = require('../utils/cart-validation');

const CART_SQL = {
  list: `SELECT c.cart_item_id, c.variant_id, c.quantity, p.product_id, p.product_name,
    v.variant_name, v.sku, v.price, v.stock, (${VALID_VARIANT}) AS valid_variant
    FROM cart_items c LEFT JOIN product_variants v ON v.variant_id = c.variant_id
    LEFT JOIN products p ON p.product_id = v.product_id
    WHERE c.user_id = ? ORDER BY c.cart_item_id DESC`,
  lockUser: 'SELECT user_id FROM users WHERE user_id = ? FOR UPDATE',
  own: 'SELECT cart_item_id, variant_id, quantity FROM cart_items WHERE cart_item_id = ? AND user_id = ? FOR UPDATE',
  variant: `SELECT v.variant_id, v.price, v.stock, (${VALID_VARIANT}) AS valid_variant
    FROM product_variants v JOIN products p ON p.product_id = v.product_id WHERE v.variant_id = ? FOR UPDATE`,
  existing: 'SELECT cart_item_id, quantity FROM cart_items WHERE user_id = ? AND variant_id = ? FOR UPDATE',
  insert: 'INSERT INTO cart_items (user_id, variant_id, quantity) VALUES (?, ?, ?)',
  update: 'UPDATE cart_items SET quantity = ? WHERE cart_item_id = ? AND user_id = ?',
  remove: 'DELETE FROM cart_items WHERE cart_item_id = ? AND user_id = ?',
  clear: 'DELETE FROM cart_items WHERE user_id = ?',
};

function createCartRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args), getConnection: () => getPool().getConnection() };
  async function list(userId) { const [rows] = await db.execute(CART_SQL.list, [userId]); return rows; }
  // Khóa users tuần tự hóa các thay đổi giỏ của cùng người dùng, kể cả giỏ rỗng.
  // Không giữ hàng và không cập nhật stock trong Bước B.
  async function transaction(userId, run) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [[user]] = await connection.execute(CART_SQL.lockUser, [userId]);
      if (!user) throw new CartError('Vui lòng đăng nhập lại.', 401);
      const result = await run({
        async one(name, params) { const [[row]] = await connection.execute(CART_SQL[name], params); return row; },
        async execute(name, params) { return connection.execute(CART_SQL[name], params); },
      });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
  return { list, transaction };
}

module.exports = { createCartRepository, CART_SQL };

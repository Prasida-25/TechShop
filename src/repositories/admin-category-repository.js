const { getPool } = require('../config/database');
const { CategoryError } = require('../utils/admin-category-validation');

const CATEGORY_SQL = {
  detail: `SELECT c.category_id,c.category_name,c.description,
    (SELECT COUNT(*) FROM products p WHERE p.category_id=c.category_id) AS product_count
    FROM categories c WHERE c.category_id=?`,
  lock: 'SELECT category_id FROM categories WHERE category_id=? FOR UPDATE',
  used: 'SELECT product_id FROM products WHERE category_id=? LIMIT 1 FOR UPDATE',
  create: 'INSERT INTO categories(category_name,description) VALUES(?,?)',
  update: 'UPDATE categories SET category_name=?,description=? WHERE category_id=?',
  remove: 'DELETE FROM categories WHERE category_id=?',
};
function createAdminCategoryRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args), getConnection: () => getPool().getConnection() };
  const missing = () => new CategoryError({ general: 'Danh mục không tồn tại.' }, 404);
  async function transaction(run) {
    const c = await db.getConnection();
    try { await c.beginTransaction(); const result = await run(c); await c.commit(); return result; }
    catch (error) { await c.rollback(); throw error; }
    finally { c.release(); }
  }
  async function lock(c, id) {
    const [[row]] = await c.execute(CATEGORY_SQL.lock, [id]);
    if (!row) throw missing();
  }
  return {
    async list(q, requestedPage) {
      if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new Error('Invalid category page');
      const where = q ? " WHERE c.category_name LIKE ? ESCAPE '!'" : '';
      const params = q ? ['%' + q.replace(/[!%_]/g, '!$&') + '%'] : [];
      const [[count]] = await db.execute('SELECT COUNT(*) total FROM categories c' + where, params);
      const total = Number(count.total), pages = Math.ceil(total / 20), page = Math.min(requestedPage, Math.max(1, pages));
      const [categories] = await db.execute(`SELECT c.category_id,c.category_name,c.description,
        (SELECT COUNT(*) FROM products p WHERE p.category_id=c.category_id) AS product_count
        FROM categories c${where} ORDER BY c.category_name,c.category_id LIMIT 20 OFFSET ${(page - 1) * 20}`, params);
      return { categories, total, pages, page, q };
    },
    async detail(id) {
      const [[row]] = await db.execute(CATEGORY_SQL.detail, [id]);
      if (!row) throw missing();
      return row;
    },
    save(id, data) {
      return transaction(async c => {
        if (id !== null) {
          await lock(c, id);
          await c.execute(CATEGORY_SQL.update, [data.name, data.description, id]);
          return id;
        }
        const [row] = await c.execute(CATEGORY_SQL.create, [data.name, data.description]);
        return Number(row.insertId);
      });
    },
    remove(id) {
      return transaction(async c => {
        // Khóa parent ngăn gán sản phẩm mới qua FK trong lúc kiểm tra/xóa.
        await lock(c, id);
        const [products] = await c.execute(CATEGORY_SQL.used, [id]);
        if (products.length) throw new CategoryError({ general: 'Không thể xóa danh mục đang có sản phẩm. Hãy chuyển toàn bộ sản phẩm sang danh mục khác trước.' }, 409);
        const [result] = await c.execute(CATEGORY_SQL.remove, [id]);
        if (result.affectedRows !== 1) throw missing();
      });
    },
  };
}
module.exports = { createAdminCategoryRepository, CATEGORY_SQL };

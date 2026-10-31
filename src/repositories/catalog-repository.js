const { getPool } = require('../config/database');
const { SORTS } = require('../utils/catalog-query');

// Một giá trị cho mỗi thuộc tính, đủ thuộc tính, cùng sản phẩm.
// Không đòi stock > 0: biến thể hết hàng vẫn hợp lệ để hiển thị.
const VALID_VARIANT = `v.price >= 0 AND v.stock >= 0
  AND NOT EXISTS (
    SELECT 1 FROM variant_option_values x
    JOIN product_option_values ov ON ov.option_value_id = x.option_value_id
    JOIN product_options op ON op.option_id = ov.option_id
    WHERE x.variant_id = v.variant_id AND op.product_id <> v.product_id
  )
  AND NOT EXISTS (
    SELECT ov.option_id FROM variant_option_values x
    JOIN product_option_values ov ON ov.option_value_id = x.option_value_id
    WHERE x.variant_id = v.variant_id GROUP BY ov.option_id HAVING COUNT(*) > 1
  )
  AND (SELECT COUNT(*) FROM variant_option_values x WHERE x.variant_id = v.variant_id)
    = (SELECT COUNT(*) FROM product_options op WHERE op.product_id = v.product_id)`;

const PRICE_JOIN = `LEFT JOIN (
  SELECT v.product_id, MIN(v.price) AS min_price, MAX(v.price) AS max_price,
    SUM(v.stock) AS total_stock, COUNT(*) AS variant_count
  FROM product_variants v WHERE ${VALID_VARIANT} GROUP BY v.product_id
) prices ON prices.product_id = p.product_id`;

const SALES_JOIN = `LEFT JOIN (
  SELECT oi.product_id, SUM(oi.quantity) AS sold_count
  FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
  WHERE o.status = 'delivered' AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id
) sales ON sales.product_id = p.product_id`;

// Gom một dòng mỗi sản phẩm để không nhân số lượng bán/biến thể khi nối bảng.
const REVIEW_JOIN = `LEFT JOIN (
  SELECT product_id, AVG(rating) AS average_rating, COUNT(*) AS review_count
  FROM reviews GROUP BY product_id
) ratings ON ratings.product_id = p.product_id`;

const SUMMARY = `SELECT p.product_id, p.category_id, p.product_name, p.brand, p.created_at,
  prices.min_price, prices.max_price, COALESCE(prices.total_stock, 0) AS total_stock,
  COALESCE(prices.variant_count, 0) AS variant_count,
  COALESCE(sales.sold_count, 0) AS sold_count,
  ratings.average_rating, COALESCE(ratings.review_count, 0) AS review_count
  FROM products p ${PRICE_JOIN} ${SALES_JOIN} ${REVIEW_JOIN}`;

function createCatalogRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args) };

  async function getCategories() {
    const [rows] = await db.execute('SELECT category_id, category_name FROM categories ORDER BY category_name, category_id');
    return rows;
  }

  async function getHomeProducts() {
    const [suggestions] = await db.execute(`${SUMMARY}
      ORDER BY sold_count DESC, p.created_at DESC, p.product_id DESC`);
    return { suggestions };
  }

  async function getProducts(filters) {
    const where = [];
    const params = [];
    if (filters.q) {
      // Dùng ! làm escape để %, _ và dấu gạch chéo được tìm như ký tự thật.
      const keyword = `%${filters.q.replace(/[!%_]/g, '!$&')}%`;
      where.push("(p.product_name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!')");
      params.push(keyword, keyword);
    }
    if (filters.categoryId) { where.push('p.category_id = ?'); params.push(filters.categoryId); }
    if (filters.minPrice !== null) { where.push('prices.min_price >= ?'); params.push(filters.minPrice); }
    if (filters.maxPrice !== null) { where.push('prices.min_price <= ?'); params.push(filters.maxPrice); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await db.execute(`SELECT COUNT(*) AS total FROM products p ${PRICE_JOIN} ${clause}`, params);
    const total = Number(count.total);
    const totalPages = Math.ceil(total / filters.limit);
    const page = Math.min(filters.page, Math.max(1, totalPages));
    // LIMIT/OFFSET là số nguyên đã kiểm tra; ORDER BY chỉ lấy từ allowlist nội bộ.
    const order = SORTS[filters.sort] || SORTS.newest;
    const offset = (page - 1) * filters.limit;
    const [products] = await db.execute(`${SUMMARY} ${clause} ORDER BY ${order}
      LIMIT ${filters.limit} OFFSET ${offset}`, params);
    return { products, total, totalPages, page };
  }

  async function getProduct(id) {
    const [[product]] = await db.execute(`SELECT p.product_id, p.category_id, p.product_name,
      p.brand, p.description, c.category_name FROM products p
      LEFT JOIN categories c ON c.category_id = p.category_id WHERE p.product_id = ?`, [id]);
    if (!product) return null;
    const [variants] = await db.execute(`SELECT v.variant_id, v.product_id, v.variant_name,
      v.sku, v.price, v.stock FROM product_variants v
      WHERE v.product_id = ? AND ${VALID_VARIANT} ORDER BY v.variant_id`, [id]);
    const [options] = await db.execute(`SELECT op.option_id, op.option_name, ov.option_value_id, ov.value_name,
      x.variant_id FROM product_options op
      JOIN product_option_values ov ON ov.option_id = op.option_id
      JOIN variant_option_values x ON x.option_value_id = ov.option_value_id
      JOIN product_variants v ON v.variant_id = x.variant_id AND v.product_id = op.product_id
      WHERE op.product_id = ? AND ${VALID_VARIANT}
      ORDER BY op.option_id, ov.option_value_id, v.variant_id`, [id]);
    let images = [];
    try { [images] = await db.execute('SELECT image_id FROM product_images WHERE product_id=? ORDER BY sort_order,image_id', [id]); }
    catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
    return { ...product, variants, options, images };
  }

  async function getImage(productId, variantId, imageId) {
    if (imageId) {
      try {
        const [images] = await db.execute('SELECT image_data,image_mime_type FROM product_images WHERE product_id=? AND image_id=?', [productId, imageId]);
        return images[0] || null;
      } catch (error) { if (error.code === 'ER_NO_SUCH_TABLE') return null; throw error; }
    }
    const [rows] = variantId
      ? await db.execute(`SELECT v.image_data, v.image_mime_type FROM product_variants v
          WHERE v.product_id = ? AND v.variant_id = ? AND ${VALID_VARIANT}`, [productId, variantId])
      : await db.execute('SELECT image_data, image_mime_type FROM products WHERE product_id = ?', [productId]);
    return rows[0] || null;
  }

  return { getCategories, getHomeProducts, getProducts, getProduct, getImage };
}

module.exports = { createCatalogRepository, VALID_VARIANT };

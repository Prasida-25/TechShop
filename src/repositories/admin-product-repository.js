const { getPool } = require('../config/database');
const { ProductError, optionValues } = require('../utils/admin-product-validation');

// Kiểm tra mọi trạng thái đơn, cả liên kết qua biến thể khi product_id lịch sử NULL.
const HAS_ORDERS = `(EXISTS(SELECT 1 FROM order_items oi WHERE oi.product_id=p.product_id)
  OR EXISTS(SELECT 1 FROM order_items oi JOIN product_variants ov ON ov.variant_id=oi.variant_id
    WHERE ov.product_id=p.product_id)) AS has_orders`;

const PRODUCT_SQL = {
  categories: 'SELECT category_id, category_name FROM categories ORDER BY category_name, category_id',
  own: `SELECT p.product_id,p.category_id,p.product_name,p.brand,p.description,
    (p.image_data IS NOT NULL AND OCTET_LENGTH(p.image_data)>0) AS has_image,${HAS_ORDERS} FROM products p WHERE p.product_id=?`,
  lockProduct: 'SELECT product_id FROM products WHERE product_id=? FOR UPDATE',
  lockVariants: 'SELECT variant_id FROM product_variants WHERE product_id=? ORDER BY variant_id FOR UPDATE',
  orderedProduct: 'SELECT order_item_id FROM order_items WHERE product_id=? LIMIT 1 FOR UPDATE',
  orderedVariant: `SELECT oi.order_item_id FROM order_items oi JOIN product_variants v ON v.variant_id=oi.variant_id
    WHERE v.product_id=? LIMIT 1 FOR UPDATE`,
  reviewed: 'SELECT review_id FROM reviews WHERE product_id=? LIMIT 1 FOR UPDATE',
  removeProduct: 'DELETE FROM products WHERE product_id=?',
  category: 'SELECT category_id FROM categories WHERE category_id=? FOR SHARE',
  options: `SELECT op.option_id,op.option_name,ov.option_value_id,ov.value_name FROM product_options op
    LEFT JOIN product_option_values ov ON ov.option_id=op.option_id WHERE op.product_id=? ORDER BY op.option_id,ov.option_value_id`,
  variants: 'SELECT variant_id,product_id,variant_name,sku,price,stock,(image_data IS NOT NULL AND OCTET_LENGTH(image_data)>0) AS has_image FROM product_variants WHERE product_id=? ORDER BY variant_id',
  links: `SELECT x.variant_id,x.option_value_id FROM variant_option_values x JOIN product_variants v ON v.variant_id=x.variant_id WHERE v.product_id=?`,
  images: 'SELECT image_id,sort_order FROM product_images WHERE product_id=? ORDER BY sort_order,image_id',
  addImage: 'INSERT INTO product_images (product_id,image_data,image_mime_type,sort_order) VALUES (?,?,?,?)',
  removeImage: 'DELETE FROM product_images WHERE product_id=? AND image_id=?',
  clearProductImage: 'UPDATE products SET image_data=NULL,image_mime_type=NULL WHERE product_id=? AND image_data IS NOT NULL',
  clearVariantImage: 'UPDATE product_variants SET image_data=NULL,image_mime_type=NULL WHERE product_id=? AND variant_id=? AND image_data IS NOT NULL',
  variant: 'SELECT variant_id,stock FROM product_variants WHERE product_id=? AND variant_id=? FOR UPDATE',
  create: 'INSERT INTO products (product_name,category_id,brand,description,image_data,image_mime_type) VALUES (?,?,?,?,?,?)',
  update: `UPDATE products SET product_name=?,category_id=?,brand=?,description=?,
    image_data=IF(?, ?, image_data),image_mime_type=IF(?, ?, image_mime_type) WHERE product_id=?`,
  addVariant: 'INSERT INTO product_variants (product_id,variant_name,sku,price,stock,image_data,image_mime_type) VALUES (?,?,?,?,?,?,?)',
  updateVariant: `UPDATE product_variants SET variant_name=?,sku=?,price=?,stock=?,
    image_data=IF(?, ?, image_data),image_mime_type=IF(?, ?, image_mime_type) WHERE product_id=? AND variant_id=?`,
  clearLinks: 'DELETE FROM variant_option_values WHERE variant_id=?',
  addLink: 'INSERT INTO variant_option_values (variant_id,option_value_id) VALUES (?,?)',
};
function createAdminProductRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args), getConnection: () => getPool().getConnection() };
  const missing = () => new ProductError({ general: 'Sản phẩm hoặc biến thể không tồn tại.' }, 404);
  async function transaction(run) {
    const c = await db.getConnection();
    try { await c.beginTransaction(); const result = await run(c); await c.commit(); return result; }
    catch (error) { await c.rollback(); throw error; }
    finally { c.release(); }
  }
  async function categories() { const [rows] = await db.execute(PRODUCT_SQL.categories); return rows; }
  async function list(q, requestedPage) {
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new ProductError({ general: 'Trang không hợp lệ.' }, 400);
    const keyword = '%' + q.replace(/[!%_]/g, '!$&') + '%';
    const where = q ? "WHERE p.product_name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!'" : '';
    const params = q ? [keyword, keyword] : [];
    const [[row]] = await db.execute(`SELECT COUNT(*) total FROM products p ${where}`, params);
    const total = Number(row.total), pages = Math.ceil(total / 20), page = Math.min(requestedPage, Math.max(1, pages));
    const [products] = await db.execute(`SELECT p.product_id,p.product_name,p.brand,c.category_name,
      (SELECT COUNT(*) FROM product_variants v WHERE v.product_id=p.product_id) variant_count,${HAS_ORDERS}
      FROM products p LEFT JOIN categories c ON c.category_id=p.category_id ${where}
      ORDER BY p.created_at DESC,p.product_id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`, params);
    return { products, total, pages, page, q };
  }
  async function detail(productId) {
    const [[product]] = await db.execute(PRODUCT_SQL.own, [productId]);
    if (!product) throw missing();
    const [variants] = await db.execute(PRODUCT_SQL.variants, [productId]);
    const [options] = await db.execute(PRODUCT_SQL.options, [productId]);
    const [links] = await db.execute(PRODUCT_SQL.links, [productId]);
    let images = [];
    try { [images] = await db.execute(PRODUCT_SQL.images, [productId]); }
    catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
    return { ...product, variants, options, links, images };
  }
  async function validCategory(c, categoryId) {
    if (categoryId === null) return;
    const [[row]] = await c.execute(PRODUCT_SQL.category, [categoryId]);
    if (!row) throw new ProductError({ category_id: 'Danh mục không tồn tại.' });
  }
  const imageParams = image => [Boolean(image), image?.data || null, Boolean(image), image?.mime || null];
  async function insertVariant(c, productId, data, image) {
    const [row] = await c.execute(PRODUCT_SQL.addVariant, [productId, data.variant_name, data.sku, data.price, data.stock, image?.data || null, image?.mime || null]);
    return Number(row.insertId);
  }
  async function saveProduct(productId, data, initialVariant, image, images = []) {
    return transaction(async c => {
      if (productId) { const [[p]] = await c.execute(PRODUCT_SQL.lockProduct, [productId]); if (!p) throw missing(); }
      await validCategory(c, data.category_id);
      // Khóa parent ở trên tuần tự hóa các lần thêm ảnh cho cùng sản phẩm.
      let existing = [];
      if (productId && images.length) {
        try { [existing] = await c.execute(PRODUCT_SQL.images, [productId]); }
        catch (error) {
          if (error.code === 'ER_NO_SUCH_TABLE') throw new ProductError({ images: 'Chưa có bảng lưu ảnh bổ sung. Cần chạy database/add-product-images.sql bằng tài khoản quản trị MySQL.' }, 503);
          throw error;
        }
      }
      if (existing.length + images.length > 9) throw new ProductError({ images: `Sản phẩm đã có ${existing.length} ảnh bổ sung. Tổng cộng tối đa 9 ảnh bổ sung và 1 ảnh đại diện.` });
      if (productId) {
        await c.execute(PRODUCT_SQL.update, [data.product_name, data.category_id, data.brand, data.description, ...imageParams(image), productId]);
      } else {
        const [p] = await c.execute(PRODUCT_SQL.create, [data.product_name, data.category_id, data.brand, data.description, image?.data || null, image?.mime || null]);
        productId = Number(p.insertId);
        await insertVariant(c, productId, initialVariant, null);
      }
      const order = existing.reduce((max, row) => Math.max(max, Number(row.sort_order)), 0);
      for (const [index, item] of images.entries()) {
        try { await c.execute(PRODUCT_SQL.addImage, [productId, item.data, item.mime, order + index + 1]); }
        catch (error) {
          if (error.code === 'ER_NO_SUCH_TABLE') throw new ProductError({ images: 'Chưa có bảng lưu ảnh bổ sung. Cần chạy database/add-product-images.sql bằng tài khoản quản trị MySQL.' }, 503);
          throw error;
        }
      }
      return productId;
    });
  }
  async function saveVariant(productId, variantId, data, body, image) {
    return transaction(async c => {
      const [[p]] = await c.execute(PRODUCT_SQL.lockProduct, [productId]); if (!p) throw missing();
      if (variantId) {
        const [[v]] = await c.execute(PRODUCT_SQL.variant, [productId, variantId]); if (!v) throw missing();
        // Precondition, không dùng số lượng client gửi làm nguồn tồn kho chính thức.
        if (Number(v.stock) !== data.expected_stock) throw new ProductError({ expected_stock: 'Tồn kho đã thay đổi. Tải lại trang trước khi cập nhật để không ghi đè giao dịch mới.' }, 409);
        if (Number(v.stock) !== data.stock && !data.confirm_stock) throw new ProductError({ stock: 'Hãy xác nhận thay đổi tồn kho trước khi lưu.' });
      }
      const [rows] = await c.execute(PRODUCT_SQL.options, [productId]);
      const selected = optionValues(body, rows);
      if (variantId) {
        await c.execute(PRODUCT_SQL.updateVariant, [data.variant_name, data.sku, data.price, data.stock, ...imageParams(image), productId, variantId]);
        await c.execute(PRODUCT_SQL.clearLinks, [variantId]);
      } else variantId = await insertVariant(c, productId, data, image);
      for (const valueId of selected) await c.execute(PRODUCT_SQL.addLink, [variantId, valueId]);
      return variantId;
    });
  }
  async function removeProduct(productId) {
    return transaction(async c => {
      const [[product]] = await c.execute(PRODUCT_SQL.lockProduct, [productId]);
      if (!product) throw missing();
      // Giữ khóa parent và biến thể đến commit để không bỏ sót đơn đang đặt.
      await c.execute(PRODUCT_SQL.lockVariants, [productId]);
      const [direct] = await c.execute(PRODUCT_SQL.orderedProduct, [productId]);
      const [variants] = await c.execute(PRODUCT_SQL.orderedVariant, [productId]);
      if (direct.length || variants.length) throw new ProductError({ general: 'Không thể xóa sản phẩm đã có đơn hàng, kể cả đơn đã hủy.' }, 409);
      const [reviews] = await c.execute(PRODUCT_SQL.reviewed, [productId]);
      if (reviews.length) throw new ProductError({ general: 'Sản phẩm đang có đánh giá liên quan. Cần kiểm tra dữ liệu trước khi xóa.' }, 409);
      // FK CASCADE xóa biến thể/thuộc tính và dòng giỏ liên quan trong cùng transaction.
      const [result] = await c.execute(PRODUCT_SQL.removeProduct, [productId]);
      if (result.affectedRows !== 1) throw missing();
    });
  }
  async function removeImage(productId, kind, imageId) {
    return transaction(async c => {
      const [[product]] = await c.execute(PRODUCT_SQL.lockProduct, [productId]);
      if (!product) throw missing();
      const sql = kind === 'cover' ? PRODUCT_SQL.clearProductImage
        : kind === 'variant' ? PRODUCT_SQL.clearVariantImage : PRODUCT_SQL.removeImage;
      const [result] = await c.execute(sql, kind === 'cover' ? [productId] : [productId, imageId]);
      if (result.affectedRows !== 1) throw new ProductError({ general: 'Ảnh không tồn tại hoặc không thuộc sản phẩm này.' }, 404);
    });
  }
  return { categories, list, detail, saveProduct, saveVariant, removeProduct, removeImage };
}
module.exports = { createAdminProductRepository, PRODUCT_SQL };

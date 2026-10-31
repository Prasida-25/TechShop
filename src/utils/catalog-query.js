const SORTS = {
  newest: 'p.created_at DESC, p.product_id DESC',
  price_asc: 'prices.min_price IS NULL, prices.min_price ASC, p.product_id DESC',
  price_desc: 'prices.min_price IS NULL, prices.min_price DESC, p.product_id DESC',
  name: 'p.product_name ASC, p.product_id ASC',
  bestselling: 'sold_count DESC, p.created_at DESC, p.product_id DESC',
};

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  error.publicMessage = message;
  return error;
}

function scalar(query, key) {
  if (query[key] === undefined) return '';
  if (typeof query[key] !== 'string') throw invalid(`Tham số ${key} không hợp lệ.`);
  return query[key].trim();
}

function positiveId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return id <= 2147483647 ? id : null;
}

function money(query, key) {
  const value = scalar(query, key);
  if (!value) return null;
  // DECIMAL(12,2): tối đa 10 chữ số nguyên, không âm.
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) throw invalid('Khoảng giá không hợp lệ.');
  return Number(value);
}

function parseCatalogQuery(query) {
  if (Object.keys(query).some((key) => /^(q|category_id|min_price|max_price|sort|page|limit)\[/.test(key))) {
    throw invalid('Tham số tìm kiếm phải là một giá trị đơn.');
  }
  const q = scalar(query, 'q').replace(/\s+/gu, ' ');
  if (q.length > 200 || /[\u0000-\u001f\u007f]/u.test(q)) {
    throw invalid('Từ khóa không hợp lệ. Vui lòng nhập tối đa 200 ký tự.');
  }
  const category = scalar(query, 'category_id');
  const categoryId = category ? positiveId(category) : null;
  if (category && !categoryId) throw invalid('Danh mục không hợp lệ.');
  const minPrice = money(query, 'min_price');
  const maxPrice = money(query, 'max_price');
  if (minPrice !== null && maxPrice !== null && maxPrice < minPrice) {
    throw invalid('Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.');
  }
  const sort = scalar(query, 'sort') || 'newest';
  if (!Object.hasOwn(SORTS, sort)) throw invalid('Cách sắp xếp không hợp lệ.');
  const pageText = scalar(query, 'page');
  const limitText = scalar(query, 'limit');
  // Trang sai định dạng quay về 1; limit luôn được giới hạn trong 1..40.
  const page = /^[1-9]\d{0,8}$/.test(pageText) ? Number(pageText) : 1;
  const limit = /^[1-9]\d{0,2}$/.test(limitText) ? Math.min(Number(limitText), 40) : 10;
  return { q, categoryId, minPrice, maxPrice, sort, page, limit };
}

function catalogUrl(filters, changes = {}) {
  const values = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (values.q) params.set('q', values.q);
  if (values.categoryId) params.set('category_id', values.categoryId);
  if (values.minPrice !== null && values.minPrice !== undefined) params.set('min_price', values.minPrice);
  if (values.maxPrice !== null && values.maxPrice !== undefined) params.set('max_price', values.maxPrice);
  if (values.sort) params.set('sort', values.sort);
  if (values.limit) params.set('limit', values.limit);
  if (values.page > 1) params.set('page', values.page);
  return `/products${values.q ? '/search' : ''}${params.size ? `?${params}` : ''}`;
}

function formatMoney(value) {
  if (value === null || value === undefined) return 'Chưa có giá bán';
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(value))}đ`;
}

module.exports = { SORTS, invalid, positiveId, parseCatalogQuery, catalogUrl, formatMoney };

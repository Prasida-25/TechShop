const { priceUnits } = require('./cart-validation');
const { detectImageMime } = require('./image-format');

class ProductError extends Error {
  constructor(errors, status = 422) { super('Product validation failed'); this.errors = errors; this.status = status; }
}
function id(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) {
    throw new ProductError({ general: 'Sản phẩm hoặc biến thể không tồn tại.' }, 404);
  }
  return Number(value);
}
function integer(value, field) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(value) || Number(value) > 2147483647) {
    throw new ProductError({ [field]: 'Nhập số nguyên từ 0 đến 2.147.483.647.' });
  }
  return Number(value);
}
function text(body, field, max, required = false) {
  if (body?.[field] !== undefined && typeof body[field] !== 'string') throw new ProductError({ [field]: 'Nội dung phải là chuỗi văn bản.' });
  const value = typeof body?.[field] === 'string' ? body[field].trim() : '';
  const controls = field === 'description' ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if ((required && !value) || value.length > max || controls.test(value)) {
    throw new ProductError({ [field]: `Nội dung ${required ? 'cần nhập và ' : ''}không quá ${max} ký tự.` });
  }
  return value;
}
function productInput(body) {
  let category = null;
  if (body?.category_id !== '') {
    try { category = id(body?.category_id); }
    catch { throw new ProductError({ category_id: 'Chọn danh mục hợp lệ hoặc Chưa phân loại.' }); }
  }
  return { product_name: text(body, 'product_name', 200, true), brand: text(body, 'brand', 100),
    description: text(body, 'description', 16000), category_id: category };
}
function variantInput(body, editing = false) {
  const price = typeof body?.price === 'string' ? body.price.trim() : '';
  const units = priceUnits(price);
  if (units === null || units <= 0n) throw new ProductError({ price: 'Giá phải lớn hơn 0, tối đa 10 chữ số nguyên và 2 số thập phân.' });
  return { variant_name: text(body, 'variant_name', 200, true), sku: text(body, 'sku', 50, true), price,
    stock: integer(body?.stock, 'stock'), ...(editing ? { expected_stock: integer(body?.expected_stock, 'expected_stock'), confirm_stock: body?.confirm_stock === '1' } : {}) };
}
function optionValues(body, rows) {
  const options = new Map(rows.map(row => [String(row.option_id), row.option_name]));
  const selected = [];
  for (const [key, name] of options) {
    const value = body?.['option_' + key];
    if (typeof value !== 'string' || !rows.some(r => String(r.option_id) === key && String(r.option_value_id) === value && r.option_value_id !== null)) {
      throw new ProductError({ options: `Chọn một giá trị hợp lệ cho ${name}.` });
    }
    selected.push(Number(value));
  }
  if (Object.keys(body || {}).some(key => key.startsWith('option_') && !options.has(key.slice(7)))) {
    throw new ProductError({ options: 'Thuộc tính không thuộc sản phẩm này.' });
  }
  return selected;
}
function imageInput(file) {
  if (!file) return null;
  const data = file.data;
  if (!Buffer.isBuffer(data) || !data.length || data.length > 1024 * 1024) {
    throw new ProductError({ image: 'Ảnh tối đa 1 MB.' });
  }
  const mime = detectImageMime(data);
  if (!mime) throw new ProductError({ image: 'Chỉ nhận PNG, JPEG/JFIF, WebP, GIF, AVIF hoặc BMP theo nội dung file. Không nhận SVG, HEIC, TIFF hoặc file không nhận diện được.' });
  return { data, mime };
}
module.exports = { ProductError, id, productInput, variantInput, optionValues, imageInput };

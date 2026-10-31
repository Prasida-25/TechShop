class CategoryError extends Error {
  constructor(errors, status = 422) { super('Category validation failed'); this.errors = errors; this.status = status; }
}
function categoryId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) {
    throw new CategoryError({ general: 'Danh mục không tồn tại.' }, 404);
  }
  return Number(value);
}
function categoryInput(body = {}) {
  const errors = {};
  const name = typeof body.category_name === 'string' ? body.category_name.trim() : '';
  const description = body.description === undefined ? '' : body.description;
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) errors.category_name = 'Tên danh mục cần từ 1 đến 100 ký tự.';
  if (typeof description !== 'string' || description.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description)) {
    errors.description = 'Mô tả tối đa 4.000 ký tự và không chứa ký tự điều khiển.';
  }
  if (Object.keys(errors).length) throw new CategoryError(errors);
  return { name, description: description.trim() || null };
}
module.exports = { CategoryError, categoryId, categoryInput };

const { CategoryError, categoryId, categoryInput } = require('../utils/admin-category-validation');

function createAdminCategoryService(repository) {
  async function write(run) {
    try { return await run(); }
    catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new CategoryError({ category_name: 'Tên danh mục đã tồn tại.' }, 409);
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new CategoryError({ general: 'Danh mục hoặc sản phẩm đang được cập nhật. Hãy tải lại trang rồi thử lại.' }, 409);
      throw error;
    }
  }
  return {
    async list(query) {
      if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 100 || /[\u0000-\u001f\u007f]/.test(query.q))) {
        throw new CategoryError({ general: 'Từ khóa danh mục không hợp lệ hoặc dài quá 100 ký tự.' }, 400);
      }
      const page = typeof query.page === 'string' && /^[1-9]\d{0,7}$/.test(query.page) ? Number(query.page) : 1;
      return repository.list((query.q || '').trim(), page);
    },
    async detail(value) { return repository.detail(categoryId(value)); },
    async save(value, body) {
      const id = value === undefined ? null : categoryId(value), data = categoryInput(body);
      return write(() => repository.save(id, data));
    },
    async remove(value, body) {
      const id = categoryId(value);
      if (body?.confirm_delete !== '1') throw new CategoryError({ general: 'Vui lòng chọn xác nhận xóa danh mục.' });
      return write(() => repository.remove(id));
    },
  };
}
module.exports = { createAdminCategoryService };

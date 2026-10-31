const { ProductError, id, productInput, variantInput, imageInput } = require('../utils/admin-product-validation');

function createAdminProductService(repository) {
  async function write(run) {
    try { return await run(); }
    catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new ProductError({ sku: 'Mã phiên bản đã tồn tại. Vui lòng dùng Mã phiên bản khác.' }, 409);
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new ProductError({ general: 'Dữ liệu đang được cập nhật. Tải lại trang và thử lại.' }, 409);
      throw error;
    }
  }
  return {
    categories: () => repository.categories(),
    list(query) {
      if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 200 || /[\u0000-\u001f\u007f]/.test(query.q))) {
        throw new ProductError({ general: 'Từ khóa không hợp lệ hoặc dài quá 200 ký tự.' }, 400);
      }
      const q = (query.q || '').trim();
      const page = typeof query.page === 'string' && /^[1-9]\d{0,7}$/.test(query.page) ? Number(query.page) : 1;
      return repository.list(q, page);
    },
    detail: value => repository.detail(id(value)),
    removeImage(product, kind, image, body) {
      const productId = id(product);
      if (!['cover', 'gallery', 'variant'].includes(kind)) throw new ProductError({ general: 'Loại ảnh không hợp lệ.' }, 404);
      const imageId = kind === 'cover' ? null : id(image);
      if (body?.confirm_delete !== '1') throw new ProductError({ general: 'Vui lòng xác nhận xóa ảnh.' });
      return write(() => repository.removeImage(productId, kind, imageId));
    },
    async removeProduct(value) {
      const productId = id(value);
      return write(() => repository.removeProduct(productId));
    },
    saveProduct(value, body, file, files = []) {
      const productId = value === undefined ? null : id(value);
      const data = productInput(body), variant = productId ? null : variantInput(body);
      let image = imageInput(file);
      if (!Array.isArray(files) || files.length > 9) throw new ProductError({ images: 'Chọn tối đa 9 ảnh bổ sung.' });
      let images;
      try { images = files.map(file => imageInput(file)); }
      catch (error) {
        if (error instanceof ProductError) throw new ProductError({ images: error.errors.image });
        throw error;
      }
      if (images.some(image => !image)) throw new ProductError({ images: 'Ảnh bổ sung không hợp lệ.' });
      // Khi tạo mới mà chỉ chọn bộ ảnh, dùng ảnh đầu làm ảnh đại diện.
      if (!productId && !image && images.length) image = images.shift();
      return write(() => repository.saveProduct(productId, data, variant, image, images));
    },
    saveVariant(product, variant, body, file) {
      const productId = id(product), variantId = variant === undefined ? null : id(variant);
      const data = variantInput(body, Boolean(variantId)), image = imageInput(file);
      return write(() => repository.saveVariant(productId, variantId, data, body, image));
    },
  };
}
module.exports = { createAdminProductService };

const { detectImageMime } = require('../utils/image-format');

class AdvertisementError extends Error {
  constructor(errors, status = 422) { super('Advertisement validation failed'); this.errors = errors; this.status = status; }
}
function advertisementId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) {
    throw new AdvertisementError({ general: 'Quảng cáo không tồn tại.' }, 404);
  }
  return Number(value);
}
// Chỉ cho phép liên kết nội bộ; không nhận javascript:, URL ngoài hoặc ký tự điều khiển.
function validTarget(value) {
  if (!value) return true;
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') || /[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith('//')) return false;
    return new URL(value, 'https://techzone.local').origin === 'https://techzone.local';
  } catch { return false; }
}
function createAdvertisementService(repository) {
  async function detail(value) {
    const row = await repository.detail(advertisementId(value));
    if (!row) throw new AdvertisementError({ general: 'Quảng cáo không tồn tại.' }, 404);
    return row;
  }
  return {
    list: () => repository.list(), detail,
    async save(value, body = {}, image, extraImages = []) {
      const id = value === undefined ? null : advertisementId(value);
      if (id) await detail(value);
      const errors = {};
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const target = typeof body.target_url === 'string' ? body.target_url.trim() : '';
      if (!title || title.length > 200 || /[\u0000-\u001f\u007f]/.test(title)) errors.title = 'Tiêu đề cần từ 1 đến 200 ký tự.';
      if ((body.target_url !== undefined && typeof body.target_url !== 'string') || !validTarget(target)) errors.target_url = 'Nhập đường dẫn nội bộ, ví dụ /products/1; tối đa 500 ký tự.';
      if (!['hero', 'promotion'].includes(body.position)) errors.position = 'Chọn vị trí quảng cáo hợp lệ.';
      if (typeof body.sort_order !== 'string' || !/^\d{1,10}$/.test(body.sort_order) || Number(body.sort_order) > 2147483647) errors.sort_order = 'Thứ tự phải là số nguyên từ 0 đến 2147483647.';
      if (body.is_active !== undefined && !['0', '1'].includes(body.is_active)) errors.is_active = 'Trạng thái không hợp lệ.';
      const mime = image && detectImageMime(image.data);
      if ((!id && !image) || (image && (!mime || image.data.length > 1024 * 1024)) || extraImages.length) errors.image = 'Chọn một ảnh JPEG, PNG, WebP, GIF, AVIF hoặc BMP, tối đa 1 MB.';
      if (Object.keys(errors).length) throw new AdvertisementError(errors);
      return repository.save(id, { title, target_url: target || null, position: body.position,
        sort_order: Number(body.sort_order), is_active: body.is_active === '1' ? 1 : 0,
        ...(image ? { image_data: image.data, image_mime_type: mime } : {}) });
    },
    async remove(value) {
      const id = advertisementId(value);
      if (!await repository.remove(id)) throw new AdvertisementError({ general: 'Quảng cáo không tồn tại.' }, 404);
    },
    async status(value, body = {}) {
      const id = advertisementId(value);
      if (!['0', '1'].includes(body.is_active)) throw new AdvertisementError({ general: 'Trạng thái không hợp lệ.' });
      if (!await repository.status(id, Number(body.is_active))) throw new AdvertisementError({ general: 'Quảng cáo không tồn tại.' }, 404);
    },
  };
}
module.exports = { createAdvertisementService, AdvertisementError, advertisementId, validTarget };

const { AdvertisementError, advertisementId } = require('../services/advertisement-service');
const { IMAGE_MIME_TYPES } = require('../utils/image-format');

function createAdvertisementController(service, repository) {
  const handle = run => async (req, res) => {
    try { return await run(req, res); }
    catch (error) {
      if (!(error instanceof AdvertisementError)) throw error;
      return res.status(error.status).render('admin/message', { title: 'Kiểm tra quảng cáo — TechZone', status: error.status, message: error.errors.general || 'Dữ liệu quảng cáo không hợp lệ.' });
    }
  };
  async function form(req, res, errors = {}, values, status = 200) {
    const advertisement = req.params.advertisementId ? await service.detail(req.params.advertisementId) : null;
    res.status(status).render('admin/advertisements/form', { title: 'Quảng cáo — TechZone', advertisement,
      errors, values: values || advertisement || { position: 'hero', sort_order: 0, is_active: 1 }, notice: req.query.saved === '1' ? 'Đã lưu quảng cáo.' : '' });
  }
  async function sendImage(req, res, activeOnly) {
    let id;
    try { id = advertisementId(req.params.advertisementId); } catch { return res.sendStatus(404); }
    const image = await repository.image(id, activeOnly);
    if (!image || !Buffer.isBuffer(image.image_data) || !image.image_data.length || !IMAGE_MIME_TYPES.includes(image.image_mime_type)) return res.sendStatus(404);
    res.set({ 'Content-Type': image.image_mime_type, 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Cache-Control': 'no-store' });
    return res.send(image.image_data);
  }
  return {
    list: handle(async (req, res) => res.render('admin/advertisements/index', { title: 'Quảng cáo — TechZone', advertisements: await service.list(), notice: req.query.notice === 'deleted' ? 'Đã xóa quảng cáo.' : req.query.notice === 'status' ? 'Đã cập nhật trạng thái.' : '' })),
    form: handle((req, res) => form(req, res)),
    save: handle(async (req, res) => {
      try {
        const id = await service.save(req.params.advertisementId, req.body, req.productImage, req.productImages);
        return res.redirect(303, `/admin/advertisements/${id}/edit?saved=1`);
      } catch (error) {
        if (!(error instanceof AdvertisementError) || error.status === 404) throw error;
        return form(req, res, error.errors, req.body, error.status);
      }
    }),
    remove: handle(async (req, res) => { await service.remove(req.params.advertisementId); res.redirect(303, '/admin/advertisements?notice=deleted'); }),
    status: handle(async (req, res) => { await service.status(req.params.advertisementId, req.body); res.redirect(303, '/admin/advertisements?notice=status'); }),
    image: (req, res) => sendImage(req, res, true),
    adminImage: (req, res) => sendImage(req, res, false),
  };
}
module.exports = { createAdvertisementController };

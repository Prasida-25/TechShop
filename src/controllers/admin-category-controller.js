const { CategoryError } = require('../utils/admin-category-validation');

function createAdminCategoryController(service) {
  const handle = run => async (req, res) => {
    try { return await run(req, res); }
    catch (error) {
      if (!(error instanceof CategoryError)) throw error;
      return res.status(error.status).render('admin/message', { title: 'Kiểm tra danh mục — TechZone', status: error.status, message: error.errors.general || 'Không thể thực hiện yêu cầu.' });
    }
  };
  async function form(req, res, errors = {}, values, status = 200) {
    const category = req.params.categoryId ? await service.detail(req.params.categoryId) : null;
    return res.status(status).render('admin/categories/form', { title: category ? 'Sửa danh mục — TechZone' : 'Thêm danh mục — TechZone', category,
      errors, values: values || category || {}, notice: req.query.saved === '1' ? 'Đã lưu danh mục.' : '' });
  }
  return {
    list: handle(async (req, res) => res.render('admin/categories/index', { title: 'Danh mục — TechZone', ...await service.list(req.query), notice: req.query.deleted === '1' ? 'Đã xóa danh mục.' : '' })),
    form: handle((req, res) => form(req, res)),
    save: handle(async (req, res) => {
      try {
        const id = await service.save(req.params.categoryId, req.body);
        return res.redirect(303, `/admin/categories/${id}/edit?saved=1`);
      } catch (error) {
        if (!(error instanceof CategoryError) || error.status === 404 || error.errors.general) throw error;
        return form(req, res, error.errors, req.body, error.status);
      }
    }),
    remove: handle(async (req, res) => {
      await service.remove(req.params.categoryId, req.body);
      return res.redirect(303, '/admin/categories?deleted=1');
    }),
  };
}
module.exports = { createAdminCategoryController };

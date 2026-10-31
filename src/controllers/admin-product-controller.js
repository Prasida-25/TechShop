const { ProductError } = require('../utils/admin-product-validation');
const { priceUnits, money } = require('../utils/cart-validation');

function createAdminProductController(service) {
  function message(res, error) {
    return res.status(error.status).render('admin/message', { title: 'Kiểm tra sản phẩm — TechZone', status: error.status,
      message: error.errors.general || 'Không thể thực hiện yêu cầu.' });
  }
  function handle(run) {
    return async (req, res) => {
      try { return await run(req, res); }
      catch (error) { if (error instanceof ProductError) return message(res, error); throw error; }
    };
  }
  async function productForm(req, res, errors = {}, values, status = 200) {
    const product = req.params.productId ? await service.detail(req.params.productId) : null;
    res.status(status).render('admin/products/form', { title: product ? 'Sửa sản phẩm — TechZone' : 'Thêm sản phẩm — TechZone',
      product, categories: await service.categories(), errors, values: values || product || { variant_name: 'Mặc định', stock: '0', category_id: '' },
      notice: req.query.image_deleted === '1' ? 'Đã xóa ảnh.' : req.query.saved === '1' ? 'Đã lưu sản phẩm hoặc biến thể.' : '',
      priceLabel: value => { const units = priceUnits(value); return units === null ? 'Giá không hợp lệ' : money(units); } });
  }
  async function variantForm(req, res, errors = {}, values, status = 200) {
    const product = await service.detail(req.params.productId);
    const variant = req.params.variantId ? product.variants.find(v => String(v.variant_id) === req.params.variantId) : null;
    if (req.params.variantId && !variant) throw new ProductError({ general: 'Biến thể không tồn tại hoặc không thuộc sản phẩm này.' }, 404);
    const initial = variant ? { ...variant, expected_stock: variant.stock } : { stock: '0' };
    if (variant) for (const row of product.options) {
      if (product.links.some(link => link.variant_id === variant.variant_id && link.option_value_id === row.option_value_id)) initial['option_' + row.option_id] = row.option_value_id;
    }
    res.status(status).render('admin/products/variant', { title: variant ? 'Sửa biến thể — TechZone' : 'Thêm biến thể — TechZone',
      product, variant, errors, values: values || initial });
  }
  return {
    removeImage: handle(async (req, res) => {
      const kind = req.params.variantId ? 'variant' : req.params.imageId ? 'gallery' : 'cover';
      await service.removeImage(req.params.productId, kind, req.params.variantId || req.params.imageId, req.body);
      return res.redirect(303, `/admin/products/${req.params.productId}/edit?image_deleted=1`);
    }),
    list: handle(async (req, res) => res.render('admin/products/index', { title: 'Sản phẩm — TechZone', ...await service.list(req.query), notice: req.query.deleted === '1' ? 'Đã xóa sản phẩm và các dòng giỏ hàng liên quan.' : '' })),
    removeProduct: handle(async (req, res) => {
      await service.removeProduct(req.params.productId);
      return res.redirect(303, '/admin/products?deleted=1');
    }),
    newProduct: handle((req, res) => productForm(req, res)),
    editProduct: handle((req, res) => productForm(req, res)),
    saveProduct: handle(async (req, res) => {
      try {
        const id = await service.saveProduct(req.params.productId, req.body, req.productImage, req.productImages);
        return res.redirect(303, `/admin/products/${id}/edit?saved=1`);
      } catch (error) {
        if (!(error instanceof ProductError) || error.status === 404) throw error;
        return productForm(req, res, error.errors, req.body, error.status);
      }
    }),
    newVariant: handle((req, res) => variantForm(req, res)),
    editVariant: handle((req, res) => variantForm(req, res)),
    saveVariant: handle(async (req, res) => {
      try {
        await service.saveVariant(req.params.productId, req.params.variantId, req.body, req.productImage);
        return res.redirect(303, `/admin/products/${req.params.productId}/edit?saved=1`);
      } catch (error) {
        if (!(error instanceof ProductError) || error.status === 404) throw error;
        return variantForm(req, res, error.errors, req.body, error.status);
      }
    }),
  };
}
module.exports = { createAdminProductController };

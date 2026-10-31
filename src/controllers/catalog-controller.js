const path = require('node:path');
const { IMAGE_MIME_TYPES } = require('../utils/image-format');
const { positiveId, invalid, parseCatalogQuery, catalogUrl, formatMoney } = require('../utils/catalog-query');
const { validTarget } = require('../services/advertisement-service');

function createCatalogController(repository, advertisementRepository, reviewRepository) {
  const helpers = { catalogUrl, formatMoney };

  async function home(req, res) {
    const categories = await repository.getCategories();
    const { suggestions } = await repository.getHomeProducts();
    const advertisements = advertisementRepository ? await advertisementRepository.home() : { hero: [], promotion: [] };
    res.render('catalog/home', { ...helpers, title: 'TechZone', categories, suggestions, advertisements, validTarget, filters: {} });
  }

  async function list(req, res) {
    const filters = parseCatalogQuery(req.query);
    const categories = await repository.getCategories();
    if (filters.categoryId && !categories.some((c) => Number(c.category_id) === filters.categoryId)) {
      throw invalid('Danh mục không tồn tại. Vui lòng chọn danh mục khác.');
    }
    const result = await repository.getProducts(filters);
    filters.page = result.page;
    res.render('catalog/products', {
      ...helpers, ...result, title: filters.q ? `Tìm kiếm: ${filters.q} — TechZone` : 'Sản phẩm — TechZone',
      categories, filters,
    });
  }

  async function detail(req, res) {
    const id = positiveId(req.params.id);
    if (!id) throw invalid('ID sản phẩm không hợp lệ.');
    const product = await repository.getProduct(id);
    if (!product) {
      return res.status(404).render('catalog/message', {
        title: 'Không tìm thấy sản phẩm — TechZone', status: 404,
        message: 'Sản phẩm không tồn tại.', filters: {},
      });
    }
    let selected = product.variants.find((v) => Number(v.stock) > 0) || product.variants[0] || null;
    if (req.query.variant !== undefined) {
      const variantId = positiveId(req.query.variant);
      selected = product.variants.find((v) => Number(v.variant_id) === variantId);
      if (!variantId || !selected) throw invalid('Biến thể không hợp lệ hoặc không thuộc sản phẩm này.');
    }
    const productReviews = reviewRepository ? await reviewRepository.list(id, 1) : { reviews: [], total: 0 };
    res.render('catalog/detail', {
      ...helpers, title: `${product.product_name} — TechZone`, product, selected, productReviews, filters: {},
    });
  }

  async function image(req, res) {
    const id = positiveId(req.params.id);
    const variantId = req.params.variantId === undefined ? null : positiveId(req.params.variantId);
    const imageId = req.params.imageId === undefined ? null : positiveId(req.params.imageId);
    if (!id || (req.params.variantId !== undefined && !variantId) || (req.params.imageId !== undefined && !imageId)) throw invalid('ID ảnh không hợp lệ.');
    const image = await repository.getImage(id, variantId, imageId);
    if (!image) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).sendFile(path.join(__dirname, '..', '..', 'public', 'images', 'product-placeholder.svg'));
    }
    const allowed = IMAGE_MIME_TYPES;
    const mime = String(image.image_mime_type || '').trim().toLowerCase();
    if (!Buffer.isBuffer(image.image_data) || !image.image_data.length || !allowed.includes(mime)) {
      res.set('Cache-Control', 'no-store');
      return res.redirect(variantId ? `/products/${id}/image` : '/images/product-placeholder.svg');
    }
    res.set({
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      // Session có thể đặt cookie trên response; không cache dùng chung giữa người dùng.
      'Cache-Control': 'private, max-age=60',
    });
    res.send(image.image_data);
  }

  return { home, list, detail, image };
}

module.exports = { createCatalogController };

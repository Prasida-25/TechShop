const { PRODUCT_SQL: SQL } = require('../../src/repositories/admin-product-repository');

// Fake SQL adapter, không mở connection MySQL thật. Transaction snapshot để test rollback.
function createProductDatabase() {
  const state = { categories: [{ category_id: 1, category_name: 'Phụ kiện TEST' }], products: [], variants: [], images: [], options: [], links: [], orderItems: [], reviews: [], carts: [], calls: [], fail: '' };
  let productId = 0, variantId = 0, imageId = 0;
  const clone = value => structuredClone(value);
  const duplicate = () => Object.assign(new Error('Fixture duplicate'), { code: 'ER_DUP_ENTRY' });
  const hasOrders = id => Number(state.orderItems.some(item => item.product_id === id || state.variants.some(v => v.product_id === id && v.variant_id === item.variant_id)));
  async function execute(sql, p = []) {
    state.calls.push({ sql, params: p });
    if (sql === SQL.categories) return [clone(state.categories)];
    if (sql === SQL.category) return [clone(state.categories.filter(c => c.category_id === p[0]))];
    if (sql === SQL.own) return [clone(state.products.filter(x => x.product_id === p[0]).map(x => ({ ...x, has_image: Number(Boolean(x.image_data?.length)), has_orders: hasOrders(x.product_id) })))];
    if (sql === SQL.lockProduct) return [clone(state.products.filter(x => x.product_id === p[0]))];
    if (sql === SQL.lockVariants) return [clone(state.variants.filter(v => v.product_id === p[0]))];
    if (sql === SQL.orderedProduct) return [clone(state.orderItems.filter(i => i.product_id === p[0]).slice(0, 1))];
    if (sql === SQL.orderedVariant) return [clone(state.orderItems.filter(i => state.variants.some(v => v.product_id === p[0] && v.variant_id === i.variant_id)).slice(0, 1))];
    if (sql === SQL.reviewed) return [clone(state.reviews.filter(r => r.product_id === p[0]).slice(0, 1))];
    if (sql === SQL.images) return [clone(state.images.filter(i => i.product_id === p[0]).map(({ image_id, sort_order }) => ({ image_id, sort_order })))];
    if (sql === SQL.removeImage) {
      if (state.fail === 'removeImage') throw new Error('TEST_IMAGE_DELETE');
      const before = state.images.length;
      state.images = state.images.filter(i => i.product_id !== p[0] || i.image_id !== p[1]);
      return [{ affectedRows: before - state.images.length }];
    }
    if (sql === SQL.clearProductImage || sql === SQL.clearVariantImage) {
      if (state.fail === 'removeImage') throw new Error('TEST_IMAGE_DELETE');
      const row = sql === SQL.clearProductImage ? state.products.find(x => x.product_id === p[0])
        : state.variants.find(x => x.product_id === p[0] && x.variant_id === p[1]);
      if (!row || row.image_data == null) return [{ affectedRows: 0 }];
      row.image_data = null; row.image_mime_type = null;
      return [{ affectedRows: 1 }];
    }
    if (sql === SQL.addImage) {
      if (state.fail === 'image' || (state.fail === 'secondImage' && state.images.length === 1)) throw new Error('TEST_IMAGE_INSERT');
      const image = { image_id: ++imageId, product_id: p[0], image_data: p[1], image_mime_type: p[2], sort_order: p[3] };
      state.images.push(image); return [{ insertId: image.image_id }];
    }
    if (sql === SQL.removeProduct) {
      if (state.fail === 'remove') throw new Error('PRIVATE_SQL_FIXTURE');
      const ids = new Set(state.variants.filter(v => v.product_id === p[0]).map(v => v.variant_id));
      const options = new Set(state.options.filter(o => o.product_id === p[0]).map(o => o.option_value_id));
      const before = state.products.length;
      state.products = state.products.filter(x => x.product_id !== p[0]);
      state.images = state.images.filter(x => x.product_id !== p[0]);
      state.variants = state.variants.filter(v => !ids.has(v.variant_id));
      state.options = state.options.filter(o => o.product_id !== p[0]);
      state.links = state.links.filter(l => !ids.has(l.variant_id) && !options.has(l.option_value_id));
      state.carts = state.carts.filter(c => !ids.has(c.variant_id));
      return [{ affectedRows: before - state.products.length }];
    }
    if (sql === SQL.variants) return [clone(state.variants.filter(x => x.product_id === p[0]).map(x => ({ ...x, has_image: Number(Boolean(x.image_data?.length)) })))];
    if (sql === SQL.options) return [clone(state.options.filter(x => x.product_id === p[0]))];
    if (sql === SQL.links) return [clone(state.links.filter(x => state.variants.some(v => v.product_id === p[0] && v.variant_id === x.variant_id)))];
    if (sql === SQL.variant) return [clone(state.variants.filter(v => v.product_id === p[0] && v.variant_id === p[1]))];
    if (/^SELECT COUNT\(\*\) total FROM products/.test(sql)) return [[{ total: state.products.length }]];
    if (/^SELECT p.product_id,p.product_name/.test(sql)) return [clone(state.products.map(p => ({ ...p, has_orders: hasOrders(p.product_id), category_name: 'Phụ kiện TEST', variant_count: state.variants.filter(v => v.product_id === p.product_id).length })))];
    if (sql === SQL.create) {
      const row = { product_id: ++productId, product_name: p[0], category_id: p[1], brand: p[2], description: p[3], image_data: p[4], image_mime_type: p[5] };
      state.products.push(row); return [{ insertId: row.product_id }];
    }
    if (sql === SQL.update) {
      const row = state.products.find(x => x.product_id === p[8]);
      Object.assign(row, { product_name: p[0], category_id: p[1], brand: p[2], description: p[3] });
      if (p[4]) { row.image_data = p[5]; row.image_mime_type = p[7]; } return [{ affectedRows: 1 }];
    }
    if (sql === SQL.addVariant || sql === SQL.updateVariant) {
      const adding = sql === SQL.addVariant, sku = p[adding ? 2 : 1];
      if (state.variants.some(v => v.sku.toLowerCase() === sku.toLowerCase() && (adding || v.variant_id !== p[9]))) throw duplicate();
      if (state.fail === 'variant') throw new Error('PRIVATE_SQL_FIXTURE');
      if (adding) {
        const v = { variant_id: ++variantId, product_id: p[0], variant_name: p[1], sku: p[2], price: p[3], stock: p[4], image_data: p[5], image_mime_type: p[6] };
        state.variants.push(v); return [{ insertId: v.variant_id }];
      }
      const v = state.variants.find(x => x.product_id === p[8] && x.variant_id === p[9]);
      Object.assign(v, { variant_name: p[0], sku: p[1], price: p[2], stock: p[3] });
      if (p[4]) { v.image_data = p[5]; v.image_mime_type = p[7]; } return [{ affectedRows: 1 }];
    }
    if (sql === SQL.clearLinks) { state.links = state.links.filter(x => x.variant_id !== p[0]); return [{ affectedRows: 1 }]; }
    if (sql === SQL.addLink) {
      if (state.fail === 'link') throw new Error('PRIVATE_SQL_FIXTURE');
      state.links.push({ variant_id: p[0], option_value_id: p[1] }); return [{ affectedRows: 1 }];
    }
    throw new Error('Unhandled fixture SQL');
  }
  return { state, execute, async getConnection() {
    let snapshot;
    return { execute,
      async beginTransaction() { state.calls.push({ sql: 'begin' }); snapshot = clone({ products: state.products, variants: state.variants, images: state.images, options: state.options, links: state.links, carts: state.carts }); },
      async commit() { if (state.fail === 'commit') throw new Error('TEST_BEFORE_COMMIT'); state.calls.push({ sql: 'commit' }); },
      async rollback() { state.calls.push({ sql: 'rollback' }); Object.assign(state, snapshot); },
      release() { state.calls.push({ sql: 'release' }); },
    };
  } };
}
module.exports = { createProductDatabase };

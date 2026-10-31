const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { createApp } = require('../src/app');
const { parseCatalogQuery, catalogUrl, positiveId } = require('../src/utils/catalog-query');
const { createCatalogRepository } = require('../src/repositories/catalog-repository');
const fixtures = require('./helpers/catalog-fixtures.cjs');

async function withServer(repository, callback, reviewRepository) {
  const server = createApp({ catalogRepository: repository, reviewRepository }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function fakeRepository() {
  const product = {
    ...fixtures.products[0], category_name: 'Tai nghe',
    variants: fixtures.variants.filter((v) => v.product_id === 1),
    options: [
      { variant_id: 11, option_id: 1, option_name: 'Màu', option_value_id: 101, value_name: 'Đen' },
      { variant_id: 12, option_id: 1, option_name: 'Màu', option_value_id: 102, value_name: 'Trắng' },
    ],
  };
  const card = { ...fixtures.products[0], min_price: '100.00', max_price: '200.00', variant_count: 2, total_stock: 5, sold_count: 5 };
  return {
    getCategories: async () => fixtures.categories,
    getHomeProducts: async () => ({ suggestions: [card] }),
    getProducts: async (filters) => ({ products: filters.q === 'missing' ? [] : [card], total: filters.q === 'missing' ? 0 : 12, totalPages: filters.q === 'missing' ? 0 : 2, page: Math.min(filters.page, 2) }),
    getProduct: async (id) => id === 1 ? product : id === 3 ? { ...product, product_id: 3, variants: [], options: [] } : null,
    getImage: async (id, variantId) => id === 1 && variantId !== 99
      ? { image_data: variantId === 12 ? null : fixtures.png, image_mime_type: 'image/png' } : null,
  };
}

test('Chuẩn hóa query: ID, giá, trang, limit, ký tự đặc biệt và allowlist sort', () => {
  assert.equal(positiveId('1'), 1);
  for (const value of ['0', '-1', '1x', '2147483648', ['1']]) assert.equal(positiveId(value), null);
  assert.equal(parseCatalogQuery({ q: '  Tai   nghe  ' }).q, 'Tai nghe');
  assert.equal(parseCatalogQuery({ q: "100% _ \\ '" }).q, "100% _ \\ '");
  assert.equal(parseCatalogQuery({ q: '' }).q, '');
  assert.throws(() => parseCatalogQuery({ 'q[]': 'one' }), (error) => error.status === 400);
  for (const page of ['-1', 'abc', '0', '1.5', '999999999999']) assert.equal(parseCatalogQuery({ page }).page, 1);
  assert.equal(parseCatalogQuery({ limit: '999' }).limit, 40);
  for (const input of [{ category_id: 'x' }, { min_price: '-1' }, { min_price: '2', max_price: '1' },
    { max_price: 'NaN' }, { min_price: '1e3' }, { q: ['one', 'two'] }, { q: 'x'.repeat(201) },
    { q: '\u0000' }, { sort: 'p.price; DROP TABLE products' }, { sort: 'toString' }]) {
    assert.throws(() => parseCatalogQuery(input), (error) => error.status === 400);
  }
  const url = new URL(catalogUrl(parseCatalogQuery({ q: 'Tai nghe', category_id: '1', min_price: '0', max_price: '200', sort: 'price_desc' }), { page: 2 }), 'http://local');
  assert.equal(url.pathname, '/products/search');
  for (const [name, value] of Object.entries({ q: 'Tai nghe', category_id: '1', min_price: '0', max_price: '200', sort: 'price_desc', page: '2' })) assert.equal(url.searchParams.get(name), value);
});

test('HTTP giả lập: trang chủ, danh sách, tìm kiếm, lọc, phân trang và escape HTML', async () => {
  await withServer(fakeRepository(), async (base) => {
    const home = await fetch(base);
    const html = await home.text();
    assert.equal(home.status, 200);
    assert.match(html, /GỢI Ý HÔM NAY/);
    assert.doesNotMatch(html, /BÁN CHẠY|bestsellers-heading/);
    assert.match(html, /Tai nghe Đen Trắng/);
    assert.match(html, /5 đã bán/);
    assert.match(html, /class="home-product-item__price-new">100đ<\/span>/);
    assert.doesNotMatch(html, /Từ 100đ/);
    assert.doesNotMatch(html, /3k\+|3\.300\.000|home-product-item__rating|home-product-item__sale-off/);
    const list = await fetch(`${base}/products/search?q=Tai+nghe&category_id=1&min_price=0&max_price=200&sort=price_asc&page=999`);
    const listHtml = await list.text();
    assert.equal(list.status, 200);
    assert.match(listHtml, /class="home-product-item__price-new">100đ<\/span>/);
    assert.doesNotMatch(listHtml, /\d+ sản phẩm phù hợp| · Trang \d+\/\d+/);
    assert.match(listHtml, /aria-current="page"[^>]*>2<\/a>/);
    assert.match(listHtml, /q=Tai\+nghe&amp;category_id=1&amp;min_price=0&amp;max_price=200&amp;sort=price_asc/);
    assert.match(await (await fetch(`${base}/products/search?q=missing`)).text(), /Không tìm thấy sản phẩm phù hợp/);
    assert.equal((await fetch(`${base}/products/search?q=`)).status, 200);
    const xss = await (await fetch(`${base}/products/search?q=${encodeURIComponent('<script>alert(1)</script>')}`)).text();
    assert.match(xss, /&lt;script&gt;/);
    assert.doesNotMatch(xss, /<script>alert/);
    for (const route of ['/products?category_id=999', '/products?category_id=x', '/products?min_price=-1', '/products?sort=DROP', '/products/search?q=a&q=b']) {
      assert.equal((await fetch(base + route)).status, 400);
    }
  });
});

test('HTTP giả lập: chi tiết chọn đúng giá, tồn kho, thuộc tính và SKU của biến thể', async () => {
  await withServer(fakeRepository(), async (base) => {
    const white = await (await fetch(base + '/products/1')).text();
    assert.match(white, /id="variant-price">200đ/);
    assert.match(white, /Còn hàng \(5\)/);
    assert.match(white, /WHITE/);
    assert.match(white, /Màu: Trắng/);
    assert.match(white, /&lt;b&gt;Mô tả dạng văn bản&lt;\/b&gt;/);
    assert.match(white, /\/products\/1\/variants\/12\/image/);
    assert.match(white, /action="\/cart\/items"/);
    assert.match(white, /name="variant_id" value="12"/);
    assert.match(white, /name="returnTo" value="\/products\/1\?variant=12"/);
    assert.match(white, /name="_csrf" value="[a-f0-9]+"/);
    assert.match(white, /href="\/css\/product-detail.css"/);
    assert.match(white, /id="product-main-image"/);
    assert.equal((white.match(/data-gallery-image/g) || []).length, 3);
    assert.match(white, /data-quantity-step="-1"/);
    assert.match(white, /data-quantity-step="1"/);
    assert.match(white, /type="submit" class="btn product-buy-button" formaction="\/cart\/buy-now"/);
    for (const heading of ['Chi tiết sản phẩm', 'Mô tả sản phẩm', 'Đánh giá của người mua']) assert.ok(white.includes(heading));
    assert.doesNotMatch(white, /Thông số kỹ thuật|Thông tin bảo hành/);
    assert.match(white, /Chưa có đánh giá cho sản phẩm này/);
    assert.ok(white.indexOf('id="product-reviews"') > white.indexOf('id="product-description-heading"'));
    const black = await (await fetch(base + '/products/1?variant=11')).text();
    assert.match(black, /id="variant-price">100đ/);
    assert.match(black, /id="variant-stock">Hết hàng/);
    assert.match(black, /BLACK/);
    assert.doesNotMatch(black, /action="\/cart\/items"/);
    for (const path of ['/products/1?variant=99', '/products/1?variant=abc', '/products/abc', '/products/-1']) assert.equal((await fetch(base + path)).status, 400);
    const missing = await fetch(base + '/products/999');
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Sản phẩm không tồn tại/);
    const noVariants = await (await fetch(base + '/products/3')).text();
    assert.match(noVariants, /Chưa có biến thể hợp lệ. Chưa có giá bán/);
    assert.doesNotMatch(noVariants, /id="variant-price"/);
  });
});

test('Chi tiết: đánh giá thật từ repository sau mô tả, escape nhận xét và liên kết xem thêm', async () => {
  const calls = [];
  const reviewRepository = { list: async (id, page) => {
    calls.push([id,page]);
    return { total:21, reviews:[{buyer_name:'Người mua <TEST>',rating:5,comment:'Tốt <script>alert(1)</script>\nDòng hai',created_at_label:'26/10/2026 10:00'},
      {rating:4,comment:null,created_at_label:'25/10/2026 10:00'}] };
  } };
  await withServer(fakeRepository(),async base=>{
    const response=await fetch(base+'/products/1'); const html=await response.text();
    assert.equal(response.status,200);assert.deepEqual(calls,[[1,1]]);
    assert.doesNotMatch(html,/<p>21 đánh giá<\/p>/);assert.match(html,/5 trên 5 sao/);
    assert.match(html,/Người mua &lt;TEST&gt;/);
    const reviewSection = html.slice(html.indexOf('id="product-reviews"'));
    assert.equal((reviewSection.match(/class="is-filled"/g)||[]).length,9);
    assert.equal((reviewSection.match(/aria-hidden="true">★/g)||[]).length,10);
    assert.match(html,/Tốt &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html,/<script>alert\(1\)/);
    assert.match(html,/Không có nội dung nhận xét/);
    assert.match(html,/href="\/products\/1\/reviews">Xem tất cả đánh giá/);
    assert.ok(html.indexOf('id="product-description-heading"')<html.indexOf('id="product-reviews"'));
    const before=calls.length;
    assert.equal((await fetch(base+'/products/999')).status,404);
    assert.equal(calls.length,before);
  },reviewRepository);
});

test('HTTP giả lập: ảnh BLOB, cache, fallback, MIME không an toàn và ảnh sai ID', async () => {
  const repo = fakeRepository();
  const original = repo.getImage;
  repo.getImage = async (id, variant) => id === 2
    ? { image_data: Buffer.from('<script>private</script>'), image_mime_type: 'text/html' } : original(id, variant);
  await withServer(repo, async (base) => {
    const image = await fetch(base + '/products/1/image');
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), fixtures.png);
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(image.headers.get('cache-control'), 'private, max-age=60');
    const cached = await fetch(base + '/products/1/image', { headers: { 'If-None-Match': image.headers.get('etag'), 'Cache-Control': 'max-age=0' } });
    assert.equal(cached.status, 304);
    const fallback = await fetch(base + '/products/1/variants/12/image', { redirect: 'manual' });
    assert.equal(fallback.headers.get('location'), '/products/1/image');
    const unsafe = await fetch(base + '/products/2/image', { redirect: 'manual' });
    assert.equal(unsafe.headers.get('location'), '/images/product-placeholder.svg');
    for (const route of ['/products/999/image', '/products/1/variants/99/image']) assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await fetch(base + '/products/x/image')).status, 400);
    for (const asset of ['/css/catalog.css', '/css/product-detail.css', '/css/header%20%26%20footer.css', '/images/Banner_home.png', '/fonts/Inter.ttf', '/fonts/fontawesome/webfonts/fa-solid-900.woff2', '/js/product-details.js', '/images/product-placeholder.svg']) assert.equal((await fetch(base + asset)).status, 200);
  });
});

test('Chi tiết không hiển thị giá 0 hoặc form mua khi phiên bản chưa có giá hợp lệ', async () => {
  const repo = fakeRepository();
  const original = repo.getProduct;
  repo.getProduct = async (id) => {
    const product = await original(id);
    return product ? { ...product, variants: product.variants.map(v => ({ ...v, price: '0.00' })) } : null;
  };
  await withServer(repo, async (base) => {
    const response = await fetch(base + '/products/1');
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Phiên bản chưa có giá bán hợp lệ/);
    assert.doesNotMatch(html, /id="variant-price"|action="\/cart\/items"/);
    assert.doesNotMatch(html, /đã bán|[0-9] sao/);
  });
});

test('Bộ ảnh catalog: render thumbnail, endpoint đúng product/image, MIME/cache và ID lỗi (mock DB, HTTP thật)', async () => {
  const repo = fakeRepository();
  const getProduct = repo.getProduct, getImage = repo.getImage;
  repo.getProduct = async (id) => { const p = await getProduct(id); return p ? { ...p, images: [{ image_id: 123 }] } : null; };
  repo.getImage = async (productId, variantId, imageId) => imageId
    ? productId === 1 && imageId === 123 ? { image_data: fixtures.png, image_mime_type: 'image/png' } : null
    : getImage(productId, variantId);
  await withServer(repo, async (base) => {
    const html = await (await fetch(base + '/products/1')).text();
    assert.match(html, /href="\/products\/1\/images\/123" data-gallery-image/);
    const image = await fetch(base + '/products/1/images/123');
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), fixtures.png);
    assert.equal((await fetch(base + '/products/2/images/123')).status, 404);
    assert.equal((await fetch(base + '/products/1/images/999')).status, 404);
    assert.equal((await fetch(base + '/products/1/images/bad')).status, 400);
  });
});

test('Endpoint ảnh phục vụ đúng MIME và bytes cho JPEG/WebP/GIF/AVIF/BMP/PNG', async () => {
  const formats = { png:fixtures.png, ...require('./helpers/image-fixtures.cjs') };
  const repo = fakeRepository();
  let current = 'png';
  repo.getImage = async () => ({ image_data:formats[current], image_mime_type:'image/'+current });
  await withServer(repo, async (base) => {
    for (const format of Object.keys(formats)) {
      current = format;
      const response = await fetch(base+'/products/1/image');
      assert.equal(response.status,200);
      assert.equal(response.headers.get('content-type'),'image/'+format);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),formats[format]);
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    }
  });
});

test('Repository ảnh bổ sung: SELECT theo cả product_id/image_id; đọc danh sách không lấy BLOB', async () => {
  const calls = [];
  const repo = createCatalogRepository({ execute: async (sql, params) => { calls.push({ sql, params }); return [[]]; } });
  await repo.getImage(1, null, 123);
  assert.match(calls[0].sql, /WHERE product_id=\? AND image_id=\?/);
  assert.deepEqual(calls[0].params, [1,123]);
  const noTable = createCatalogRepository({ execute: async () => { throw Object.assign(new Error('fixture'), { code:'ER_NO_SUCH_TABLE' }); } });
  assert.equal(await noTable.getImage(1, null, 123), null);
});

test('HTTP giả lập: dữ liệu rỗng và lỗi tải không lộ SQL', async () => {
  const repo = fakeRepository();
  repo.getCategories = async () => [];
  repo.getHomeProducts = async () => ({ suggestions: [] });
  repo.getProducts = async () => ({ products: [], total: 0, totalPages: 0, page: 1 });
  await withServer(repo, async (base) => {
    const html = await (await fetch(base)).text();
    assert.match(html, /Chưa có sản phẩm/);
    assert.doesNotMatch(html, /BÁN CHẠY|Chưa có dữ liệu sản phẩm bán chạy/);
    const list = await (await fetch(base + '/products')).text();
    assert.doesNotMatch(list, /Trang 1\/0/);
    repo.getProducts = async () => { throw new Error('SELECT secret FROM private_database'); };
    const error = await fetch(base + '/products');
    assert.equal(error.status, 500);
    const errorHtml = await error.text();
    assert.match(errorHtml, /Đã xảy ra lỗi máy chủ/);
    assert.doesNotMatch(errorHtml, /SELECT|secret|private_database/);
  });
});

test('JavaScript chọn biến thể gửi lại form để server đọc giá, chạy được khi không có select', () => {
  const source = readFileSync('public/js/product-details.js', 'utf8');
  let change, submitted = 0;
  vm.runInNewContext(source, { document: { querySelector: () => null, getElementById: (id) => id === 'variant-select'
    ? { addEventListener: (name, handler) => { assert.equal(name, 'change'); change = handler; } }
    : { requestSubmit: () => submitted++ } } });
  change(); assert.equal(submitted, 1);
  vm.runInNewContext(source, { document: { querySelector: () => null, getElementById: () => null } });
});

test('JavaScript chi tiết: thư viện ảnh, số lượng có giới hạn và input không hợp lệ', () => {
  const source = readFileSync('public/js/product-details.js', 'utf8');
  const image = {};
  function button(step) {
    return { dataset: { quantityStep: String(step) }, addEventListener(name, handler) { this[name] = handler; } };
  }
  const down = button(-1), up = button(1);
  const quantity = { value: '1', min: '1', max: '2',
    checkValidity: () => Number.isInteger(Number(quantity.value)) && Number(quantity.value) >= 1 && Number(quantity.value) <= 2,
    reportValidity() { this.reported = true; }, addEventListener(name, handler) { this[name] = handler; } };
  const thumbs = ['a', 'b'].map((name) => ({ href: `/products/1/${name}/image`,
    querySelector: () => ({ alt: name }), setAttribute(key, value) { this[key] = value; },
    addEventListener(event, handler) { this[event] = handler; } }));
  const page = { classList: { add() {} }, querySelectorAll: (selector) => selector === '[data-gallery-image]' ? thumbs : [down, up] };
  vm.runInNewContext(source, { document: { querySelector: () => page,
    getElementById: (id) => id === 'product-main-image' ? image : id === 'cart-quantity' ? quantity : null } });
  let prevented = false;
  thumbs[1].click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(image.src, thumbs[1].href);
  assert.equal(image.alt, 'b');
  assert.equal(thumbs[0]['aria-current'], 'false');
  assert.equal(thumbs[1]['aria-current'], 'true');
  thumbs[0].click({ ctrlKey: true });
  assert.equal(image.src, thumbs[1].href);
  assert.equal(down.disabled, true);
  up.click(); assert.equal(quantity.value, '2'); assert.equal(up.disabled, true);
  up.click(); assert.equal(quantity.value, '2');
  down.click(); assert.equal(quantity.value, '1');
  for (const value of ['0', '-1', '1.5', '3', 'abc']) {
    quantity.value = value; quantity.input();
    assert.equal(up.disabled, true); assert.equal(down.disabled, true);
    up.click(); assert.equal(quantity.value, value); assert.equal(quantity.reported, true);
  }
});

test('Repository chỉ SELECT: escape LIKE, không SELECT BLOB trong danh sách và sắp xếp từ allowlist', async () => {
  const calls = [];
  const repo = createCatalogRepository({ execute: async (sql, params = []) => {
    calls.push({ sql, params });
    return /SELECT COUNT\(\*\) AS total FROM products/.test(sql) ? [[{ total: 25 }]] : [[]];
  } });
  await repo.getProducts(parseCatalogQuery({ q: "100% _ \\ '", min_price: '0', max_price: '200', sort: 'price_desc', page: '99', limit: '10' }));
  const list = calls.at(-1);
  assert.equal(list.params[0], "%100!% !_ \\ '%");
  assert.match(list.sql, /LIMIT 10 OFFSET 20/);
  assert.match(list.sql, /prices.min_price DESC/);
  assert.doesNotMatch(list.sql, /image_data|100%/);
  assert.match(list.sql, /AVG\(rating\) AS average_rating/);
  assert.match(list.sql, /FROM reviews GROUP BY product_id/);
  await repo.getHomeProducts();
  for (const call of calls) assert.match(call.sql.trim(), /^SELECT /);
  assert.match(calls.at(-1).sql, /o.status = 'delivered'/);
  assert.match(calls.at(-1).sql, /ORDER BY sold_count DESC, p.created_at DESC, p.product_id DESC/);
  assert.doesNotMatch(calls.at(-1).sql, /sales.sold_count > 0|LIMIT|image_data/);
});

test('Card sản phẩm: điểm thật, thiếu đánh giá, giá thấp nhất và trạng thái hết hàng (fixture EJS)',async()=>{
  const render=product=>require('ejs').renderFile(require('node:path').resolve('src/views/catalog/partials/product-card.ejs'),{
    product:{product_id:1,product_name:'Tai nghe <TEST>',min_price:'990000',max_price:'1340000',variant_count:2,total_stock:5,sold_count:12,...product},
    formatMoney:require('../src/utils/catalog-query').formatMoney,
  });
  let html=await render({average_rating:'4.9',review_count:3});
  assert.match(html,/4\.9 trên 5 sao, 3 đánh giá/);assert.match(html,/12 đã bán/);assert.match(html,/990\.000đ/);assert.doesNotMatch(html,/Từ 990/);
  assert.match(html,/Tai nghe &lt;TEST&gt;/);
  html=await render({average_rating:null,review_count:0,total_stock:0,sold_count:0});
  assert.match(html,/Chưa có đánh giá/);assert.match(html,/Hết hàng/);assert.match(html,/0 đã bán/);assert.doesNotMatch(html,/aria-label=".*trên 5 sao/);
  html=await render({min_price:null,variant_count:0});assert.match(html,/Chưa có giá bán/);assert.match(html,/Chưa có biến thể hợp lệ/);
});

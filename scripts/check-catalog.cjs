const assert = require('node:assert/strict');
const { once } = require('node:events');
const { getPool, closePool } = require('../src/config/database');
const { createCatalogRepository } = require('../src/repositories/catalog-repository');
const { createApp } = require('../src/app');
const { parseCatalogQuery } = require('../src/utils/catalog-query');
const { fixtureQuery, png } = require('../tests/helpers/catalog-fixtures.cjs');

async function main() {
  const pool = getPool();
  const fixture = fixtureQuery();
  let queries = 0;
  const fixtureDatabase = {
    execute(sql, params = []) {
      assert.match(sql.trim(), /^SELECT\b/i, 'Bộ kiểm tra chỉ chấp nhận SELECT.');
      queries++;
      return pool.execute(`${fixture.sql} ${sql}`, [...fixture.values, ...params]);
    },
  };
  const repository = createCatalogRepository(fixtureDatabase);
  const filters = (query = {}) => parseCatalogQuery(query);
  const check = async (name, run) => { await run(); console.log(`PASS [CTE giả lập] ${name}`); };
  const [[actual]] = await pool.execute('SELECT COUNT(*) AS total FROM products');
  console.log(`[MySQL thực tế] products: ${actual.total}. Không thêm dữ liệu kiểm thử vào bảng thật.`);

  await check('Danh mục, toàn bộ sản phẩm gợi ý; bán chạy trước, chỉ tính delivered', async () => {
    assert.equal((await repository.getCategories()).length, 3);
    const home = await repository.getHomeProducts();
    assert.equal(home.suggestions.length, 16);
    assert.deepEqual(home.suggestions.map((p) => p.product_id), [2,1,16,15,14,13,12,11,10,9,8,7,6,5,4,3]);
    assert.deepEqual(home.suggestions.slice(0,2).map((p) => [p.product_id, Number(p.sold_count)]), [[2,7],[1,5]]);
    assert.ok(home.suggestions.slice(2).every(p => Number(p.sold_count) === 0));
  });
  await check('Tìm tên/thương hiệu, khoảng trắng và ký tự LIKE đặc biệt', async () => {
    assert.equal((await repository.getProducts(filters({ q: '  Tai   nghe  ' }))).total, 1);
    assert.equal((await repository.getProducts(filters({ q: 'TechBrand' }))).total, 1);
    assert.equal((await repository.getProducts(filters({ q: "100% _ \\ '" }))).total, 1);
    assert.equal((await repository.getProducts(filters({ q: "' OR 1=1 --" }))).total, 0);
    assert.equal((await repository.getProducts(filters({ q: 'không có kết quả' }))).total, 0);
    assert.equal((await repository.getProducts(filters({ q: '' }))).total, 16);
  });
  await check('Lọc danh mục, giá thấp nhất kể cả hết hàng; không dùng giá biến thể khác', async () => {
    assert.equal((await repository.getProducts(filters({ category_id: '1' }))).total, 2);
    assert.equal((await repository.getProducts(filters({ category_id: '3' }))).total, 0);
    const selected = await repository.getProducts(filters({ min_price: '100', max_price: '100' }));
    assert.deepEqual(selected.products.map((p) => p.product_id), [1]);
    assert.equal((await repository.getProducts(filters({ min_price: '130', max_price: '250' }))).total, 0);
    assert.equal((await repository.getProducts(filters({ q: 'Tai nghe', category_id: '1', min_price: '0', max_price: '100', sort: 'price_asc' }))).total, 1);
  });
  await check('Sắp xếp tăng/giảm/tên/bán chạy và phân trang không trùng', async () => {
    for (const sort of ['price_asc','price_desc']) {
      const rows = (await repository.getProducts(filters({ sort, limit: '40' }))).products;
      const prices = rows.filter((p) => p.min_price !== null).map((p) => Number(p.min_price));
      assert.deepEqual(prices, [...prices].sort((a,b) => sort === 'price_asc' ? a-b : b-a));
      assert.ok(rows.slice(-3).every((p) => p.min_price === null));
    }
    assert.equal((await repository.getProducts(filters({ sort: 'name' }))).total, 16);
    assert.equal((await repository.getProducts(filters({ sort: 'bestselling' }))).products[0].product_id, 2);
    const first = await repository.getProducts(filters({ limit: '5' }));
    const second = await repository.getProducts(filters({ page: '2', limit: '5' }));
    assert.equal(first.total, 16); assert.equal(first.totalPages, 4);
    assert.ok(second.products.every((p) => !first.products.some((x) => x.product_id === p.product_id)));
    const last = await repository.getProducts(filters({ page: '999', limit: '5' }));
    assert.equal(last.page, 4); assert.equal(last.products.length, 1);
  });
  await check('Biến thể đủ thuộc tính, loại liên kết sai/trùng/thiếu; sản phẩm không giá', async () => {
    const detail = await repository.getProduct(1);
    assert.deepEqual(detail.variants.map((v) => [v.variant_id, Number(v.price), v.stock]), [[11,100,0],[12,200,5]]);
    assert.deepEqual(detail.options.map((o) => o.value_name), ['Đen','Trắng']);
    for (const id of [3,4,5]) {
      assert.equal((await repository.getProduct(id)).variants.length, 0);
    }
    const list = await repository.getProducts(filters({ limit: '40' }));
    for (const id of [3,4,5]) assert.equal(list.products.find((p) => p.product_id === id).min_price, null);
    assert.equal(Number(list.products.find((p) => p.product_id === 2).total_stock), 0);
    assert.equal(await repository.getProduct(999), null);
  });
  await check('BLOB và kiểm tra biến thể đúng sản phẩm', async () => {
    assert.deepEqual((await repository.getImage(1)).image_data, png);
    assert.deepEqual((await repository.getImage(1,11)).image_data, png);
    assert.equal((await repository.getImage(1,12)).image_data, null);
    assert.equal(await repository.getImage(2,11), null);
    assert.equal(await repository.getImage(999), null);
  });

  const server = createApp({ catalogRepository: repository }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await check('HTTP end-to-end: repository SQL giả lập → MySQL → EJS, ảnh và biến thể', async () => {
      for (const route of ['/', '/products', '/products/search?q=Tai+nghe&category_id=1&min_price=100&max_price=100&sort=price_desc', '/products?page=2&limit=5']) {
        assert.equal((await fetch(base + route)).status, 200);
      }
      const black = await (await fetch(base + '/products/1?variant=11')).text();
      assert.match(black, /id="variant-price">100đ/); assert.match(black, /id="variant-stock">Hết hàng/);
      const white = await (await fetch(base + '/products/1?variant=12')).text();
      assert.match(white, /id="variant-price">200đ/); assert.match(white, /Còn hàng \(5\)/);
      assert.equal((await fetch(base + '/products/1?variant=21')).status, 400);
      assert.equal((await fetch(base + '/products/999')).status, 404);
      assert.equal((await fetch(base + '/products/abc')).status, 400);
      const image = await fetch(base + '/products/1/variants/11/image');
      assert.equal(image.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
      const placeholder = await fetch(base + '/products/3/image');
      assert.equal(placeholder.status, 200); assert.match(placeholder.headers.get('content-type'), /image\/svg/);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  const [[after]] = await pool.execute('SELECT COUNT(*) AS total FROM products');
  assert.equal(after.total, actual.total);
  console.log(`Đã chạy ${queries} SELECT với CTE giả lập. Số sản phẩm thật vẫn là ${after.total}.`);
  console.log('Kết quả này kiểm tra SQL/HTTP bằng dữ liệu giả lập, không chứng minh có sản phẩm trong database thật.');
}

main().catch((error) => {
  console.error(`FAIL kiểm tra catalog: ${error instanceof assert.AssertionError ? error.message : 'lỗi MySQL/HTTP (đã ẩn chi tiết nhạy cảm)'}`);
  process.exitCode = 1;
}).finally(closePool);

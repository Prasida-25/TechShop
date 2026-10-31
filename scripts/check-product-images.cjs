// Opt-in. Chỉ ghi fixture mới trên instance MySQL test đã được xác minh độc lập.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { openTestPool } = require('./test-db-config.cjs');
const { createAdminProductRepository, PRODUCT_SQL } = require('../src/repositories/admin-product-repository');
const { createAdminProductService } = require('../src/services/admin-product-service');
const { createCatalogRepository } = require('../src/repositories/catalog-repository');
const { createApp } = require('../src/app');
const { png } = require('../tests/helpers/catalog-fixtures.cjs');

async function main() {
  const pool = await openTestPool(); // Kiểm tra database, datadir, cổng và quyền trước mọi ghi.
  const repository = createAdminProductRepository(pool);
  const service = createAdminProductService(repository);
  const catalog = createCatalogRepository(pool);
  const ids = [];
  let server, serial = 0;
  const tag = 'IMAGE-TEST-' + crypto.randomBytes(8).toString('hex');
  const data = () => ({ product_name: tag, category_id: '', brand: 'TEST', description: 'Fixture ảnh riêng',
    variant_name: 'Mặc định', sku: tag + '-' + (++serial), price: '100000', stock: '1' });
  const image = () => ({ data: png, type: 'image/png' });
  const counts = async () => {
    const [[row]] = await pool.execute(`SELECT (SELECT COUNT(*) FROM products) products,
      (SELECT COUNT(*) FROM product_variants) variants, (SELECT COUNT(*) FROM product_images) images`);
    return row;
  };
  try {
    const [engines] = await pool.execute(`SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('products','product_variants','product_images')`);
    assert.equal(engines.length, 3, 'Cần áp dụng add-product-images.sql trên database test trước.');
    assert.ok(engines.every(table => table.ENGINE === 'InnoDB'));
    const before = await counts();
    try {
      const id = await service.saveProduct(undefined, data(), image(), [image(), image()]);
      ids.push(id);
      let detail = await service.detail(String(id));
      assert.equal(detail.images.length, 2);
      assert.equal(detail.variants.length, 1);
      assert.deepEqual((await catalog.getImage(id, null, detail.images[0].image_id)).image_data, png);
      await service.saveProduct(String(id), data(), undefined, [image()]);
      detail = await service.detail(String(id));
      assert.equal(detail.images.length, 3);
      console.log('PASS MySQL: tạo sản phẩm/biến thể, lưu BLOB và thêm ảnh khi sửa.');

      // Tạo lỗi sau lần INSERT ảnh đầu tiên; transaction vẫn là MySQL thật.
      let inserts = 0;
      const faultService = createAdminProductService(createAdminProductRepository({
        execute: (...args) => pool.execute(...args),
        async getConnection() {
          const connection = await pool.getConnection();
          return {
            beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(),
            rollback: () => connection.rollback(), release: () => connection.release(),
            execute(sql, params) {
              if (sql === PRODUCT_SQL.addImage && ++inserts === 2) throw new Error('TEST_IMAGE_INSERT_FAILURE');
              return connection.execute(sql, params);
            },
          };
        },
      }));
      const originalName = detail.product_name;
      await assert.rejects(faultService.saveProduct(String(id), { ...data(), product_name: 'Không được lưu' }, undefined, [image(), image()]));
      detail = await service.detail(String(id));
      assert.equal(detail.product_name, originalName);
      assert.equal(detail.images.length, 3);
      console.log('PASS MySQL: rollback tên sản phẩm và ảnh đã INSERT khi ảnh tiếp theo lỗi.');

      await service.saveProduct(String(id), data(), undefined, Array.from({ length: 5 }, image));
      const concurrent = await Promise.allSettled([
        service.saveProduct(String(id), data(), undefined, [image()]),
        service.saveProduct(String(id), data(), undefined, [image()]),
      ]);
      assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(concurrent.find(r => r.status === 'rejected').reason.status, 422);
      detail = await service.detail(String(id));
      assert.equal(detail.images.length, 9);
      console.log('PASS MySQL: hai lần thêm ảnh đồng thời không vượt 9 ảnh bổ sung.');

      const fallback = await service.saveProduct(undefined, data(), undefined, [image(), image()]);
      ids.push(fallback);
      assert.deepEqual((await catalog.getImage(fallback)).image_data, png);
      assert.equal((await service.detail(String(fallback))).images.length, 1);
      assert.equal(await catalog.getImage(fallback, null, detail.images[0].image_id), null);
      console.log('PASS MySQL: ảnh đầu làm đại diện; ảnh bổ sung phải thuộc đúng sản phẩm.');

      server = createApp({ catalogRepository: catalog }).listen(0, '127.0.0.1');
      await once(server, 'listening');
      const base = `http://127.0.0.1:${server.address().port}`;
      const response = await fetch(`${base}/products/${id}/images/${detail.images[0].image_id}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
      const page = await fetch(`${base}/products/${id}`);
      assert.equal(page.status, 200);
      assert.ok((await page.text()).includes(`/products/${id}/images/${detail.images[0].image_id}`));
      console.log('PASS HTTP + MySQL: render bộ ảnh, endpoint trả đúng MIME và nội dung BLOB.');
      const confirm = { confirm_delete:'1' };
      const firstImage = detail.images[0].image_id;
      await assert.rejects(service.removeImage(String(fallback), 'gallery', String(firstImage), confirm), { status:404 });
      await service.removeImage(String(id), 'gallery', String(firstImage), confirm);
      assert.equal(await catalog.getImage(id, null, firstImage), null);
      assert.equal((await service.detail(String(id))).images.length, 8);
      await service.removeImage(String(id), 'cover', null, confirm);
      assert.equal((await catalog.getImage(id)).image_data, null);
      const variant = detail.variants[0];
      await service.saveVariant(String(id), String(variant.variant_id), { ...data(), sku:variant.sku, expected_stock:'1', confirm_stock:'1' }, image());
      await service.removeImage(String(id), 'variant', String(variant.variant_id), confirm);
      const [[stored]] = await pool.execute('SELECT image_data,image_mime_type,stock FROM product_variants WHERE variant_id=?', [variant.variant_id]);
      assert.equal(stored.image_data, null); assert.equal(stored.image_mime_type, null); assert.equal(stored.stock, 1);
      console.log('PASS MySQL: xóa gallery/đại diện/biến thể đúng phạm vi; chặn ảnh của sản phẩm khác, giữ tồn kho.');
    } finally {
      if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      // Chỉ xóa sản phẩm do lần chạy này tạo. Không cleanup theo tên/prefix hoặc toàn bảng.
      for (const id of ids) {
        const [[row]] = await pool.execute('SELECT product_name FROM products WHERE product_id=?', [id]);
        assert.equal(row?.product_name, tag, 'Dừng cleanup nếu fixture không còn đúng nguồn gốc.');
        await repository.removeProduct(id);
        const [[remaining]] = await pool.execute('SELECT COUNT(*) count FROM product_images WHERE product_id=?', [id]);
        assert.equal(Number(remaining.count), 0);
      }
      assert.deepEqual(await counts(), before);
      console.log('PASS cleanup: cascade ảnh/biến thể đúng fixture; số dòng test trở về ban đầu.');
    }
  } finally { await pool.end(); }
}

if (process.argv.includes('--run')) main().catch(error => {
  console.error('PRODUCT_IMAGES_TEST_FAILED', error.code || error.name);
  process.exitCode = 1;
});

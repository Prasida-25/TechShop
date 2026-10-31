const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createProductDatabase } = require('./helpers/admin-product-database.cjs');
const { createAdminProductRepository, PRODUCT_SQL } = require('../src/repositories/admin-product-repository');
const { createAdminProductService } = require('../src/services/admin-product-service');
const { productInput, variantInput, optionValues, imageInput } = require('../src/utils/admin-product-validation');
const { withAccountApp } = require('./helpers/account-client.cjs');
const { png } = require('./helpers/catalog-fixtures.cjs');
const imageFixtures = require('./helpers/image-fixtures.cjs');

const data = { product_name: 'Tai nghe <TEST>', category_id: '1', brand: 'TEST', description: 'Mô tả',
  variant_name: 'Mặc định', sku: 'SKU-TEST', price: '100000.01', stock: '5', confirm_stock: '1' };
function setup() { const db = createProductDatabase(), repo = createAdminProductRepository(db); return { db, repo, service: createAdminProductService(repo) }; }
const fixtureImage = () => ({ data: png, type: 'image/png' });

test('Định dạng ảnh: nhận 6 loại raster theo nội dung dù MIME sai/rỗng; chặn SVG/HTML/HEIC/file giả', () => {
  for (const [format, bytes] of Object.entries({ png, ...imageFixtures })) {
    for (const type of ['', 'application/octet-stream', 'image/webp', 'image/unknown']) {
      assert.equal(imageInput({ data:bytes, type }).mime, 'image/' + format);
    }
  }
  const heic = Buffer.from('000000186674797068656963000000006d69663168656963','hex');
  for (const bytes of [Buffer.from('<svg><script>bad</script></svg>'), Buffer.from('<html/>'), Buffer.from('RIFF0000WEBPFAKE'), heic, Buffer.from('GIF89a'), Buffer.from('BM')]) {
    assert.throws(() => imageInput({ data:bytes, type:'image/png' }), { status:422 });
  }
});

test('Hộp thoại xóa ảnh: Hủy/Escape không gửi, Xóa gửi đúng form một lần', () => {
  const source = require('node:fs').readFileSync('public/js/admin-image-delete.js', 'utf8');
  const handlers = {}, message = { textContent:'' };
  const dialog = { open:false, returnValue:'', showModal() { this.open=true; }, addEventListener(name, fn) { handlers[name]=fn; } };
  function makeForm(label) {
    return { dataset:{ imageLabel:label }, sent:0, addEventListener(name, fn) { this.submitHandler=fn; },
      requestSubmit() { let prevented=false; this.submitHandler({ preventDefault() { prevented=true; } }); if (!prevented) this.sent++; } };
  }
  const a=makeForm('ảnh đại diện'), b=makeForm('ảnh bổ sung 2');
  require('node:vm').runInNewContext(source, { document:{
    querySelector:selector => selector === '[data-image-delete-dialog]' ? dialog : message,
    querySelectorAll:() => [a,b],
  } });
  const close = value => { dialog.returnValue=value; dialog.open=false; handlers.close(); };
  a.requestSubmit(); assert.equal(a.sent,0); close('cancel'); assert.equal(a.sent,0);
  b.requestSubmit(); assert.match(message.textContent,/ảnh bổ sung 2/); close('delete');
  assert.equal(b.sent,1); assert.equal(a.sent,0);
  a.requestSubmit(); assert.equal(dialog.returnValue,'cancel'); close(dialog.returnValue);
  assert.equal(a.sent,0); assert.equal(b.sent,1);
  require('node:vm').runInNewContext(source, { document:{ querySelector:()=>null, querySelectorAll:()=>[] } });
});

test('Sản phẩm admin: validation tên/danh mục/giá/stock/SKU, không nhận field quyền hoặc ID từ body', () => {
  assert.equal(productInput({ ...data, product_id: '999', role: 'admin' }).product_name, data.product_name);
  assert.equal(productInput({ ...data, category_id: '' }).category_id, null);
  for (const change of [{ product_name: ' ' }, { product_name: 'x'.repeat(201) }, { category_id: 'bad' }, { brand: 'x'.repeat(101) }]) assert.throws(() => productInput({ ...data, ...change }));
  for (const change of [{ price: '0' }, { price: '-1' }, { price: '1e3' }, { price: '1.001' }, { price: '10000000000' }, { stock: '-1' }, { stock: '1.5' }, { stock: '2147483648' }, { stock: [] }, { sku: '' }, { sku: 'x'.repeat(51) }]) assert.throws(() => variantInput({ ...data, ...change }));
  assert.equal(variantInput({ ...data, price: '9999999999.99', stock: '0' }).stock, 0);
  assert.throws(() => variantInput(data, true));
});

test('Sản phẩm admin: chọn đúng giá trị option; ảnh MIME/signature/size, không nhận SVG hoặc file giả', () => {
  const options = [{ option_id: 1, option_name: 'Màu', option_value_id: 10 }];
  assert.deepEqual(optionValues({ option_1: '10' }, options), [10]);
  for (const body of [{}, { option_1: '99' }, { option_1: ['10'] }, { option_1: '10', option_2: '10' }]) assert.throws(() => optionValues(body, options));
  assert.throws(() => optionValues({}, [{ option_id: 1, option_name: 'Màu', option_value_id: null }]));
  assert.equal(imageInput(fixtureImage()).mime, 'image/png');
  assert.equal(imageInput({ data: png, type: 'image/jpeg' }).mime, 'image/png');
  assert.equal(imageInput(null), null);
  for (const file of [{ data: Buffer.from('<svg/>'), type: 'image/svg+xml' }, { data: Buffer.alloc(1024*1024+1), type: 'image/png' }]) assert.throws(() => imageInput(file));
});

test('Sản phẩm admin: tạo product+default variant atomic, SKU trùng rollback; sửa giữ ảnh cũ và không đụng order_items', async () => {
  const { db, service } = setup();
  const id = await service.saveProduct(undefined, { ...data, product_id: '999' }, fixtureImage());
  assert.equal(id, 1); assert.equal(db.state.products.length, 1); assert.equal(db.state.variants.length, 1);
  await assert.rejects(service.saveProduct(undefined, data), { status: 409 });
  assert.equal(db.state.products.length, 1); assert.equal(db.state.variants.length, 1);
  await service.saveProduct('1', { ...data, product_name: 'Tên mới' });
  assert.equal(db.state.products[0].product_name, 'Tên mới');
  assert.deepEqual(Buffer.from(db.state.products[0].image_data), png);
  assert.ok(!db.state.calls.some(call => /(?:UPDATE|DELETE FROM) (?:orders|order_items)/i.test(call.sql)));
  db.state.fail = 'variant';
  await assert.rejects(service.saveProduct(undefined, { ...data, sku: 'OTHER' }));
  assert.equal(db.state.products.length, 1);
  assert.equal(db.state.calls.at(-2).sql, 'rollback'); assert.equal(db.state.calls.at(-1).sql, 'release');
  await assert.rejects(service.saveProduct('999', data), { status: 404 });
  await assert.rejects(service.saveProduct(undefined, { ...data, category_id: '99' }), { status: 422 });
});

test('Bộ ảnh: tạo nhiều ảnh atomic, thêm khi sửa giữ ảnh cũ, giới hạn 10 và cascade khi xóa (mock SQL)', async () => {
  const { db, repo, service } = setup();
  const images = Array.from({ length: 9 }, fixtureImage);
  await service.saveProduct(undefined, data, fixtureImage(), images);
  assert.equal(db.state.images.length, 9);
  assert.deepEqual(db.state.images.map(i => i.sort_order), [1,2,3,4,5,6,7,8,9]);
  assert.equal((await service.detail('1')).images.length, 9);
  await assert.rejects(service.saveProduct('1', data, undefined, [fixtureImage()]), { status: 422 });
  assert.equal(db.state.images.length, 9);
  assert.throws(() => service.saveProduct(undefined, data, undefined, [...images, fixtureImage()]), { status: 422 });
  assert.throws(() => service.saveProduct(undefined, data, undefined, [{ data: Buffer.from('<svg/>'), type: 'image/jpeg' }]), { status: 422 });
  await service.saveProduct('1', { ...data, product_name: 'Đổi tên giữ bộ ảnh' });
  assert.equal(db.state.images.length, 9);
  assert.deepEqual(Buffer.from(db.state.products[0].image_data), png);
  await repo.removeProduct(1);
  assert.equal(db.state.images.length, 0);
});

test('Bộ ảnh: chọn ảnh đầu làm đại diện; lỗi chèn ảnh rollback cả sản phẩm/biến thể và dữ liệu sửa (mock SQL)', async () => {
  const { db, service } = setup();
  await service.saveProduct(undefined, data, undefined, [fixtureImage(), fixtureImage()]);
  assert.deepEqual(Buffer.from(db.state.products[0].image_data), png);
  assert.equal(db.state.images.length, 1);
  db.state.fail = 'secondImage';
  await assert.rejects(service.saveProduct('1', { ...data, product_name: 'Không được lưu' }, undefined, [fixtureImage()]));
  assert.equal(db.state.products[0].product_name, data.product_name);
  assert.equal(db.state.images.length, 1);
  db.state.fail = 'image';
  await assert.rejects(service.saveProduct(undefined, { ...data, sku: 'NEW' }, fixtureImage(), [fixtureImage()]));
  assert.equal(db.state.products.length, 1);
  assert.equal(db.state.variants.length, 1);
  assert.equal(db.state.images.length, 1);
});

test('Xóa ảnh: đúng sản phẩm, cover/variant/gallery riêng biệt, xác nhận và rollback (mock SQL)', async () => {
  const { db, service } = setup();
  await service.saveProduct(undefined, data, fixtureImage(), [fixtureImage(), fixtureImage()]);
  await service.saveProduct(undefined, { ...data, sku: 'OTHER' }, fixtureImage(), [fixtureImage()]);
  const confirm = { confirm_delete: '1' };
  assert.equal((await service.detail('1')).has_image, 1);
  const other = structuredClone(db.state.products[1]);
  await assert.rejects(service.removeImage('2', 'gallery', '1', confirm), { status:404 });
  assert.throws(() => service.removeImage('1', 'gallery', '1', {}), { status:422 });
  assert.throws(() => service.removeImage('1', 'gallery', 'bad', confirm), { status:404 });
  await service.removeImage('1', 'gallery', '1', confirm);
  assert.equal(db.state.images.filter(i => i.product_id === 1).length, 1);
  await assert.rejects(service.removeImage('1', 'gallery', '1', confirm), { status:404 });
  await service.removeImage('1', 'cover', null, confirm);
  assert.equal(db.state.products[0].image_data, null);
  assert.equal((await service.detail('1')).has_image, 0);
  assert.deepEqual(db.state.products[1], other);
  await service.saveVariant('1', '1', { ...data, expected_stock:'5' }, fixtureImage());
  await assert.rejects(service.removeImage('2', 'variant', '1', confirm), { status:404 });
  await service.removeImage('1', 'variant', '1', confirm);
  assert.equal(db.state.variants[0].image_data, null);
  assert.equal(db.state.variants[0].stock, 5);
  db.state.fail = 'commit';
  await assert.rejects(service.removeImage('1', 'gallery', '2', confirm));
  assert.equal(db.state.images.filter(i => i.product_id === 1).length, 1);
  assert.equal(db.state.products.length, 2);
});

test('Thiếu bảng ảnh: đọc/sửa sản phẩm cũ vẫn chạy, thêm ảnh báo lỗi rõ và rollback (mock SQL)', async () => {
  const db = createProductDatabase();
  const execute = async (sql, params) => {
    if (sql === PRODUCT_SQL.images || sql === PRODUCT_SQL.addImage) throw Object.assign(new Error('fixture'), { code: 'ER_NO_SUCH_TABLE' });
    return db.execute(sql, params);
  };
  const repo = createAdminProductRepository({ execute, async getConnection() { return { ...await db.getConnection(), execute }; } });
  const service = createAdminProductService(repo);
  await service.saveProduct(undefined, data);
  assert.deepEqual((await service.detail('1')).images, []);
  await service.saveProduct('1', data);
  await assert.rejects(service.saveProduct('1', data, undefined, [fixtureImage()]), { status: 503 });
  await assert.rejects(service.saveProduct(undefined, { ...data, sku: 'NEW' }, fixtureImage(), [fixtureImage()]), { status: 503 });
  assert.equal(db.state.products.length, 1);
});

test('Biến thể admin: đúng product/option, SKU trùng, stale stock, rollback link và bảo toàn dữ liệu', async () => {
  const { db, service } = setup(); await service.saveProduct(undefined, data);
  db.state.options = [{ product_id: 1, option_id: 10, option_name: 'Màu', option_value_id: 100, value_name: 'Đen' }];
  await assert.rejects(service.saveVariant('1', undefined, { ...data, sku: 'NEW', option_10: '999' }), { status: 422 });
  const id = await service.saveVariant('1', undefined, { ...data, sku: 'NEW', option_10: '100' }, fixtureImage());
  assert.equal(db.state.links[0].option_value_id, 100);
  const input = { ...data, sku: 'NEW', option_10: '100', expected_stock: '5', stock: '3' };
  await assert.rejects(service.saveVariant('1', String(id), { ...input, confirm_stock: '' }), { status: 422 });
  assert.equal(db.state.variants.find(v => v.variant_id === id).stock, 5);
  db.state.variants.find(v => v.variant_id === id).stock = 4; // Checkout giả lập đã trừ kho.
  await assert.rejects(service.saveVariant('1', String(id), input), { status: 409 });
  assert.equal(db.state.variants.find(v => v.variant_id === id).stock, 4);
  await service.saveVariant('1', String(id), { ...input, expected_stock: '4' });
  assert.equal(db.state.variants.find(v => v.variant_id === id).stock, 3);
  assert.deepEqual(Buffer.from(db.state.variants.find(v => v.variant_id === id).image_data), png);
  const before = structuredClone(db.state.variants); db.state.fail = 'link';
  await assert.rejects(service.saveVariant('1', String(id), { ...input, expected_stock: '3', stock: '2' }));
  assert.deepEqual(db.state.variants, before);
  await assert.rejects(service.saveVariant('1', '999', input), { status: 404 });
  await service.saveProduct(undefined, { ...data, sku: 'OTHER-PRODUCT' });
  await assert.rejects(service.saveVariant('2', String(id), { ...input, expected_stock: '3' }), { status: 404 });
});

test('Danh sách admin: query an toàn, limit/page và SQL parameterized, không đọc BLOB', async () => {
  const { db, service } = setup();
  assert.equal((await service.list({})).products.length, 0);
  await service.list({ q: "100% _ ' OR 1=1 --", page: '-9' });
  const queries = db.state.calls.filter(c => c.sql.startsWith('SELECT'));
  assert.ok(queries.at(-1).sql.includes('LIMIT 20 OFFSET 0'));
  assert.ok(!queries.at(-1).sql.includes('OR 1=1 --'));
  assert.equal(queries.at(-1).params[0], "%100!% !_ ' OR 1=1 --%");
  assert.ok(!queries.some(c => /image_data/.test(c.sql)));
  assert.throws(() => service.list({ q: ['a'] }), { status: 400 });
  assert.throws(() => service.list({ q: 'a'.repeat(201) }), { status: 400 });
});

async function adminClient(client, database) {
  const a = client(); await a.get('/register');
  await a.post('/register', { full_name: 'Admin TEST', phone: '0900000001', password: 'AdminTest123', confirm_password: 'AdminTest123' });
  database.state.users[0].role = 'admin';
  await a.get('/login'); await a.post('/login', { phone: '0900000001', password: 'AdminTest123' });
  await a.get('/admin'); return a;
}
function multipart(a, route, fields, image) {
  const form = new FormData(); for (const [key, value] of Object.entries({ ...fields, _csrf: a.token })) form.append(key, value);
  if (image) form.append('image', new Blob([image.data], { type: image.type }), 'test.png');
  return a.request(route, { method: 'POST', body: form });
}

test('HTTP upload raster: ảnh thật JPEG/WebP/GIF/AVIF/BMP/PNG, cover/gallery/variant lưu đúng MIME khi file khai sai', async () => {
  const { db, repo } = setup();
  await withAccountApp(async ({ client, database }) => {
    const a = await adminClient(client, database);
    for (const [format, bytes] of Object.entries({ png, ...imageFixtures })) {
      const form = new FormData();
      for (const [key,value] of Object.entries({ ...data, sku:'FORMAT-'+format, _csrf:a.token })) form.append(key,value);
      form.append('image', new Blob([bytes], { type:'image/webp' }), 'wrong-extension.webp');
      form.append('images', new Blob([bytes]), 'unknown.bin');
      const response = await a.request('/admin/products', { method:'POST', body:form });
      assert.equal(response.status,303,format);
      const p = db.state.products.at(-1), image = db.state.images.at(-1);
      assert.equal(p.image_mime_type,'image/'+format);
      assert.equal(image.image_mime_type,'image/'+format);
      assert.deepEqual(p.image_data,bytes);
      const variant = await multipart(a, `/admin/products/${p.product_id}/variants`, { ...data, sku:'VARIANT-'+format }, { data:bytes, type:'application/octet-stream' });
      assert.equal(variant.status,303,format);
      assert.equal(db.state.variants.at(-1).image_mime_type,'image/'+format);
    }
  }, undefined, undefined, undefined, undefined, repo);
});
test('Sản phẩm admin HTTP: EJS, tạo multipart BLOB, lỗi gần field, thêm/sửa biến thể và tồn kho cũ', async () => {
  const { db, repo } = setup();
  await withAccountApp(async ({ client, database }) => {
    const a = await adminClient(client, database);
    assert.match((await a.get('/admin/products')).html, /Không có sản phẩm/);
    assert.equal((await a.get('/admin/products/new')).status, 200);
    const created = await multipart(a, '/admin/products', data, fixtureImage());
    assert.equal(created.status, 303); assert.equal(created.headers.get('location'), '/admin/products/1/edit?saved=1');
    const page = await a.get(created.headers.get('location')); assert.equal(page.status, 200);
    assert.match(page.html, /Tai nghe &lt;TEST&gt;/); assert.match(page.html, /Đã lưu sản phẩm/);
    assert.deepEqual(db.state.products[0].image_data, png);
    let bad = await multipart(a, '/admin/products/1/update', { ...data, product_name: '' });
    assert.equal(bad.status, 422); assert.match(bad.html, /product_name-error/);
    assert.equal((await multipart(a, '/admin/products', data)).status, 409);
    assert.equal((await a.get('/admin/products/1/variants/new')).status, 200);
    assert.equal((await multipart(a, '/admin/products/1/variants', { ...data, sku: 'SECOND' })).status, 303);
    assert.equal((await a.get('/admin/products/1/variants/2/edit')).status, 200);
    assert.equal((await multipart(a, '/admin/products/1/variants/2/update', { ...data, sku: 'SECOND', stock: '0', expected_stock: '5' })).status, 303);
    bad = await multipart(a, '/admin/products/1/variants/2/update', { ...data, sku: 'SECOND', expected_stock: '5' });
    assert.equal(bad.status, 409); assert.match(bad.html, /Tồn kho đã thay đổi/);
    assert.equal(db.state.variants[1].stock, 0);
    assert.equal((await a.get('/admin/products/1/variants/999/edit')).status, 404);
    assert.equal((await a.get('/admin/products/bad/edit')).status, 404);
    assert.equal((await a.get('/admin/products/999/edit')).status, 404);
    db.state.fail = 'variant';
    bad = await multipart(a, '/admin/products', { ...data, sku: 'THIRD' });
    assert.equal(bad.status, 500); assert.doesNotMatch(bad.html, /PRIVATE_SQL_FIXTURE|SELECT|stack/);
  }, undefined, undefined, undefined, undefined, repo);
});

test('Sản phẩm admin HTTP: quyền/CSRF, file giả hoặc quá lớn, malformed/duplicate multipart, không ghi ngoài ý muốn', async () => {
  const { db, repo } = setup();
  await withAccountApp(async ({ client, database }) => {
    const a = await adminClient(client, database);
    const badImage = await multipart(a, '/admin/products', data, { data: Buffer.from('<svg/>'), type: 'image/svg+xml' });
    assert.equal(badImage.status, 422); assert.match(badImage.html, /Chỉ nhận PNG/);
    const noCsrf = new FormData(); for (const [key,value] of Object.entries(data)) noCsrf.append(key,value);
    assert.equal((await a.request('/admin/products', { method: 'POST', body: noCsrf })).status, 403);
    const duplicate = new FormData(); duplicate.append('_csrf', a.token); duplicate.append('sku','A'); duplicate.append('sku','B');
    assert.equal((await a.request('/admin/products', { method: 'POST', body: duplicate })).status, 400);
    assert.equal((await multipart(a, '/admin/products', data, { data: Buffer.alloc(1024*1024+1), type: 'image/png' })).status, 400);
    assert.equal((await a.request('/admin/products', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=TEST' }, body: 'not-a-form' })).status, 400);
    assert.equal((await a.request('/admin/products', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=TEST' }, body: Buffer.alloc(11*1024*1024+1) })).status, 413);
    database.state.users[0].role = 'user'; await a.get('/account');
    for (const route of ['/admin/products', '/admin/products/1/update', '/admin/products/1/variants', '/admin/products/1/variants/1/update']) assert.equal((await a.post(route, data)).status, 403);
    assert.equal((await a.get('/admin/products')).status, 403);
    assert.equal(db.state.products.length, 0); assert.equal(db.state.variants.length, 0);
  }, undefined, undefined, undefined, undefined, repo);
});

test('Bộ ảnh HTTP: upload nhiều file, form sửa xem ảnh, chặn ảnh giả/đếm file/CSRF/role (mock DB, HTTP thật)', async () => {
  const { db, repo } = setup();
  await withAccountApp(async ({ client, database }) => {
    const a = await adminClient(client, database);
    const page = await a.get('/admin/products/new');
    assert.match(page.html, /name="images"[^>]*multiple/);
    function form(count = 2) {
      const form = new FormData();
      for (const [key, value] of Object.entries({ ...data, _csrf: a.token })) form.append(key, value);
      for (let i = 0; i < count; i++) form.append('images', new Blob([png], { type: 'image/png' }), `photo-${i}.png`);
      return form;
    }
    assert.equal((await a.request('/admin/products', { method: 'POST', body: form() })).status, 303);
    assert.equal(db.state.images.length, 1); // Ảnh đầu là đại diện.
    const edit = await a.get('/admin/products/1/edit');
    assert.match(edit.html, /\/products\/1\/images\/1/);
    assert.equal((await a.request('/admin/products/1/update', { method: 'POST', body: form() })).status, 303);
    assert.equal(db.state.images.length, 3);
    const deleting = await a.get('/admin/products/1/edit');
    assert.match(deleting.html, /data-confirm-image-delete/);
    assert.match(deleting.html, /\/admin\/products\/1\/images\/1\/delete/);
    const route = '/admin/products/1/images/1/delete';
    assert.equal((await a.get(route)).status, 404);
    assert.equal((await a.post(route, { confirm_delete:'1' }, '')).status, 403);
    assert.equal((await a.post(route, {})).status, 422);
    assert.equal((await a.post('/admin/products/999/images/1/delete', { confirm_delete:'1' })).status, 404);
    assert.equal((await a.post(route, { confirm_delete:'1', product_id:'999', user_id:'999' })).status, 303);
    assert.equal(db.state.images.length, 2);
    assert.equal((await a.post('/admin/products/1/image/delete', { confirm_delete:'1' })).status, 303);
    assert.match((await a.get('/admin/products/1/edit?image_deleted=1')).html, /Đã xóa ảnh/);
    const bad = form(0); bad.append('images', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'bad.svg');
    assert.equal((await a.request('/admin/products/1/update', { method: 'POST', body: bad })).status, 422);
    assert.equal((await a.request('/admin/products', { method: 'POST', body: form(10) })).status, 400);
    const strings = form(0); strings.append('images', 'not-a-file');
    assert.equal((await a.request('/admin/products', { method: 'POST', body: strings })).status, 400);
    const tooLarge = form(0); tooLarge.append('images', new Blob([Buffer.alloc(1024*1024+1)], { type:'image/png' }), 'large.png');
    assert.equal((await a.request('/admin/products', { method: 'POST', body: tooLarge })).status, 400);
    const noCsrf = form(); noCsrf.delete('_csrf');
    assert.equal((await a.request('/admin/products', { method: 'POST', body: noCsrf })).status, 403);
    database.state.users[0].role = 'user';
    assert.equal((await a.request('/admin/products', { method: 'POST', body: form() })).status, 403);
    assert.equal(db.state.products.length, 1);
    assert.equal((await a.post('/admin/products/1/images/2/delete', { confirm_delete:'1' })).status, 403);
    assert.equal(db.state.images.length, 2);
  }, undefined, undefined, undefined, undefined, repo);
});

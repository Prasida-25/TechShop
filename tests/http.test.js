const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const { test } = require('node:test');
const express = require('express');
const {createApp} = require('../src/app');
const app = createApp({catalogRepository:{
  getCategories:async()=>[], getHomeProducts:async()=>({suggestions:[]}),
}});
const errorHandler = require('../src/middleware/error-handler');
const { describeDatabaseError } = require('../src/config/database');

async function withServer(application, run) {
  const server = application.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('Express render EJS và các partial, phục vụ CSS, trả 404', async () => {
  await withServer(app, async (baseUrl) => {
    const page = await fetch(`${baseUrl}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(html, /TechZone/);
    assert.match(html, /<html lang="vi">/);
    assert.doesNotMatch(html, /<%/);

    const css = await fetch(`${baseUrl}/css/base.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    assert.match(await css.text(), /:root/);

    for (const route of ['/foundation', '/css/foundation.css', '/khong-ton-tai', '/.env', '/database/techshop.sql', '/css/missing.css']) {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 404);
      assert.match(await response.text(), /Không tìm thấy trang/);
    }
    assert.doesNotMatch(html,/href="\/foundation"/);
  });
});

test('Middleware lỗi không lộ message/stack trong production', async () => {
  const errorApp = express();
  errorApp.set('env', 'production');
  errorApp.set('view engine', 'ejs');
  errorApp.set('views', path.join(__dirname, '..', 'src', 'views'));
  // Route chỉ có trong kiểm thử, không được đăng ký trong ứng dụng thật.
  errorApp.get('/', () => { throw new Error('TEST_PRIVATE_DETAIL'); });
  errorApp.use(errorHandler);

  await withServer(errorApp, async (baseUrl) => {
    const response = await fetch(baseUrl);
    const html = await response.text();
    assert.equal(response.status, 500);
    assert.match(html, /Đã xảy ra lỗi máy chủ/);
    assert.doesNotMatch(html, /TEST_PRIVATE_DETAIL|Error:|http\.test/);
  });
});

test('Thông báo MySQL chỉ nêu nguyên nhân an toàn', () => {
  const refused = Object.assign(new Error('TEST_PRIVATE_DETAIL'), { code: 'ECONNREFUSED' });
  assert.match(describeDatabaseError(refused), /DB_HOST và DB_PORT/);
  assert.doesNotMatch(describeDatabaseError(refused), /TEST_PRIVATE_DETAIL/);
  assert.doesNotMatch(describeDatabaseError(new Error('TEST_PRIVATE_DETAIL')), /TEST_PRIVATE_DETAIL/);
});

test('Parser HTTP: giữ 413, 400, request hợp lệ và lỗi server 500 (không dùng DB)', async () => {
  const parserApp = express();
  parserApp.set('env', 'production');
  parserApp.set('view engine', 'ejs');
  parserApp.set('views', path.join(__dirname, '..', 'src', 'views'));
  // Giữ cùng giới hạn form với app thật; JSON chỉ dùng để tạo lỗi parser trong test.
  parserApp.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 40 }));
  parserApp.use(express.json({ limit: '16kb' }));
  parserApp.post('/', (req, res) => res.json({ received: req.body }));
  parserApp.get('/server-error', () => { throw new Error('TEST_PRIVATE_DETAIL'); });
  parserApp.get('/unknown-error', () => {
    throw Object.assign(new Error('TEST_PRIVATE_DETAIL'), { status: 413, type: 'unknown' });
  });
  parserApp.use(errorHandler);

  await withServer(parserApp, async (baseUrl) => {
    const post = (body, type = 'application/x-www-form-urlencoded') => fetch(baseUrl, {
      method: 'POST', headers: { 'content-type': type }, body,
    });
    for (const body of ['value=' + 'x'.repeat(17 * 1024),
      new URLSearchParams(Array.from({ length: 41 }, (_, i) => [`key${i}`, 'value'])).toString()]) {
      const response = await post(body);
      assert.equal(response.status, 413);
      const html = await response.text();
      assert.match(html, /Yêu cầu quá lớn/);
      assert.doesNotMatch(html, /PayloadTooLargeError|stack|key40|entity\.too\.large/);
    }
    const valid = await post('name=TechZone');
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { received: { name: 'TechZone' } });
    const malformed = await post('{"TEST_PRIVATE_DETAIL":', 'application/json');
    assert.equal(malformed.status, 400);
    assert.doesNotMatch(await malformed.text(), /TEST_PRIVATE_DETAIL|SyntaxError|stack/);
    for (const route of ['/server-error', '/unknown-error']) {
      const response = await fetch(baseUrl + route);
      assert.equal(response.status, 500);
      assert.doesNotMatch(await response.text(), /TEST_PRIVATE_DETAIL|stack/);
    }
  });
});

test('Middleware giữ nguyên lỗi công khai 400 và lỗi nghiệp vụ 401/403/404', () => {
  for (const status of [400, 401, 403, 404]) {
    const error = status === 400
      ? { status, publicMessage: 'Thông báo an toàn' }
      : { status, errors: { general: 'Thông báo an toàn' } };
    const response = {
      status(code) { this.code = code; return this; },
      render(view, data) { this.view = view; this.data = data; },
    };
    errorHandler(error, {}, response, () => assert.fail('Không được bỏ qua lỗi'));
    assert.equal(response.code, status);
    assert.equal(response.data.message, 'Thông báo an toàn');
  }
});

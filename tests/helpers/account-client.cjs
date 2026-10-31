const { once } = require('node:events');
const { createApp } = require('../../src/app');
const { createUserRepository } = require('../../src/repositories/user-repository');
const { createAddressRepository } = require('../../src/repositories/address-repository');
const { createAccountDatabase } = require('./account-database.cjs');

async function withAccountApp(callback, limitOptions = { ipMax: 100, pairMax: 100, registerMax: 100 }, cartRepository, checkoutRepository, orderRepository, adminProductRepository, adminOrderRepository, reviewRepository, adminCategoryRepository, couponRepository, advertisementRepository) {
  const database = createAccountDatabase();
  const store = new (require('express-session').MemoryStore)();
  const catalogRepository = {
    getCategories: async () => [], getHomeProducts: async () => ({ suggestions: [] }),
    getProducts: async () => ({ products: [], total: 0, totalPages: 0, page: 1 }),
    getProduct: async () => null, getImage: async () => null,
  };
  const app = createApp({ catalogRepository, userRepository: createUserRepository(database), addressRepository: createAddressRepository(database), cartRepository, checkoutRepository, orderRepository, adminProductRepository, adminOrderRepository, reviewRepository, adminCategoryRepository, couponRepository, advertisementRepository, sessionOptions: { store }, limitOptions });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    return {
      cookie: '', token: '',
      async request(path, options = {}) {
        const response = await fetch(base + path, { ...options, redirect: 'manual', headers: { ...options.headers, ...(this.cookie ? { Cookie: this.cookie } : {}) } });
        const cookie = response.headers.get('set-cookie');
        if (cookie) this.cookie = cookie.split(';')[0];
        const html = await response.text();
        const token = html.match(/name="_csrf" value="([a-f0-9]+)"/);
        if (token) this.token = token[1];
        return { status: response.status, html, headers: response.headers };
      },
      get(path) { return this.request(path); },
      post(path, data = {}, token = this.token) {
        return this.request(path, { method: 'POST', body: new URLSearchParams({ ...data, ...(token ? { _csrf: token } : {}) }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      },
    };
  }
  try { await callback({ database, client, base, store }); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

module.exports = { withAccountApp };

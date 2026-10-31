// Xem giao diện với dữ liệu test, không đổi .env hoặc cấu hình npm start.
const { openTestPool } = require('./test-db-config.cjs');
const { createApp } = require('../src/app');
const { createUserRepository } = require('../src/repositories/user-repository');
const { createAddressRepository } = require('../src/repositories/address-repository');
const { createCartRepository } = require('../src/repositories/cart-repository');
const { createCheckoutRepository } = require('../src/repositories/checkout-repository');
const { createOrderRepository } = require('../src/repositories/order-repository');
const { createCatalogRepository } = require('../src/repositories/catalog-repository');
async function main() {
  const pool=await openTestPool();
  const app=createApp({userRepository:createUserRepository(pool),addressRepository:createAddressRepository(pool),cartRepository:createCartRepository(pool),checkoutRepository:createCheckoutRepository(pool),orderRepository:createOrderRepository(pool),catalogRepository:createCatalogRepository(pool)});
  const server=app.listen(0,'127.0.0.1',()=>console.log('TEST_UI http://127.0.0.1:'+server.address().port));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(async()=>{await pool.end();process.exit(0);});});
}
if (!process.env.NODE_TEST_CONTEXT && process.argv.includes('--serve')) main().catch(e=>{console.error('Test UI unavailable:',e.code||'UNAVAILABLE');process.exitCode=1;});

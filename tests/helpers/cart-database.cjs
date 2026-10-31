const { CART_SQL } = require('../../src/repositories/cart-repository');

// Giả lập riêng trong bộ nhớ. Không kết nối MySQL; không chứng minh khóa InnoDB.
function createCartDatabase() {
  const state = {
    items: [], calls: [], fail: '',
    variants: [
      { variant_id: 1, product_id: 1, product_name: 'Tai nghe <test>', variant_name: 'Đen', sku: 'TEST-1', price: '100000.01', stock: 120, valid_variant: 1 },
      { variant_id: 2, product_id: 1, product_name: 'Tai nghe <test>', variant_name: 'Trắng', sku: 'TEST-2', price: '200000.02', stock: 2, valid_variant: 1 },
      { variant_id: 3, product_id: 2, product_name: 'Hết hàng', price: '50000.00', stock: 0, valid_variant: 1 },
      { variant_id: 4, product_id: 3, price: '0.00', stock: 10, valid_variant: 1 },
      { variant_id: 5, product_id: 4, price: '100.00', stock: 10, valid_variant: 0 },
    ],
  };
  let id = 0, queue = Promise.resolve();
  async function execute(sql, params) {
    const name = Object.keys(CART_SQL).find((key) => CART_SQL[key] === sql);
    if (!name) throw new Error('Unexpected test SQL');
    state.calls.push({ name, params: [...params] });
    if (state.fail === name) throw new Error('Injected database failure');
    if (name === 'list') return [state.items.filter((i) => i.user_id === params[0]).sort((a,b)=>b.cart_item_id-a.cart_item_id).map((i) => ({ ...state.variants.find((v) => v.variant_id === i.variant_id), ...i }))];
    if (name === 'lockUser') return [[{ user_id: params[0] }]];
    if (name === 'own') return [[...state.items.filter((i) => i.cart_item_id === params[0] && i.user_id === params[1])]];
    if (name === 'variant') return [[...state.variants.filter((v) => v.variant_id === params[0])]];
    if (name === 'existing') return [[...state.items.filter((i) => i.user_id === params[0] && i.variant_id === params[1])]];
    if (name === 'insert') { state.items.push({ cart_item_id: ++id, user_id: params[0], variant_id: params[1], quantity: params[2] }); return [{ insertId: id }]; }
    if (name === 'update') {
      const item = state.items.find((i) => i.cart_item_id === params[1] && i.user_id === params[2]);
      if (item) item.quantity = params[0];
      return [{ affectedRows: item ? 1 : 0 }];
    }
    if (name === 'remove') state.items = state.items.filter((i) => !(i.cart_item_id === params[0] && i.user_id === params[1]));
    if (name === 'clear') state.items = state.items.filter((i) => i.user_id !== params[0]);
    return [{ affectedRows: 1 }];
  }
  return { state, execute, async getConnection() {
    let unlock, before;
    return {
      async beginTransaction() {
        const previous = queue;
        queue = new Promise((resolve) => { unlock = resolve; });
        await previous;
        before = structuredClone(state.items);
      },
      execute,
      async commit() {
        if (state.fail === 'commit') throw new Error('Injected commit failure');
        state.calls.push({ name: 'commit' });
      },
      async rollback() { state.items = before; state.calls.push({ name: 'rollback' }); },
      release() { state.calls.push({ name: 'release' }); unlock(); },
    };
  } };
}

module.exports = { createCartDatabase };

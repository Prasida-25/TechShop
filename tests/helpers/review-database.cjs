const { REVIEW_SQL: SQL } = require('../../src/repositories/review-repository');

function createReviewDatabase() {
  const state = {
    orders: [{ order_id: 1, user_id: 1, status: 'delivered' }, { order_id: 2, user_id: 2, status: 'delivered' }, { order_id: 3, user_id: 1, status: 'delivered' }],
    items: [1, 2, 3].map(id => ({ order_id: id, order_item_id: id, product_id: 1, product_name: 'Tai nghe lúc mua', variant_name: 'Đen' })),
    products: [{ product_id: 1, product_name: 'Tên hiện tại <TEST>' }], reviews: [], calls: [], fail: '',
  };
  let queue = Promise.resolve();
  async function execute(sql, params = []) {
    state.calls.push({ sql, params: [...params] });
    if (state.fail === 'all' || state.fail && sql === SQL[state.fail]) throw new Error('PRIVATE SQL/config');
    if (sql === SQL.target || sql === SQL.target + ' FOR UPDATE') {
      const order = state.orders.find(o => o.order_id === params[0] && o.user_id === params[2]);
      const item = state.items.find(i => i.order_id === params[0] && i.order_item_id === params[1]);
      return [[...(order && item && state.products.some(p => p.product_id === item.product_id) ? [{ ...item, status: order.status }] : [])]];
    }
    if (sql === SQL.existing) return [structuredClone(state.reviews.filter(r => r.user_id === params[0] && r.product_id === params[1]))];
    if (sql === SQL.insert) {
      if (state.reviews.some(r => r.user_id === params[0] && r.product_id === params[1] || r.order_item_id === params[2])) throw Object.assign(new Error('PRIVATE DUP'), { code: 'ER_DUP_ENTRY' });
      const id = state.reviews.length + 1;
      state.reviews.push({ review_id: id, user_id: params[0], product_id: params[1], order_item_id: params[2], rating: params[3], comment: params[4], created_at_label: '23/10/2026 10:00' });
      return [{ insertId: id }];
    }
    if (sql === SQL.product) return [structuredClone(state.products.filter(p => p.product_id === params[0]))];
    if (sql === SQL.count) return [[{ total: state.reviews.filter(r => r.product_id === params[0]).length }]];
    if (sql.startsWith(SQL.list)) return [structuredClone(state.reviews.filter(r => r.product_id === params[0]).sort((a, b) => b.review_id - a.review_id).slice(Number(sql.slice(SQL.list.length)), Number(sql.slice(SQL.list.length)) + 20))];
    throw new Error('Unexpected review SQL');
  }
  return { state, execute, async getConnection() {
    let unlock, snapshot;
    return { execute,
      async beginTransaction() { const previous = queue; queue = new Promise(r => { unlock = r; }); await previous; snapshot = structuredClone(state.reviews); },
      async commit() { if (state.fail === 'commit') throw new Error('TEST_BEFORE_COMMIT'); state.calls.push({ sql: 'commit' }); },
      async rollback() { state.reviews = snapshot; state.calls.push({ sql: 'rollback' }); },
      release() { state.calls.push({ sql: 'release' }); unlock(); },
    };
  } };
}
module.exports = { createReviewDatabase };

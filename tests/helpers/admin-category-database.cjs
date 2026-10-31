const { CATEGORY_SQL: SQL } = require('../../src/repositories/admin-category-repository');
function createCategoryDatabase() {
  const state = { categories: [{ category_id: 1, category_name: 'Có sản phẩm', description: null }, { category_id: 2, category_name: 'Rỗng', description: null }], products: [{ product_id: 1, category_id: 1 }], calls: [], fail: '' };
  let queue = Promise.resolve();
  const count = id => state.products.filter(p => p.category_id === id).length;
  const enriched = rows => structuredClone(rows.map(c => ({ ...c, product_count: count(c.category_id) })));
  async function execute(sql, params = []) {
    state.calls.push({ sql, params: [...params] });
    if (state.fail && (sql === SQL[state.fail] || state.fail === 'all')) throw new Error('PRIVATE_CATEGORY_SQL');
    if (sql === SQL.lock) return [structuredClone(state.categories.filter(c => c.category_id === params[0]))];
    if (sql === SQL.detail) return [enriched(state.categories.filter(c => c.category_id === params[0]))];
    if (sql === SQL.used) return [structuredClone(state.products.filter(p => p.category_id === params[0]).slice(0, 1))];
    if (sql === SQL.create || sql === SQL.update) {
      if (state.categories.some(c => c.category_id !== params[2] && c.category_name.toLowerCase() === params[0].toLowerCase())) throw Object.assign(new Error('PRIVATE_DUP'), { code: 'ER_DUP_ENTRY' });
      if (sql === SQL.create) {
        const id = Math.max(0, ...state.categories.map(c => c.category_id)) + 1;
        state.categories.push({ category_id: id, category_name: params[0], description: params[1] }); return [{ insertId: id }];
      }
      const row = state.categories.find(c => c.category_id === params[2]); Object.assign(row, { category_name: params[0], description: params[1] }); return [{ affectedRows: 1 }];
    }
    if (sql === SQL.remove) {
      const n = state.categories.length; state.categories = state.categories.filter(c => c.category_id !== params[0]); return [{ affectedRows: n - state.categories.length }];
    }
    const q = params.length ? params[0].slice(1, -1).replace(/!(.)/g, '$1').toLowerCase() : '';
    const filtered = state.categories.filter(c => c.category_name.toLowerCase().includes(q)).sort((a, b) => a.category_name.localeCompare(b.category_name) || a.category_id - b.category_id);
    if (sql.startsWith('SELECT COUNT(*) total')) return [[{ total: filtered.length }]];
    if (sql.startsWith('SELECT c.category_id')) { const offset = Number(sql.match(/OFFSET (\d+)$/)[1]); return [enriched(filtered.slice(offset, offset + 20))]; }
    throw new Error('Unhandled category SQL');
  }
  return { state, execute, async getConnection() {
    let unlock, snapshot;
    return { execute,
      async beginTransaction() { const prev = queue; queue = new Promise(r => { unlock = r; }); await prev; snapshot = structuredClone(state.categories); },
      async commit() { if (state.fail === 'commit') throw new Error('TEST_BEFORE_COMMIT'); state.calls.push({ sql: 'commit' }); },
      async rollback() { state.categories = snapshot; state.calls.push({ sql: 'rollback' }); },
      release() { state.calls.push({ sql: 'release' }); unlock(); },
    };
  } };
}
module.exports = { createCategoryDatabase };

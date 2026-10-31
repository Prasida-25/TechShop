const { ADMIN_ORDER_SQL: SQL } = require('../../src/repositories/admin-order-repository');
const { COUPON_SQL } = require('../../src/repositories/coupon-repository');

// SQL giả lập có mutex transaction. Không phải bằng chứng khóa InnoDB thật.
function createAdminOrderDatabase() {
  const order = (id, user) => ({ order_id: id, user_id: user, buyer_name: 'Khách TEST '+user,
    receiver_name: 'Người nhận lúc đặt', phone: '0900000001', address_detail: 'Địa chỉ cũ', ward: 'Phường cũ', district: '', province: 'Tỉnh cũ',
    created_at_label: '23/10/2026 10:00', updated_at_label: '23/10/2026 10:00', status: 'pending', payment_method: 'cod', payment_status: 'unpaid',
    total_amount: '130000.01', expired: 0 });
  const state = { orders: [order(1,1),order(2,2)], items: [1,2].map(id => ({ order_item_id: id, order_id: id, variant_id: 1, product_id: 1,
    product_name: 'Tai nghe <TEST> lúc mua', variant_name: 'Đen cũ', sku: 'OLD-SKU', quantity: 1, unit_price: '100000.01' })),
    variants: [{ variant_id: 1, product_id: 1, stock: 3 }], coupons:[], calls: [], fail: '', failVariant: null };
  const clone = value => structuredClone(value);
  let queue = Promise.resolve();
  function filtered(sql, params) {
    let index = 0, result = [...state.orders];
    if (sql.includes('o.status=?')) result = result.filter(o => o.status === params[index++]);
    if (sql.includes('o.order_id=? OR')) {
      const id = params[index++], term = params[index].slice(1,-1).replace(/!(.)/g,'$1').toLowerCase();
      result = result.filter(o => o.order_id === id || [o.receiver_name,o.phone,o.buyer_name].some(v => String(v).toLowerCase().includes(term)));
    }
    return result.sort((a,b) => b.order_id-a.order_id);
  }
  async function execute(sql, params = []) {
    state.calls.push({sql,params:[...params]});
    if(sql===COUPON_SQL.lock)return [clone(state.coupons.filter(c=>c.coupon_id===params[0]))];
    if(sql===COUPON_SQL.release){ const c=state.coupons.find(c=>c.coupon_id===params[0]&&c.used_count>0);if(c)c.used_count--;return [{affectedRows:c?1:0}]; }
    const name = Object.keys(SQL).find(key => SQL[key] === sql);
    if (state.fail && (state.fail === name || state.fail === 'all')) throw new Error('PRIVATE SQL/config TEST');
    if (sql === SQL.detail || sql === SQL.lock || sql === SQL.age) return [clone(state.orders.filter(o => o.order_id === params[0]))];
    if (sql === SQL.items || sql === SQL.restoreItems) return [clone(state.items.filter(i => i.order_id === params[0]).sort((a,b) => (a.variant_id||0)-(b.variant_id||0)))];
    if (sql === SQL.variant) return [clone(state.variants.filter(v => v.variant_id === params[0]))];
    if (sql === SQL.restore) {
      const v = state.variants.find(v => v.variant_id === params[1]);
      if (!v || state.failVariant === params[1] || v.stock > 2147483647-params[0]) return [{affectedRows:0}];
      v.stock += params[0]; return [{affectedRows:1}];
    }
    if (sql === SQL.status) {
      const o = state.orders.find(o => o.order_id === params[1] && o.status === params[2]);
      if (!o) return [{affectedRows:0}]; o.status = params[0]; return [{affectedRows:1}];
    }
    if (sql === SQL.confirmCod) {
      const o = state.orders.find(o => o.order_id === params[0] && o.status === 'delivered' && o.payment_method === 'cod' && o.payment_status === 'unpaid');
      if (!o) return [{affectedRows:0}]; o.payment_status = 'paid'; return [{affectedRows:1}];
    }
    if(sql===SQL.confirmBank){const o=state.orders.find(o=>o.order_id===params[0]&&o.status==='pending'&&o.payment_method==='bank'&&o.payment_status==='unpaid'&&!o.expired);if(o)o.payment_status='paid';return [{affectedRows:o?1:0}];}
    if (sql === SQL.expired) return [state.orders.filter(o => o.order_id > params[0] && o.status === 'pending' && o.expired && ['cod','bank'].includes(o.payment_method) && o.payment_status === 'unpaid').sort((a,b)=>a.order_id-b.order_id).slice(0,50).map(o=>({order_id:o.order_id}))];
    if (sql.startsWith('SELECT COUNT(*) total')) return [[{total:filtered(sql,params).length}]];
    if (sql.startsWith('SELECT o.order_id,o.user_id')) {
      const offset = Number(sql.match(/OFFSET (\d+)$/)[1]);
      return [clone(filtered(sql,params).slice(offset,offset+20).map(o=>({...o,quantity:state.items.filter(i=>i.order_id===o.order_id).reduce((n,i)=>n+i.quantity,0)})))];
    }
    throw new Error('Unhandled admin order SQL');
  }
  return {state,execute,async getConnection(){
    let unlock, snapshot;
    return {execute,
      async beginTransaction(){ const previous=queue;queue=new Promise(r=>{unlock=r;});await previous;snapshot=clone({orders:state.orders,variants:state.variants,coupons:state.coupons});state.calls.push({sql:'begin'}); },
      async commit(){state.calls.push({sql:'commit'});},
      async rollback(){state.calls.push({sql:'rollback'});Object.assign(state,snapshot);},
      release(){state.calls.push({sql:'release'});unlock();},
    };
  }};
}
module.exports = {createAdminOrderDatabase};

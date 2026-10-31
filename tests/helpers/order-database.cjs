const { ORDER_SQL } = require('../../src/repositories/order-repository');

function createOrderDatabase() {
  const states = ['pending', 'confirmed', 'shipping', 'delivered', 'cancelled'];
  const state = {
    orders: Array.from({ length: 22 }, (_, i) => ({ order_id: i + 1, user_id: 1,
      created_at_label: '22/10/2026 10:00', total_amount: '145000.01', status: states[i % 5],
      payment_method: 'cod', payment_status: 'unpaid', address_id: null,
      receiver_name: 'Người nhận lúc đặt', phone: '0900000001', address_detail: 'Địa chỉ lúc đặt',
      ward: 'Phường cũ', district: '', province: 'Tỉnh cũ',
    })).concat([{ order_id: 999, user_id: 2, total_amount: '100.00', status: 'delivered', receiver_name: 'PRIVATE OTHER USER' }]),
    items: Array.from({ length: 22 }, (_, i) => ({ order_item_id: i + 1, order_id: i + 1,
      product_id: null, variant_id: null, product_name: 'Tai nghe <script>thử</script>', variant_name: 'Đen lúc mua',
      sku: 'OLD-SKU', quantity: 1, unit_price: '100000.01',
    })),
    calls: [], fail: false,
  };
  return { state, async execute(sql, params) {
    state.calls.push({ sql, params: [...params] });
    if (state.fail) throw new Error('PRIVATE SQL/password/config');
    const matches = o => o.user_id === params[0] && (!params[1] || params[1]==='all' || o.status===params[1] || params[1]==='unpaid' && o.status==='pending' && o.payment_method==='bank' && o.payment_status==='unpaid');
    if (sql === ORDER_SQL.count) return [[{ total: state.orders.filter(matches).length }]];
    if (sql.startsWith(ORDER_SQL.list)) {
      const offset = Number(sql.slice(ORDER_SQL.list.length));
      return [state.orders.filter(matches).sort((a, b) => b.order_id - a.order_id).slice(offset, offset + 10)];
    }
    if (sql.startsWith(ORDER_SQL.listItems)) return [state.items.filter(i=>params.slice(1).includes(i.order_id) && state.orders.some(o=>o.order_id===i.order_id && o.user_id===params[0]))];
    if (sql === ORDER_SQL.own) return [[...state.orders.filter((o) => o.order_id === params[0] && o.user_id === params[1])]];
    if (sql === ORDER_SQL.items) {
      const own = state.orders.some((o) => o.order_id === params[0] && o.user_id === params[1]);
      return [own ? state.items.filter((i) => i.order_id === params[0]) : []];
    }
    throw new Error('Unexpected order test SQL');
  } };
}

module.exports = { createOrderDatabase };

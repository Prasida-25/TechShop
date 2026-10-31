const { CHECKOUT_SQL } = require('../../src/repositories/checkout-repository');
const { CART_SQL } = require('../../src/repositories/cart-repository');
const { ADDRESS_SQL } = require('../../src/repositories/address-repository');
const { ORDER_SQL } = require('../../src/repositories/order-repository');
const { COUPON_SQL } = require('../../src/repositories/coupon-repository');

function createCheckoutDatabase() {
  const state = {
    carts: [{ cart_item_id: 1, user_id: 1, variant_id: 1, quantity: 1 }, { cart_item_id: 2, user_id: 2, variant_id: 1, quantity: 1 }],
    variants: [1, 2].map((id) => ({ variant_id: id, product_id: 1, product_name: 'Tai nghe <thử>',
      variant_name: 'Màu ' + id, sku: 'TEST-' + id, price: '100000.01', stock: 5, valid_variant: 1 })),
    addresses: [1, 2].map((id) => ({ address_id: id, user_id: id, receiver_name: 'Người nhận ' + id,
      phone: '0900000001', address_detail: 'Đường thử', ward: 'Phường thử', district: '', province: 'Tỉnh thử', is_default: 1 })),
    orders: [], orderItems: [], coupons: [], calls: [], fail: '', failStockId: 0, failItemAt: 0,
  };
  let queue = Promise.resolve(), orderId = 0, cartId = 2;
  const sqlNames = { ...CHECKOUT_SQL, list: CART_SQL.list, lockUser: CART_SQL.lockUser, clear: CART_SQL.clear, addresses: ADDRESS_SQL.list,
    cartVariant: CART_SQL.variant, ownCart: CART_SQL.own, existing: CART_SQL.existing,
    addCart: CART_SQL.insert, updateCart: CART_SQL.update, removeCart: CART_SQL.remove,
    couponByCode:COUPON_SQL.byCode,couponLock:COUPON_SQL.lock,couponClock:COUPON_SQL.clock,couponConsume:COUPON_SQL.consume };
  async function execute(sql, params) {
    // Adapter đọc đơn dùng chung dữ liệu vừa đặt, vẫn hoàn toàn trong bộ nhớ.
    const matches = o => o.user_id === params[0] && (!params[1] || params[1]==='all' || o.status===params[1] || params[1]==='unpaid' && o.status==='pending' && o.payment_method==='bank' && o.payment_status==='unpaid');
    if (sql === ORDER_SQL.count) return [[{ total: state.orders.filter(matches).length }]];
    if (sql.startsWith(ORDER_SQL.list)) {
      const offset = Number(sql.slice(ORDER_SQL.list.length));
      return [state.orders.filter(matches).sort((a,b) => b.order_id-a.order_id).slice(offset,offset+10)];
    }
    if(sql.startsWith(ORDER_SQL.listItems)) return [state.orderItems.filter(i=>params.slice(1).includes(i.order_id) && state.orders.some(o=>o.order_id===i.order_id&&o.user_id===params[0]))];
    if (sql === ORDER_SQL.own) return [[...state.orders.filter((o) => o.order_id === params[0] && o.user_id === params[1])]];
    if (sql === ORDER_SQL.items) return [state.orders.some((o) => o.order_id === params[0] && o.user_id === params[1]) ? state.orderItems.filter((i) => i.order_id === params[0]) : []];
    const name = Object.keys(sqlNames).find((n) => sqlNames[n] === sql);
    if (!name) throw new Error('Unexpected checkout test SQL');
    state.calls.push({ name, params: [...params] });
    if (state.fail === name) throw new Error('Private SQL/config test error');
    if(name==='couponByCode')return [structuredClone(state.coupons.filter(c=>c.code===params[0]))];
    if(name==='couponLock'||name==='couponClock')return [structuredClone(state.coupons.filter(c=>c.coupon_id===params[0]))];
    if(name==='couponConsume') {
      const c=state.coupons.find(c=>c.coupon_id===params[0]);
      if(!c||!c.is_active||c.expired||c.not_started||(c.max_uses!=null&&c.used_count>=c.max_uses))return [{affectedRows:0}];
      c.used_count++;return [{affectedRows:1}];
    }
    if (name === 'list') return [state.carts.filter((c) => c.user_id === params[0]).sort((a,b)=>b.cart_item_id-a.cart_item_id).map((c) => ({ ...state.variants.find((v) => v.variant_id === c.variant_id), ...c }))];
    if (name === 'addresses') return [state.addresses.filter((a) => a.user_id === params[0])];
    if (name === 'lockUser') return [[{ user_id: params[0] }]];
    if (name === 'cart') return [state.carts.filter((c) => c.user_id === params[0]).sort((a, b) => a.variant_id - b.variant_id)];
    if (name === 'variant') return [[...state.variants.filter((v) => v.variant_id === params[0])]];
    if (name === 'cartVariant') return [[...state.variants.filter((v) => v.variant_id === params[0])]];
    if (name === 'ownCart') return [[...state.carts.filter((c) => c.cart_item_id === params[0] && c.user_id === params[1])]];
    if (name === 'existing') return [[...state.carts.filter((c) => c.user_id === params[0] && c.variant_id === params[1])]];
    if (name === 'addCart') { state.carts.push({ cart_item_id: ++cartId, user_id: params[0], variant_id: params[1], quantity: params[2] }); return [{ insertId: cartId }]; }
    if (name === 'updateCart') { const c = state.carts.find((c) => c.cart_item_id === params[1] && c.user_id === params[2]); if (c) c.quantity=params[0]; return [{ affectedRows: c ? 1 : 0 }]; }
    if (name === 'removeCart') { const before=state.carts.length; state.carts=state.carts.filter((c) => !(c.cart_item_id === params[0] && c.user_id === params[1])); return [{ affectedRows: before-state.carts.length }]; }
    if (name === 'address') return [[...state.addresses.filter((a) => a.address_id === params[0] && a.user_id === params[1])]];
    if (name === 'stock') {
      const v = state.variants.find((v) => v.variant_id === params[1]);
      if (!v || v.stock < params[2] || state.failStockId === v.variant_id) return [{ affectedRows: 0 }];
      v.stock -= params[0]; return [{ affectedRows: 1 }];
    }
    if (name === 'order') {
      const keys = ['user_id','address_id','receiver_name','phone','address_detail','ward','district','province','total_amount','coupon_id','coupon_code','discount_amount','shipping_fee'];
      const row = Object.fromEntries(keys.map((key, i) => [key, params[i]]));
      state.orders.push({ ...row, order_id: ++orderId, status: 'pending', payment_method: params[13], payment_status: 'unpaid' });
      return [{ insertId: orderId }];
    }
    if (name === 'item') {
      if (state.failItemAt && state.calls.filter((c) => c.name === 'item').length === state.failItemAt) throw new Error('Injected item failure after partial insert');
      const keys = ['order_id','product_id','variant_id','product_name','variant_name','sku','quantity','unit_price'];
      state.orderItems.push({ order_item_id: state.orderItems.length + 1, ...Object.fromEntries(keys.map((key, i) => [key, params[i]])) });
      return [{ affectedRows: 1 }];
    }
    if (name === 'clear') {
      const count = state.carts.filter((c) => c.user_id === params[0]).length;
      state.carts = state.carts.filter((c) => c.user_id !== params[0]);
      return [{ affectedRows: count }];
    }
    if (name === 'confirmation') return [[...state.orders.filter((o) => o.order_id === params[0] && o.user_id === params[1])]];
  }
  return { state, execute, async getConnection() {
    let unlock, before;
    return {
      async beginTransaction() {
        const previous = queue; queue = new Promise((resolve) => { unlock = resolve; }); await previous;
        before = structuredClone({ carts: state.carts, variants: state.variants, orders: state.orders, orderItems: state.orderItems, coupons:state.coupons });
        state.calls.push({ name: 'begin' });
      },
      execute,
      async commit() { if (state.fail === 'commit') throw new Error('Commit test failure'); state.calls.push({ name: 'commit' }); },
      async rollback() { Object.assign(state, before); state.calls.push({ name: 'rollback' }); },
      release() { state.calls.push({ name: 'release' }); unlock(); },
    };
  } };
}

module.exports = { createCheckoutDatabase };

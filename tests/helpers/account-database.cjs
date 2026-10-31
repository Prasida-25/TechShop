// Database giả lập trong bộ nhớ, không kết nối hoặc ghi MySQL thật.
const { USER_SQL } = require('../../src/repositories/user-repository');
const { ADDRESS_SQL } = require('../../src/repositories/address-repository');

function createAccountDatabase() {
  const state = { users: [], addresses: [], orders: [], calls: [], failNextClear: false };
  let userId = 0, addressId = 0;
  const queues = new Map();
  const copy = (value) => structuredClone(value);
  const duplicate = () => Object.assign(new Error('test duplicate'), { code: 'ER_DUP_ENTRY' });

  async function execute(sql, params = [], connection) {
    state.calls.push({ sql, params: params.map((value, index) => sql === USER_SQL.create && index === 2 || sql === USER_SQL.password && index !== 1 ? '[test hash]' : value) });
    if (sql === USER_SQL.byId) return [[copy(state.users.find((user) => user.user_id === params[0]))].filter(Boolean)];
    if (sql === USER_SQL.byPhone) return [[copy(state.users.find((user) => user.phone === params[0]))].filter(Boolean)];
    if (sql === USER_SQL.create) {
      if (state.users.some((user) => user.phone === params[1])) throw duplicate();
      const row = { user_id: ++userId, full_name: params[0], phone: params[1], password: params[2], role: 'user' };
      state.users.push(row); return [{ insertId: row.user_id, affectedRows: 1 }];
    }
    if (sql === USER_SQL.profile) {
      if (state.users.some((user) => user.phone === params[1] && user.user_id !== params[2])) throw duplicate();
      const row = state.users.find((user) => user.user_id === params[2]);
      if (row) Object.assign(row, { full_name: params[0], phone: params[1] });
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql === USER_SQL.password) {
      const row = state.users.find((user) => user.user_id === params[1] && user.password === params[2]);
      if (row) row.password = params[0];
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql === ADDRESS_SQL.lock) {
      await connection.lockUser(params[0]);
      return [[copy(state.users.find((user) => user.user_id === params[0]))].filter(Boolean)];
    }
    if (sql === ADDRESS_SQL.list) return [copy(state.addresses.filter((row) => row.user_id === params[0]).sort((a,b) => b.is_default-a.is_default || a.address_id-b.address_id))];
    if (sql === ADDRESS_SQL.own) return [copy(state.addresses.filter((row) => row.address_id === params[0] && row.user_id === params[1]))];
    if (sql === ADDRESS_SQL.insert) {
      assertLocked(connection, params[0]);
      const row = { address_id: ++addressId, user_id: params[0], receiver_name: params[1], phone: params[2], address_detail: params[3], ward: params[4], district: params[5], province: params[6], is_default: params[7] };
      state.addresses.push(row); return [{ insertId: row.address_id, affectedRows: 1 }];
    }
    if (sql === ADDRESS_SQL.update) {
      assertLocked(connection, params[8]);
      const row = state.addresses.find((item) => item.address_id === params[7] && item.user_id === params[8]);
      if (row) Object.assign(row, { receiver_name: params[0], phone: params[1], address_detail: params[2], ward: params[3], district: params[4], province: params[5], is_default: params[6] });
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql === ADDRESS_SQL.clear) {
      assertLocked(connection, params[0]);
      for (const row of state.addresses.filter((item) => item.user_id === params[0])) row.is_default = 0;
      if (state.failNextClear) { state.failNextClear = false; throw new Error('test transaction failure'); }
      return [{ affectedRows: 1 }];
    }
    if (sql === ADDRESS_SQL.default) {
      assertLocked(connection, params[1]);
      const row = state.addresses.find((item) => item.address_id === params[0] && item.user_id === params[1]);
      if (row) row.is_default = 1;
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql === ADDRESS_SQL.delete) {
      assertLocked(connection, params[1]);
      const index = state.addresses.findIndex((item) => item.address_id === params[0] && item.user_id === params[1]);
      if (index >= 0) {
        state.addresses.splice(index, 1);
        for (const order of state.orders.filter((item) => item.address_id === params[0])) order.address_id = null;
      }
      return [{ affectedRows: index >= 0 ? 1 : 0 }];
    }
    throw new Error('SQL not handled by isolated test database');
  }

  function assertLocked(connection, id) {
    if (!connection || connection.userId !== id) throw new Error('Address mutation without user lock');
  }

  async function getConnection() {
    let unlock, addressSnapshot, orderSnapshot;
    const connection = {
      userId: null,
      async beginTransaction() {},
      async lockUser(id) {
        const previous = queues.get(id) || Promise.resolve();
        const next = new Promise((resolve) => { unlock = resolve; });
        queues.set(id, next);
        await previous;
        connection.userId = id;
        addressSnapshot = copy(state.addresses.filter((row) => row.user_id === id));
        orderSnapshot = copy(state.orders.filter((row) => row.user_id === id));
      },
      execute: (sql, params) => execute(sql, params, connection),
      async commit() {},
      async rollback() {
        if (connection.userId !== null) {
          state.addresses = [...state.addresses.filter((row) => row.user_id !== connection.userId), ...addressSnapshot];
          state.orders = [...state.orders.filter((row) => row.user_id !== connection.userId), ...orderSnapshot];
        }
      },
      release() { if (unlock) unlock(); },
    };
    return connection;
  }
  return { state, execute, getConnection };
}

module.exports = { createAccountDatabase };

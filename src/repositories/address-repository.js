const { getPool } = require('../config/database');
const { AccountError } = require('../utils/account-validation');

const ADDRESS_SQL = {
  list: 'SELECT address_id, user_id, receiver_name, phone, address_detail, ward, district, province, is_default FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, address_id ASC',
  own: 'SELECT address_id, user_id, receiver_name, phone, address_detail, ward, district, province, is_default FROM user_addresses WHERE address_id = ? AND user_id = ?',
  lock: 'SELECT user_id FROM users WHERE user_id = ? FOR UPDATE',
  insert: 'INSERT INTO user_addresses (user_id, receiver_name, phone, address_detail, ward, district, province, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  update: 'UPDATE user_addresses SET receiver_name = ?, phone = ?, address_detail = ?, ward = ?, district = ?, province = ?, is_default = ? WHERE address_id = ? AND user_id = ?',
  clear: 'UPDATE user_addresses SET is_default = 0 WHERE user_id = ?',
  default: 'UPDATE user_addresses SET is_default = 1 WHERE address_id = ? AND user_id = ?',
  delete: 'DELETE FROM user_addresses WHERE address_id = ? AND user_id = ?',
};

function createAddressRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args), getConnection: () => getPool().getConnection() };
  const notFound = () => new AccountError({ general: 'Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn.' }, 404);

  async function withUserLock(userId, run) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [[user]] = await connection.execute(ADDRESS_SQL.lock, [userId]);
      if (!user) throw notFound();
      const result = await run(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async function list(userId) { const [rows] = await db.execute(ADDRESS_SQL.list, [userId]); return rows; }
  async function findOwn(userId, id) { const [[row]] = await db.execute(ADDRESS_SQL.own, [id, userId]); return row || null; }
  async function setDefault(connection, userId, id) {
    await connection.execute(ADDRESS_SQL.clear, [userId]);
    await connection.execute(ADDRESS_SQL.default, [id, userId]);
  }

  async function save(userId, data, id = null) {
    return withUserLock(userId, async (connection) => {
      const [rows] = await connection.execute(ADDRESS_SQL.list, [userId]);
      const current = id ? rows.find((row) => Number(row.address_id) === id) : null;
      if (id && !current) throw notFound();
      // Giữ địa chỉ mặc định khi sửa; đổi mặc định bằng thao tác chọn địa chỉ khác.
      const isDefault = data.is_default || rows.length === 0 || Boolean(current?.is_default);
      const fields = [data.receiver_name, data.phone, data.address_detail, data.ward, data.district, data.province, isDefault ? 1 : 0];
      if (id) await connection.execute(ADDRESS_SQL.update, [...fields, id, userId]);
      else {
        const [result] = await connection.execute(ADDRESS_SQL.insert, [userId, ...fields]);
        id = result.insertId;
      }
      if (isDefault) await setDefault(connection, userId, id);
      return id;
    });
  }

  async function makeDefault(userId, id) {
    return withUserLock(userId, async (connection) => {
      const [[row]] = await connection.execute(ADDRESS_SQL.own, [id, userId]);
      if (!row) throw notFound();
      await setDefault(connection, userId, id);
    });
  }

  async function remove(userId, id) {
    return withUserLock(userId, async (connection) => {
      const [[row]] = await connection.execute(ADDRESS_SQL.own, [id, userId]);
      if (!row) throw notFound();
      // FK orders.address_id SET NULL; không chạm vào bản sao địa chỉ trong orders.
      await connection.execute(ADDRESS_SQL.delete, [id, userId]);
      if (row.is_default) {
        const [remaining] = await connection.execute(ADDRESS_SQL.list, [userId]);
        if (remaining.length) {
          const next = [...remaining].sort((a, b) => a.address_id - b.address_id)[0];
          await setDefault(connection, userId, next.address_id);
        }
      }
    });
  }
  return { list, findOwn, save, makeDefault, remove };
}

module.exports = { createAddressRepository, ADDRESS_SQL };

const { getPool } = require('../config/database');

const USER_SQL = {
  byId: 'SELECT user_id, full_name, phone, password, role FROM users WHERE user_id = ?',
  byPhone: 'SELECT user_id, full_name, phone, password, role FROM users WHERE phone = ?',
  create: "INSERT INTO users (full_name, phone, password, role) VALUES (?, ?, ?, 'user')",
  profile: 'UPDATE users SET full_name = ?, phone = ? WHERE user_id = ?',
  password: 'UPDATE users SET password = ? WHERE user_id = ? AND password = ?',
};

function createUserRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args) };
  return {
    async findById(id) { const [[row]] = await db.execute(USER_SQL.byId, [id]); return row || null; },
    async findByPhone(phone) { const [[row]] = await db.execute(USER_SQL.byPhone, [phone]); return row || null; },
    async create(data, hash) {
      const [result] = await db.execute(USER_SQL.create, [data.full_name, data.phone, hash]);
      return result.insertId;
    },
    async updateProfile(id, data) { await db.execute(USER_SQL.profile, [data.full_name, data.phone, id]); },
    async updatePassword(id, hash, oldHash) {
      const [result] = await db.execute(USER_SQL.password, [hash, id, oldHash]);
      return result.affectedRows === 1;
    },
  };
}

module.exports = { createUserRepository, USER_SQL };

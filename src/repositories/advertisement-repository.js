const { getPool } = require('../config/database');
const { AdvertisementError } = require('../services/advertisement-service');
const metadata = 'advertisement_id,title,target_url,position,sort_order,is_active,created_at,updated_at';

function createAdvertisementRepository(database) {
  const db = database || { execute: (...args) => getPool().execute(...args) };
  return {
    async list() {
      const [rows] = await db.execute(`SELECT ${metadata} FROM advertisement ORDER BY position,sort_order,advertisement_id`);
      return rows;
    },
    async home() {
      // Không lấy BLOB khi dựng HTML. Giữ một banner lớn và tối đa bốn ô nhỏ.
      const [hero] = await db.execute(`SELECT ${metadata} FROM advertisement WHERE is_active=1 AND position='hero' ORDER BY sort_order,advertisement_id LIMIT 1`);
      const [promotion] = await db.execute(`SELECT ${metadata} FROM advertisement WHERE is_active=1 AND position='promotion' ORDER BY sort_order,advertisement_id LIMIT 4`);
      return { hero, promotion };
    },
    async detail(id) {
      const [[row]] = await db.execute(`SELECT ${metadata} FROM advertisement WHERE advertisement_id=?`, [id]);
      return row || null;
    },
    async image(id, activeOnly = true) {
      const [[row]] = await db.execute(`SELECT image_data,image_mime_type FROM advertisement WHERE advertisement_id=?${activeOnly ? ' AND is_active=1' : ''}`, [id]);
      return row || null;
    },
    async save(id, data) {
      const fields = ['title', 'target_url', 'position', 'sort_order', 'is_active'];
      if (data.image_data) fields.push('image_data', 'image_mime_type');
      const values = fields.map(field => data[field]);
      if (id) {
        const [result] = await db.execute(`UPDATE advertisement SET ${fields.map(field => `${field}=?`).join(',')} WHERE advertisement_id=?`, [...values, id]);
        if (!result.affectedRows) {
          const [[row]] = await db.execute('SELECT advertisement_id FROM advertisement WHERE advertisement_id=?', [id]);
          if (!row) throw new AdvertisementError({ general: 'Quảng cáo không tồn tại.' }, 404);
        }
        return id;
      }
      const [result] = await db.execute(`INSERT INTO advertisement (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, values);
      return result.insertId;
    },
    async status(id, active) {
      await db.execute('UPDATE advertisement SET is_active=? WHERE advertisement_id=?', [active, id]);
      const [[row]] = await db.execute('SELECT advertisement_id FROM advertisement WHERE advertisement_id=?', [id]);
      return Boolean(row);
    },
    async remove(id) {
      const [result] = await db.execute('DELETE FROM advertisement WHERE advertisement_id=?', [id]);
      return result.affectedRows > 0;
    },
  };
}
module.exports = { createAdvertisementRepository };

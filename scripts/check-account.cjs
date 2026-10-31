// Kiểm tra schema/cú pháp trên MySQL thật, không tạo tài khoản hoặc địa chỉ.
const { getPool, closePool } = require('../src/config/database');
const { USER_SQL } = require('../src/repositories/user-repository');
const { ADDRESS_SQL } = require('../src/repositories/address-repository');

async function main() {
  const connection = await getPool().getConnection();
  try {
    const counts = {};
    for (const table of ['users', 'user_addresses', 'products']) {
      const [[row]] = await connection.execute(`SELECT COUNT(*) AS total FROM ${table}`);
      counts[table] = row.total;
    }
    let prepared = 0;
    for (const sql of [...Object.values(USER_SQL), ...Object.values(ADDRESS_SQL)]) {
      // COM_STMT_PREPARE chỉ phân tích truy vấn và tên cột/quyền; không EXECUTE.
      const statement = await connection.prepare(sql);
      await statement.close();
      prepared++;
    }
    const [rules] = await connection.execute(`SELECT TABLE_NAME, CONSTRAINT_NAME, DELETE_RULE, UPDATE_RULE
      FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ?
      AND TABLE_NAME IN ('orders', 'user_addresses')`, [process.env.DB_NAME]);
    console.log(JSON.stringify({ counts, preparedStatementsNotExecuted: prepared, foreignKeyRules: rules }, null, 2));
    console.log('Chưa kiểm thử ghi tài khoản/địa chỉ trên MySQL thật. Chỉ đọc metadata và PREPARE, không EXECUTE lệnh ghi.');
  } finally { connection.release(); }
}

main().catch(() => {
  console.error('Không hoàn tất kiểm tra schema/truy vấn tài khoản; đã ẩn chi tiết kết nối.');
  process.exitCode = 1;
}).finally(closePool);

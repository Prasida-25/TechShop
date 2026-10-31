const mysql = require('mysql2/promise');
const { getDatabaseOptions } = require('./environment');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...getDatabaseOptions(),
      connectionLimit: 5,
      waitForConnections: true,
      queueLimit: 10,
    });
  }
  return pool;
}

async function checkConnection() {
  // SELECT hằng số chỉ kiểm tra kết nối, không đọc/ghi dữ liệu nghiệp vụ.
  await getPool().execute('SELECT 1');
}

async function closePool() {
  if (pool) {
    const currentPool = pool;
    pool = undefined;
    await currentPool.end();
  }
}

function describeDatabaseError(error) {
  const hints = {
    ECONNREFUSED: 'Không kết nối được MySQL. Kiểm tra dịch vụ MySQL, DB_HOST và DB_PORT.',
    ETIMEDOUT: 'Kết nối MySQL hết thời gian chờ. Kiểm tra địa chỉ, cổng và firewall.',
    ENOTFOUND: 'Không tìm thấy máy chủ MySQL. Kiểm tra DB_HOST.',
    ER_ACCESS_DENIED_ERROR: 'MySQL từ chối đăng nhập. Kiểm tra DB_USER, DB_PASSWORD và quyền kết nối.',
    ER_DBACCESS_DENIED_ERROR: 'Tài khoản MySQL không có quyền truy cập DB_NAME.',
    ER_BAD_DB_ERROR: 'Database không tồn tại. Kiểm tra DB_NAME; ứng dụng không tự tạo database.',
    ER_TABLEACCESS_DENIED_ERROR: 'Tài khoản MySQL không có quyền đọc metadata được yêu cầu.',
  };
  if (hints[error.code]) return `${error.code}: ${hints[error.code]}`;

  // Các thông báo tự tạo chỉ chứa tên biến. Không trả error.message từ driver.
  if (/^(Thiếu biến môi trường:|DB_PORT phải là)/.test(error.message || '')) {
    return error.message;
  }
  return 'Không thể kết nối/đọc thông tin MySQL. Kiểm tra cấu hình, quyền và dịch vụ MySQL.';
}

module.exports = { getPool, checkConnection, closePool, describeDatabaseError };

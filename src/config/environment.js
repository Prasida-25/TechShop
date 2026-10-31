const path = require('node:path');

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env'),
  quiet: true,
});

function readPort(name, defaultValue) {
  const value = process.env[name] ?? defaultValue;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 65535) {
    // Chỉ nêu tên biến, không in giá trị cấu hình.
    throw new Error(`${name} phải là số nguyên từ 1 đến 65535.`);
  }
  return Number(value);
}

function getDatabaseOptions() {
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter((name) => process.env[name] === undefined ||
    (name !== 'DB_PASSWORD' && process.env[name].trim() === ''));
  if (missing.length) {
    throw new Error(`Thiếu biến môi trường: ${missing.join(', ')}.`);
  }

  return {
    host: process.env.DB_HOST,
    port: readPort('DB_PORT'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 10000,
    multipleStatements: false,
  };
}

module.exports = { readPort, getDatabaseOptions };

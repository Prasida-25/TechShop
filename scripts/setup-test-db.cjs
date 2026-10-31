// Chạy riêng khi được phép tạo môi trường test. Không được gọi từ npm start.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { getDatabaseOptions } = require('../src/config/environment');

async function main() {
  if (!process.argv.includes('--create')) throw new Error('CREATE_FLAG_REQUIRED');
  const file = path.join(__dirname, '..', '.env.test.local');
  if (fs.existsSync(file)) throw new Error('TEST_CONFIG_ALREADY_EXISTS');
  const source = getDatabaseOptions();
  const target = 'techshop_test';
  if (source.database === target) throw new Error('SOURCE_IS_TEST_DATABASE');
  if (!process.argv.includes('--isolated')) throw new Error('ISOLATED_FLAG_REQUIRED');
  const local = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.test-admin.local')));
  const adminOptions = { host: '127.0.0.1', port: Number(local.PORT), user: 'root', password: local.PASSWORD };
  if (source.host === adminOptions.host && source.port === adminOptions.port) throw new Error('SOURCE_ENDPOINT_MATCH');
  const admin = await mysql.createConnection(adminOptions);
  const reader = await mysql.createConnection(source);
  try {
    await require('./test-db-config.cjs').assertIsolatedInstance(admin);
    const [[exists]] = await admin.execute('SELECT COUNT(*) AS count FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [target]);
    if (Number(exists.count)) throw new Error('TEST_DATABASE_ALREADY_EXISTS');
    const [tables] = await reader.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME', [source.database, 'BASE TABLE']);
    const [keys] = await reader.execute('SELECT TABLE_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL', [source.database]);
    const pending = new Set(tables.map((t) => t.TABLE_NAME)), ordered = [];
    while (pending.size) {
      const ready = [...pending].filter((name) => !keys.some((k) => k.TABLE_NAME === name && pending.has(k.REFERENCED_TABLE_NAME)));
      if (!ready.length) throw new Error('CYCLIC_SCHEMA');
      for (const name of ready) { pending.delete(name); ordered.push(name); }
    }
    // Chỉ sao chép DDL metadata, không SELECT dữ liệu nguồn, không chạy dump.
    const definitions = [];
    for (const name of ordered) {
      const [[row]] = await reader.query('SHOW CREATE TABLE ' + mysql.escapeId(source.database) + '.' + mysql.escapeId(name));
      definitions.push(row['Create Table'].replace(/ AUTO_INCREMENT=\d+/g, ''));
    }
    await admin.query('CREATE DATABASE ' + mysql.escapeId(target) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await admin.query('USE ' + mysql.escapeId(target));
    for (const ddl of definitions) await admin.query(ddl);
    const user = 'tz_test_' + crypto.randomBytes(4).toString('hex');
    const password = crypto.randomBytes(32).toString('base64url');
    const account = mysql.escape(user) + "@'localhost'";
    await admin.query('CREATE USER ' + account + ' IDENTIFIED BY ' + mysql.escape(password));
    await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ' + mysql.escapeId(target) + '.* TO ' + account);
    const config = { TEST_DB_HOST: adminOptions.host, TEST_DB_PORT: adminOptions.port, TEST_DB_USER: user, TEST_DB_PASSWORD: password, TEST_DB_NAME: target };
    fs.writeFileSync(file, Object.entries(config).map(([k,v]) => `${k}=${JSON.stringify(String(v))}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Created isolated test database, ' + ordered.length + ' empty InnoDB tables and restricted account. Secrets saved only in ignored local config.');
  } finally { await reader.end(); await admin.end(); }
}
main().catch((error) => { console.error('Test setup failed:', error.code || (/^[A-Z_]+$/.test(error.message) ? error.message : 'UNAVAILABLE')); process.exitCode = 1; });

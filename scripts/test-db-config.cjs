const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { getDatabaseOptions } = require('../src/config/environment');

async function assertIsolatedInstance(connection) {
  const runtime = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.test-runtime', 'instance.json')));
  const expected = runtime.args.find((a) => a.startsWith('--datadir=')).slice('--datadir='.length);
  const port = Number(runtime.args.find((a) => a.startsWith('--port=')).slice('--port='.length));
  const [[row]] = await connection.query('SELECT @@datadir AS dir, @@port AS port');
  if (path.resolve(row.dir).toLowerCase() !== path.resolve(expected).toLowerCase() || Number(row.port) !== port) throw new Error('WRONG_MYSQL_INSTANCE');
}

async function openTestPool() {
  const file = path.join(__dirname, '..', '.env.test.local');
  const config = dotenv.parse(fs.readFileSync(file));
  const source = getDatabaseOptions();
  if (config.TEST_DB_NAME !== 'techshop_test' || config.TEST_DB_NAME === source.database || config.TEST_DB_USER === source.user) throw new Error('UNSAFE_TEST_TARGET');
  const pool = mysql.createPool({ host: config.TEST_DB_HOST, port: Number(config.TEST_DB_PORT), user: config.TEST_DB_USER,
    password: config.TEST_DB_PASSWORD, database: config.TEST_DB_NAME, connectionLimit: 10, connectTimeout: 10000, multipleStatements: false });
  try {
    await assertIsolatedInstance(pool);
    const [[row]] = await pool.query('SELECT DATABASE() AS db');
    if (row.db !== 'techshop_test') throw new Error('WRONG_TEST_DATABASE');
    const [grants] = await pool.query('SHOW GRANTS FOR CURRENT_USER');
    const statements = grants.map((r) => Object.values(r)[0]);
    if (statements.some((s) => !/^GRANT USAGE ON \*\.\* TO /.test(s) && !/^GRANT SELECT, INSERT, UPDATE, DELETE ON `techshop_test`\.\* TO /.test(s))) throw new Error('UNEXPECTED_TEST_PRIVILEGES');
    return pool;
  } catch (error) { await pool.end(); throw error; }
}
module.exports = { openTestPool, assertIsolatedInstance };

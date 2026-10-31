// Instance riêng, không dùng Windows service hoặc data directory của website.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const adminFile = path.join(__dirname, '..', '.env.test-admin.local');
const runtimeFile = path.join(__dirname, '..', '.test-runtime', 'instance.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (process.argv.includes('--stop')) {
    const config = dotenv.parse(fs.readFileSync(adminFile));
    const c = await mysql.createConnection({ host: '127.0.0.1', port: Number(config.PORT), user: 'root', password: config.PASSWORD });
    try { await require('./test-db-config.cjs').assertIsolatedInstance(c); await c.query('SHUTDOWN'); } finally { await c.end().catch(() => {}); }
    console.log('Isolated test instance stopped. Test data retained.'); return;
  }
  const exe = process.env.TEST_MYSQLD_PATH || 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe';
  if (!fs.existsSync(exe)) throw new Error('MYSQLD_NOT_FOUND');
  if (fs.existsSync(runtimeFile)) {
    const info = JSON.parse(fs.readFileSync(runtimeFile));
    const config = dotenv.parse(fs.readFileSync(adminFile));
    const connect = () => mysql.createConnection({ host: '127.0.0.1', port: Number(config.PORT), user: 'root', password: config.PASSWORD, connectTimeout: 500 });
    try { const existing = await connect(); await existing.end(); console.log('Isolated test instance is already running.'); return; } catch {}
    const child = spawn(exe, info.args, { cwd: os.tmpdir(), stdio: ['ignore','pipe','pipe'], windowsHide: true });
    child.stdout.resume(); child.stderr.resume();
    for (let i=0;i<60;i++) {
      try { const c=await connect(); await c.end(); console.log('Isolated test instance restarted.'); return; }
      catch { await sleep(250); }
    }
    throw new Error('ISOLATED_RESTART_FAILED');
  }
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'techshop-mysql-'));
  const basedir = path.dirname(path.dirname(exe));
  const init = spawn(exe, ['--no-defaults', '--initialize-insecure', '--basedir=' + basedir, '--datadir=' + data], { cwd: os.tmpdir(), stdio: 'ignore', windowsHide: true });
  const [code] = await once(init, 'exit'); if (code !== 0) throw new Error('INITIALIZE_FAILED');
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise((r) => probe.close(r));
  const args = ['--no-defaults', '--console', '--basedir=' + basedir, '--datadir=' + data, '--bind-address=127.0.0.1', '--port=' + port, '--mysqlx=OFF', '--innodb-buffer-pool-size=64M'];
  const child = spawn(exe, args, { cwd: os.tmpdir(), stdio: ['ignore','pipe','pipe'], windowsHide: true });
  child.stdout.resume(); child.stderr.resume();
  let c;
  for (let i = 0; i < 60; i++) {
    try { c = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', connectTimeout: 500 }); break; }
    catch { await sleep(250); }
  }
  if (!c) throw new Error('ISOLATED_START_FAILED');
  try {
    const password = crypto.randomBytes(32).toString('base64url');
    await c.query("ALTER USER 'root'@'localhost' IDENTIFIED BY " + mysql.escape(password));
    fs.writeFileSync(adminFile, `PORT=${port}\nPASSWORD=${password}\n`, { flag: 'wx', mode: 0o600 });
    fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
    fs.writeFileSync(runtimeFile, JSON.stringify({ args, pid: child.pid }), { flag: 'wx' });
    console.log('Isolated localhost MySQL initialized; credentials are in ignored local files only.');
  } finally { await c.end(); }
}
if (!process.env.NODE_TEST_CONTEXT && (process.argv.includes('--start') || process.argv.includes('--stop'))) main().catch((e) => { console.error('Test instance failed:', e.code || (/^[A-Z_]+$/.test(e.message) ? e.message : 'UNAVAILABLE')); process.exitCode = 1; });

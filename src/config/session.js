require('./environment');
const crypto = require('node:crypto');
const session = require('express-session');

const COOKIE_NAME = 'techzone.sid';

function createSessionConfig(options = {}) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Session hiện chỉ cấu hình cho demo local. Cần duyệt store production trước khi triển khai.');
  }
  const secret = options.secret || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  if (secret.length < 32) throw new Error('SESSION_SECRET cần ít nhất 32 ký tự; không in giá trị cấu hình.');
  const store = options.store || new session.MemoryStore();
  const middleware = session({
    name: COOKIE_NAME, secret, store,
    resave: false, saveUninitialized: false, rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', path: '/', maxAge: 2 * 60 * 60 * 1000 },
  });

  async function destroyUserSessions(userId) {
    const sessions = await new Promise((resolve, reject) => store.all((error, rows) => error ? reject(error) : resolve(rows || {})));
    await Promise.all(Object.entries(sessions).filter(([, value]) => value.userId === userId)
      .map(([id]) => new Promise((resolve, reject) => store.destroy(id, (error) => error ? reject(error) : resolve()))));
  }

  function clearCookie(req, res) {
    res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax', secure: req.secure });
  }
  return { middleware, store, secret, destroyUserSessions, clearCookie };
}

module.exports = { createSessionConfig, COOKIE_NAME };

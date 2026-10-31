const { AccountError, safeReturnTo, normalizePhone } = require('../utils/account-validation');

function createAuthController(service, sessions) {
  function showLogin(req, res) {
    if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/');
    const notices = { registered: 'Đăng ký thành công. Bạn có thể đăng nhập.', loggedout: 'Bạn đã đăng xuất.', changed: 'Đã đổi mật khẩu và hủy các phiên đăng nhập cũ. Vui lòng đăng nhập lại.' };
    const notice = ['registered', 'loggedout', 'changed'].find((key) => req.query[key] === '1');
    res.set('Cache-Control', 'no-store');
    res.render('account/login', { title: 'Đăng nhập — TechZone', errors: {}, values: {},
      returnTo: safeReturnTo(req.query.returnTo), notice: notice ? notices[notice] : '' });
  }

  function showRegister(req, res) {
    if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/account');
    res.set('Cache-Control', 'no-store');
    res.render('account/register', { title: 'Đăng ký — TechZone', errors: {}, values: {} });
  }

  async function register(req, res) {
    if (req.user) return res.redirect(303, req.user.role === 'admin' ? '/admin' : '/account');
    try { await service.register(req.body); }
    catch (error) {
      if (!(error instanceof AccountError)) throw error;
      return res.status(error.status).render('account/register', {
        title: 'Đăng ký — TechZone', errors: error.errors,
        values: { full_name: typeof req.body.full_name === 'string' ? req.body.full_name.slice(0, 100) : '', phone: normalizePhone(req.body.phone) },
      });
    }
    res.redirect(303, '/login?registered=1');
  }

  async function login(req, res) {
    const returnTo = safeReturnTo(req.body?.returnTo);
    try {
      const auth = await service.login(req.body);
      await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
      req.session.userId = auth.user.user_id;
      // HMAC phục vụ thu hồi session, không chứa mật khẩu hoặc hash mật khẩu.
      req.session.authVersion = auth.authVersion;
      await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
      res.redirect(303, auth.user.role === 'admin' ? '/admin' : returnTo);
    } catch (error) {
      if (!(error instanceof AccountError)) throw error;
      res.status(error.status).render('account/login', {
        title: 'Đăng nhập — TechZone', errors: error.errors, notice: '',
        values: { phone: normalizePhone(req.body?.phone) }, returnTo,
      });
    }
  }

  async function logout(req, res) {
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    sessions.clearCookie(req, res);
    res.redirect(303, '/login?loggedout=1');
  }
  return { showLogin, showRegister, register, login, logout };
}

module.exports = { createAuthController };

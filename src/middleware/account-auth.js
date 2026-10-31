const { safeReturnTo } = require('../utils/account-validation');

function createLoadUser(service) {
  return async function loadUser(req, res, next) {
    res.locals.currentUser = null;
    if (req.session.userId !== undefined) {
      const user = await service.sessionUser(req.session);
      if (!user) {
        // Session cũ sau đổi mật khẩu hoặc tài khoản không còn hợp lệ.
        await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
      } else {
        req.user = user;
        res.locals.currentUser = user;
      }
    }
    next();
  };
}

function requireAuth(req, res, next) {
  // Middleware mount tại /admin nhận req.path='/' và baseUrl='/admin'.
  if (!req.user) return res.redirect(303, `/login?returnTo=${encodeURIComponent(safeReturnTo(req.baseUrl || req.path))}`);
  res.set('Cache-Control', 'no-store');
  next();
}

function requireCustomerAccount(req, res, next) {
  if (req.user?.role === 'admin') {
    if (['GET', 'HEAD'].includes(req.method)) return res.redirect(303, '/admin');
    return res.status(403).render('admin/message', {
      title: 'Không có quyền chỉnh sửa tài khoản — TechZone', status: 403,
      message: 'Tài khoản quản trị không được chỉnh sửa hồ sơ, địa chỉ hoặc mật khẩu qua chức năng tài khoản.',
    });
  }
  next();
}

module.exports = { createLoadUser, requireAuth, requireCustomerAccount };

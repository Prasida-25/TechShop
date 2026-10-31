const express = require('express');
const { requireAuth, requireCustomerAccount } = require('../middleware/account-auth');
const { createAuthController } = require('../controllers/auth-controller');
const { createAccountController } = require('../controllers/account-controller');
const { createLoginLimits } = require('../middleware/login-limits');

function createAccountRouter(service, sessions, limitOptions) {
  const router = express.Router();
  const auth = createAuthController(service, sessions);
  const account = createAccountController(service, sessions);
  const limits = createLoginLimits(limitOptions);
  // Các response tài khoản không được cache, bao gồm form lỗi.
  router.use(['/register', '/login', '/logout', '/account'], (req, res, next) => {
    res.set('Cache-Control', 'no-store'); next();
  });
  router.get('/register', auth.showRegister);
  router.post('/register', limits.register, auth.register);
  router.get('/login', auth.showLogin);
  router.post('/login', limits.loginIp, limits.loginPair, auth.login);
  router.post('/logout', requireAuth, auth.logout);
  router.use('/account', requireCustomerAccount);
  router.get('/account', requireAuth, account.profile);
  router.post('/account/profile', requireAuth, account.updateProfile);
  router.get('/account/addresses', requireAuth, account.showAddresses);
  router.post('/account/addresses', requireAuth, account.saveAddress);
  router.post('/account/addresses/:addressId/update', requireAuth, account.saveAddress);
  router.post('/account/addresses/:addressId/delete', requireAuth, account.removeAddress);
  router.post('/account/addresses/:addressId/default', requireAuth, account.defaultAddress);
  router.get('/account/change-password', requireAuth, account.showPassword);
  router.post('/account/change-password', requireAuth, account.changePassword);
  return router;
}

module.exports = { createAccountRouter };

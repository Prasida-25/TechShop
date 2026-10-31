const express = require('express');
const { requireAuth } = require('../middleware/account-auth');
const { safeReturnTo } = require('../utils/account-validation');
const { createCartRepository } = require('../repositories/cart-repository');
const { createCartService } = require('../services/cart-service');
const { createCartController } = require('../controllers/cart-controller');

function createCartRouter(repository = createCartRepository()) {
  const router = express.Router();
  const controller = createCartController(createCartService(repository));
  router.get('/cart/preview', (req, res) => {
    if (!req.user) return res.status(401).json({ message:'Vui lòng đăng nhập để xem giỏ hàng.' });
    return controller.preview(req, res);
  });
  router.use('/cart', (req, res, next) => {
    if (!req.user) {
      let returnTo = '/cart';
      if (req.method === 'POST' && ['/items', '/buy-now'].includes(req.path)) {
        const productPage = safeReturnTo(req.body?.returnTo);
        if (productPage.startsWith('/products/')) returnTo = productPage;
      }
      return res.redirect(303, `/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
    return requireAuth(req, res, next);
  });
  router.get('/cart', controller.show);
  router.post('/cart/items', controller.add);
  router.post('/cart/buy-now', controller.buyNow);
  router.post('/cart/items/:cartItemId/update', controller.update);
  router.post('/cart/items/:cartItemId/delete', controller.remove);
  router.post('/cart/clear', controller.clear);
  return router;
}

module.exports = { createCartRouter };

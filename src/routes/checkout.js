const express = require('express');
const { createCheckoutRepository } = require('../repositories/checkout-repository');
const { createCheckoutService } = require('../services/checkout-service');
const { createCheckoutController } = require('../controllers/checkout-controller');

function createCheckoutRouter(repository = createCheckoutRepository()) {
  const router = express.Router();
  const controller = createCheckoutController(createCheckoutService(repository));
  router.use('/checkout', (req, res, next) => {
    if (!req.user) return res.redirect(303, '/login?returnTo=%2Fcheckout');
    next();
  });
  router.get('/checkout', controller.show);
  router.post('/checkout', controller.place);
  router.post('/checkout/payment', controller.selectPayment);
  router.post('/checkout/coupon', controller.applyCoupon);
  router.post('/checkout/coupon/remove', controller.removeCoupon);
  router.get('/checkout/success/:orderId', controller.success);
  return router;
}

module.exports = { createCheckoutRouter };

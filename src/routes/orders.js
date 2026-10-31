const express = require('express');
const { createOrderRepository } = require('../repositories/order-repository');
const { createOrderService } = require('../services/order-service');
const { createOrderController } = require('../controllers/order-controller');

function createOrderRouter(repository = createOrderRepository()) {
  const router = express.Router();
  const controller = createOrderController(createOrderService(repository));
  router.use('/orders', (req, res, next) => {
    if (!req.user) return res.redirect(303, '/login?returnTo=%2Forders');
    next();
  });
  router.get('/orders', controller.list);
  router.get('/orders/:orderId/payment', controller.payment);
  router.get('/orders/:orderId', controller.detail);
  return router;
}

module.exports = { createOrderRouter };

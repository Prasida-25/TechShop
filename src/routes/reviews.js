const express = require('express');
const { createReviewRepository } = require('../repositories/review-repository');
const { createReviewService } = require('../services/review-service');
const { createReviewController } = require('../controllers/review-controller');

function createReviewRouter(repository = createReviewRepository()) {
  const router = express.Router(), controller = createReviewController(createReviewService(repository));
  const authenticated = (req, res, next) => {
    if (!req.user) return res.redirect(303, '/login?returnTo=%2Forders');
    next();
  };
  router.get('/orders/:orderId/items/:itemId/review', authenticated, controller.form);
  router.post('/orders/:orderId/items/:itemId/review', authenticated, controller.create);
  router.get('/products/:productId/reviews', controller.list);
  return router;
}
module.exports = { createReviewRouter };

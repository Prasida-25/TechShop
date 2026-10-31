const express = require('express');
const { createCatalogRepository } = require('../repositories/catalog-repository');
const { createCatalogController } = require('../controllers/catalog-controller');
const { createAdvertisementController } = require('../controllers/advertisement-controller');

function createCatalogRouter(repository = createCatalogRepository(), advertisements, reviews) {
  const router = express.Router();
  const controller = createCatalogController(repository, advertisements, reviews);
  if (advertisements) router.get('/advertisements/:advertisementId/image', createAdvertisementController(null, advertisements).image);
  router.use((req, res, next) => {
    res.locals.catalogPage = true;
    next();
  });
  router.get('/', controller.home);
  router.get('/products', controller.list);
  router.get('/products/search', controller.list);
  router.get('/products/:id/image', controller.image);
  router.get('/products/:id/images/:imageId', controller.image);
  router.get('/products/:id/variants/:variantId/image', controller.image);
  router.get('/products/:id', controller.detail);
  return router;
}

module.exports = { createCatalogRouter };

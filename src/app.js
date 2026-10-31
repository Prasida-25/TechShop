const path = require("node:path");
const express = require("express");
const notFound = require("./middleware/not-found");
const errorHandler = require("./middleware/error-handler");
const { createCatalogRouter } = require("./routes/catalog");
const { createSessionConfig } = require("./config/session");
const { createCsrf } = require("./middleware/csrf");
const { createLoadUser } = require("./middleware/account-auth");
const { createUserRepository } = require("./repositories/user-repository");
const {
  createAddressRepository,
} = require("./repositories/address-repository");
const { createAccountService } = require("./services/account-service");
const { createAccountRouter } = require("./routes/account");
const { createCartRouter } = require("./routes/cart");
const { createCheckoutRouter } = require("./routes/checkout");
const { createOrderRouter } = require("./routes/orders");
const { createReviewRouter } = require("./routes/reviews");
const { createAdminRouter } = require("./routes/admin");
const { adminProductForm } = require("./middleware/admin-product-form");
const { createAdvertisementRepository } = require('./repositories/advertisement-repository');
const { createReviewRepository } = require('./repositories/review-repository');

function createApp({
  catalogRepository,
  userRepository,
  addressRepository,
  cartRepository,
  checkoutRepository,
  orderRepository,
  reviewRepository,
  adminProductRepository,
  adminOrderRepository,
  adminCategoryRepository,
  couponRepository,
  advertisementRepository,
  sessionOptions,
  limitOptions,
} = {}) {
  const app = express();
  const sessions = createSessionConfig(sessionOptions);
  const service = createAccountService(
    userRepository || createUserRepository(),
    addressRepository || createAddressRepository(),
    sessions.secret,
  );
  const csrf = createCsrf();

  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.locals.currentUser = null;
  app.locals.csrfToken = "";
  app.locals.filters = {};
  app.use(
    express.static(path.join(__dirname, "..", "public"), { dotfiles: "deny" }),
  );
  // HTML có token/session không được cache dùng chung; endpoint ảnh tự đặt cache riêng.
  app.use((req, res, next) => {
    res.locals.accountPath = req.path;
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 40 }),
  );
  app.use(sessions.middleware);
  app.use(createLoadUser(service));
  app.use("/admin/products", adminProductForm);
  app.use('/admin/advertisements', adminProductForm);
  app.use(csrf.protect);
  app.use(csrf.exposeToken);
  app.use(
    "/",
    createAdminRouter(
      adminProductRepository,
      adminOrderRepository,
      adminCategoryRepository,
      couponRepository,
      advertisementRepository,
    ),
  );
  app.use("/", createAccountRouter(service, sessions, limitOptions));
  app.use("/", createCartRouter(cartRepository));
  app.use("/", createCheckoutRouter(checkoutRepository));
  app.use("/", createOrderRouter(orderRepository));
  app.use("/", createReviewRouter(reviewRepository));
  // Khi catalog được giả lập trong test, không tự đọc quảng cáo từ MySQL thật.
  const advertisements = advertisementRepository || (catalogRepository
    ? { home: async () => ({ hero: [], promotion: [] }), image: async () => null }
    : createAdvertisementRepository());
  const productReviews = reviewRepository || (catalogRepository
    ? { list: async () => ({ reviews: [], total: 0 }) }
    : createReviewRepository());
  app.use("/", createCatalogRouter(catalogRepository, advertisements, productReviews));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp();
// Cho phép kiểm thử HTTP với repository giả lập, không cần ghi database thật.
module.exports.createApp = createApp;

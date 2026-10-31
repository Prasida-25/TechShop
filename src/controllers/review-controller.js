const { ReviewError } = require('../utils/review-validation');

function createReviewController(service) {
  const formUrl = req => `/orders/${req.params.orderId}/items/${req.params.itemId}/review`;
  const renderForm = async (req, res, errors = {}, values = {}, status = 200) => {
    const data = await service.form(req.user.user_id, req.params.orderId, req.params.itemId);
    return res.status(status).render('reviews/form', { title: 'Đánh giá sản phẩm — TechZone', ...data,
      orderId: req.params.orderId, action: formUrl(req), errors, values });
  };
  const handle = run => async (req, res) => {
    try { return await run(req, res); }
    catch (error) {
      if (!(error instanceof ReviewError)) throw error;
      return res.status(error.status).render('catalog/message', { title: 'Đánh giá — TechZone', status: error.status, message: error.message, filters: {} });
    }
  };
  return {
    form: handle((req, res) => renderForm(req, res)),
    create: handle(async (req, res) => {
      try { await service.create(req.user.user_id, req.params.orderId, req.params.itemId, req.body); }
      catch (error) {
        if (error instanceof ReviewError && error.status === 422) {
          const values = { rating: typeof req.body.rating === 'string' ? req.body.rating : '',
            comment: typeof req.body.comment === 'string' ? req.body.comment.slice(0, 4000) : '' };
          return await renderForm(req, res, error.errors, values, 422);
        }
        throw error;
      }
      return res.redirect(303, formUrl(req));
    }),
    list: handle(async (req, res) => res.render('reviews/index', { title: 'Đánh giá sản phẩm — TechZone', ...await service.list(req.params.productId, req.query), filters: {} })),
  };
}
module.exports = { createReviewController };

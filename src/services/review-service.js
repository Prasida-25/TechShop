const { reviewId, reviewInput } = require('../utils/review-validation');

function createReviewService(repository) {
  return {
    async form(userId, order, item) { return repository.form(userId, reviewId(order), reviewId(item)); },
    async create(userId, order, item, body) { return repository.create(userId, reviewId(order), reviewId(item), reviewInput(body)); },
    async list(product, query) {
      const page = typeof query.page === 'string' && /^[1-9]\d{0,7}$/.test(query.page) ? Number(query.page) : 1;
      return repository.list(reviewId(product), page);
    },
  };
}
module.exports = { createReviewService };

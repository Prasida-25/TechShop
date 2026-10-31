class ReviewError extends Error {
  constructor(message, status = 422, errors = {}) { super(message); this.status = status; this.errors = errors; }
}
function reviewId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) {
    throw new ReviewError('Không tìm thấy sản phẩm hoặc chi tiết đơn hàng.', 404);
  }
  return Number(value);
}
function reviewInput(body = {}) {
  const errors = {};
  if (typeof body.rating !== 'string' || !/^[1-5]$/.test(body.rating)) errors.rating = 'Chọn điểm đánh giá từ 1 đến 5.';
  const comment = body.comment === undefined ? '' : body.comment;
  if (typeof comment !== 'string' || [...comment].length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(comment)) {
    errors.comment = 'Nội dung tối đa 2.000 ký tự và không chứa ký tự điều khiển.';
  }
  if (Object.keys(errors).length) throw new ReviewError('Vui lòng kiểm tra nội dung đánh giá.', 422, errors);
  return { rating: Number(body.rating), comment: comment.trim() || null };
}
module.exports = { ReviewError, reviewId, reviewInput };

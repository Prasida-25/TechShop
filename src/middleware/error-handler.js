function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  // Chỉ nhận diện lỗi parser đã biết, không dùng tùy ý status/message của lỗi gốc.
  const tooLarge = error.status === 413 && ['entity.too.large', 'parameters.too.many'].includes(error.type);
  const malformed = error.status === 400 && error.type === 'entity.parse.failed';
  if (tooLarge || malformed) {
    const status = tooLarge ? 413 : 400;
    return res.status(status).render('error', {
      title: `${status} — TechZone`, status,
      message: tooLarge ? 'Yêu cầu quá lớn. Vui lòng giảm dữ liệu gửi lên rồi thử lại.'
        : 'Dữ liệu gửi lên không đúng định dạng. Vui lòng kiểm tra rồi thử lại.',
    });
  }

  if (error.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('account/message', {
      title: 'Biểu mẫu hết hạn — TechZone', filters: {},
      message: 'Biểu mẫu không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang rồi thử lại.',
    });
  }
  if (error.errors && [401, 403, 404, 409, 422].includes(error.status)) {
    return res.status(error.status).render('account/message', {
      title: 'Không thể thực hiện — TechZone', filters: {}, message: error.errors.general || 'Không thể thực hiện yêu cầu.',
    });
  }
  // Không chuyển message/stack/query/config từ lỗi gốc vào HTML hoặc log.
  if (error.status === 400 && error.publicMessage) {
    return res.status(400).render('catalog/message', {
      title: 'Tham số không hợp lệ — TechZone', status: 400,
      message: error.publicMessage, filters: {},
    });
  }
  console.error('[HTTP] Có lỗi khi xử lý yêu cầu.');
  res.status(500).render(res.locals.catalogPage ? 'catalog/message' : 'error', {
    title: '500 — TechZone',
    status: 500,
    message: 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại sau.',
    filters: {},
  });
}

module.exports = errorHandler;

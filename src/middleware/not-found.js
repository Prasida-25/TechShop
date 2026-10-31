function notFound(req, res) {
  res.status(404).render('error', {
    title: '404 — TechZone',
    status: 404,
    message: 'Không tìm thấy trang bạn yêu cầu.',
  });
}

module.exports = notFound;

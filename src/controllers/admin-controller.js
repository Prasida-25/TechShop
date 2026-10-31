function overview(req, res) {
  res.render('admin/index', { title: 'Quản trị — TechZone' });
}

function notFound(req, res) {
  res.status(404).render('admin/message', {
    title: 'Không tìm thấy trang quản trị — TechZone', status: 404,
    message: 'Trang hoặc thao tác quản trị này không tồn tại.',
  });
}

module.exports = { overview, notFound };

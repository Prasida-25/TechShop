// req.user do loadUser xác minh từ session và database ở mỗi request.
// Không đọc role/is_admin/user_id từ query, body hoặc header để cấp quyền.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).render('admin/message', {
      title: 'Không có quyền truy cập — TechZone', status: 403,
      message: 'Bạn không có quyền truy cập khu vực quản trị.',
    });
  }
  res.set('Cache-Control', 'no-store');
  return next();
}

module.exports = { requireAdmin };

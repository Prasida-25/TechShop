const express = require('express');

// Node hiện tại có Request.formData(): không cần thêm thư viện multipart.
// Parse trước CSRF để token trong form được kiểm tra; chỉ đọc file sau xác thực admin.
const read = express.raw({ type: 'multipart/form-data', limit: '2mb' });
const readMultiple = express.raw({ type: 'multipart/form-data', limit: '11mb' });
function adminProductForm(req, res, next) {
  if (req.method !== 'POST' || !req.is('multipart/form-data') || req.user?.role !== 'admin') return next();
  const productForm = req.path === '/' || /^\/[1-9]\d*\/update\/?$/.test(req.path);
  (productForm ? readMultiple : read)(req, res, async error => {
    if (error) return next(error);
    try {
      const form = await new Request('http://localhost/form', {
        method: 'POST', headers: { 'content-type': req.get('content-type') }, body: req.body,
      }).formData();
      const body = Object.create(null);
      let image = null, count = 0;
      const images = [];
      for (const [key, value] of form) {
        if (++count > 42) throw new Error('Invalid form');
        if (key === 'images') {
          if (!productForm || typeof value === 'string' || value.size > 1024 * 1024) throw new Error('Invalid image');
          if (value.size) images.push({ data: Buffer.from(await value.arrayBuffer()), type: value.type });
          if (images.length > 9) throw new Error('Too many images');
          continue;
        }
        if (Object.hasOwn(body, key)) throw new Error('Invalid form');
        if (typeof value === 'string') body[key] = value;
        else {
          if (key !== 'image' || image || value.size > 1024 * 1024) throw new Error('Invalid image');
          if (value.size) image = { data: Buffer.from(await value.arrayBuffer()), type: value.type };
          body[key] = ''; // Đánh dấu để chặn file/field trùng tên.
        }
      }
      req.body = body; req.productImage = image; req.productImages = images; next();
    } catch {
      res.status(400).render('admin/message', { title: 'Biểu mẫu không hợp lệ — TechZone', status: 400,
        message: `Không đọc được biểu mẫu. Mỗi ảnh tối đa 1 MB${productForm ? ', tối đa 9 ảnh bổ sung, tổng biểu mẫu tối đa 11 MB' : ', tổng biểu mẫu tối đa 2 MB'}; không gửi trường văn bản trùng tên.` });
    }
  });
}
module.exports = { adminProductForm };

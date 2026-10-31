const { AccountError, addressId } = require('../utils/account-validation');

function createAccountController(service, sessions) {
  const renderProfile = (res, values, errors = {}, status = 200, notice = '') => res.status(status).render('account/profile', {
    title: 'Hồ sơ — TechZone', values, errors, notice,
  });
  function profile(req, res) { renderProfile(res, req.user, {}, 200, req.query.updated === '1' ? 'Đã cập nhật hồ sơ.' : ''); }
  async function updateProfile(req, res) {
    try { await service.updateProfile(req.user.user_id, req.body); }
    catch (error) {
      if (!(error instanceof AccountError)) throw error;
      return renderProfile(res, {
        full_name: typeof req.body.full_name === 'string' ? req.body.full_name.slice(0, 100) : '',
        phone: typeof req.body.phone === 'string' ? req.body.phone.slice(0, 30) : '',
      }, error.errors, error.status);
    }
    res.redirect(303, '/account?updated=1');
  }

  async function showAddresses(req, res) {
    const rows = await service.listAddresses(req.user.user_id);
    let editing = null;
    if (req.query.edit !== undefined) {
      editing = await service.findAddress(req.user.user_id, addressId(req.query.edit));
      if (!editing) throw new AccountError({ general: 'Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn.' }, 404);
    }
    res.render('account/addresses', { title: 'Địa chỉ — TechZone', addresses: rows, editing,
      values: editing || {}, errors: {}, notice: req.query.saved === '1' ? 'Đã cập nhật danh sách địa chỉ.' : '' });
  }

  async function saveAddress(req, res) {
    const id = req.params.addressId === undefined ? null : addressId(req.params.addressId);
    try { await service.saveAddress(req.user.user_id, req.body, id); }
    catch (error) {
      if (!(error instanceof AccountError) || error.status === 404) throw error;
      const values = {};
      for (const field of ['receiver_name', 'phone', 'address_detail', 'ward', 'district', 'province']) values[field] = typeof req.body[field] === 'string' ? req.body[field].slice(0, 255) : '';
      values.is_default = req.body.is_default === '1';
      return res.status(error.status).render('account/addresses', { title: 'Địa chỉ — TechZone',
        addresses: await service.listAddresses(req.user.user_id), editing: id ? { address_id: id } : null,
        values, errors: error.errors, notice: '' });
    }
    res.redirect(303, '/account/addresses?saved=1');
  }

  async function removeAddress(req, res) {
    if (req.body?.confirm_delete !== '1') throw new AccountError({ general: 'Vui lòng xác nhận trước khi xóa địa chỉ.' });
    await service.removeAddress(req.user.user_id, addressId(req.params.addressId));
    res.redirect(303, '/account/addresses?saved=1');
  }
  async function defaultAddress(req, res) {
    await service.defaultAddress(req.user.user_id, addressId(req.params.addressId));
    res.redirect(303, '/account/addresses?saved=1');
  }
  function showPassword(req, res) {
    res.render('account/password', { title: 'Đổi mật khẩu — TechZone', errors: {} });
  }
  async function changePassword(req, res) {
    try { await service.changePassword(req.user.user_id, req.body); }
    catch (error) {
      if (!(error instanceof AccountError)) throw error;
      return res.status(error.status).render('account/password', { title: 'Đổi mật khẩu — TechZone', errors: error.errors });
    }
    await sessions.destroyUserSessions(req.user.user_id);
    sessions.clearCookie(req, res);
    // Không lưu lại session hiện tại sau khi đã thu hồi nó khỏi store.
    req.session = null;
    res.redirect(303, '/login?changed=1');
  }
  return { profile, updateProfile, showAddresses, saveAddress, removeAddress, defaultAddress, showPassword, changePassword };
}

module.exports = { createAccountController };

class AccountError extends Error {
  constructor(errors, status = 422) {
    super('Account validation failed');
    this.errors = errors;
    this.status = status;
  }
}

function text(body, field) {
  return typeof body?.[field] === 'string' ? body[field].trim() : '';
}

function normalizePhone(value) {
  if (typeof value !== 'string') return '';
  let phone = value.trim().replace(/[\s.()-]/g, '');
  if (/^\+?84[35789]\d{8}$/.test(phone)) phone = `0${phone.replace(/^\+?84/, '')}`;
  return /^0[35789]\d{8}$/.test(phone) ? phone : '';
}

function passwordValid(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128 &&
    /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}

function profileInput(body) {
  const data = { full_name: text(body, 'full_name').replace(/\s+/g, ' '), phone: normalizePhone(body?.phone) };
  const errors = {};
  if (!data.full_name || data.full_name.length > 100 || /[\u0000-\u001f\u007f]/.test(data.full_name)) errors.full_name = 'Họ tên phải từ 1 đến 100 ký tự.';
  if (!data.phone) errors.phone = 'Nhập số di động Việt Nam hợp lệ (10 số hoặc dạng +84).';
  if (Object.keys(errors).length) throw new AccountError(errors);
  return data;
}

function registrationInput(body) {
  let data, errors = {};
  try { data = profileInput(body); } catch (error) { errors = { ...error.errors }; }
  if (!passwordValid(body?.password)) errors.password = 'Mật khẩu cần 8–128 ký tự, có chữ cái và chữ số.';
  if (body?.confirm_password !== body?.password || typeof body?.confirm_password !== 'string') errors.confirm_password = 'Mật khẩu xác nhận không khớp.';
  if (Object.keys(errors).length) throw new AccountError(errors);
  return { ...data, password: body.password };
}

function passwordInput(body) {
  const errors = {};
  if (typeof body?.current_password !== 'string' || !body.current_password || body.current_password.length > 128) errors.current_password = 'Nhập mật khẩu hiện tại hợp lệ.';
  if (!passwordValid(body?.new_password)) errors.new_password = 'Mật khẩu cần 8–128 ký tự, có chữ cái và chữ số.';
  if (typeof body?.confirm_password !== 'string' || body.confirm_password !== body?.new_password) errors.confirm_password = 'Mật khẩu xác nhận không khớp.';
  if (Object.keys(errors).length) throw new AccountError(errors);
  return { current: body.current_password, next: body.new_password };
}

function addressInput(body) {
  const data = {};
  const errors = {};
  for (const [field, label, max] of [
    ['receiver_name', 'Người nhận', 100], ['address_detail', 'Địa chỉ chi tiết', 255],
    ['ward', 'Phường/Xã', 100], ['province', 'Tỉnh/Thành phố', 100], ['district', 'Quận/Huyện', 100],
  ]) {
    data[field] = text(body, field);
    if ((field !== 'district' && !data[field]) || data[field].length > max || /[\u0000-\u001f\u007f]/.test(data[field])) errors[field] = `${label} ${field === 'district' ? 'tối đa' : 'cần từ 1 đến'} ${max} ký tự.`;
  }
  data.phone = normalizePhone(body?.phone);
  if (!data.phone) errors.phone = 'Số điện thoại người nhận không hợp lệ.';
  data.is_default = body?.is_default === '1' || body?.is_default === 'on';
  if (Object.keys(errors).length) throw new AccountError(errors);
  return data;
}

function addressId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) {
    throw new AccountError({ general: 'Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn.' }, 404);
  }
  return Number(value);
}

function safeReturnTo(value) {
  if (['/', '/account', '/account/addresses', '/account/change-password', '/cart', '/checkout', '/orders', '/admin'].includes(value)) return value;
  // Chỉ quay lại trang sản phẩm nội bộ, không nhận URL tùy ý từ form.
  const product = typeof value === 'string' && value.match(/^\/products\/([1-9]\d{0,9})(?:\?variant=([1-9]\d{0,9}))?$/);
  if (product && product[0] === value && Number(product[1]) <= 2147483647 &&
      (!product[2] || Number(product[2]) <= 2147483647)) return value;
  return '/';
}

module.exports = { AccountError, normalizePhone, passwordValid, profileInput, registrationInput, passwordInput, addressInput, addressId, safeReturnTo };

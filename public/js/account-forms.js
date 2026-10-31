document.querySelectorAll('[data-account-form]').forEach((form) => {
  const find = (name) => form.elements.namedItem(name);
  const validate = () => {
    const phone = find('phone');
    if (phone) {
      const normalized = phone.value.trim().replace(/[\s.()-]/g, '').replace(/^\+?84/, '0');
      phone.setCustomValidity(/^0[35789]\d{8}$/.test(normalized) ? '' : 'Nhập số di động Việt Nam hợp lệ.');
    }
    const password = find('new_password') || (form.dataset.accountForm === 'register' ? find('password') : null);
    if (password) password.setCustomValidity(password.value.length >= 8 && password.value.length <= 128 && /[A-Za-z]/.test(password.value) && /[0-9]/.test(password.value) ? '' : 'Mật khẩu cần 8–128 ký tự, có chữ cái và chữ số.');
    const confirmation = find('confirm_password');
    if (confirmation && password) confirmation.setCustomValidity(confirmation.value === password.value ? '' : 'Mật khẩu xác nhận không khớp.');
    for (const field of ['full_name', 'receiver_name', 'address_detail', 'ward', 'province']) {
      const input = find(field);
      if (input) input.setCustomValidity(input.value.trim() ? '' : 'Vui lòng nhập thông tin này.');
    }
  };
  form.addEventListener('input', validate);
  form.addEventListener('submit', (event) => {
    validate();
    if (!form.checkValidity()) { event.preventDefault(); form.reportValidity(); }
  });
});

document.querySelectorAll('[data-confirm-delete]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm('Bạn chắc chắn muốn xóa địa chỉ này?')) event.preventDefault();
  });
});

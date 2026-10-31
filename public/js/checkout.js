const checkoutForm = document.querySelector('[data-checkout-form]');
if (checkoutForm) {
  const button = checkoutForm.querySelector('button[type=submit]');
  const status = checkoutForm.querySelector('[data-checkout-status]');
  const originalLabel = button.textContent;
  checkoutForm.addEventListener('submit', (event) => {
    if (checkoutForm.dataset.submitting === '1') { event.preventDefault(); return; }
    if (!checkoutForm.checkValidity()) return;
    checkoutForm.dataset.submitting = '1';
    button.disabled = true;
    button.textContent = 'Đang đặt hàng…';
    checkoutForm.setAttribute('aria-busy', 'true');
    status.textContent = 'Đang xử lý đơn hàng, vui lòng chờ…';
  });
  // Khi quay lại từ lịch sử trình duyệt, backend vẫn kiểm tra token và giỏ mới.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    checkoutForm.dataset.submitting = '';
    checkoutForm.removeAttribute('aria-busy');
    button.disabled = false;
    button.textContent = originalLabel;
    status.textContent = '';
  });
}

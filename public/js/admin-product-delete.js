(() => {
  const dialog = document.querySelector('[data-product-delete-dialog]');
  const message = document.querySelector('[data-product-delete-message]');
  const approved = new WeakSet();
  let pending = null;

  document.querySelectorAll('[data-confirm-product-delete]').forEach(form => {
    form.addEventListener('submit', event => {
      if (approved.has(form)) { approved.delete(form); return; }
      const question = `Bạn có muốn xóa sản phẩm “${form.dataset.productName}” không?`;
      if (!dialog || typeof dialog.showModal !== 'function') {
        if (!window.confirm(question + '\nCác biến thể và dòng giỏ liên quan cũng sẽ bị xóa.')) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (dialog.open) return;
      pending = form;
      message.textContent = question;
      // Reset trước mỗi lần mở: Escape sau lần xác nhận trước không được xóa.
      dialog.returnValue = 'cancel';
      dialog.showModal();
    });
  });

  if (dialog) dialog.addEventListener('close', () => {
    const form = pending;
    pending = null;
    if (dialog.returnValue === 'delete' && form) {
      approved.add(form);
      form.requestSubmit();
    }
  });
})();

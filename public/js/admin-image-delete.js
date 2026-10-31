(() => {
  const dialog = document.querySelector('[data-image-delete-dialog]');
  const message = document.querySelector('[data-image-delete-message]');
  const approved = new WeakSet();
  let pending = null;
  document.querySelectorAll('[data-confirm-image-delete]').forEach(form => {
    form.addEventListener('submit', event => {
      if (approved.has(form)) { approved.delete(form); return; }
      const question = `Bạn có muốn xóa ${form.dataset.imageLabel} không? Ảnh đã xóa không thể khôi phục.`;
      if (!dialog || typeof dialog.showModal !== 'function') {
        if (!window.confirm(question)) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (dialog.open) return;
      pending = form;
      message.textContent = question;
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

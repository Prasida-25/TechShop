document.addEventListener('submit', event => {
  const form = event.target;
  if (form.matches('[data-advertisement-delete]') && !window.confirm(`Xóa quảng cáo “${form.dataset.title}”?`)) event.preventDefault();
});

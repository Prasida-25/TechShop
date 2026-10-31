const addressDialog = document.querySelector('[data-address-dialog]');
if (addressDialog && typeof addressDialog.showModal === 'function') {
  // Không có JavaScript: form vẫn hiển thị trực tiếp và gửi POST bình thường.
  addressDialog.close();
  if (addressDialog.dataset.autoOpen === '1' || new URLSearchParams(location.search).get('new') === '1') addressDialog.showModal();
  document.querySelector('[data-address-open]')?.addEventListener('click', event => {
    if (addressDialog.dataset.editing === '1' || addressDialog.dataset.autoOpen === '1') return;
    event.preventDefault();
    addressDialog.showModal();
  });
  document.querySelector('[data-address-close]')?.addEventListener('click', event => {
    if (addressDialog.dataset.editing === '1' || addressDialog.dataset.autoOpen === '1') return;
    event.preventDefault(); addressDialog.close();
  });
}

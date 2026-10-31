// Chọn nguyên phiên bản đã tồn tại, không tạo tổ hợp thuộc tính mới ở trình duyệt.
// Server đọc lại giá, tồn kho và ảnh từ MySQL sau mỗi lần chọn.
const variantSelect = document.getElementById('variant-select');
const variantForm = document.getElementById('variant-form');
if (variantSelect && variantForm) {
  variantSelect.addEventListener('change', () => variantForm.requestSubmit());
}

// Các tương tác dưới đây chỉ thay đổi giao diện. Backend vẫn kiểm tra giá và kho.
const productPage = document.querySelector('.product-page');
if (productPage) {
  productPage.classList.add('product-page--enhanced');
  const mainImage = document.getElementById('product-main-image');
  const thumbnails = productPage.querySelectorAll('[data-gallery-image]');
  for (const thumbnail of thumbnails) {
    thumbnail.addEventListener('click', (event) => {
      if (!mainImage || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      mainImage.src = thumbnail.href;
      mainImage.alt = thumbnail.querySelector('img').alt;
      for (const item of thumbnails) item.setAttribute('aria-current', String(item === thumbnail));
    });
  }

  const quantity = document.getElementById('cart-quantity');
  const steps = productPage.querySelectorAll('[data-quantity-step]');
  if (quantity) {
    function updateQuantityButtons() {
      const value = Number(quantity.value);
      for (const button of steps) {
        const step = Number(button.dataset.quantityStep);
        button.disabled = !Number.isInteger(value) || value < Number(quantity.min) || value > Number(quantity.max)
          || (step < 0 ? value <= Number(quantity.min) : value >= Number(quantity.max));
      }
    }
    for (const button of steps) {
      button.addEventListener('click', () => {
        if (!quantity.checkValidity()) { quantity.reportValidity(); return; }
        const next = Number(quantity.value) + Number(button.dataset.quantityStep);
        quantity.value = String(Math.max(Number(quantity.min), Math.min(Number(quantity.max), next)));
        updateQuantityButtons();
      });
    }
    quantity.addEventListener('input', updateQuantityButtons);
    updateQuantityButtons();
  }
}

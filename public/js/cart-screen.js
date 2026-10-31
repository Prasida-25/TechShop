(() => {
  function priceUnits(value) {
    const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value));
    return match ? BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0')) : null;
  }
  function totals(rows) {
    let amount = 0n, quantity = 0, invalid = false;
    for (const row of rows) {
      const price = priceUnits(row.price), count = Number(row.quantity);
      if (price === null || price <= 0n || !Number.isInteger(count) || count < 1 || count > 99) { invalid = true; continue; }
      amount += price * BigInt(count); quantity += count;
      if (row.problem === '1') invalid = true;
    }
    return { amount, quantity, invalid };
  }
  function money(units) {
    const fraction = units % 100n;
    return new Intl.NumberFormat('vi-VN').format(units / 100n) + (fraction ? ',' + fraction.toString().padStart(2, '0') : '') + ' ₫';
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { priceUnits, totals, money };
  if (typeof document === 'undefined' || !document.querySelector('.cart-screen')) return;
  const selected = new Set();
  let busy = false;
  const rows = () => [...document.querySelectorAll('[data-cart-row]')];
  function confirmDelete(question) {
    const dialog = document.querySelector('.cart-delete-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') return Promise.resolve(window.confirm(question));
    if (dialog.open) return Promise.resolve(false);
    dialog.querySelector('[data-cart-delete-question]').textContent = question;
    dialog.returnValue = 'cancel';
    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'delete'), { once:true });
      dialog.showModal();
    });
  }
  function feedback(message) {
    const target = document.querySelector('.cart-feedback');
    if (target) target.textContent = message;
  }
  function renderSelection() {
    const all = rows();
    const available = new Set(all.map(row => row.dataset.id));
    for (const id of selected) if (!available.has(id)) selected.delete(id);
    for (const row of all) row.querySelector('[data-select-item]').checked = selected.has(row.dataset.id);
    for (const checkbox of document.querySelectorAll('[data-select-all]')) {
      checkbox.checked = all.length > 0 && selected.size === all.length;
      checkbox.indeterminate = selected.size > 0 && selected.size < all.length;
      checkbox.disabled = busy;
    }
    const checkout = document.querySelector('[data-cart-checkout]');
    if (!checkout) return;
    const result = totals(all.filter(row => selected.has(row.dataset.id)).map(row => row.dataset));
    const dirty = all.some(row => {
      const input = row.querySelector('[name=quantity]');
      return input.value !== row.dataset.quantity || !input.checkValidity();
    });
    document.querySelector('[data-selected-count]').textContent = String(result.quantity);
    document.querySelector('[data-selected-total]').textContent = money(result.amount);
    checkout.elements.items.value = [...selected].join(',');
    checkout.querySelector('button').disabled = busy || dirty || !selected.size || result.invalid || selected.size > 200;
    document.querySelector('[data-delete-selected]').disabled = busy || !selected.size;
    const note = document.querySelector('[data-cart-note]');
    if (note) note.textContent = busy ? 'Đang cập nhật, vui lòng chờ…'
      : dirty ? 'Vui lòng cập nhật số lượng hợp lệ trước khi mua hàng.'
      : result.invalid ? 'Sản phẩm đã chọn có vấn đề. Vui lòng cập nhật số lượng hoặc bỏ chọn.'
      : selected.size > 200 ? 'Mỗi lần đặt tối đa 200 dòng sản phẩm.'
      : selected.size ? 'Phí giao hàng được tính tại bước checkout.' : 'Chọn sản phẩm để tiếp tục.';
    for (const checkbox of document.querySelectorAll('[data-select-item]')) checkbox.disabled = busy;
  }
  function applyPage(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const next = parsed.querySelector('.cart-screen');
    if (!next) throw new Error('Không tải được giỏ hàng. Vui lòng tải lại trang để kiểm tra kết quả.');
    document.querySelector('.cart-screen').replaceWith(next);
  }
  async function post(form) {
    const response = await fetch(form.action, { method:'POST', credentials:'same-origin', body:new URLSearchParams(new FormData(form)) });
    if (new URL(response.url).pathname === '/login') { window.location.assign(response.url); throw new Error('Phiên đăng nhập đã hết hạn.'); }
    const html = await response.text();
    applyPage(html); // Thành tiền và giá hiển thị luôn được lấy lại từ response của server.
    if (!response.ok) throw new Error(document.querySelector('.cart-feedback').textContent.trim() || 'Không cập nhật được giỏ hàng. Vui lòng thử lại.');
  }
  async function mutate(forms) {
    if (busy) return;
    busy = true;
    let done = 0;
    try {
      renderSelection();
      document.querySelector('.cart-screen').setAttribute('aria-busy','true');
      for (const form of forms) { await post(form); done++; }
      feedback(forms.length > 1 ? `Đã xóa ${done} dòng đã chọn.` : 'Đã cập nhật giỏ hàng. Giá và tồn kho đã được kiểm tra lại.');
    } catch (error) {
      feedback((forms.length > 1 && done ? `Đã xử lý ${done}/${forms.length} dòng. ` : '') + error.message);
    } finally {
      busy = false;
      document.querySelector('.cart-screen')?.removeAttribute('aria-busy');
      renderSelection();
    }
  }
  document.addEventListener('change', event => {
    if (event.target.matches('[data-select-all]')) {
      selected.clear();
      if (event.target.checked) for (const row of rows()) selected.add(row.dataset.id);
      renderSelection();
    } else if (event.target.matches('[data-select-item]')) {
      const id = event.target.closest('[data-cart-row]').dataset.id;
      if (event.target.checked) selected.add(id); else selected.delete(id);
      renderSelection();
    } else if (event.target.matches('[data-cart-update] input[name=quantity]')) {
      const form = event.target.form;
      if (form.checkValidity()) mutate([form]); else form.reportValidity();
    }
  });
  // Chốt cả khi rời ô nhập: không phụ thuộc riêng vào change sau khi thay DOM.
  document.addEventListener('focusout', event => {
    const input = event.target;
    if (!input.matches('[data-cart-update] input[name=quantity]') || busy) return;
    const row = input.closest('[data-cart-row]');
    if (row && input.value !== row.dataset.quantity && input.form.checkValidity()) mutate([input.form]);
  });
  document.addEventListener('click', async event => {
    const step = event.target.closest('[data-step]');
    if (step) {
      if (busy) return;
      const form = step.closest('form'), input = form.elements.quantity;
      const value = Number(input.value) + Number(step.dataset.step);
      if (!Number.isInteger(value) || value < Number(input.min) || value > Number(input.max)) {
        feedback('Số lượng phải từ 1 đến 99 và không vượt tồn kho hiện tại.'); return;
      }
      input.value = String(value); mutate([form]);
    }
    if (event.target.closest('[data-delete-selected]') && !busy && selected.size) {
      if (!await confirmDelete(`Xóa ${selected.size} dòng sản phẩm đã chọn khỏi giỏ hàng?`)) return;
      const forms = rows().filter(row => selected.has(row.dataset.id)).map(row => row.querySelector('[data-cart-delete]'));
      // Dùng các endpoint xóa hiện có; nếu một dòng lỗi, dừng và báo phần đã xử lý.
      mutate(forms);
    }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (form.matches('[data-cart-update], [data-cart-delete]')) {
      event.preventDefault();
      if (busy || !form.checkValidity()) return;
      if (form.matches('[data-cart-delete]') && !await confirmDelete('Xóa sản phẩm này khỏi giỏ hàng?')) return;
      mutate([form]);
    } else if (form.matches('[data-cart-checkout]')) {
      renderSelection();
      if (form.querySelector('button').disabled) event.preventDefault();
    }
  });
  // Khi input đang sửa, chưa cho checkout sử dụng tổng tiền của số lượng cũ.
  document.addEventListener('input', event => {
    if (event.target.matches('[data-cart-update] input[name=quantity]')) {
      const checkout = document.querySelector('[data-cart-checkout]');
      checkout.querySelector('button').disabled = true;
      feedback('Vui lòng cập nhật số lượng trước khi mua hàng.');
    }
  });
  renderSelection();
})();

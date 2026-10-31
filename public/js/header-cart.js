(() => {
  const wrapper = document.querySelector('[data-header-cart]');
  if (!wrapper) return;
  const body = wrapper.querySelector('[data-cart-preview-body]');
  const badge = wrapper.querySelector('[data-cart-badge]');
  const toggle = wrapper.querySelector('.header__cart-link');
  const panel = wrapper.querySelector('#header-cart-preview');
  let loading = false;
  function positionPanel() {
    if (window.matchMedia('(max-width: 760px)').matches) {
      const bottom = wrapper.closest('header').getBoundingClientRect().bottom;
      panel.style.setProperty('--header-cart-top', Math.max(8, Math.min(bottom + 8, window.innerHeight - 160)) + 'px');
    } else panel.style.removeProperty('--header-cart-top');
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function state(message) { body.replaceChildren(element('p', message, 'header-cart-state')); }
  async function refresh() {
    positionPanel();
    if (wrapper.dataset.authenticated !== '1' || loading) return;
    loading = true; body.setAttribute('aria-busy','true'); state('Đang tải giỏ hàng…');
    try {
      const response = await fetch('/cart/preview', { credentials:'same-origin', cache:'no-store' });
      if (response.status === 401) {
        wrapper.dataset.authenticated = '0'; badge.hidden = true;
        const link = wrapper.querySelector('.header-cart-footer a');
        link.href = '/login?returnTo=%2Fcart'; link.textContent = 'Đăng nhập';
        state('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); return;
      }
      if (!response.ok) throw new Error('Không tải được giỏ hàng.');
      const cart = await response.json();
      badge.textContent = cart.quantity > 99 ? '99+' : String(cart.quantity);
      badge.hidden = cart.quantity < 1;
      if (!cart.items.length) {
        const image = element('img', undefined, 'header-cart-empty-image'); image.src = '/images/no-cart.png'; image.alt = '';
        body.replaceChildren(image, element('p','Giỏ hàng của bạn đang trống.','header-cart-state')); return;
      }
      const list = element('ul', undefined, 'header-cart-items');
      for (const item of cart.items) {
        const li = element('li');
        const link = element('a', undefined, 'header-cart-item');
        link.href = item.productId ? `/products/${item.productId}?variant=${item.variantId}` : '/cart';
        const image = element('img'); image.width = 52; image.height = 52; image.alt = item.name;
        image.src = item.productId ? `/products/${item.productId}/variants/${item.variantId}/image` : '/images/product-placeholder.svg';
        const info = element('span', undefined, 'header-cart-item__info');
        info.append(element('span',item.name,'header-cart-item__name'),element('span',item.variant,'header-cart-item__variant'));
        if (item.problem) info.append(element('span',item.problem,'header-cart-item__problem'));
        const price = element('span',item.priceLabel,'header-cart-item__price');
        price.append(element('small',`× ${item.quantity}`));
        link.append(image,info,price); li.append(link); list.append(li);
      }
      body.replaceChildren(list);
    } catch {
      badge.hidden = true;
      state('Không tải được giỏ hàng. Mở giỏ hàng hoặc thử lại.');
    } finally { loading = false; body.removeAttribute('aria-busy'); }
  }
  // Gắn trực tiếp vào link chứa biểu tượng giỏ, không cần nút mũi tên riêng.
  toggle.addEventListener('mouseenter', () => { wrapper.classList.remove('preview-dismissed'); toggle.setAttribute('aria-expanded','true'); refresh(); });
  wrapper.addEventListener('mouseleave', () => { if (!wrapper.contains(document.activeElement)) toggle.setAttribute('aria-expanded','false'); });
  wrapper.addEventListener('focusin', event => {
    if (!wrapper.contains(event.relatedTarget)) {
      // Hover đã mở/tải panel: không thay DOM lúc mousedown đang focus link sản phẩm.
      const alreadyOpen = toggle.getAttribute('aria-expanded') === 'true';
      wrapper.classList.remove('preview-dismissed');
      toggle.setAttribute('aria-expanded','true');
      if (!alreadyOpen) refresh();
    }
  });
  wrapper.addEventListener('focusout', event => {
    if (!wrapper.contains(event.relatedTarget)) toggle.setAttribute('aria-expanded','false');
  });
  document.addEventListener('click', event => {
    if (!wrapper.contains(event.target)) {
      toggle.setAttribute('aria-expanded','false');
      if (wrapper.contains(document.activeElement)) document.activeElement.blur();
    }
  });
  wrapper.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      wrapper.classList.add('preview-dismissed'); toggle.setAttribute('aria-expanded','false');
      document.activeElement?.blur();
    }
  });
  window.addEventListener('resize',positionPanel);
})();

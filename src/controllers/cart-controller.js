const { CartError } = require('../utils/cart-validation');

function createCartController(service) {
  async function render(req, res, status = 200, message = '') {
    const cart = await service.getCart(req.user.user_id);
    res.status(status).render('cart/index', { title: 'Giỏ hàng — TechZone', filters: {}, cart, message });
  }
  function mutate(operation) {
    return async (req, res) => {
      try { await service.change(req.user.user_id, operation, req.body, req.params.cartItemId); }
      catch (error) {
        if (!(error instanceof CartError)) throw error;
        return render(req, res, error.status, error.message);
      }
      res.redirect(303, '/cart?updated=1');
    };
  }
  return {
    async buyNow(req, res) {
      try {
        const itemId = await service.change(req.user.user_id, 'buyNow', req.body);
        return res.redirect(303, `/checkout?items=${itemId}`);
      } catch (error) {
        if (!(error instanceof CartError)) throw error;
        return render(req, res, error.status, error.message);
      }
    },
    async preview(req, res) {
      try {
        const cart = await service.getCart(req.user.user_id);
        res.set('Cache-Control', 'no-store');
        return res.json({ quantity:cart.quantity, lineCount:cart.items.length, totalLabel:cart.totalLabel,
          items:cart.items.slice(0,5).map(item => ({
            productId:item.product_id, variantId:item.variant_id,
            name:item.product_name || 'Sản phẩm không còn tồn tại', variant:item.variant_name || 'Biến thể không còn tồn tại',
            quantity:Number(item.quantity), priceLabel:item.priceLabel, lineLabel:item.lineLabel, problem:item.problem,
          })) });
      } catch {
        console.error('[Cart preview] Không tải được giỏ hàng.');
        return res.status(503).json({ message:'Không tải được giỏ hàng. Vui lòng thử lại.' });
      }
    },
    show: (req, res) => render(req, res, 200, req.query.updated === '1' ? 'Đã cập nhật giỏ hàng.' : ''),
    add: mutate('add'), update: mutate('update'), remove: mutate('remove'), clear: mutate('clear'),
  };
}

module.exports = { createCartController };

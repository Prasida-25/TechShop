const { CartError } = require('../utils/cart-validation');
const { CouponError, couponCode } = require('../utils/coupon-validation');
const {paymentMethod}=require('../config/payment');

function createCheckoutController(service) {
  const failure = (res, error) => {
    if (!(error instanceof CartError)) throw error;
    return res.status(error.status).render('checkout/message', { title: 'Kiểm tra đặt hàng — TechZone', message: error.message });
  };
  function checkoutUrl(input) {
    const query = new URLSearchParams();
    for (const key of ['items', 'address_id']) if (typeof input[key] === 'string') query.set(key, input[key]);
    return '/checkout?' + query.toString();
  }
  async function render(req, res, input, code, status = 200) {
    let checkout, couponError = '';
    try { checkout = await service.preview(req.user.user_id, input.address_id, input.items, code,req.session.paymentMethod); }
    catch (error) {
      if (!(error instanceof CouponError)) throw error;
      couponError = error.message;
      checkout = await service.preview(req.user.user_id, input.address_id, input.items,undefined,req.session.paymentMethod);
      checkout.token = ''; // Không đặt hàng với tổng tiền khác báo giá khách đang sửa.
      status = error.status;
    }
    return res.status(status).render('checkout/index', { title: 'Checkout — TechZone', checkout,
      couponError, hasCoupon: code !== undefined, couponInput: typeof code === 'string' ? code : '' });
  }
  return {
    async selectPayment(req,res) {
      try {req.session.paymentMethod=paymentMethod(req.body.payment_method);return res.redirect(303,checkoutUrl(req.body));}
      catch(error){return failure(res,error);}
    },
    async show(req, res) {
      try { return await render(req, res, req.query, req.session.couponCode); }
      catch (error) { return failure(res, error); }
    },
    async applyCoupon(req, res) {
      try {
        const code = couponCode(req.body.code);
        await service.preview(req.user.user_id, req.body.address_id || undefined, req.body.items || undefined, code,req.session.paymentMethod);
        req.session.couponCode = code;
        return res.redirect(303, checkoutUrl(req.body));
      } catch (error) {
        if (!(error instanceof CouponError)) return failure(res, error);
        // Giữ mã đã nhập để khách sửa hoặc gỡ, không tự áp dụng mã cũ âm thầm.
        req.session.couponCode = typeof req.body.code === 'string' && req.body.code.length <= 50 ? req.body.code : '';
        try { return await render(req, res, {address_id:req.body.address_id || undefined,items:req.body.items || undefined}, req.session.couponCode); }
        catch (nextError) { return failure(res, nextError); }
      }
    },
    removeCoupon(req, res) {
      delete req.session.couponCode;
      return res.redirect(303, checkoutUrl(req.body));
    },
    async place(req, res) {
      try { const id = await service.place(req.user.user_id, req.body); res.redirect(303, `/checkout/success/${id}`); }
      catch (error) { return failure(res, error); }
    },
    async success(req, res) {
      try { res.render('checkout/success', { title: 'Đặt hàng thành công — TechZone', order: await service.confirmation(req.user.user_id, req.params.orderId) }); }
      catch (error) { return failure(res, error); }
    },
  };
}

module.exports = { createCheckoutController };

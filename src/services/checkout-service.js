const crypto = require('node:crypto');
const { CartError, positiveInteger, priceUnits, money } = require('../utils/cart-validation');
const { quote, shippingAddress, fingerprint, parseCartSelection, selectCartItems } = require('../utils/checkout');
const {couponCode:normalizeCode}=require('../utils/coupon-validation');
const {applyCoupon}=require('../utils/coupon-pricing');
const {paymentMethod,bankDetails}=require('../config/payment');

function createCheckoutService(repository, { now = Date.now } = {}) {
  // Chỉ demo local một tiến trình. Không phải idempotency bền vững trong DB.
  // Tách khỏi session để các request đồng thời không ghi đè trạng thái token.
  const reviews = new Map();
  const ttl = 20 * 60 * 1000;
  function prune() {
    for (const [token, review] of reviews) if (review.expires <= now() && review.status !== 'pending') reviews.delete(token);
  }
  async function preview(userId, addressId, selection, code, method = 'cod') {
    method = paymentMethod(method);
    prune();
    const cartItemIds = parseCartSelection(selection);
    const requested=code!==undefined&&code!==null;
    const normalized=requested?normalizeCode(code):null;
    const data = await repository.preview(userId,normalized);
    const pricing = applyCoupon(quote(selectCartItems(data.items, cartItemIds)),data.coupon,requested);
    const id = addressId === undefined ? null : positiveInteger(addressId);
    const selected = id ? data.addresses.find((a) => Number(a.address_id) === id) : data.addresses[0];
    if (id && !selected) throw new CartError('Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn.', 409);
    const address = selected ? shippingAddress(selected) : null;
    let token = '';
    if (address) {
      // Giới hạn bộ nhớ; token đã hoàn thành được giữ đến hết hạn để trả lại đơn cũ.
      const own = [...reviews.entries()].filter(([, r]) => r.userId === userId && r.status === 'open');
      while (own.length >= 10) reviews.delete(own.shift()[0]);
      if (reviews.size >= 2000) throw new CartError('Có nhiều phiên checkout đang mở. Vui lòng thử lại sau.', 429);
      token = crypto.randomBytes(32).toString('hex');
      reviews.set(token, { userId, paymentMethod:method, addressId: address.address_id, cartItemIds,couponId:pricing.couponId, fingerprint: fingerprint(pricing, address),
        expires: now() + ttl, status: 'open' });
    }
    return { ...pricing, paymentMethod:method,bankDetails,addresses: data.addresses, address, token, selection: cartItemIds ? cartItemIds.join(',') : null };
  }
  async function place(userId, body) {
    prune();
    const token = typeof body?.checkout_token === 'string' ? body.checkout_token : '';
    const review = /^[a-f0-9]{64}$/.test(token) ? reviews.get(token) : null;
    if (!review || review.userId !== userId || review.expires <= now()) throw new CartError('Phiên checkout hết hạn hoặc không hợp lệ. Vui lòng kiểm tra lại.', 409);
    if (review.status === 'done') return review.orderId;
    if (body.payment_method !== undefined && paymentMethod(body.payment_method) !== review.paymentMethod) throw new CartError('Phương thức đã thay đổi. Vui lòng xác nhận lại tại checkout.',409);
    if (review.status !== 'open') throw new CartError('Yêu cầu đang được xử lý hoặc đã kết thúc. Vui lòng kiểm tra đơn trước khi thử lại.', 409);
    if (body.confirm !== '1') throw new CartError('Vui lòng xác nhận giá, địa chỉ và tổng tiền trước khi đặt hàng.');
    if (typeof body.address_id !== 'string' || body.address_id !== String(review.addressId)) throw new CartError('Địa chỉ đã thay đổi. Vui lòng xác nhận lại tại checkout.', 409);
    // Đổi trạng thái trước await: một token không thể có hai lần place đang chạy.
    review.status = 'pending';
    try {
      const orderId = await repository.place(userId, review);
      review.status = 'done'; review.orderId = orderId;
      return orderId;
    } catch (error) {
      // Không tự retry sau lỗi commit vì chưa chắc DB đã commit hay chưa.
      review.status = 'failed';
      throw error;
    }
  }
  async function confirmation(userId, id) {
    const row = await repository.confirmation(userId, positiveInteger(id));
    if (!row) throw new CartError('Không tìm thấy đơn hàng.', 404);
    return { ...row, bankDetails, totalLabel: money(priceUnits(row.total_amount)) };
  }
  return { preview, place, confirmation };
}

module.exports = { createCheckoutService };

class AdminOrderError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
const NEXT_STATUS = Object.freeze({ pending: 'confirmed', confirmed: 'shipping', shipping: 'delivered' });
const ORDER_STATUSES = Object.freeze({ pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', shipping: 'Đang giao hàng', delivered: 'Đã giao hàng', cancelled: 'Đã hủy' });
function orderId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) throw new AdminOrderError('Không tìm thấy đơn hàng.', 404);
  return Number(value);
}
module.exports = { AdminOrderError, NEXT_STATUS, ORDER_STATUSES, orderId };

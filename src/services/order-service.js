const { priceUnits, money } = require('../utils/cart-validation');
const {bankDetails}=require('../config/payment');

class OrderError extends Error {
  constructor(message = 'Không tìm thấy đơn hàng.', status = 404) { super(message); this.status = status; }
}
const statuses = { pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', shipping: 'Đang giao hàng', delivered: 'Đã giao hàng', cancelled: 'Đã hủy' };
const payments = { paid: 'Đã thanh toán', unpaid: 'Chưa thanh toán', refund: 'Đã hoàn tiền' };
const methods = { cod: 'Thanh toán khi nhận hàng (COD)', bank: 'Chuyển khoản' };
const label = (mapping, value) => Object.hasOwn(mapping, value) ? mapping[value] : 'Chưa xác định';
const moneyLabel = (value) => { const units = priceUnits(value); return units === null ? 'Chưa có dữ liệu' : money(units); };

function summary(order) {
  return { ...order, totalLabel: moneyLabel(order.total_amount), statusLabel: label(statuses, order.status),
    canPayBank: order.payment_method === 'bank' && order.status === 'pending' && order.payment_status === 'unpaid'
      && Number(order.payment_window_open) === 1 && priceUnits(order.total_amount) > 0n,
    paymentLabel: label(payments, order.payment_status), methodLabel: label(methods, order.payment_method) };
}

// Cùng một cách đọc/định dạng snapshot cho trang khách và trang quản trị.
function formatOrderDetail(order) {
  let subtotal = 0n, complete = order.items.length > 0;
  const items = order.items.map((item) => {
    const price = priceUnits(item.unit_price);
    const valid = price !== null && Number.isSafeInteger(Number(item.quantity)) && Number(item.quantity) > 0;
    const line = valid ? price * BigInt(item.quantity) : null;
    if (line === null) complete = false; else subtotal += line;
    return { ...item, priceLabel: moneyLabel(item.unit_price), lineLabel: line === null ? 'Chưa có dữ liệu' : money(line) };
  });
  const total = priceUnits(order.total_amount);
  const hasSnapshot = order.shipping_fee != null || order.discount_amount != null;
  const shipping = priceUnits(order.shipping_fee), discount = priceUnits(order.discount_amount);
  const feeValid = complete && total !== null && (hasSnapshot
    ? shipping !== null && discount !== null && discount <= subtotal && subtotal - discount + shipping === total
    : total >= subtotal);
  return { ...summary(order), bankDetails,items, subtotalLabel: complete ? money(subtotal) : 'Chưa có dữ liệu',
    discountLabel: hasSnapshot && discount !== null ? money(discount) : null,
    shippingLabel: feeValid ? money(hasSnapshot ? shipping : total - subtotal) : 'Không xác định',
    warning: feeValid ? '' : 'Dữ liệu chi tiết chưa đủ hoặc chưa khớp để xác định phí giao hàng. Tổng thanh toán vẫn hiển thị theo đơn đã lưu.' };
}

function createOrderService(repository) {
  async function list(userId, query) {
    const status = query.status === undefined ? 'all' : query.status;
    if (typeof status !== 'string' || !['all','unpaid',...Object.keys(statuses)].includes(status)) throw new OrderError('Bộ lọc đơn hàng không hợp lệ.',400);
    const requested = typeof query.page === 'string' && /^[1-9]\d{0,8}$/.test(query.page) ? Number(query.page) : 1;
    const total = await repository.count(userId, status);
    const totalPages = Math.ceil(total / 10);
    const page = Math.min(requested, Math.max(1, totalPages));
    const rows = await repository.list(userId, (page - 1) * 10, status);
    const items = await repository.listItems(userId, rows.map(row => Number(row.order_id)));
    const orders = rows.map(row => ({ ...summary(row), items: items.filter(item => Number(item.order_id) === Number(row.order_id)).map(item => ({...item, priceLabel:moneyLabel(item.unit_price)})) }));
    return { orders, total, totalPages, page, status };
  }
  async function detail(userId, id) {
    if (typeof id !== 'string' || !/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) throw new OrderError();
    const order = await repository.detail(userId, Number(id));
    if (!order) throw new OrderError();
    return formatOrderDetail(order);
  }
  async function payment(userId, id) {
    const order = await detail(userId, id);
    if (!order.canPayBank) throw new OrderError('Đơn hàng không còn đủ điều kiện chuyển khoản. Vui lòng kiểm tra trạng thái đơn hàng; không chuyển tiền cho đơn đã hết hạn hoặc bị hủy.', 409);
    return order;
  }
  return { list, detail, payment };
}

module.exports = { createOrderService, OrderError, summary, formatOrderDetail };

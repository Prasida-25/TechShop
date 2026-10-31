const { CartError, priceUnits, money } = require('./cart-validation');
const { variantProblem } = require('../services/cart-service');
const { addressInput } = require('./account-validation');

function decimal(units) { return `${units / 100n}.${(units % 100n).toString().padStart(2, '0')}`; }

function quote(items) {
  if (!items.length) throw new CartError('Giỏ hàng đang trống. Vui lòng chọn sản phẩm.', 409);
  let subtotal = 0n;
  const lines = items.map((item) => {
    const problem = variantProblem(item.product_id ? item : null, Number(item.quantity));
    if (problem) throw new CartError(`${item.product_name || 'Sản phẩm'}: ${problem}`, 409);
    const unitPrice = priceUnits(item.price);
    const line = unitPrice * BigInt(item.quantity);
    subtotal += line;
    return { ...item, price: decimal(unitPrice), priceLabel: money(unitPrice), lineLabel: money(line) };
  });
  const shipping = subtotal >= 30000000n ? 0n : 3000000n;
  const total = subtotal + shipping;
  if (total > 999999999999n) throw new CartError('Tổng tiền vượt giới hạn đơn hàng. Vui lòng giảm số lượng.', 409);
  return { items: lines, subtotal:decimal(subtotal),shipping:decimal(shipping),subtotalLabel: money(subtotal), shippingLabel: money(shipping), totalLabel: money(total), total: decimal(total) };
}

function shippingAddress(row) {
  if (!row) throw new CartError('Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn.', 409);
  try {
    const data = addressInput(row);
    return { address_id: Number(row.address_id), receiver_name: data.receiver_name, phone: data.phone,
      address_detail: data.address_detail, ward: data.ward, district: data.district, province: data.province };
  } catch { throw new CartError('Địa chỉ chưa hợp lệ. Vui lòng cập nhật địa chỉ nhận hàng.', 409); }
}

// Chỉ dùng để đối chiếu khách đã duyệt gì; giá bán luôn đọc lại từ MySQL.
function fingerprint(pricing, address) {
  return JSON.stringify({ address, total: pricing.total,discount:pricing.discount,shipping:pricing.shipping,coupon:pricing.couponTerms, items: pricing.items.map((i) => ({
    cart_item_id: Number(i.cart_item_id), variant_id: Number(i.variant_id), product_id: Number(i.product_id),
    product_name: i.product_name, variant_name: i.variant_name, sku: i.sku,
    quantity: Number(i.quantity), price: i.price,
  })).sort((a, b) => a.variant_id - b.variant_id) });
}

function parseCartSelection(value) {
  if (value === undefined) return null; // Tương thích checkout toàn bộ giỏ hiện có.
  if (typeof value !== 'string' || !/^[1-9]\d*(,[1-9]\d*)*$/.test(value) || value.length > 2400) throw new CartError('Danh sách sản phẩm đã chọn không hợp lệ.', 400);
  const ids = value.split(',').map(Number);
  if (ids.length > 200 || new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id > 2147483647)) throw new CartError('Danh sách sản phẩm đã chọn không hợp lệ.', 400);
  return ids;
}

function selectCartItems(items, ids) {
  if (ids === null || ids === undefined) return items;
  const selected = items.filter(item => ids.includes(Number(item.cart_item_id)));
  if (!ids.length || selected.length !== ids.length) throw new CartError('Sản phẩm đã chọn không còn trong giỏ của bạn. Vui lòng chọn lại.', 409);
  return selected;
}

module.exports = { decimal, quote, shippingAddress, fingerprint, parseCartSelection, selectCartItems };

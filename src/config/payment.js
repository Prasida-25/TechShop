const { CartError } = require('../utils/cart-validation');

// Thông tin nhận chuyển khoản công khai do cửa hàng cung cấp, không phải credentials.
const bankDetails = Object.freeze({ bank: 'MB', account: '0878250056', owner: 'TechZone' });
function paymentMethod(value = 'cod') {
  if (typeof value !== 'string' || !['cod', 'bank'].includes(value)) {
    throw new CartError('Phương thức thanh toán không hợp lệ.');
  }
  return value;
}
module.exports = { bankDetails, paymentMethod };

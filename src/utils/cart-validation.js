class CartError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

function positiveInteger(value, max = 2147483647) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw new CartError('Mã sản phẩm hoặc số lượng không hợp lệ. Số lượng phải là số nguyên từ 1 đến 99.');
  }
  return Number(value);
}

// MySQL DECIMAL được đọc thành chuỗi; tính bằng phần trăm đồng để tránh sai số.
function priceUnits(value) {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
}

function money(units) {
  const whole = units / 100n;
  const fraction = units % 100n;
  return new Intl.NumberFormat('vi-VN').format(whole) + (fraction ? ',' + fraction.toString().padStart(2, '0') : '') + ' ₫';
}

module.exports = { CartError, positiveInteger, priceUnits, money };

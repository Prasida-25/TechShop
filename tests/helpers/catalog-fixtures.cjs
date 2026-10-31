// Dữ liệu chỉ dành cho kiểm thử, không được nạp vào database thật.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
const categories = [
  { category_id: 1, category_name: 'Tai nghe' },
  { category_id: 2, category_name: 'Cáp sạc' },
  { category_id: 3, category_name: 'Danh mục trống' },
];
const products = Array.from({ length: 16 }, (_, index) => ({
  product_id: index + 1, category_id: index < 2 ? 1 : 2,
  product_name: index === 0 ? 'Tai nghe Đen Trắng' : index === 5 ? "Cáp 100% _ \\ ' <script>alert(1)</script>" : `Sản phẩm ${index + 1}`,
  brand: index === 0 ? 'TechBrand' : 'Other', description: '<b>Mô tả dạng văn bản</b>',
  created_at: index === 0 ? '2026-02-01 00:00:00' : '2026-01-01 00:00:00',
  image_data: index === 0 ? png : null, image_mime_type: index === 0 ? 'image/png' : null,
}));
const variants = [
  { variant_id: 11, product_id: 1, variant_name: 'Đen', sku: 'BLACK', price: '100.00', stock: 0, image_data: png, image_mime_type: 'image/png' },
  { variant_id: 12, product_id: 1, variant_name: 'Trắng', sku: 'WHITE', price: '200.00', stock: 5, image_data: null, image_mime_type: null },
  { variant_id: 21, product_id: 2, variant_name: 'Mặc định', sku: 'DEFAULT', price: '50.00', stock: 0, image_data: Buffer.from('not-an-image'), image_mime_type: 'text/html' },
  // Sai sản phẩm, trùng thuộc tính, thiếu thuộc tính: đều phải loại.
  { variant_id: 41, product_id: 4, variant_name: 'Sai liên kết', sku: 'BAD', price: '1.00', stock: 9 },
  { variant_id: 51, product_id: 5, variant_name: 'Hai màu', sku: 'BAD2', price: '2.00', stock: 9 },
  { variant_id: 52, product_id: 5, variant_name: 'Thiếu màu', sku: 'BAD3', price: '3.00', stock: 9 },
  ...Array.from({ length: 11 }, (_, index) => ({ variant_id: 60 + index, product_id: 6 + index, variant_name: 'Mặc định', sku: `SKU-${index}`, price: `${300 + index}.00`, stock: 1 })),
];
const options = [
  { option_id: 1, product_id: 1, option_name: 'Màu' },
  { option_id: 5, product_id: 5, option_name: 'Màu' },
];
const optionValues = [
  { option_value_id: 101, option_id: 1, value_name: 'Đen' },
  { option_value_id: 102, option_id: 1, value_name: 'Trắng' },
  { option_value_id: 501, option_id: 5, value_name: 'Đỏ' },
  { option_value_id: 502, option_id: 5, value_name: 'Xanh' },
];
const links = [
  { variant_id: 11, option_value_id: 101 }, { variant_id: 12, option_value_id: 102 },
  { variant_id: 41, option_value_id: 101 },
  { variant_id: 51, option_value_id: 501 }, { variant_id: 51, option_value_id: 502 },
];
const orders = [
  { order_id: 1, status: 'delivered' }, { order_id: 2, status: 'cancelled' },
  { order_id: 3, status: 'pending' }, { order_id: 4, status: 'shipping' },
];
const orderItems = [
  { order_id: 1, product_id: 1, quantity: 3 }, { order_id: 1, product_id: 1, quantity: 2 },
  { order_id: 1, product_id: 2, quantity: 7 }, { order_id: 2, product_id: 1, quantity: 999 },
  { order_id: 3, product_id: 1, quantity: 999 }, { order_id: 4, product_id: 1, quantity: 999 },
  { order_id: 1, product_id: null, quantity: 10 },
];

// Dùng CTE chứa hằng số để che tên các bảng thật trong đúng một SELECT.
// Không INSERT, không bảng tạm, không transaction ghi và không dữ liệu lưu lại.
function fixtureQuery() {
  const tables = { categories, products, product_variants: variants, product_options: options,
    product_option_values: optionValues, variant_option_values: links, orders, order_items: orderItems };
  const values = [];
  const ctes = Object.entries(tables).map(([table, rows]) => {
    const columns = Object.keys(rows[0]);
    const selects = rows.map((row) => 'SELECT ' + columns.map((column) => {
      values.push(row[column] ?? null);
      const type = column === 'image_data' ? 'BINARY' : column === 'price' ? 'DECIMAL(12,2)'
        : /(_id|quantity|stock)$/.test(column) ? 'SIGNED' : 'CHAR CHARACTER SET utf8mb4';
      return `CAST(? AS ${type})`;
    }).join(', '));
    return `${table} (${columns.join(', ')}) AS (${selects.join(' UNION ALL ')})`;
  });
  return { sql: `WITH ${ctes.join(', ')}`, values };
}

module.exports = { png, categories, products, variants, options, optionValues, links, fixtureQuery };

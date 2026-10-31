// Chỉ chạy ghi dữ liệu khi có --apply. Không chạy từ npm start hoặc bộ test.
const fs = require('node:fs');
const path = require('node:path');
const { getPool, closePool } = require('../src/config/database');

const MARKER = '[TechZone catalog demo v1]';
const groups = [
  ['Tai nghe', ['Tai nghe Bluetooth TZ Air', 'Tai nghe chụp tai TZ Studio', 'Tai nghe có dây TZ Basic', 'Tai nghe gaming TZ Play'], [390000, 790000, 99000, 590000], 'color'],
  ['Chuột', ['Chuột không dây TZ Silent', 'Chuột gaming TZ RGB', 'Chuột văn phòng TZ Basic', 'Chuột Bluetooth TZ Travel'], [199000, 450000, 89000, 299000], 'color'],
  ['Bàn phím', ['Bàn phím cơ TZ Compact', 'Bàn phím cơ TZ Fullsize', 'Bàn phím văn phòng TZ Basic', 'Bàn phím không dây TZ Mini'], [690000, 990000, 159000, 590000], 'keyboard'],
  ['Sạc dự phòng', ['Sạc dự phòng TZ Pocket', 'Sạc dự phòng TZ Fast', 'Sạc dự phòng TZ Basic', 'Sạc dự phòng TZ Travel'], [249000, 399000, 179000, 329000], 'capacity'],
  ['Cáp sạc', ['Cáp USB-C TZ Braided', 'Cáp USB-C TZ Fast', 'Cáp sạc TZ Basic', 'Cáp USB-C TZ Travel'], [69000, 99000, 39000, 79000], 'length'],
  ['Ổ cứng SSD', ['SSD TZ SATA', 'SSD TZ NVMe', 'SSD gắn ngoài TZ Basic', 'SSD TZ Portable'], [590000, 890000, 1290000, 990000], 'ssd'],
];

function makeVariants(type, price) {
  if (type === 'default') return [{ name: 'Mặc định', price, values: {} }];
  if (type === 'color') return [
    { name: 'Đen', price, values: { 'Màu sắc': 'Đen' } },
    { name: 'Trắng', price: price + 50000, values: { 'Màu sắc': 'Trắng' } },
  ];
  if (type === 'keyboard') return [
    { name: 'Đen / Red switch', price, values: { 'Màu sắc': 'Đen', 'Loại switch': 'Red' } },
    { name: 'Đen / Brown switch', price: price + 100000, values: { 'Màu sắc': 'Đen', 'Loại switch': 'Brown' } },
    { name: 'Trắng / Red switch', price: price + 50000, values: { 'Màu sắc': 'Trắng', 'Loại switch': 'Red' } },
  ];
  const [option, values, increment] = {
    capacity: ['Dung lượng', ['10.000 mAh', '20.000 mAh'], 150000],
    length: ['Chiều dài', ['1 m', '2 m'], 30000],
    ssd: ['Dung lượng', ['256 GB', '512 GB', '1 TB'], 350000],
  }[type];
  return values.map((value, index) => ({ name: value, price: price + increment * index, values: { [option]: value } }));
}

const samples = groups.flatMap(([category, names, prices, type], group) => names.map((name, index) => {
  const number = group * 4 + index + 1;
  const variants = makeVariants(index === 2 ? 'default' : type, prices[index]).map((variant, variantIndex) => ({
    ...variant,
    sku: `TZDEMO-V1-${String(number).padStart(2, '0')}-${String(variantIndex + 1).padStart(2, '0')}`,
    stock: number === 4 || (number === 1 && variantIndex === 0) ? 0 : 5 + number + variantIndex,
  }));
  return { category, name: `${name} (Demo)`, number, variants, withoutImage: number === 20 };
}));

async function seedCatalog() {
  const image = fs.readFileSync(path.join(__dirname, '..', 'frontend-static', 'assets', 'images', 'Describe.png'));
  const connection = await getPool().getConnection();
  const created = { categories: 0, products: 0, variants: 0, options: 0, optionValues: 0, links: 0, skippedProducts: 0 };
  let locked = false;
  try {
    // Ngăn hai lần seed cùng bộ mẫu chạy đồng thời.
    const [[lock]] = await connection.execute("SELECT GET_LOCK('techzone:catalog-seed:v1', 5) AS acquired");
    if (Number(lock.acquired) !== 1) throw new Error('SEED_LOCK_BUSY');
    locked = true;
    await connection.beginTransaction();

    for (const sample of samples) {
      const skus = sample.variants.map((variant) => variant.sku);
      const [existing] = await connection.execute(`SELECT v.sku, v.product_id, p.description
        FROM product_variants v JOIN products p ON p.product_id = v.product_id
        WHERE v.sku IN (${skus.map(() => '?').join(', ')})`, skus);
      if (existing.length) {
        if (existing.length !== skus.length || new Set(existing.map((row) => row.product_id)).size !== 1 ||
            existing.some((row) => !String(row.description || '').startsWith(MARKER))) {
          throw new Error('SEED_SKU_CONFLICT');
        }
        created.skippedProducts++;
        continue;
      }

      let [[category]] = await connection.execute('SELECT category_id FROM categories WHERE category_name = ?', [sample.category]);
      if (!category) {
        const [result] = await connection.execute('INSERT INTO categories (category_name, description) VALUES (?, ?)',
          [sample.category, `${MARKER} Danh mục phụ kiện dùng kiểm thử catalog.`]);
        category = { category_id: result.insertId };
        created.categories++;
      }
      const description = `${MARKER}\nDữ liệu mẫu để kiểm thử website, không phải thông tin thương mại thực tế.\nẢnh minh họa dùng chung từ tài nguyên có sẵn trong project.\nCó thể thử tìm kiếm, lọc giá, chọn biến thể và xem tình trạng tồn kho.`;
      const [product] = await connection.execute(`INSERT INTO products
        (category_id, product_name, brand, description, image_data, image_mime_type) VALUES (?, ?, ?, ?, ?, ?)`,
      [category.category_id, sample.name, 'TechZone Demo', description, sample.withoutImage ? null : image, sample.withoutImage ? null : 'image/png']);
      created.products++;

      const options = new Map();
      const values = new Map();
      for (const variant of sample.variants) {
        for (const [optionName, valueName] of Object.entries(variant.values)) {
          if (!options.has(optionName)) {
            const [option] = await connection.execute('INSERT INTO product_options (product_id, option_name) VALUES (?, ?)', [product.insertId, optionName]);
            options.set(optionName, option.insertId);
            created.options++;
          }
          const key = JSON.stringify([optionName, valueName]);
          if (!values.has(key)) {
            const [value] = await connection.execute('INSERT INTO product_option_values (option_id, value_name) VALUES (?, ?)', [options.get(optionName), valueName]);
            values.set(key, value.insertId);
            created.optionValues++;
          }
        }
      }
      for (let index = 0; index < sample.variants.length; index++) {
        const variant = sample.variants[index];
        // Chỉ biến thể đầu có ảnh riêng; các biến thể khác thử fallback ảnh sản phẩm.
        const variantImage = index === 0 && !sample.withoutImage ? image : null;
        const [result] = await connection.execute(`INSERT INTO product_variants
          (product_id, sku, variant_name, price, stock, image_data, image_mime_type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [product.insertId, variant.sku, variant.name, variant.price, variant.stock, variantImage, variantImage ? 'image/png' : null]);
        created.variants++;
        for (const [optionName, valueName] of Object.entries(variant.values)) {
          await connection.execute('INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (?, ?)',
            [result.insertId, values.get(JSON.stringify([optionName, valueName]))]);
          created.links++;
        }
      }
    }
    await connection.commit();
    return created;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (locked) {
      try { await connection.execute("SELECT RELEASE_LOCK('techzone:catalog-seed:v1')"); }
      finally { connection.release(); }
    } else connection.release();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`Xem trước: ${groups.length} danh mục, ${samples.length} sản phẩm, ${samples.reduce((sum, item) => sum + item.variants.length, 0)} biến thể.`);
    console.log('Chưa kết nối/ghi database. Chỉ chạy ghi khi có quyền: node scripts/seed-catalog.cjs --apply');
  } else if (args.length === 1 && args[0] === '--apply') {
    seedCatalog().then((created) => {
      console.log('Đã hoàn tất transaction dữ liệu mẫu catalog:');
      console.log(JSON.stringify(created, null, 2));
    }).catch((error) => {
      const messages = {
        SEED_LOCK_BUSY: 'Một tiến trình khác đang thêm bộ mẫu. Hãy thử lại sau.',
        SEED_SKU_CONFLICT: 'SKU bộ mẫu bị trùng hoặc bộ mẫu cũ không đầy đủ; không ghi đè. Transaction đã được rollback.',
      };
      console.error(messages[error.message] || 'Không hoàn tất được seed. Không in thông tin kết nối; hãy kiểm tra dịch vụ MySQL, quyền INSERT và cấu trúc hiện tại.');
      process.exitCode = 1;
    }).finally(closePool);
  } else {
    console.error('Tham số không hợp lệ. Dùng --apply để thêm bộ mẫu đã được cho phép.');
    process.exitCode = 1;
  }
}

module.exports = { samples, seedCatalog };

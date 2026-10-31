const { CartError, positiveInteger, priceUnits, money } = require('../utils/cart-validation');

function variantProblem(variant, quantity) {
  if (!variant || !Number(variant.valid_variant)) return 'Sản phẩm hoặc biến thể không còn hợp lệ.';
  const price = priceUnits(variant.price);
  if (price === null || price <= 0n) return 'Biến thể chưa có giá bán hợp lệ.';
  if (!Number.isInteger(Number(variant.stock)) || Number(variant.stock) <= 0) return 'Biến thể đã hết hàng.';
  if (!Number.isInteger(Number(quantity)) || quantity < 1 || quantity > 99) return 'Số lượng phải từ 1 đến 99.';
  if (quantity > Number(variant.stock)) return `Số lượng vượt tồn kho hiện tại (${variant.stock}). Vui lòng giảm số lượng.`;
  return '';
}

function createCartService(repository) {
  async function getCart(userId) {
    const rows = await repository.list(userId);
    let total = 0n, quantity = 0;
    const items = rows.map((row) => {
      const problem = variantProblem(row.product_id ? row : null, Number(row.quantity));
      const price = priceUnits(row.price);
      const line = price !== null && price > 0n ? price * BigInt(row.quantity) : null;
      if (line !== null) total += line;
      quantity += Number(row.quantity);
      return { ...row, problem, priceLabel: price !== null && price > 0n ? money(price) : 'Chưa có giá hợp lệ', lineLabel: line === null ? 'Không tính được' : money(line) };
    });
    return { items, quantity, totalLabel: money(total), hasProblems: items.some((item) => item.problem) };
  }

  async function change(userId, operation, body, id) {
    const itemId = ['update', 'remove'].includes(operation) ? positiveInteger(id) : null;
    const variantId = ['add', 'buyNow'].includes(operation) ? positiveInteger(body?.variant_id) : null;
    const quantity = ['add', 'update', 'buyNow'].includes(operation) ? positiveInteger(body?.quantity, 99) : null;
    return repository.transaction(userId, async (tx) => {
      if (operation === 'clear') { await tx.execute('clear', [userId]); return; }
      let item;
      if (itemId) {
        item = await tx.one('own', [itemId, userId]);
        if (!item) throw new CartError('Dòng giỏ hàng không tồn tại.', 404);
      }
      if (operation === 'remove') { await tx.execute('remove', [itemId, userId]); return; }
      const variant = await tx.one('variant', [variantId || item.variant_id]);
      const existing = ['add', 'buyNow'].includes(operation) ? await tx.one('existing', [userId, variantId]) : item;
      // Mua ngay dùng đúng số lượng đang chọn, không cộng thêm số lượng cũ trong giỏ.
      const next = operation === 'add' ? Number(existing?.quantity || 0) + quantity : quantity;
      const problem = variantProblem(variant, next);
      if (problem) throw new CartError(problem);
      if (existing) {
        await tx.execute('update', [next, existing.cart_item_id, userId]);
        return existing.cart_item_id;
      }
      const [result] = await tx.execute('insert', [userId, variantId, next]);
      return result.insertId;
    });
  }
  return { getCart, change };
}

module.exports = { createCartService, variantProblem };

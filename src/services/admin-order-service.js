const { summary, formatOrderDetail } = require('./order-service');

const { AdminOrderError, NEXT_STATUS, ORDER_STATUSES, orderId } = require('../utils/admin-order-rules');
function createAdminOrderService(repository) {
  let expiryCursor = 0;
  async function change(value, body, cancellation = false) {
    const id = orderId(value), expected = body?.expected_status, target = cancellation ? 'cancelled' : body?.next_status;
    if (body?.confirm !== '1') throw new AdminOrderError('Vui lòng chọn xác nhận trước khi thay đổi đơn hàng.');
    if (typeof expected !== 'string' || !Object.hasOwn(ORDER_STATUSES, expected) ||
      (target === 'cancelled' ? expected !== 'pending' : !Object.hasOwn(NEXT_STATUS, expected) || NEXT_STATUS[expected] !== target)) {
      throw new AdminOrderError('Chuyển trạng thái không hợp lệ. Không bỏ bước, quay lùi hoặc hủy đơn ngoài trạng thái chờ xác nhận.', 409);
    }
    try { return await repository.change(id, expected, target); }
    catch (error) {
      if (['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new AdminOrderError('Đơn hoặc kho đang được cập nhật. Hãy tải lại để kiểm tra rồi thử lại.', 409);
      throw error;
    }
  }
  return {
    async list(query) {
      if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 100 || /[\u0000-\u001f\u007f]/.test(query.q))) {
        throw new AdminOrderError('Từ khóa không hợp lệ hoặc dài quá 100 ký tự.', 400);
      }
      if (query.status !== undefined && query.status !== '' && (typeof query.status !== 'string' || !Object.hasOwn(ORDER_STATUSES, query.status))) {
        throw new AdminOrderError('Trạng thái lọc không hợp lệ.', 400);
      }
      const filters = { q: (query.q || '').trim(), status: query.status || '',
        page: typeof query.page === 'string' && /^[1-9]\d{0,7}$/.test(query.page) ? Number(query.page) : 1 };
      const result = await repository.list(filters);
      return { ...result, filters: { ...filters, page: result.page }, orders: result.orders.map(summary), statuses: ORDER_STATUSES };
    },
    async detail(value) {
      const row = await repository.detail(orderId(value));
      if (!row) throw new AdminOrderError('Không tìm thấy đơn hàng.', 404);
      const order = formatOrderDetail(row);
      const bankPaid=row.payment_method==='bank'&&row.payment_status==='paid';
      return { ...order, nextStatus: ((row.payment_method === 'cod' && ['paid','unpaid'].includes(row.payment_status))||bankPaid) && Object.hasOwn(NEXT_STATUS,row.status) && !(row.status === 'pending' && Number(row.expired)&&!bankPaid) ? NEXT_STATUS[row.status] : null,
        canCancel: row.status === 'pending' && ['cod','bank'].includes(row.payment_method) && row.payment_status === 'unpaid',
        canConfirmBank:row.payment_method==='bank'&&row.status==='pending'&&row.payment_status==='unpaid'&&!Number(row.expired),
        canConfirmCod: row.status === 'delivered' && row.payment_method === 'cod' && row.payment_status === 'unpaid', statuses: ORDER_STATUSES };
    },
    change,
    async confirmBank(value,body) {
      const id=orderId(value);
      if(body?.confirm!=='1')throw new AdminOrderError('Vui lòng xác nhận đã đối soát và nhận đủ tiền chuyển khoản.');
      try{return await repository.confirmBank(id);}catch(error){
        if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code))throw new AdminOrderError('Đơn đang được xử lý. Hãy tải lại và kiểm tra.',409);
        throw error;
      }
    },
    async confirmCod(value, body) {
      const id = orderId(value);
      if (body?.confirm !== '1') throw new AdminOrderError('Vui lòng xác nhận đã nhận đủ tiền COD của đơn hàng.');
      // Chỉ nhận xác nhận; số tiền, trạng thái và danh tính không lấy từ form.
      try { return await repository.confirmCod(id); }
      catch (error) {
        if (['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new AdminOrderError('Đơn đang được cập nhật. Hãy tải lại để kiểm tra rồi thử lại.', 409);
        throw error;
      }
    },
    async expireBatch() {
      const ids = await repository.expired(expiryCursor);
      const result = { selected: ids.length, cancelled: 0, skipped: 0, failed: 0 };
      for (const id of ids) {
        try { if (await repository.change(id, 'pending', 'cancelled', true)) result.cancelled++; else result.skipped++; }
        catch { result.failed++; /* Không log lỗi driver/SQL/dữ liệu người mua. */ }
      }
      expiryCursor = ids.length === 50 ? ids[ids.length-1] : 0;
      return result;
    },
  };
}
module.exports = { createAdminOrderService, AdminOrderError, ORDER_STATUSES, orderId };

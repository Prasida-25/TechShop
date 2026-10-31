const { AdminOrderError } = require('../services/admin-order-service');

function createAdminOrderController(service) {
  const handle = run => async (req, res) => {
    try { return await run(req, res); }
    catch (error) {
      if (!(error instanceof AdminOrderError)) throw error;
      return res.status(error.status).render('admin/message', { title: 'Kiểm tra đơn hàng — TechZone', status: error.status, message: error.message });
    }
  };
  return {
    list: handle(async (req, res) => res.render('admin/orders/index', { title: 'Đơn hàng — TechZone', ...await service.list(req.query) })),
    detail: handle(async (req, res) => {
      const order = await service.detail(req.params.orderId);
      const notice = req.query.payment === '1' && order.payment_method === 'cod' && order.payment_status === 'paid'
        ? 'Đơn đã được ghi nhận thu tiền COD.'
        : req.query.payment === '1' && order.payment_method==='bank' && order.payment_status==='paid' ? 'Đã xác nhận nhận tiền chuyển khoản.'
        : req.query.updated === '1' ? 'Đã cập nhật trạng thái đơn hàng.' : '';
      return res.render('admin/orders/detail', { title: 'Chi tiết đơn hàng — TechZone', order, notice });
    }),
    confirmCod: handle(async (req, res) => {
      await service.confirmCod(req.params.orderId, req.body);
      return res.redirect(303, `/admin/orders/${req.params.orderId}?payment=1`);
    }),
    confirmBank:handle(async(req,res)=>{
      await service.confirmBank(req.params.orderId,req.body);
      return res.redirect(303,`/admin/orders/${req.params.orderId}?payment=1`);
    }),
    change: handle(async (req, res) => {
      await service.change(req.params.orderId, req.body, false);
      return res.redirect(303, `/admin/orders/${req.params.orderId}?updated=1`);
    }),
    cancel: handle(async (req, res) => {
      await service.change(req.params.orderId, req.body, true);
      return res.redirect(303, `/admin/orders/${req.params.orderId}?updated=1`);
    }),
  };
}
module.exports = { createAdminOrderController };

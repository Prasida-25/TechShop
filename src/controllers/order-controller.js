const { OrderError } = require('../services/order-service');

function createOrderController(service) {
  return {
    async payment(req, res) {
      try { res.render('orders/payment', { title: 'Thanh toán đơn hàng — TechZone', order: await service.payment(req.user.user_id, req.params.orderId) }); }
      catch (error) {
        if (!(error instanceof OrderError)) throw error;
        res.status(error.status).render('orders/message', { title: 'Kiểm tra thanh toán — TechZone', message: error.message });
      }
    },
    async list(req, res) {
      try { res.render('orders/index', { title: 'Đơn mua — TechZone', history: await service.list(req.user.user_id, req.query) }); }
      catch(error) {
        if (!(error instanceof OrderError)) throw error;
        res.status(error.status).render('orders/message',{title:'Kiểm tra đơn hàng — TechZone',message:error.message});
      }
    },
    async detail(req, res) {
      try { res.render('orders/detail', { title: 'Chi tiết đơn hàng — TechZone', order: await service.detail(req.user.user_id, req.params.orderId) }); }
      catch (error) {
        if (!(error instanceof OrderError)) throw error;
        res.status(404).render('orders/message', { title: 'Không tìm thấy đơn — TechZone', message: error.message });
      }
    },
  };
}

module.exports = { createOrderController };

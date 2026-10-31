const {CouponError}=require('../utils/coupon-validation');
const {priceUnits,money}=require('../utils/cart-validation');
function createAdminCouponController(service) {
  const helpers={moneyLabel:value=>value==null?'Không giới hạn':money(priceUnits(value))};
  const handle=fn=>async(req,res)=>{try{return await fn(req,res);}catch(e){if(!(e instanceof CouponError))throw e;return res.status(e.status).render('admin/message',{title:'Kiểm tra mã giảm giá — TechZone',status:e.status,message:e.message});}};
  async function form(req,res,errors={},values,status=200) {
    const coupon=req.params.couponId?await service.detail(req.params.couponId):null;
    if(values) values=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,typeof value==='string'?value:'']));
    return res.status(status).render('admin/coupons/form',{title:coupon?'Sửa mã giảm giá — TechZone':'Tạo mã giảm giá — TechZone',coupon,errors,values:values||coupon||{discount_type:'percent',min_order_amount:'0',is_active:1},notice:req.query.saved==='1'?'Đã lưu mã giảm giá.':''});
  }
  return {
    list:handle(async(req,res)=>res.render('admin/coupons/index',{title:'Mã giảm giá — TechZone',...helpers,...await service.list(req.query)})),
    form:handle((req,res)=>form(req,res)),
    save:handle(async(req,res)=>{try{const id=await service.save(req.params.couponId,req.body);return res.redirect(303,`/admin/coupons/${id}/edit?saved=1`);}catch(e){if(!(e instanceof CouponError)||e.status===404||e.errors.general)throw e;return form(req,res,e.errors,req.body,e.status);}}),
    status:handle(async(req,res)=>{await service.status(req.params.couponId,req.body);return res.redirect(303,`/admin/coupons/${req.params.couponId}/edit?saved=1`);}),
    orders:handle(async(req,res)=>res.render('admin/coupons/orders',{title:'Đơn sử dụng mã — TechZone',...helpers,...await service.orders(req.params.couponId,req.query)})),
  };
}
module.exports={createAdminCouponController};

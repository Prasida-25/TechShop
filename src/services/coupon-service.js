const { CouponError,couponId,couponInput }=require('../utils/coupon-validation');
function createCouponService(repo) {
  const page=value=>typeof value==='string' && /^[1-9]\d{0,7}$/.test(value)?Number(value):1;
  return {
    list(query) {if(query.q!==undefined && (typeof query.q!=='string'||query.q.length>50))throw new CouponError({general:'Từ khóa tối đa 50 ký tự.'},400);return repo.list((query.q||'').trim(),page(query.page));},
    detail:value=>repo.detail(couponId(value)),
    orders:(value,query)=>repo.orders(couponId(value),page(query.page)),
    async save(value,body) {
      const id=value===undefined?null:couponId(value),data=couponInput(body);
      try{return await repo.save(id,data);}catch(e){
        if(e.code==='ER_DUP_ENTRY')throw new CouponError({code:'Mã giảm giá đã tồn tại.'},409);
        if(['ER_LOCK_WAIT_TIMEOUT','ER_LOCK_DEADLOCK'].includes(e.code))throw new CouponError({general:'Mã đang được cập nhật. Vui lòng thử lại.'},409);
        throw e;
      }
    },
    status(value,body) {const id=couponId(value);if(!['0','1'].includes(body?.is_active))throw new CouponError({general:'Trạng thái không hợp lệ.'});return repo.status(id,Number(body.is_active));},
  };
}
module.exports={createCouponService};

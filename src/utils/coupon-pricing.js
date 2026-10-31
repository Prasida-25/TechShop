const {priceUnits,money}=require('./cart-validation');
const {CouponError}=require('./coupon-validation');
const {decimal}=require('./checkout');

function applyCoupon(pricing,coupon,requested=false) {
  const subtotal=priceUnits(pricing.subtotal),shipping=priceUnits(pricing.shipping);
  let discount=0n,terms=null;
  if(requested) {
    if(!coupon)throw new CouponError({code:'Mã giảm giá không tồn tại.'},409);
    if(!Number(coupon.is_active))throw new CouponError({code:'Mã giảm giá đã bị vô hiệu hóa.'},409);
    if(Number(coupon.not_started))throw new CouponError({code:'Mã giảm giá chưa đến thời gian áp dụng.'},409);
    if(Number(coupon.expired))throw new CouponError({code:'Mã giảm giá đã hết hạn.'},409);
    if(coupon.max_uses!=null&&Number(coupon.used_count)>=Number(coupon.max_uses))throw new CouponError({code:'Mã giảm giá đã hết lượt sử dụng.'},409);
    if(subtotal<priceUnits(coupon.min_order_amount))throw new CouponError({code:`Tiền hàng tối thiểu để dùng mã là ${money(priceUnits(coupon.min_order_amount))}.`},409);
    const value=priceUnits(coupon.discount_value);
    discount=coupon.discount_type==='percent'?subtotal*value/10000n:value;
    const cap=priceUnits(coupon.max_discount_amount);
    if(coupon.discount_type==='percent'&&cap!==null&&discount>cap)discount=cap;
    if(discount>subtotal)discount=subtotal;
    terms=[coupon.coupon_id,coupon.code,coupon.discount_type,coupon.discount_value,coupon.min_order_amount,coupon.max_discount_amount,coupon.starts_at,coupon.ends_at];
  }
  const total=subtotal-discount+shipping;
  return {...pricing,total:decimal(total),totalLabel:money(total),discount:decimal(discount),discountLabel:money(discount),
    couponId:requested?Number(coupon.coupon_id):null,couponCode:requested?coupon.code:null,couponTerms:terms};
}
module.exports={applyCoupon};

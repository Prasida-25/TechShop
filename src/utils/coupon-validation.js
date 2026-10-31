const { CartError, priceUnits, positiveInteger } = require('./cart-validation');

class CouponError extends CartError {
  constructor(errors, status = 422) { super(Object.values(errors)[0], status); this.errors = errors; }
}
function couponCode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{3,50}$/.test(value.trim())) throw new CouponError({ code:'Mã gồm 3–50 ký tự chữ, số, dấu _ hoặc -.' });
  return value.trim().toUpperCase();
}
function couponId(value) { try { return positiveInteger(value); } catch { throw new CouponError({ general:'Không tìm thấy mã giảm giá.' },404); } }
function dateInput(value, field) {
  const m = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) throw new CouponError({ [field]:'Nhập ngày giờ hợp lệ.' });
  const [year,month,day,hour,minute,second] = m.slice(1).map(n=>Number(n || 0));
  const d=new Date(Date.UTC(year,month-1,day,hour,minute,second));
  if(year<1000 || d.getUTCFullYear()!==year || d.getUTCMonth()!==month-1 || d.getUTCDate()!==day || hour>23 || minute>59 || second>59) throw new CouponError({[field]:'Ngày giờ không hợp lệ.'});
  return value.replace('T',' ') + (m[6] ? '' : ':00');
}
function couponInput(body) {
  const type=body?.discount_type;
  if(!['percent','fixed'].includes(type)) throw new CouponError({discount_type:'Chọn loại giảm giá hợp lệ.'});
  function amount(field, required=false) {
    const value=body?.[field];
    if(!required && (value==='' || value===undefined)) return null;
    if(typeof value!=='string' || priceUnits(value)===null) throw new CouponError({[field]:'Nhập số tiền không âm, tối đa 2 chữ số thập phân.'});
    return value;
  }
  const value=amount('discount_value',true),min=amount('min_order_amount',true),max=amount('max_discount_amount');
  if(priceUnits(value)<=0n || (type==='percent' && priceUnits(value)>10000n)) throw new CouponError({discount_value:'Giá trị phải dương; phần trăm không quá 100.'});
  if(max!==null && (type!=='percent' || priceUnits(max)<=0n)) throw new CouponError({max_discount_amount:'Chỉ mã phần trăm có mức giảm tối đa lớn hơn 0; mã cố định để trống.'});
  let maxUses=null;
  if(body?.max_uses!=='' && body?.max_uses!==undefined) { try { maxUses=positiveInteger(body.max_uses); } catch { throw new CouponError({max_uses:'Nhập số lượt nguyên dương hoặc để trống nếu không giới hạn.'}); } }
  const start=dateInput(body?.starts_at,'starts_at'),end=dateInput(body?.ends_at,'ends_at');
  if(end<=start) throw new CouponError({ends_at:'Thời gian kết thúc phải sau thời gian bắt đầu.'});
  if(!['0','1'].includes(body?.is_active)) throw new CouponError({is_active:'Trạng thái không hợp lệ.'});
  return {code:couponCode(body?.code),discount_type:type,discount_value:value,min_order_amount:min,max_discount_amount:max,starts_at:start,ends_at:end,max_uses:maxUses,is_active:Number(body.is_active)};
}
module.exports={CouponError,couponCode,couponId,couponInput};

const { getPool } = require('../config/database');
const { CouponError } = require('../utils/coupon-validation');

const FIELDS=`coupon_id,code,discount_type,discount_value,min_order_amount,max_discount_amount,
 DATE_FORMAT(starts_at,'%Y-%m-%d %H:%i:%s') starts_at,DATE_FORMAT(ends_at,'%Y-%m-%d %H:%i:%s') ends_at,
 max_uses,used_count,is_active,(CURRENT_TIMESTAMP<starts_at) not_started,(CURRENT_TIMESTAMP>=ends_at) expired`;
const COUPON_SQL={
  byCode:`SELECT ${FIELDS} FROM coupons WHERE code=?`,
  own:`SELECT ${FIELDS} FROM coupons WHERE coupon_id=?`,
  lock:`SELECT ${FIELDS} FROM coupons WHERE coupon_id=? FOR UPDATE`,
  clock:'SELECT (CURRENT_TIMESTAMP<starts_at) not_started,(CURRENT_TIMESTAMP>=ends_at) expired FROM coupons WHERE coupon_id=?',
  consume:`UPDATE coupons SET used_count=used_count+1 WHERE coupon_id=? AND is_active=1
    AND starts_at<=CURRENT_TIMESTAMP AND ends_at>CURRENT_TIMESTAMP AND (max_uses IS NULL OR used_count<max_uses)`,
  release:'UPDATE coupons SET used_count=used_count-1 WHERE coupon_id=? AND used_count>0',
  create:`INSERT INTO coupons (code,discount_type,discount_value,min_order_amount,max_discount_amount,starts_at,ends_at,max_uses,is_active) VALUES (?,?,?,?,?,?,?,?,?)`,
  update:`UPDATE coupons SET discount_type=?,discount_value=?,min_order_amount=?,max_discount_amount=?,starts_at=?,ends_at=?,max_uses=?,is_active=? WHERE coupon_id=?`,
};
function createCouponRepository(database) {
  const db=database || {execute:(...a)=>getPool().execute(...a),getConnection:()=>getPool().getConnection()};
  async function detail(id) { const [[row]]=await db.execute(COUPON_SQL.own,[id]); if(!row) throw new CouponError({general:'Không tìm thấy mã giảm giá.'},404);return row; }
  async function list(q,page) {
    const where=q?" WHERE code LIKE ? ESCAPE '!'":'',params=q?['%'+q.replace(/[!%_]/g,'!$&')+'%']:[];
    const [[count]]=await db.execute('SELECT COUNT(*) total FROM coupons'+where,params);
    const total=Number(count.total),pages=Math.ceil(total/20);page=Math.min(page,Math.max(1,pages));
    const [coupons]=await db.execute(`SELECT ${FIELDS} FROM coupons${where} ORDER BY coupon_id DESC LIMIT 20 OFFSET ${(page-1)*20}`,params);
    return {coupons,total,pages,page,q};
  }
  async function save(id,data) {
    const c=await db.getConnection();
    try {
      await c.beginTransaction();
      if(id) {
        const [[row]]=await c.execute(COUPON_SQL.lock,[id]);if(!row) throw new CouponError({general:'Không tìm thấy mã giảm giá.'},404);
        if(row.code!==data.code) throw new CouponError({code:'Không đổi tên mã đã tạo. Hãy vô hiệu hóa và tạo mã khác.'});
        if(data.max_uses!==null && data.max_uses<Number(row.used_count)) throw new CouponError({max_uses:'Hạn mức không thể thấp hơn số lượt đang dùng.'});
        await c.execute(COUPON_SQL.update,[data.discount_type,data.discount_value,data.min_order_amount,data.max_discount_amount,data.starts_at,data.ends_at,data.max_uses,data.is_active,id]);
      } else { const [r]=await c.execute(COUPON_SQL.create,[data.code,data.discount_type,data.discount_value,data.min_order_amount,data.max_discount_amount,data.starts_at,data.ends_at,data.max_uses,data.is_active]);id=Number(r.insertId); }
      await c.commit();return id;
    } catch(e){await c.rollback();throw e;}finally{c.release();}
  }
  async function status(id,active) {const [r]=await db.execute('UPDATE coupons SET is_active=? WHERE coupon_id=?',[active,id]);if(!r.affectedRows)await detail(id);}
  async function orders(id,page) {
    const coupon=await detail(id);const [[count]]=await db.execute('SELECT COUNT(*) total FROM orders WHERE coupon_id=?',[id]);
    const total=Number(count.total),pages=Math.ceil(total/20);page=Math.min(page,Math.max(1,pages));
    const [orders]=await db.execute(`SELECT order_id,coupon_code,discount_amount,total_amount,status,DATE_FORMAT(created_at,'%d/%m/%Y %H:%i') created_at_label FROM orders WHERE coupon_id=? ORDER BY order_id DESC LIMIT 20 OFFSET ${(page-1)*20}`,[id]);
    return {coupon,orders,total,pages,page};
  }
  return {detail,list,save,status,orders};
}
module.exports={createCouponRepository,COUPON_SQL};

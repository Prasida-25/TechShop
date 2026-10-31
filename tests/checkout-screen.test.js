const {test}=require('node:test');
const assert=require('node:assert/strict');
const ejs=require('ejs');
const path=require('node:path');
const fs=require('node:fs');
const vm=require('node:vm');
const {createCheckoutDatabase}=require('./helpers/checkout-database.cjs');
const {createCheckoutRepository}=require('../src/repositories/checkout-repository');
const {createCheckoutService}=require('../src/services/checkout-service');

test('Checkout EJS: giữ dòng đã chọn, địa chỉ mặc định, ảnh biến thể và các trường gửi backend',async()=>{
  const db=createCheckoutDatabase();
  db.state.carts.push({cart_item_id:3,user_id:1,variant_id:2,quantity:1});
  const checkout=await createCheckoutService(createCheckoutRepository(db)).preview(1,undefined,'1');
  const html=await ejs.renderFile(path.resolve('src/views/checkout/index.ejs'),{title:'Thanh toán',checkout,csrfToken:'test-csrf',couponInput:'',hasCoupon:false,couponError:''});
  assert.match(html,/src="\/products\/1\/variants\/1\/image"/);
  assert.doesNotMatch(html,/variants\/2\/image/);
  assert.match(html,/name="items" value="1"/);
  assert.match(html,/name="address_id" value="1" checked/);
  assert.match(html,/Mặc định/);assert.match(html,/Tai nghe &lt;thử&gt;/);
  assert.match(html,/name="checkout_token" value="[a-f0-9]{64}"/);
  assert.match(html,/name="confirm" value="1"/);
  assert.match(html,/name="_csrf" value="test-csrf"/);
  assert.doesNotMatch(html,/name="(?:quantity|price|total|user_id|payment_status)"/);
  assert.match(html,/130\.000,01/);assert.match(html,/Thanh toán khi nhận hàng/);
  assert.match(html,/value="cod" class="checkout-payment-option" aria-pressed="true"/);
  assert.match(html,/value="bank" class="checkout-payment-option" aria-pressed="false"/);
  assert.doesNotMatch(html,/checkout-payment-picker/);
  assert.doesNotMatch(html,/MoMo|VNPay/);assert.match(html,/value="bank"/);
  const sections=['delivery-title','Sản phẩm thanh toán','voucher-title','payment-title','data-checkout-form'].map(s=>html.indexOf(s));
  assert.ok(sections.every((v,i)=>v>=0&&(i===0||v>sections[i-1])));
});

test('Checkout EJS: thiếu địa chỉ hoặc mã lỗi không có form tạo đơn; mã lỗi vẫn sửa/gỡ được',async()=>{
  const db=createCheckoutDatabase();db.state.addresses=[];
  const checkout=await createCheckoutService(createCheckoutRepository(db)).preview(1);
  const base={title:'Thanh toán',checkout,csrfToken:'test-csrf',couponInput:'',hasCoupon:false,couponError:''};
  let html=await ejs.renderFile(path.resolve('src/views/checkout/index.ejs'),base);
  assert.match(html,/Thêm địa chỉ/);assert.doesNotMatch(html,/name="checkout_token"/);
  html=await ejs.renderFile(path.resolve('src/views/checkout/index.ejs'),{...base,couponError:'Mã hết lượt',couponInput:'TEST10',hasCoupon:true});
  assert.match(html,/checkout-voucher__picker" open/);assert.match(html,/role="alert">Mã hết lượt/);
  assert.match(html,/action="\/checkout\/coupon\/remove"/);assert.doesNotMatch(html,/name="checkout_token"/);
});

test('Checkout JS: validation, loading, chặn gửi lặp và khôi phục khi Back từ bfcache',()=>{
  const handlers={},windowHandlers={},button={textContent:'Đặt hàng',disabled:false},status={textContent:''};
  let valid=false;
  const form={dataset:{},checkValidity:()=>valid,querySelector:s=>s==='button[type=submit]'?button:status,
    addEventListener:(event,fn)=>handlers[event]=fn,setAttribute:(name,value)=>form[name]=value,removeAttribute:name=>delete form[name]};
  vm.runInNewContext(fs.readFileSync('public/js/checkout.js','utf8'),{document:{querySelector:()=>form},window:{addEventListener:(event,fn)=>windowHandlers[event]=fn}});
  let prevented=0;const event={preventDefault:()=>prevented++};
  handlers.submit(event);assert.equal(button.disabled,false);assert.equal(form.dataset.submitting,undefined);
  valid=true;handlers.submit(event);assert.equal(button.disabled,true);assert.equal(button.textContent,'Đang đặt hàng…');assert.equal(form['aria-busy'],'true');
  handlers.submit(event);assert.equal(prevented,1);
  windowHandlers.pageshow({persisted:false});assert.equal(button.disabled,true);
  windowHandlers.pageshow({persisted:true});assert.equal(button.disabled,false);assert.equal(button.textContent,'Đặt hàng');assert.equal(status.textContent,'');
});

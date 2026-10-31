const { test } = require('node:test');
const assert = require('node:assert/strict');
const { totals, priceUnits, money } = require('../public/js/cart-screen');
const vm = require('node:vm');
const fs = require('node:fs');

test('Tổng tiền giỏ theo dòng được chọn: chính xác phần lẻ, giỏ rỗng và trạng thái lỗi', () => {
  const rows = [{ price:'100000.01', quantity:'2', problem:'0' }, { price:'200000.02', quantity:'1', problem:'0' }];
  assert.equal(totals([]).amount,0n);
  assert.equal(totals(rows.slice(0,1)).amount,20000002n);
  assert.equal(totals(rows).quantity,3);
  assert.equal(money(totals(rows).amount),'400.000,04 ₫');
  assert.equal(totals([{ ...rows[0], problem:'1' }]).invalid,true);
  for (const quantity of ['0','-1','1.5','100','bad']) assert.equal(totals([{ ...rows[0],quantity }]).invalid,true);
  for (const price of ['-1','0','bad','1.234']) assert.equal(totals([{ ...rows[0],price }]).invalid,true);
  assert.equal(priceUnits('1.01'),101n);
});

test('Giỏ JS: thiếu ghi chú không chặn POST; nhập số lượng khi blur và lỗi mạng không kẹt busy',async()=>{
  const handlers={},sent=[],checkbox={},button={},root={setAttribute(){},removeAttribute(){}};
  const input={value:'2',min:'1',max:'99',checkValidity:()=>true,matches:()=>true};
  const form={action:'http://test/cart/items/1/update',elements:{quantity:input},checkValidity:()=>true};input.form=form;
  const row={dataset:{id:'1',price:'100000.01',quantity:'2',problem:'0'},querySelector:s=>s==='[name=quantity]'?input:checkbox};input.closest=()=>row;
  const checkout={elements:{items:{value:''}},querySelector:()=>button};
  const nodes={'.cart-screen':root,'[data-cart-checkout]':checkout,'.cart-feedback':{},'[data-selected-count]':{},'[data-selected-total]':{},'[data-delete-selected]':{}};
  vm.runInNewContext(fs.readFileSync('public/js/cart-screen.js','utf8'),{
    document:{querySelector:s=>nodes[s]||null,querySelectorAll:s=>s==='[data-cart-row]'?[row]:s==='[data-select-all]'||s==='[data-select-item]'?[checkbox]:[],addEventListener:(name,fn)=>handlers[name]=fn},
    window:{},URL,URLSearchParams,FormData:class{constructor(f){return new Map([['quantity',f.elements.quantity.value]]);}},
    fetch:async(url,options)=>{sent.push({url,quantity:options.body.get('quantity')});throw new Error('Lỗi mạng giả lập');},
  });
  input.value='1';handlers.focusout({target:input});await new Promise(r=>setImmediate(r));
  assert.deepEqual(sent,[{url:form.action,quantity:'1'}]);assert.match(nodes['.cart-feedback'].textContent,/Lỗi mạng giả lập/);
  input.value='3';handlers.focusout({target:input});await new Promise(r=>setImmediate(r));
  assert.equal(sent.length,2);assert.equal(sent[1].quantity,'3');
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const source=readFileSync('public/js/account-address-dialog.js','utf8');
function setup(auto='0',editing='0',search=''){
  const handlers={};
  const dialog={open:true,dataset:{autoOpen:auto,editing},close(){this.open=false;},showModal(){this.open=true;}};
  vm.runInNewContext(source,{URLSearchParams,location:{search},document:{querySelector(selector){
    if(selector==='[data-address-dialog]')return dialog;
    return {addEventListener(event,fn){handlers[selector]=fn;}};
  }}});
  return {dialog,click(selector){let prevented=false;handlers[selector]({preventDefault(){prevented=true;}});return prevented;}};
}
test('Hộp thoại địa chỉ: đóng mặc định, thêm/mở, trở lại/đóng; tự mở khi sửa hoặc lỗi server',()=>{
  const added=setup();assert.equal(added.dialog.open,false);
  assert.equal(added.click('[data-address-open]'),true);assert.equal(added.dialog.open,true);
  assert.equal(added.click('[data-address-close]'),true);assert.equal(added.dialog.open,false);
  for(const args of [['1','0',''],['1','1',''],['0','0','?new=1']])assert.equal(setup(...args).dialog.open,true);
  const edit=setup('1','1');assert.equal(edit.click('[data-address-close]'),false);
  assert.equal(edit.click('[data-address-open]'),false); // Cho phép tải form thêm sạch từ URL.
  vm.runInNewContext(source,{document:{querySelector:()=>null}});
});

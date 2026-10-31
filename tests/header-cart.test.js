const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Header: hover trực tiếp biểu tượng giỏ tải preview; không chặn click mở giỏ và Escape đóng', async () => {
  function node() {
    return { handlers:{}, attributes:{}, children:[],
      addEventListener(name,fn) { this.handlers[name]=fn; },
      setAttribute(name,value) { this.attributes[name]=value; }, removeAttribute(name) { delete this.attributes[name]; },
      getAttribute(name) { return this.attributes[name]; },
      replaceChildren(...nodes) { this.children=nodes; }, append(...nodes) { this.children.push(...nodes); } };
  }
  const wrapper=node(),link=node(),body=node(),badge=node(),panel=node();
  const classes=new Set();
  wrapper.classList={ add:name=>classes.add(name),remove:name=>classes.delete(name) };
  wrapper.contains=()=>false;
  wrapper.dataset={authenticated:'1'};
  panel.style={removeProperty() {}};
  const nodes={'[data-cart-preview-body]':body,'[data-cart-badge]':badge,
    '.header__cart-link':link,'#header-cart-preview':panel};
  wrapper.querySelector=selector=>nodes[selector];
  const calls=[];
  vm.runInNewContext(fs.readFileSync('public/js/header-cart.js','utf8'),{
    document:{querySelector:()=>wrapper,createElement:()=>node(),addEventListener() {},activeElement:null},
    window:{matchMedia:()=>({matches:false}),addEventListener() {}},
    fetch:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({quantity:0,lineCount:0,items:[]})};},
  });
  assert.equal(typeof link.handlers.mouseenter,'function');
  assert.equal(link.handlers.click,undefined); // Nhấn link vẫn điều hướng tự nhiên tới /cart.
  link.handlers.mouseenter(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/cart/preview');
  assert.equal(calls[0].options.cache,'no-store');assert.equal(link.attributes['aria-expanded'],'true');
  assert.equal(body.children[1].textContent,'Giỏ hàng của bạn đang trống.');
  const content=body.children;
  wrapper.handlers.focusin({relatedTarget:null});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);assert.equal(body.children,content); // Focus trước click không xóa link đang bấm.
  wrapper.handlers.keydown({key:'Escape'});
  assert.equal(link.attributes['aria-expanded'],'false');assert.equal(classes.has('preview-dismissed'),true);
  link.handlers.mouseenter();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(classes.has('preview-dismissed'),false);assert.equal(calls.length,2);
});

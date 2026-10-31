const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { createAdvertisementService, validTarget, advertisementId } = require('../src/services/advertisement-service');
const { createAdvertisementRepository } = require('../src/repositories/advertisement-repository');
const { withAccountApp } = require('./helpers/account-client.cjs');
const { png } = require('./helpers/catalog-fixtures.cjs');

function fixture() {
  const rows = []; let next = 1;
  const repo = {
    list: async () => rows.map(({ image_data, ...row }) => row),
    detail: async id => rows.find(row => row.advertisement_id === id) || null,
    image: async (id, activeOnly = true) => rows.find(row => row.advertisement_id === id && (!activeOnly || row.is_active)) || null,
    home: async () => {
      const sorted = rows.filter(row => row.is_active).sort((a,b) => a.sort_order - b.sort_order || a.advertisement_id - b.advertisement_id);
      return { hero: sorted.filter(row => row.position === 'hero').slice(0,1), promotion: sorted.filter(row => row.position === 'promotion').slice(0,4) };
    },
    save: async (id, data) => { if (id) Object.assign(rows.find(row => row.advertisement_id === id), data); else { id = next++; rows.push({ ...data, advertisement_id: id }); } return id; },
    status: async (id, active) => { const row = rows.find(row => row.advertisement_id === id); if (row) row.is_active = active; return Boolean(row); },
    remove: async id => { const index = rows.findIndex(row => row.advertisement_id === id); if (index < 0) return false; rows.splice(index,1); return true; },
  };
  return { rows, repo, service: createAdvertisementService(repo) };
}
const fields = { title: 'Quảng cáo <TEST>', position: 'hero', sort_order: '0', is_active: '1', target_url: '/products/1' };
const image = { data: png, type: 'application/octet-stream' };
const inApp = (repo, run) => withAccountApp(run, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, repo);
async function registered(client, database, admin = true) {
  const browser = client(); await browser.get('/register');
  const password = 'Advertisement123';
  assert.equal((await browser.post('/register', { full_name: 'Test', phone: '0900000001', password, confirm_password: password })).status, 303);
  if (admin) database.state.users[0].role = 'admin';
  await browser.get('/login');
  assert.equal((await browser.post('/login', { phone:'0900000001', password })).status,303);
  await browser.get(admin ? '/admin' : '/account');
  return browser;
}
function upload(browser, path, data, bytes = png, token = browser.token) {
  const form = new FormData();
  for (const [key,value] of Object.entries(data)) form.append(key,value);
  if (token) form.append('_csrf', token);
  if (bytes) form.append('image', new Blob([bytes], { type:'image/webp' }), 'test.webp');
  return browser.request(path, { method:'POST', body:form });
}

test('Quảng cáo service: validate ID, liên kết nội bộ, ảnh thực, thứ tự/trạng thái và giữ ảnh khi sửa', async () => {
  const { service, rows } = fixture();
  for (const target of ['/products', '/products/1?variant=2', '/products/search?q=Tai%20nghe', '']) assert.equal(validTarget(target),true);
  for (const target of ['https://evil.test', '//evil.test', '/\\evil.test', '/%2fevil.test', '/%0afoo', 'javascript:alert(1)', '/bad%']) assert.equal(validTarget(target),false);
  for (const id of ['0','-1','1.2','2147483648',['1']]) assert.throws(() => advertisementId(id), { status:404 });
  for (const change of [{ title:'' }, { title:'x'.repeat(201) }, { title:'a\nb' }, { target_url:'//evil.test' }, { position:'fake' }, { sort_order:'-1' }, { sort_order:'1.5' }, { sort_order:'2147483648' }, { is_active:'admin' }]) {
    await assert.rejects(service.save(undefined, { ...fields, ...change }, image), { status:422 });
  }
  await assert.rejects(service.save(undefined, fields), { status:422 });
  await assert.rejects(service.save(undefined, fields, { data:Buffer.from('<svg/>') }), { status:422 });
  await assert.rejects(service.save(undefined, fields, { data:Buffer.concat([png,Buffer.alloc(1024*1024)]) }), { status:422 });
  await assert.rejects(service.save(undefined, fields, image, [image]), { status:422 });
  const id = await service.save(undefined, { ...fields, user_id:'999', advertisement_id:'999' }, image);
  assert.equal(id,1); assert.equal(rows[0].image_mime_type,'image/png');
  assert.equal(rows[0].user_id,undefined);
  await service.save('1',{ ...fields, title:'Mới', is_active:'0' });
  assert.equal(rows[0].title,'Mới'); assert.equal(rows[0].image_data,png);
  await service.status('1',{ is_active:'1' }); assert.equal(rows[0].is_active,1);
  await assert.rejects(service.status('1',{ is_active:'2' }),{status:422});
  await service.remove('1'); assert.equal(rows.length,0);
  await assert.rejects(service.detail('1'),{status:404});
});

test('Quảng cáo repository: tham số SQL, danh sách không tải BLOB, giới hạn hiển thị và cập nhật không thay ảnh cũ', async () => {
  const queries=[];
  const repo=createAdvertisementRepository({ execute:async(sql,params=[])=>{
    queries.push({sql,params});
    if(sql.startsWith('INSERT')) return [{insertId:7}];
    if(sql.startsWith('UPDATE') || sql.startsWith('DELETE')) return [{affectedRows:1}];
    return [[{advertisement_id:7}]];
  }});
  await repo.list(); await repo.home(); await repo.detail(7);
  for(const {sql} of queries) assert.doesNotMatch(sql,/image_data|SELECT \*/);
  assert.match(queries[1].sql,/is_active=1.*position='hero'.*sort_order,advertisement_id LIMIT 1/);
  assert.match(queries[2].sql,/position='promotion'.*LIMIT 4/);
  await repo.image(7); assert.match(queries.at(-1).sql,/advertisement_id=\? AND is_active=1/);
  await repo.image(7,false); assert.doesNotMatch(queries.at(-1).sql,/AND is_active/);
  await repo.save(7,{title:"a' OR 1=1",target_url:null,position:'hero',sort_order:0,is_active:1});
  assert.doesNotMatch(queries.at(-1).sql,/image_data|OR 1=1/); assert.equal(queries.at(-1).params[0],"a' OR 1=1");
  await repo.remove(7); assert.deepEqual(queries.at(-1).params,[7]);
});

test('Quảng cáo HTTP/session: phân quyền mọi thao tác, CSRF và khách không đọc được ảnh tắt', async () => {
  const {repo,rows}=fixture();
  await inApp(repo,async({client,database})=>{
    const guest=client();
    assert.equal((await guest.get('/admin/advertisements')).status,303);
    const user=await registered(client,database,false);
    for(const path of ['/admin/advertisements','/admin/advertisements/new','/admin/advertisements/1/edit','/admin/advertisements/1/image']) assert.equal((await user.get(path)).status,403);
    for(const path of ['/admin/advertisements','/admin/advertisements/1/update','/admin/advertisements/1/status','/admin/advertisements/1/delete']) assert.equal((await user.post(path,{...fields,role:'admin',user_id:'999'})).status,403);
    assert.equal(rows.length,0);
    database.state.users[0].role='admin';
    await user.get('/admin/advertisements/new');
    assert.equal((await upload(user,'/admin/advertisements',fields,png,'invalid')).status,403);
    assert.equal(rows.length,0);
    assert.equal((await user.post('/admin/advertisements/1/delete',{},'invalid')).status,403);
    assert.equal((await guest.get('/advertisements/1/image')).status,404);
  });
});

test('Quảng cáo HTTP/EJS: upload, lỗi field, sửa giữ ảnh, bật/tắt, trang chủ động và xóa thật trong mock', async () => {
  const {repo,rows}=fixture();
  await inApp(repo,async({client,database})=>{
    const admin=await registered(client,database);
    assert.match((await admin.get('/admin/advertisements')).html,/Chưa có quảng cáo/);
    await admin.get('/admin/advertisements/new');
    const invalid=await upload(admin,'/admin/advertisements',{...fields,title:''});
    assert.equal(invalid.status,422); assert.match(invalid.html,/Tiêu đề cần/); assert.equal(rows.length,0);
    assert.equal((await upload(admin,'/admin/advertisements',fields,Buffer.from('<svg/>'))).status,422);
    assert.equal((await upload(admin,'/admin/advertisements',fields)).status,303);
    assert.equal(rows.length,1); assert.equal(rows[0].image_mime_type,'image/png');
    let page=await admin.get('/admin/advertisements');
    assert.match(page.html,/Quảng cáo &lt;TEST&gt;/); assert.match(page.html,/data-advertisement-delete/);
    const guest=client(); let home=await guest.get('/');
    assert.match(home.html,/src="\/advertisements\/1\/image"/); assert.doesNotMatch(home.html,/Banner_home.png|\/images\/apple.png/);
    assert.equal((await guest.get('/advertisements/1/image')).headers.get('content-type'),'image/png');
    assert.equal((await upload(admin,'/admin/advertisements/1/update',{...fields,title:'Sửa',target_url:''},null)).status,303);
    assert.deepEqual(rows[0].image_data,png);
    assert.equal((await admin.post('/admin/advertisements/1/status',{is_active:'0'})).status,303);
    assert.equal((await guest.get('/advertisements/1/image')).status,404);
    assert.equal((await admin.get('/admin/advertisements/1/image')).status,200);
    assert.doesNotMatch((await guest.get('/')).html,/src="\/advertisements\/1\/image"/);
    await admin.get('/admin/advertisements');
    assert.equal((await admin.post('/admin/advertisements/1/status',{is_active:'1'})).status,303);
    for(let i=0;i<6;i++) await repo.save(null,{...rows[0],advertisement_id:undefined,title:`Ô ${i}`,position:'promotion',sort_order:5-i});
    home=await guest.get('/'); assert.equal((home.html.match(/src="\/advertisements\//g)||[]).length,5);
    assert.ok(home.html.indexOf('alt="Ô 5"')<home.html.indexOf('alt="Ô 4"'));
    assert.equal((await admin.post('/admin/advertisements/1/delete')).status,303);
    assert.equal((await admin.get('/admin/advertisements/1/edit')).status,404);
    assert.equal((await guest.get('/advertisements/1/image')).status,404);
    assert.equal((await guest.get('/advertisements/abc/image')).status,404);
  });
});

test('Xóa quảng cáo: hộp xác nhận hủy chặn submit, đồng ý giữ nguyên POST',()=>{
  let handler,prevented=0,allow=false;
  vm.runInNewContext(readFileSync('public/js/admin-advertisements.js','utf8'),{
    document:{addEventListener:(name,fn)=>{handler=fn;}},window:{confirm:()=>allow},
  });
  const event={target:{matches:()=>true,dataset:{title:'Test'}},preventDefault:()=>prevented++};
  handler(event);assert.equal(prevented,1);allow=true;handler(event);assert.equal(prevented,1);
});

test('Quảng cáo upload HTTP: trường trùng, file quá lớn, multipart lỗi và ảnh bổ sung bị từ chối',async()=>{
  const {repo,rows}=fixture();
  await inApp(repo,async({client,database})=>{
    const admin=await registered(client,database); await admin.get('/admin/advertisements/new');
    const form=new FormData();
    for(const [key,value] of Object.entries({...fields,_csrf:admin.token})) form.append(key,value);
    form.append('title','Trùng');
    assert.equal((await admin.request('/admin/advertisements',{method:'POST',body:form})).status,400);
    assert.equal((await upload(admin,'/admin/advertisements',fields,Buffer.concat([png,Buffer.alloc(1024*1024)]))).status,400);
    assert.equal((await admin.request('/admin/advertisements',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=bad'},body:'broken'})).status,400);
    const extra=new FormData();
    for(const [key,value] of Object.entries({...fields,_csrf:admin.token})) extra.append(key,value);
    extra.append('image',new Blob([png]),'one.png');extra.append('images',new Blob([png]),'two.png');
    assert.equal((await admin.request('/admin/advertisements',{method:'POST',body:extra})).status,422);
    assert.equal(rows.length,0);
  });
});

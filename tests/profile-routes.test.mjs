import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server.mjs';

test('portal, planner, CMS catalog and shared API coexist after profile integration',async t=>{
  const {server}=createApp({databasePath:':memory:'});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  const portal=await fetch(origin+'/');
  assert.equal(portal.status,200);
  assert.match(await portal.text(),/src="\/portal.mjs"/);
  const planner=await fetch(origin+'/planner?profile=cms-developer');
  assert.equal(planner.status,200);
  assert.match(await planner.text(),/id="profile-selector"/);
  const catalog=await fetch(origin+'/profiles.json').then(r=>r.json());
  assert.deepEqual(catalog.map(p=>p.id),['dealertrack-developer','cms-developer']);
  for(const entry of catalog){
    const response=await fetch(origin+entry.url);
    assert.equal(response.status,200);
    assert.equal((await response.json()).id,entry.id);
  }
  const actors=await fetch(origin+'/api/demo/actors').then(r=>r.json());
  const manager=actors.data.find(a=>a.role==='em');
  const hires=await fetch(origin+'/api/hires',{headers:{'X-Demo-Actor-Id':manager.id}});
  assert.equal(hires.status,200);
  assert.ok((await hires.json()).data.items.length>0);
});

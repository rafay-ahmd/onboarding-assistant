import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../backend/db/store.mjs';
import {createPlatform,seedDemo} from '../backend/services/platform.mjs';
import {createApp} from '../server.mjs';

test('CMS demo seed links Sameer to Pugazh with only confirmed defaults and scoped access',t=>{
  const store=openStore(':memory:');t.after(()=>store.close());seedDemo(store);
  const app=createPlatform(store);
  assert.equal(app.actors().find(a=>a.id==='em-pugazh').name,'Pugazh (demo EM)');
  const profile=app.profiles('em-pugazh').items.find(p=>p.id==='cms-developer');
  assert.deepEqual(profile.groups,['TR-AP-GitHub-CMS']);
  assert.equal(profile.adminRequired,true);
  const [hire]=app.list('em-pugazh').items;
  assert.equal(hire.name,'Sameer Mehta');
  assert.equal(hire.managerId,'em-pugazh');
  assert.equal(hire.profileId,'cms-developer');
  assert.deepEqual(hire.requestedGroups,['TR-AP-GitHub-CMS']);
  assert.equal(hire.adminRequired,true);
  assert.equal(hire.slackIdentity,undefined);
  const self=app.actors().find(a=>a.hireId===hire.id);
  assert.equal(self.role,'hire');
  assert.deepEqual(app.list(self.id).items.map(h=>h.id),[hire.id]);
  assert.ok(!app.list('em-vibgy').items.some(h=>h.id===hire.id));
  assert.ok(app.list('network-toronto').items.some(h=>h.id===hire.id));
  assert.ok(!app.list('network-berlin').items.some(h=>h.id===hire.id));
  for(const actor of ['em-vibgy','em-other','network-berlin'])
    assert.throws(()=>app.get(actor,hire.id),e=>e.code==='FORBIDDEN');
  const detail=app.get(self.id,hire.id);
  assert.equal(detail.account,null);
  assert.equal(detail.assignments.length,0);
  assert.equal(detail.accessSummary.supported,false);
  assert.equal(detail.requests.length,1);
  assert.equal(detail.requests[0].status,'pending');
});

test('CMS seeding survives restart without duplicating identities or resetting reviewed profiles/progress',t=>{
  const directory=mkdtempSync(join(tmpdir(),'onboarding-cms-seed-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const path=join(directory,'demo.sqlite');
  let store=openStore(path);t.after(()=>store.close());seedDemo(store);
  let app=createPlatform(store);
  const hire=app.list('em-pugazh').items[0];
  const initialHires=store.list('hires').length,initialActors=store.list('actors').length;
  app.account('network-toronto',hire.id,'cms-account',{
    adId:'DEMO-SAMEER',workEmail:'sameer@example.invalid',laptopId:'DEMO-SAMEER-LT'
  });
  const before=app.provision('network-toronto',hire.id,'cms-provision',{});
  const edited=app.updateProfile('em-pugazh','cms-developer','cms-review',{
    name:'CMS developer — reviewed demo',groups:['DEMO-CMS-REVIEWED'],adminRequired:true,revision:1
  });
  store.close();store=openStore(path);seedDemo(store);seedDemo(store);app=createPlatform(store);
  assert.equal(store.list('hires').length,initialHires);
  assert.equal(store.list('actors').length,initialActors);
  assert.deepEqual(app.get('em-pugazh',hire.id),before);
  assert.deepEqual(app.profiles('em-pugazh').items.find(p=>p.id==='cms-developer'),edited);
  assert.equal(app.list('em-pugazh').items[0].id,hire.id);
});

test('CMS portal identity resolves its matching planner recipe without a live Slack binding',async t=>{
  const {server}=createApp({databasePath:':memory:',slackCall:async()=>{throw Error('Unexpected Slack call');}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const actors=(await (await fetch(origin+'/api/demo/actors')).json()).data;
  const self=actors.find(a=>a.name==='Sameer Mehta (demo hire)');assert.ok(self);
  const detail=await (await fetch(origin+'/api/hires/'+self.hireId,{headers:{'X-Demo-Actor-Id':self.id}})).json();
  assert.equal(detail.data.profileId,'cms-developer');
  const catalog=await (await fetch(origin+'/profiles.json')).json();
  const recipe=catalog.find(p=>p.id===detail.data.profileId);
  assert.ok(recipe);
  const profile=await (await fetch(origin+recipe.url)).json();
  assert.equal(profile.id,'cms-developer');
  assert.equal(profile.inventorySupported,false);
  const status=await fetch(origin+'/api/hires/'+self.hireId+'/slack/status',{headers:{'X-Demo-Actor-Id':self.id}});
  assert.equal(status.status,200);
  assert.equal((await status.json()).connected,false);
  const rejected=await fetch(origin+'/api/hires/'+self.hireId+'/slack/requests',{headers:{'X-Demo-Actor-Id':self.id}});
  assert.equal(rejected.status,403);
});

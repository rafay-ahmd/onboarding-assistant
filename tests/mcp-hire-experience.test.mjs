import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {openStore} from '../backend/db/store.mjs';
import {createPlatform,seedDemo} from '../backend/services/platform.mjs';
import {apiRouter} from '../backend/api/router.mjs';
import {createOnboardingMcpServer} from '../mcp/server.mjs';
import cms from '../profiles/cms-developer.json' with {type:'json'};

function fixture(t) {
  const store=openStore(':memory:');seedDemo(store);t.after(()=>store.close());
  store.put('profiles',{id:'cms-developer',name:'CMS developer',groups:['TR-AP-GitHub-CMS'],adminRequired:true,revision:1});
  const platform=createPlatform(store);
  const hire=platform.create('em-vibgy','cms-hire-experience',{
    firstName:'Sameer',lastName:'Mehta',email:'sameer@example.invalid',startDate:'2026-11-02',location:'Toronto',profileId:'cms-developer'
  });
  return {store,platform,hire,self:`hire-${hire.id}`};
}

test('my onboarding resolves the immutable self mapping and rejects manager/network/missing actors',t=>{
  const {platform,hire,self}=fixture(t);
  assert.deepEqual(platform.myOnboarding(self),platform.get(self,hire.id));
  for(const actor of ['em-vibgy','em-other','network-toronto','network-berlin'])
    assert.throws(()=>platform.myOnboarding(actor),e=>e.code==='FORBIDDEN'&&e.status===403);
  assert.throws(()=>platform.myOnboarding('missing'),e=>e.code==='ACTOR_REQUIRED');
});

test('requirements keep assigned snapshots separate from current profile edits and draft recipe candidates',t=>{
  const {platform,hire,self}=fixture(t);
  platform.updateProfile('em-vibgy','cms-developer','later-cms-edit',{
    name:'CMS updated for future hires',groups:['DEMO-FUTURE-HIRES'],adminRequired:false,revision:1
  });
  const result=platform.profileRequirements(self);
  assert.equal(result.hire.id,hire.id);
  assert.equal(result.recipeAvailable,true);
  assert.equal(result.assignedRequirements.profileRevision,1);
  assert.deepEqual(result.assignedRequirements.requestedGroups,['TR-AP-GitHub-CMS']);
  assert.equal(result.assignedRequirements.adminRequired,true);
  assert.deepEqual(result.guidance,cms);
  assert.deepEqual(result.guidance.workstation,{os:'Windows',developmentEnvironment:'WSL',ide:'Visual Studio Code',adminRequired:true});
  assert.ok(result.guidance.openQuestions.some(q=>q.includes('AWS')&&q.includes('VPN')));
  assert.ok(result.guidance.access.find(a=>a.id==='github-team').fields.includes('githubRepository'));
  assert.match(result.guidance.programmeGuidance.status,/Draft/);
  assert.ok(result.guidance.sources.includes('https://docs.services.as24.tech/onboarding/'));
  assert.match(result.guidanceNotice,/not automatically assigned/);
  // Public read results cannot change the module's shared recipe for later callers.
  result.guidance.access[0].group='CHANGED';
  assert.equal(platform.profileRequirements(self).guidance.access[0].group,'TR-AP-GitHub-CMS');
});

test('requirements preserve existing hire visibility and never guess a recipe for a custom profile',t=>{
  const {platform,hire,self}=fixture(t);
  assert.deepEqual(platform.profileRequirements('em-vibgy',hire.id),platform.profileRequirements(self));
  assert.deepEqual(platform.profileRequirements('network-toronto',hire.id),platform.profileRequirements(self));
  for(const actor of ['em-other','network-berlin'])
    assert.throws(()=>platform.profileRequirements(actor,hire.id),e=>e.code==='FORBIDDEN');
  const other=platform.list('em-vibgy').items.find(h=>h.id!==hire.id);
  assert.throws(()=>platform.profileRequirements(self,other.id),e=>e.code==='FORBIDDEN');
  for(const actor of ['em-vibgy','network-toronto'])
    assert.throws(()=>platform.profileRequirements(actor),e=>e.code==='FORBIDDEN');
  assert.throws(()=>platform.profileRequirements('em-vibgy','missing'),e=>e.code==='NOT_FOUND');
  const profile=platform.createProfile('em-vibgy','cms-name-lookalike',{
    name:'CMS developer',groups:['TR-AP-GitHub-CMS'],adminRequired:true
  });
  const custom=platform.create('em-vibgy','custom-profile-hire',{
    firstName:'Jordan',lastName:'Example',startDate:'2026-11-02',location:'Toronto',profileId:profile.id
  });
  const unmapped=platform.profileRequirements('em-vibgy',custom.id);
  assert.equal(unmapped.recipeAvailable,false);
  assert.equal(unmapped.guidance,null);
  assert.deepEqual(unmapped.assignedRequirements.requestedGroups,['TR-AP-GitHub-CMS']);
  assert.match(unmapped.guidanceNotice,/No onboarding recipe/);
  const dealertrack=platform.profileRequirements('em-vibgy',other.id);
  assert.equal(dealertrack.guidance.id,'dealertrack-developer');
  assert.notDeepEqual(dealertrack.guidance,cms);
});

test('new MCP reads use the shared HTTP routes with exact API parity and enforced scope',async t=>{
  const {platform,hire,self}=fixture(t);
  const router=apiRouter(platform),server=http.createServer(router);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const baseUrl=`http://127.0.0.1:${server.address().port}`;
  async function connection(actorId){
    const mcp=createOnboardingMcpServer({baseUrl,actorId});
    const client=new Client({name:'hire-experience',version:'1.0.0'});
    const [a,b]=InMemoryTransport.createLinkedPair();await mcp.connect(a);await client.connect(b);
    t.after(async()=>{await client.close();await mcp.close();});return client;
  }
  async function read(client,name,args={}){
    const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));
    assert.deepEqual(result.structuredContent,JSON.parse(result.content[0].text));return result.structuredContent.data;
  }
  async function api(path,actor=self){
    const response=await fetch(baseUrl+path,{headers:{'X-Demo-Actor-Id':actor}});
    assert.equal(response.status,200);return (await response.json()).data;
  }
  const me=await connection(self),em=await connection('em-vibgy'),network=await connection('network-berlin');
  assert.deepEqual(await read(me,'get_my_onboarding'),await api('/api/me/onboarding'));
  assert.deepEqual(await read(me,'get_my_onboarding'),await api(`/api/hires/${hire.id}`));
  const requirements=await read(me,'get_profile_requirements');
  assert.deepEqual(requirements,await api('/api/me/onboarding/requirements'));
  assert.deepEqual(requirements,await read(me,'get_profile_requirements',{hireId:hire.id}));
  assert.deepEqual(requirements,await read(em,'get_profile_requirements',{hireId:hire.id}));
  assert.deepEqual(requirements,await api(`/api/hires/${hire.id}/requirements`,'em-vibgy'));
  for(const [client,name,args] of [[em,'get_my_onboarding',{}],[em,'get_profile_requirements',{}],[network,'get_profile_requirements',{hireId:hire.id}]]){
    const error=await client.callTool({name,arguments:args});
    assert.equal(error.isError,true);assert.equal(error.structuredContent.error.code,'FORBIDDEN');
  }
  const missingActor=await fetch(baseUrl+'/api/me/onboarding');assert.equal(missingActor.status,403);
  const badOrigin=await fetch(baseUrl+'/api/me/onboarding/requirements',{headers:{'X-Demo-Actor-Id':self,Origin:'https://example.invalid'}});
  assert.equal(badOrigin.status,403);
  for(const path of ['/api/me/onboarding','/api/me/onboarding/requirements',`/api/hires/${hire.id}/requirements`]){
    const write=await fetch(baseUrl+path,{method:'POST',headers:{'X-Demo-Actor-Id':self}});
    assert.equal(write.status,404);
  }
});

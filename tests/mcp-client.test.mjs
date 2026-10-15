import test from 'node:test';
import assert from 'node:assert/strict';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {createOnboardingMcpServer} from '../mcp/server.mjs';
import {createApiClient} from '../mcp/api-client.mjs';
import {configFromEnv,validateConfig} from '../mcp/config.mjs';

async function fixture(t,fetchImpl) {
  const server=createOnboardingMcpServer({actorId:'em-vibgy',fetchImpl});
  const client=new Client({name:'onboarding-test',version:'1.0.0'});
  t.after(async()=>{await client.close();await server.close();});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  return client;
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const createInput={firstName:'Casey',lastName:'Example',startDate:'2026-11-03',location:'Toronto',profileId:'dealertrack-developer',idempotencyKey:'create-casey-v1'};

test('configuration requires an explicit actor and a loopback origin',()=>{
  assert.equal(configFromEnv({ONBOARDING_DEMO_ACTOR_ID:'em-vibgy'}).baseUrl,'http://127.0.0.1:4173');
  assert.equal(validateConfig({actorId:'network-toronto',baseUrl:'http://localhost:5000/'}).baseUrl,'http://localhost:5000');
  for(const baseUrl of ['https://example.com','http://127.0.0.1.evil.test','http://user:password@localhost','http://localhost/api','http://localhost/?actor=em','file:///tmp/test']) {
    assert.throws(()=>validateConfig({actorId:'em-vibgy',baseUrl}));
  }
  for(const actorId of [undefined,'','em-vibgy\nInjected: true'])assert.throws(()=>validateConfig({actorId}));
  for(const timeoutMs of [0,NaN,1.5,60001])assert.throws(()=>validateConfig({actorId:'em-vibgy',timeoutMs}));
});

test('eight tools expose strict schemas with explicit mutation keys and no actor-switch arguments',async t=>{
  let calls=0;
  const client=await fixture(t,async()=>{calls++;return json({data:{}});});
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(t=>t.name).sort(),['create_hire','get_my_onboarding','get_onboarding_status','get_profile_requirements','list_hires','list_profiles','provision_access','record_account_details']);
  for(const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties,false);
    assert.equal(tool.inputSchema.properties.actorId,undefined);
    if(!tool.annotations.readOnlyHint)assert.ok(tool.inputSchema.required.includes('idempotencyKey'));
  }
  const invalid=[
    {name:'list_hires',arguments:{actorId:'em-other'}},
    {name:'get_my_onboarding',arguments:{hireId:'another-hire'}},
    {name:'get_profile_requirements',arguments:{profileId:'cms-developer'}},
    {name:'get_profile_requirements',arguments:{hireId:'../../api/slack/requests'}},
    {name:'list_hires',arguments:{offset:-1}},
    {name:'get_onboarding_status',arguments:{hireId:'../../api/slack/requests'}},
    {name:'create_hire',arguments:{...createInput,idempotencyKey:undefined}},
    {name:'create_hire',arguments:{...createInput,firstName:' '}},
    {name:'create_hire',arguments:{...createInput,startDate:'2026-02-30'}},
    {name:'create_hire',arguments:{...createInput,role:'network'}},
    {name:'record_account_details',arguments:{hireId:'hire',adId:'demo',workEmail:'invalid',laptopId:'demo',idempotencyKey:'account'}}
  ];
  for(const input of invalid) {
    let rejected=false;
    try {rejected=(await client.callTool(input)).isError===true;}
    catch(error){assert.match(error.message,/valid|schema|argument|parameter/i);rejected=true;}
    assert.ok(rejected,`Invalid input should fail: ${input.name}`);
  }
  assert.equal(calls,0,'Invalid schemas must fail before any HTTP request');
});

test('tools translate fixtures into the agreed HTTP requests without inventing defaults',async t=>{
  const calls=[];
  const client=await fixture(t,async(url,init)=>{
    calls.push({url:String(url),...init});return json({data:{fixture:'result'}});
  });
  const inputs=[
    {name:'list_profiles',arguments:{}},
    {name:'list_hires',arguments:{offset:50}},
    {name:'get_onboarding_status',arguments:{hireId:'demo-hire'}},
    {name:'create_hire',arguments:createInput},
    {name:'record_account_details',arguments:{hireId:'demo-hire',adId:'demo-ad',workEmail:'casey@example.invalid',laptopId:'DEMO-001',idempotencyKey:'account-v1'}},
    {name:'provision_access',arguments:{hireId:'demo-hire',idempotencyKey:'provision-v1'}}
  ];
  for(const input of inputs) {
    const result=await client.callTool(input);
    assert.ok(!result.isError);
    assert.deepEqual(result.structuredContent.data,{fixture:'result'});
    assert.equal(result.structuredContent.context.actorId,'em-vibgy');
    assert.equal(result.structuredContent.context.externalProvisioning,'simulated');
    assert.deepEqual(JSON.parse(result.content[0].text),result.structuredContent);
  }
  assert.deepEqual(calls.map(c=>[new URL(c.url).pathname+new URL(c.url).search,c.method]),[
    ['/api/profiles','GET'],['/api/hires?offset=50','GET'],['/api/hires/demo-hire','GET'],
    ['/api/hires','POST'],['/api/hires/demo-hire/account','PUT'],['/api/hires/demo-hire/provision','POST']
  ]);
  for(const call of calls){assert.equal(call.headers['X-Demo-Actor-Id'],'em-vibgy');assert.equal(call.redirect,'error');}
  const {idempotencyKey,...body}=createInput;
  assert.deepEqual(JSON.parse(calls[3].body),body);
  assert.equal(calls[3].headers['Idempotency-Key'],idempotencyKey);
  assert.equal(JSON.parse(calls[3].body).requestedGroups,undefined);
  assert.equal(JSON.parse(calls[3].body).adminRequired,undefined);
  assert.deepEqual(JSON.parse(calls[5].body),{});
});

test('backend failures preserve codes/status and never cause automatic mutation retries',async t=>{
  let status=403,calls=0;
  const client=await fixture(t,async()=>{calls++;return json({error:{code:'FIXTURE_ERROR',message:'Fixture failure'}},status);});
  for(status of [400,403,404,409,501]) {
    const result=await client.callTool({name:'create_hire',arguments:createInput});
    assert.equal(result.isError,true);
    assert.equal(result.structuredContent.error.code,'FIXTURE_ERROR');
    assert.equal(result.structuredContent.error.status,status);
    assert.equal(result.structuredContent.error.idempotencyKey,createInput.idempotencyKey);
    assert.equal(result.structuredContent.error.outcomeUnknown,status>=500);
  }
  assert.equal(calls,5);
});

test('unavailable backend, timeout and malformed responses expose safe uncertain-outcome errors',async t=>{
  for(const [name,fetchImpl,code] of [
    ['unavailable',async()=>{throw Error('Do not expose transport details or fixture credentials');},'BACKEND_UNAVAILABLE'],
    ['invalid-json',async()=>new Response('Do not expose response bodies'),'BACKEND_PROTOCOL_ERROR'],
    ['missing-envelope',async()=>json({other:true}),'BACKEND_PROTOCOL_ERROR']
  ]) {
    await t.test(name,async t=>{
      const client=await fixture(t,fetchImpl);
      const result=await client.callTool({name:'create_hire',arguments:createInput});
      assert.equal(result.isError,true);
      assert.equal(result.structuredContent.error.code,code);
      assert.equal(result.structuredContent.error.outcomeUnknown,true);
      assert.doesNotMatch(JSON.stringify(result),/fixture credentials|response bodies/);
    });
  }
  const client=createApiClient({actorId:'em-vibgy',timeoutMs:10,
    fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});
  // An active timer keeps Node alive while AbortSignal.timeout's unref'd timer runs.
  const keepAlive=setTimeout(()=>{},1000);
  try {await assert.rejects(client.request('/api/hires',{method:'POST',body:{},idempotencyKey:'timeout'}),e=>e.code==='BACKEND_TIMEOUT'&&e.outcomeUnknown);}
  finally{clearTimeout(keepAlive);}
});

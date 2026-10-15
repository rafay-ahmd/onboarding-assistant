import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/client/stdio';
import {createApp} from '../server.mjs';
import {createOnboardingMcpServer} from '../mcp/server.mjs';

const entry=fileURLToPath(new URL('../mcp/index.mjs',import.meta.url));
const createInput={firstName:'Casey',lastName:'Example',startDate:'2026-11-03',location:'Toronto',profileId:'dealertrack-developer',idempotencyKey:'create-casey-v1'};
const account={adId:'DEMO-CASEY',workEmail:'casey@example.invalid',laptopId:'DEMO-CASEY-LT'};
async function backend(databasePath=':memory:') {
  const {server}=createApp({databasePath});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const baseUrl=`http://127.0.0.1:${server.address().port}`;
  return {baseUrl,close:()=>new Promise(resolve=>server.close(resolve))};
}
async function mcp(t,baseUrl,actorId,options={}) {
  const server=createOnboardingMcpServer({baseUrl,actorId,...options});
  const client=new Client({name:'onboarding-integration-test',version:'1.0.0'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  t.after(async()=>{await client.close();await server.close();});
  return client;
}
async function tool(client,name,args={}) {
  const result=await client.callTool({name,arguments:args});
  assert.ok(!result.isError,JSON.stringify(result.structuredContent));
  assert.deepEqual(result.structuredContent,JSON.parse(result.content[0].text));
  return result.structuredContent.data;
}
async function error(client,name,args,code,status) {
  const result=await client.callTool({name,arguments:args});
  assert.equal(result.isError,true);
  assert.equal(result.structuredContent.error.code,code);
  assert.equal(result.structuredContent.error.status,status);
}
async function http(baseUrl,actor,path,method='GET',body,key='fixture-command') {
  const response=await fetch(baseUrl+path,{method,headers:{'X-Demo-Actor-Id':actor,
    ...(body?{'Content-Type':'application/json','Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  return result.data;
}

test('MCP and dashboard API share profile defaults, hire identity, permissions and derived blockers',async t=>{
  const app=await backend();t.after(app.close);
  const profile=await http(app.baseUrl,'em-vibgy','/api/profiles','POST',{
    name:'Fictional CMS demo',groups:['DEMO-CMS-DEVELOPERS'],adminRequired:true},'cms-fixture');
  await http(app.baseUrl,'network-toronto','/api/location-defaults/Toronto','PUT',{
    groups:['DEMO-TORONTO-NETWORK'],revision:1},'toronto-fixture');
  const em=await mcp(t,app.baseUrl,'em-vibgy');
  const network=await mcp(t,app.baseUrl,'network-toronto');
  const berlin=await mcp(t,app.baseUrl,'network-berlin');
  const otherEm=await mcp(t,app.baseUrl,'em-other');
  assert.ok((await tool(em,'list_profiles')).items.some(p=>p.id===profile.id));
  await error(network,'list_profiles',{},'FORBIDDEN',403);
  const input={...createInput,profileId:profile.id};
  const initialCount=(await tool(em,'list_hires')).items.length;
  const hire=await tool(em,'create_hire',input);
  assert.deepEqual(hire.requestedGroups,['DEMO-CMS-DEVELOPERS','DEMO-TORONTO-NETWORK']);
  assert.equal(hire.adminRequired,true);
  assert.equal(hire.name,'Casey Example');
  assert.equal(hire.account,null);
  assert.equal(hire.requests[0].kind,'account');
  assert.equal(hire.requests[0].status,'pending');
  assert.deepEqual(await tool(em,'create_hire',input),hire);
  assert.equal((await tool(em,'list_hires')).items.length,initialCount+1);
  await error(em,'create_hire',{...input,lastName:'Changed'},'IDEMPOTENCY_CONFLICT',409);
  assert.ok((await tool(network,'list_hires')).items.some(h=>h.id===hire.id));
  assert.ok(!(await tool(berlin,'list_hires')).items.some(h=>h.id===hire.id));
  await error(otherEm,'get_onboarding_status',{hireId:hire.id},'FORBIDDEN',403);
  await error(em,'get_onboarding_status',{hireId:'missing'},'NOT_FOUND',404);
  await error(em,'record_account_details',{hireId:hire.id,...account,idempotencyKey:'wrong-role'},'FORBIDDEN',403);
  await error(berlin,'record_account_details',{hireId:hire.id,...account,idempotencyKey:'wrong-location'},'FORBIDDEN',403);
  await error(network,'provision_access',{hireId:hire.id,idempotencyKey:'too-early'},'ACCOUNT_REQUIRED',409);
  const recorded=await tool(network,'record_account_details',{hireId:hire.id,...account,idempotencyKey:'account-v1'});
  assert.equal(recorded.requests[0].status,'completed');
  assert.equal(recorded.account.workEmail,account.workEmail);
  // Idempotent mutation replays are saved receipts, not fresh status snapshots.
  await tool(network,'record_account_details',{hireId:hire.id,...account,workEmail:'updated@example.invalid',idempotencyKey:'account-v2'});
  assert.equal((await tool(network,'record_account_details',{hireId:hire.id,...account,idempotencyKey:'account-v1'})).account.workEmail,account.workEmail);
  const current=await tool(em,'get_onboarding_status',{hireId:hire.id});
  assert.equal(current.account.workEmail,'updated@example.invalid');
  assert.deepEqual(current,await http(app.baseUrl,'em-vibgy',`/api/hires/${hire.id}`));
  const personal=await mcp(t,app.baseUrl,`hire-${hire.id}`);
  assert.equal((await tool(personal,'list_hires')).items.length,1);
  await error(personal,'create_hire',{...input,idempotencyKey:'hire-cannot-create'},'FORBIDDEN',403);
  const pending=await tool(network,'provision_access',{hireId:hire.id,idempotencyKey:'provision-v1'});
  assert.equal(pending.assignments.length,2);
  assert.equal(pending.requests.filter(r=>r.kind==='admin').length,1);
  const repeated=await tool(network,'provision_access',{hireId:hire.id,idempotencyKey:'provision-again'});
  assert.deepEqual(repeated.assignments.map(a=>a.id),pending.assignments.map(a=>a.id));
  const [first,second]=pending.assignments;
  // These are the dashboard's explicit provider actions; this MCP scope does not expose them.
  await http(app.baseUrl,'network-toronto',`/api/assignments/${first.id}/actions`,'POST',{action:'success'},'first-success');
  await http(app.baseUrl,'network-toronto',`/api/assignments/${second.id}/actions`,'POST',{action:'failure'},'second-failure');
  assert.ok((await tool(em,'get_onboarding_status',{hireId:hire.id})).blockers.some(b=>b.includes('failed')));
  for(const action of ['retry','success'])await http(app.baseUrl,'network-toronto',`/api/assignments/${second.id}/actions`,'POST',{action},`second-${action}`);
  const admin=pending.requests.find(r=>r.kind==='admin');
  for(const action of ['ticket','grant','verify'])await http(app.baseUrl,'network-toronto',`/api/requests/${admin.id}/actions`,'POST',{action},`admin-${action}`);
  const completed=await tool(em,'get_onboarding_status',{hireId:hire.id});
  assert.deepEqual(completed.blockers,[]);
  assert.equal(completed.assignments.find(a=>a.id===first.id).attempts,1);
  assert.equal(completed.assignments.find(a=>a.id===second.id).attempts,2);
  assert.equal(completed.simulation,true);
  assert.equal(completed.realReadiness,'Not assessed by this portal');
  assert.deepEqual(completed,await http(app.baseUrl,'em-vibgy',`/api/hires/${hire.id}`));
  const noAdmin=await tool(em,'create_hire',{...createInput,idempotencyKey:'standard-hire',adminRequired:false});
  await tool(network,'record_account_details',{hireId:noAdmin.id,...account,adId:'DEMO-STANDARD',idempotencyKey:'standard-account'});
  assert.equal((await tool(network,'provision_access',{hireId:noAdmin.id,idempotencyKey:'standard-provision'})).requests.some(r=>r.kind==='admin'),false);
});

test('retrying an uncertain MCP response replays the committed hire without duplicating it',async t=>{
  const app=await backend();t.after(app.close);
  const initialCount=(await http(app.baseUrl,'em-vibgy','/api/hires')).items.length;
  let loseResponse=true;
  const em=await mcp(t,app.baseUrl,'em-vibgy',{fetchImpl:async(...args)=>{
    const response=await fetch(...args);
    if(loseResponse){
      loseResponse=false;
      await response.json(); // The backend committed, but the caller never receives the receipt.
      throw new Error('Simulated lost response');
    }
    return response;
  }});
  const result=await em.callTool({name:'create_hire',arguments:createInput});
  assert.equal(result.isError,true);
  assert.equal(result.structuredContent.error.outcomeUnknown,true);
  assert.equal(result.structuredContent.error.idempotencyKey,createInput.idempotencyKey);
  const committed=(await http(app.baseUrl,'em-vibgy','/api/hires')).items.find(h=>h.name==='Casey Example');
  assert.ok(committed);
  assert.equal((await tool(em,'create_hire',createInput)).id,committed.id);
  assert.equal((await tool(em,'list_hires')).items.length,initialCount+1);
});

test('MCP hire status and idempotency survive an actual SQLite backend restart',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'onboarding-mcp-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const path=join(directory,'demo.sqlite');
  let app=await backend(path);let closed=false;
  t.after(async()=>{if(!closed)await app.close();});
  const em=await mcp(t,app.baseUrl,'em-vibgy');
  const network=await mcp(t,app.baseUrl,'network-toronto');
  const initialCount=(await tool(em,'list_hires')).items.length;
  const hire=await tool(em,'create_hire',createInput);
  await tool(network,'record_account_details',{hireId:hire.id,...account,idempotencyKey:'account'});
  await tool(network,'provision_access',{hireId:hire.id,idempotencyKey:'provision'});
  const before=await tool(em,'get_onboarding_status',{hireId:hire.id});
  await app.close();closed=true;
  app=await backend(path);closed=false;
  const after=await mcp(t,app.baseUrl,'em-vibgy');
  assert.deepEqual(await tool(after,'get_onboarding_status',{hireId:hire.id}),before);
  assert.equal((await tool(after,'create_hire',createInput)).id,hire.id);
  assert.equal((await tool(after,'list_hires')).items.length,initialCount+1);
});

test('stdio process completes the SDK handshake and tool calls without stdout diagnostics',async t=>{
  const app=await backend();t.after(app.close);
  const client=new Client({name:'stdio-smoke',version:'1.0.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[entry],stderr:'pipe',env:{
    ONBOARDING_API_URL:app.baseUrl,ONBOARDING_DEMO_ACTOR_ID:'em-vibgy'}});
  let stderr='';transport.stderr.on('data',data=>stderr+=data.toString());
  t.after(()=>client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length,6);
  const profiles=await tool(client,'list_profiles');
  assert.ok(profiles.items.length>0);
  const hire=await tool(client,'create_hire',createInput);
  assert.equal((await http(app.baseUrl,'em-vibgy','/api/hires')).items.find(h=>h.id===hire.id).firstName,'Casey');
  assert.deepEqual(await tool(client,'get_onboarding_status',{hireId:hire.id}),await http(app.baseUrl,'em-vibgy',`/api/hires/${hire.id}`));
  assert.equal(stderr,'');
});

test('invalid startup exits with stderr guidance and no protocol output',()=>{
  const result=spawnSync(process.execPath,[entry],{env:getDefaultEnvironment(),encoding:'utf8',timeout:5000});
  assert.equal(result.status,1);
  assert.equal(result.stdout,'');
  assert.match(result.stderr,/ONBOARDING_DEMO_ACTOR_ID/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {draftRequest,dependencyStatus,reconcileCompletions,validateReport,validateTicketUrl,normalizeState} from '../web/model.mjs';
const profile=JSON.parse(await readFile(new URL('../profiles/dealertrack-developer.json',import.meta.url)));
test('each request targets one entitlement and AWS requires a group',()=>{
  const aws=profile.access.find(x=>x.id==='aws');
  assert.deepEqual(draftRequest(aws,{name:'Alex',email:'alex@example.invalid'}).missing,['awsGroup']);
  const hire={name:'Alex',email:'alex@example.invalid',awsGroup:'TR-RO-AWS-DEALERTRACK-DEV'};
  assert.match(draftRequest(aws,hire).text,/Requested Okta group: TR-RO-AWS-DEALERTRACK-DEV/);
  const jira=draftRequest(profile.access.find(x=>x.id==='trader-jira'),hire).text;
  assert.match(jira,/Trader Jira/);assert.doesNotMatch(jira,/Confluence|AS24 Jira/);
});
test('granted access does not unblock dependent setup until verified',()=>{
  const step=profile.steps.find(x=>x.id==='oracle');
  assert.deepEqual(dependencyStatus(step,{admin:{status:'granted'}},[]),['admin']);
  assert.deepEqual(dependencyStatus(step,{admin:{status:'verified'}},[]),[]);
  assert.deepEqual(dependencyStatus(profile.steps.find(x=>x.id==='setup'),{admin:{status:'verified'},github:{status:'verified'}},[]),['oracle']);
});
test('reports reject invalid modes, statuses, empty inventory and duplicate checks',()=>{
  const report={schemaVersion:1,profileId:profile.id,mode:'read-only',generatedAt:new Date().toISOString(),checks:[{id:'git',name:'Git',status:'ready',detail:'Located'}]};
  assert.equal(validateReport(report),report);
  for(const altered of [{...report,mode:'setup'},{...report,checks:[]},{...report,checks:[...report.checks,...report.checks]},{...report,checks:[{...report.checks[0],status:'complete'}]}])assert.throws(()=>validateReport(altered));
});
test('access revocation invalidates dependent recorded completions transitively',()=>{
  const access=Object.fromEntries(profile.access.map(x=>[x.id,{status:'verified'}]));
  const completed=profile.steps.map(s=>s.id);
  assert.deepEqual(reconcileCompletions(profile,access,completed),completed);
  access.admin.status='blocked';
  assert.deepEqual(reconcileCompletions(profile,access,completed),['preflight','vpn']);
});
test('ticket links accept only helpdesk HTTPS and remove incidental query data',()=>{
  assert.equal(validateTicketUrl('https://go.helpdesk.autoscout24.com/servicedesk/customer/portal/105/OET-29575?created=true'),'https://go.helpdesk.autoscout24.com/servicedesk/customer/portal/105/OET-29575');
  for(const url of ['javascript:alert(1)','https://example.com/ticket','https://go.helpdesk.autoscout24.com.evil.test/servicedesk/customer/x','https://user:pass@go.helpdesk.autoscout24.com/servicedesk/customer/x'])assert.throws(()=>validateTicketUrl(url));
});
test('profile dependencies resolve and initial plan makes no access claims',()=>{
  const all=new Set([...profile.access,...profile.steps].map(x=>x.id));
  for(const step of profile.steps)for(const id of step.dependsOn)assert.ok(all.has(id),`Unknown dependency: ${id}`);
  const state=normalizeState({access:{admin:{status:'automatic',ticket:'javascript:alert(1)'}}},profile);
  assert.ok(Object.values(state.access).every(x=>x.status==='not-requested'));
  assert.equal(state.access.admin.ticket,'');assert.deepEqual(state.completedSteps,[]);
});

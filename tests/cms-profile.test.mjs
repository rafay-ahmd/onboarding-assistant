import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {draftRequest,normalizeState,planStorageKey,dependencyStatus,reconcileCompletions,validateReport,validateTicketUrl} from '../web/model.mjs';
import {prepareRequest,enqueue,advanceRequest,sendRequest,accessCardStatus} from '../web/request-queue.mjs';
import {mockSlackAdapter} from '../web/mock-slack-adapter.mjs';

const load = async path => JSON.parse(await readFile(new URL(path,import.meta.url)));
const cms = await load('../profiles/cms-developer.json');
const dealertrack = await load('../profiles/dealertrack-developer.json');
const hire = {name:'Alex Example',email:'alex@example.invalid',manager:'Taylor Example',githubUsername:'alex-example',githubRepository:'tdr-cms/fictional-demo — read access',githubTeam:'CMS-GH-FICTIONAL-DEMO'};
const justification = 'Fictional request to demonstrate CMS onboarding with no live submission.';

test('CMS profile keeps unconfirmed requirements explicit and all dependency references valid',()=>{
  for(const profile of [cms,dealertrack]){
    const all=[...profile.access,...profile.steps].map(x=>x.id);
    assert.equal(new Set(all).size,all.length,'Access and step identifiers must be unambiguous');
    const visit=(id,path=[])=>{
      assert.ok(!path.includes(id),`Dependency cycle: ${[...path,id].join(' -> ')}`);
      const step=profile.steps.find(s=>s.id===id);
      for(const dependency of step?.dependsOn||[]){assert.ok(all.includes(dependency));visit(dependency,[...path,id]);}
    };
    profile.steps.forEach(s=>visit(s.id));
  }
  assert.match(cms.reviewStatus,/Draft/);
  assert.ok(cms.openQuestions.length>=4);
  assert.equal(cms.inventorySupported,false);
  const confluenceSources=[
    'https://autoscout24.atlassian.net/wiki/spaces/SelfServ/pages/1719238689/GitHub+Access',
    'https://autoscout24.atlassian.net/wiki/spaces/PO/pages/2818506803/GitHub+access'
  ];
  assert.ok(cms.sources.every(url=>url.startsWith('https://docs.services.as24.tech/') || confluenceSources.includes(url)));
  for(const item of cms.access)assert.ok(cms.sources.includes(item.source));
});

test('CMS repository requests require a repository but permit an unknown team group',()=>{
  const item=cms.access.find(x=>x.id==='github-team');
  assert.deepEqual(draftRequest(item,{...hire,githubRepository:''},cms).missing,['githubRepository']);
  const withoutGroup=draftRequest(item,{...hire,githubTeam:''},cms);
  assert.deepEqual(withoutGroup.missing,[]);
  assert.match(withoutGroup.text,/Requested repository and permission: tdr-cms\/fictional-demo/);
  assert.match(withoutGroup.text,/Request destination: #helpdesk/);
  assert.doesNotMatch(withoutGroup.text,/Requested repository group:/);
  assert.equal(prepareRequest(cms,item,{...hire,githubTeam:''},justification).status,'draft');
  for(const githubTeam of ['CMS-GH-','CMS-GH-*','Unknown * team']){
    assert.ok(draftRequest(item,{...hire,githubTeam},cms).missing.length);
    assert.throws(()=>prepareRequest(cms,item,{...hire,githubTeam},justification));
  }
  const draft=draftRequest(item,hire,cms);
  assert.deepEqual(draft.missing,[]);
  assert.match(draft.text,/CMS software developer/);
  assert.match(draft.text,/Requested repository group: CMS-GH-FICTIONAL-DEMO/);
  const teamName=draftRequest(item,{...hire,githubTeam:'Fictional CMS Repository Team'},cms);
  assert.deepEqual(teamName.missing,[]);
  const byExample=draftRequest(item,{...hire,githubTeam:'',githubMirrorUser:'fictional-colleague'},cms);
  assert.deepEqual(byExample.missing,[]);
  assert.match(byExample.text,/Example GitHub user with required access: fictional-colleague/);
  assert.match(byExample.text,/up to 6 hours/);
  assert.doesNotMatch(draft.text,/Dealertrack software developer|TR-RO-AWS-DEALERTRACK/);
  const aws=cms.access.find(x=>x.id==='aws');
  assert.ok(draftRequest(aws,hire,cms).missing.includes('awsGroup'));
  assert.ok(draftRequest(aws,{...hire,awsGroup:'FICTIONAL-AWS-GROUP'},cms).missing.includes('subteam'));
});

test('CMS portal/team routes cannot enter the mock Slack queue',()=>{
  for(const item of cms.access.filter(x=>x.route!=='helpdesk'))assert.throws(()=>prepareRequest(cms,item,hire,justification),/cannot enter/);
  const request=prepareRequest(cms,cms.access.find(x=>x.id==='sonarqube'),hire,justification);
  assert.match(request.text,/TR-AP-SonarQube-CMS-Developers/);
  assert.doesNotMatch(request.text,/PowerUsers membership is reserved.*Requested group:.*PowerUsers/s);
});

test('profile storage and queue identities remain isolated for the same hire and entitlement',()=>{
  assert.equal(planStorageKey(dealertrack.id),'dt-onboarding-v1');
  assert.notEqual(planStorageKey(cms.id),planStorageKey(dealertrack.id));
  assert.equal(normalizeState({},cms).hire.awsGroup,'');
  assert.equal(normalizeState({hire:{githubTeam:hire.githubTeam}},cms).hire.githubTeam,hire.githubTeam);
  // Use the same entitlement ID to test profile isolation independently of routing.
  const item={id:'shared-demo',name:'Shared demo entitlement',route:'helpdesk',reason:'Test isolation.',fields:[]};
  const a=prepareRequest({...dealertrack,access:[item]},item,hire,justification);
  const b=prepareRequest({...cms,access:[item]},item,hire,justification);
  const {queue}=enqueue([a],b);
  assert.equal(queue.length,2);
  assert.equal(enqueue(queue,b).duplicate,true);
  assert.equal(accessCardStatus([a],cms.id,hire.email,item.id,'not-requested').simulated,false);
});

test('CMS setup requires recorded EM review; mock verification never satisfies real dependencies',()=>{
  const access=normalizeState({},cms).access;
  const accountStep=cms.steps.find(x=>x.id==='account-review');
  assert.deepEqual(dependencyStatus(accountStep,access,[]),['requirements-review']);
  assert.deepEqual(dependencyStatus(accountStep,access,['requirements-review']),[]);
  const item=cms.access.find(x=>x.id==='github-team');
  let request=sendRequest(prepareRequest(cms,item,hire,justification),mockSlackAdapter);
  for(const action of ['ticket','grant','verify'])request=advanceRequest(request,action);
  assert.equal(request.status,'verified');
  assert.deepEqual(dependencyStatus(cms.steps.find(x=>x.id==='repository-check'),access,['requirements-review','account-review','github-sso']),['github-team']);
  assert.deepEqual(reconcileCompletions(cms,access,cms.steps.map(x=>x.id)).sort(),['account-review','github-account','machine-plan','requirements-review']);
  assert.deepEqual(reconcileCompletions(cms,access,cms.steps.map(x=>x.id).filter(id=>id!=='requirements-review')),[]);
});

test('GitHub SSO and local sync have separate prerequisites and preserve draft programme provenance',()=>{
  const access=normalizeState({},cms).access;
  const sso=cms.steps.find(x=>x.id==='github-sso');
  access.github.status='verified';
  assert.deepEqual(dependencyStatus(sso,access,['requirements-review','account-review']),['github-account']);
  assert.deepEqual(dependencyStatus(sso,access,['github-account']),[]);
  const sync=cms.steps.find(x=>x.id==='repository-sync');
  assert.deepEqual(dependencyStatus(sync,access,[]),['repository-check','github-cli-setup']);
  assert.match(cms.steps.find(x=>x.id==='github-cli-setup').action,/SelfService or Company Portal/);
  assert.match(sync.action,/Avoid Desktop, Documents/);
  assert.match(cms.programmeGuidance.status,/Draft/);
  assert.equal(cms.sourceDocuments.find(x=>x.url===cms.programmeGuidance.source).publishedCommit,'368cccfa52da520f663ca2a4e77e482ad74f5072');
});

test('required CMS admin uses helpdesk and only actual verified access unblocks workstation setup',()=>{
  assert.deepEqual(cms.workstation,{os:'Windows',developmentEnvironment:'WSL',ide:'Visual Studio Code',adminRequired:true});
  assert.equal(cms.access.find(x=>x.id==='github').group,'TR-AP-GitHub-CMS');
  const admin=cms.access.find(x=>x.id==='admin');
  assert.equal(admin.route,'helpdesk');
  const request=prepareRequest(cms,admin,hire,justification);
  assert.match(request.text,/Request destination: #helpdesk/);
  let simulated=sendRequest(request,mockSlackAdapter);
  for(const action of ['ticket','grant','verify'])simulated=advanceRequest(simulated,action);
  const access=normalizeState({},cms).access;
  const step=cms.steps.find(x=>x.id==='workstation-setup');
  const completed=['requirements-review','account-review','machine-plan'];
  assert.equal(simulated.status,'verified');
  assert.deepEqual(dependencyStatus(step,access,completed),['admin']);
  access.admin.status='granted';
  assert.deepEqual(dependencyStatus(step,access,completed),['admin']);
  access.admin.status='verified';
  assert.deepEqual(dependencyStatus(step,access,completed),[]);
  access.admin.status='blocked';
  assert.ok(!reconcileCompletions(cms,access,[...completed,'workstation-setup']).includes('workstation-setup'));
  // Preserve main’s updated Dealertrack helpdesk route; only CMS mounts this local queue.
  const dealerAdmin=dealertrack.access.find(x=>x.id==='admin');
  assert.equal(dealerAdmin.route,'helpdesk');
});

test('CMS rejects Dealertrack inventory and accepts documented OET ticket bookmarks safely',async()=>{
  const report=await load('../reports/sample.json');
  assert.equal(validateReport(report),report);
  assert.throws(()=>validateReport(report,cms.id),/No inventory checker/);
  assert.equal(validateTicketUrl('https://autoscout24.atlassian.net/servicedesk/customer/portal/105/OET-123?from=email#comment'),'https://autoscout24.atlassian.net/servicedesk/customer/portal/105/OET-123');
  for(const url of ['https://autoscout24.atlassian.net.evil.test/servicedesk/customer/x','https://user:pass@autoscout24.atlassian.net/servicedesk/customer/x','https://autoscout24.atlassian.net/wiki/x'])assert.throws(()=>validateTicketUrl(url));
});

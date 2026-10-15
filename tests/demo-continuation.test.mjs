import test from 'node:test';
import assert from 'node:assert/strict';
import {demoAccessPreview,dependencyStatus,accessProgress} from '../web/model.mjs';
const profile={id:'dealertrack-developer',access:[{id:'admin'},{id:'github'}]};
const access={admin:{status:'not-requested'},github:{status:'not-requested'}};
const requests=[{id:'sent',profileId:profile.id,accessId:'admin',status:'message-sent',receipt:{thread:'1.2'}}];
test('demo approval does not unlock dependencies; demo verification does without mutating real records',()=>{
 const before=JSON.stringify({access,requests});
 const approved=demoAccessPreview(profile,access,requests,{sent:'approved'});
 assert.equal(approved.active,true);assert.equal(approved.progress.verified,0);
 assert.deepEqual(dependencyStatus({dependsOn:['admin']},approved.access,[]),['admin']);
 const verified=demoAccessPreview(profile,access,requests,{sent:'verified'});
 assert.equal(verified.progress.percent,50);assert.deepEqual(dependencyStatus({dependsOn:['admin']},verified.access,[]),[]);
 assert.equal(JSON.stringify({access,requests}),before);assert.equal(accessProgress(profile,access,requests).verified,0);
 assert.equal(demoAccessPreview(profile,access,requests,{}).active,false);
});
test('demo continuation ignores unsent requests and other profiles',()=>{
 const unrelated=[{...requests[0],id:'other',profileId:'cms-developer'},{...requests[0],id:'draft',receipt:null}];
 const view=demoAccessPreview(profile,access,unrelated,{other:'verified',draft:'verified'});
 assert.equal(view.active,false);assert.equal(view.progress.verified,0);
});

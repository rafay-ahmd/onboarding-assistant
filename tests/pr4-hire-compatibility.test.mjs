import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../backend/db/store.mjs';
import {createPlatform,seedDemo} from '../backend/services/platform.mjs';
import {planStorageKey,resolvePlannerProfile} from '../web/model.mjs';
test('hire and profile keys isolate CMS, Dealertrack and different hires while retaining existing keys',()=>{
 assert.equal(planStorageKey('dealertrack-developer'),'dt-onboarding-v1');
 assert.equal(planStorageKey('dealertrack-developer','h1'),'dt-onboarding-hire-v1:h1');
 assert.notEqual(planStorageKey('cms-developer','h1'),planStorageKey('dealertrack-developer','h1'));
 assert.notEqual(planStorageKey('dealertrack-developer','h1'),planStorageKey('dealertrack-developer','h2'));
 const catalog=[{id:'dealertrack-developer'},{id:'cms-developer'}];
 assert.equal(resolvePlannerProfile(catalog,'cms-developer','dealertrack-developer'),'dealertrack-developer');
 assert.equal(resolvePlannerProfile(catalog,'cms-developer'),'cms-developer');
 assert.throws(()=>resolvePlannerProfile(catalog,'dealertrack-developer','custom-profile'),/no workstation/);
});
test('unmapped managed profiles never inherit Dealertrack live access requirements',()=>{
 const store=openStore(':memory:');try{seedDemo(store);const app=createPlatform(store);
 const profile=app.createProfile('em-vibgy','custom-profile',{name:'Another team',groups:['OTHER-GROUP'],adminRequired:false});
 const hire=app.create('em-vibgy','custom-hire',{firstName:'Other',lastName:'Example',startDate:'2026-11-03',location:'Toronto',profileId:profile.id});
 assert.equal(hire.profileId,profile.id);assert.equal(hire.accessSummary.supported,false);assert.equal(hire.accessSummary.total,0);assert.deepEqual(hire.accessSummary.items,[]);
 }finally{store.close();}
});

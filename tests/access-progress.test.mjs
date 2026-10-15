import test from 'node:test';
import assert from 'node:assert/strict';
import {accessProgress} from '../web/model.mjs';
test('access readiness counts verified permissions once and prioritizes linked request status',()=>{
 const profile={id:'p',access:[{id:'a'},{id:'b'},{id:'c'},{id:'d'}]};
 const manual={a:{status:'verified'},b:{status:'granted'},c:{status:'verified'}};
 const requests=[{profileId:'p',accessId:'c',status:'message-sent'},{profileId:'p',accessId:'d',status:'verified'},{profileId:'other',accessId:'b',status:'verified'}];
 assert.deepEqual(accessProgress(profile,manual,requests),{verified:2,total:4,percent:50});
 assert.deepEqual(accessProgress({id:'p',access:[]},{},[]),{verified:0,total:0,percent:0});
});

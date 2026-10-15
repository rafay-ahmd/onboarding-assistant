import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareRequest,enqueue,sendRequest,reconcileDelivery,advanceRequest,readQueue,accessCardStatus} from '../web/request-queue.mjs';
import {mockSlackAdapter as adapter} from '../web/mock-slack-adapter.mjs';
const profile=JSON.parse(await readFile(new URL('../profiles/dealertrack-developer.json',import.meta.url)));
const hire={name:'Alex Example',email:'Alex@Example.invalid',manager:'Taylor',githubUsername:'alex',awsGroup:'TR-RO-AWS-DEALERTRACK-DEV'};
const prepare=(id='trader-jira',person=hire)=>prepareRequest(profile,profile.access.find(x=>x.id===id),person,'Access is required to work on Dealertrack development tickets.');
test('one request per entitlement, required details and justification validated',()=>{
  const request=prepare();assert.match(request.text,/Trader Jira/);assert.doesNotMatch(request.text,/AS24 Jira|Confluence/);assert.equal(request.employee.email,'alex@example.invalid');
  assert.throws(()=>prepare('admin'),/form or a team/);assert.throws(()=>prepare('sharepoint'),/form or a team/);
  assert.throws(()=>prepare('aws',{...hire,awsGroup:''}),/awsGroup/);
  assert.throws(()=>prepare('trader-jira',{...hire,email:'invalid'}),/email/);
  assert.throws(()=>prepareRequest(profile,profile.access[1],hire,'short'),/justification/);
});
test('dedupe survives serialization, email case and whitespace changes',()=>{
  const first=prepare();const saved=readQueue(JSON.stringify(enqueue([],first).queue));
  const duplicate=enqueue(saved,prepare('trader-jira',{...hire,email:'  alex@example.invalid  '}));
  assert.equal(duplicate.duplicate,true);assert.equal(duplicate.queue.length,1);assert.equal(duplicate.request.id,first.id);
  assert.equal(enqueue(saved,prepare('as24-jira')).duplicate,false);
  assert.equal(enqueue(saved,prepare('trader-jira',{...hire,email:'other@example.invalid'})).duplicate,false);
});
test('message delivery, ticket creation, grant and verification remain distinct',()=>{
  let r=sendRequest(prepare(),adapter);assert.equal(r.status,'message-sent');assert.equal(r.ticket,null);assert.throws(()=>sendRequest(r,adapter));assert.throws(()=>advanceRequest(r,'verify'));
  r=advanceRequest(r,'ticket');assert.match(r.ticket.key,/^DEMO-/);assert.equal(r.status,'ticket-created');
  r=advanceRequest(r,'grant');assert.equal(r.status,'granted');r=advanceRequest(r,'verify');assert.equal(r.status,'verified');assert.equal(r.history.length,5);
});
test('follow-up blocks ticket creation until a valid reply',()=>{
  let r=advanceRequest(sendRequest(prepare(),adapter),'question');assert.equal(r.status,'waiting-for-answer');
  assert.throws(()=>advanceRequest(r,'ticket'));assert.throws(()=>advanceRequest(r,'answer','short'));
  r=advanceRequest(r,'answer','I will implement Dealertrack software changes.');assert.equal(r.status,'message-sent');assert.equal(r.question,null);assert.match(r.answer,/Dealertrack/);
});
test('known pre-delivery failure can retry; uncertain outcome must reconcile',()=>{
  let failed=sendRequest(prepare(),adapter,'failure');assert.equal(failed.status,'failed');assert.equal(failed.receipt,null);
  failed=sendRequest(failed,adapter);assert.equal(failed.status,'message-sent');assert.equal(failed.attempts,2);
  const unknown=sendRequest(prepare(),adapter,'unknown');assert.equal(unknown.status,'delivery-unknown');assert.throws(()=>sendRequest(unknown,adapter));
  const recovered=reconcileDelivery(readQueue(JSON.stringify([unknown]))[0],adapter);assert.equal(recovered.status,'message-sent');assert.equal(recovered.attempts,1);assert.ok(recovered.receipt.thread);
});
test('denied requests cannot be blindly resent or approved',()=>{
  const denied=advanceRequest(sendRequest(prepare(),adapter),'deny');assert.equal(denied.status,'denied');assert.throws(()=>sendRequest(denied,adapter));assert.throws(()=>advanceRequest(denied,'grant'));
});
test('saved queue rejects unknown provider, corrupt records and duplicates',()=>{
  const r=prepare();assert.equal(readQueue(JSON.stringify([r])).length,1);
  for(const records of [[{...r,provider:'slack'}],[{...r,status:'fake'}],[r,r],[{...r,employee:null}],[{...r,key:'mismatch'}]])assert.throws(()=>readQueue(JSON.stringify(records)));
});

test('access cards follow mock verification without modifying actual access or another employee',()=>{
  let r=sendRequest(prepare('vs'),adapter);r=advanceRequest(r,'ticket');r=advanceRequest(r,'grant');r=advanceRequest(r,'verify');
  const persisted=readQueue(JSON.stringify([r]));
  assert.deepEqual(accessCardStatus(persisted,profile.id,hire.email,'vs','not-requested'),{status:'verified',label:'Mock · verified',simulated:true});
  assert.deepEqual(accessCardStatus(persisted,profile.id,'other@example.invalid','vs','requested'),{status:'requested',label:'requested',simulated:false});
  assert.deepEqual(accessCardStatus([],profile.id,hire.email,'vs','granted'),{status:'granted',label:'granted',simulated:false});
});

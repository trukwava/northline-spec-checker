import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercises the actual SQLite-backed loopback API. It resets only synthetic demo jobs.
const base='http://127.0.0.1:4317/api';
const reviewerKey=process.env.NORTHLINE_REVIEWER_KEY;
const coordinatorKey=process.env.NORTHLINE_COORDINATOR_KEY;
assert(reviewerKey&&coordinatorKey,'Integration requires ephemeral keys from the CI runner');
async function call(path:string,data?:any,key:string=reviewerKey){
  const headers:Record<string,string>={...(key?{'Authorization':'Bearer '+key}:{})};
  const response=await fetch(base+path,data===undefined?{headers}:{method:'POST',body:JSON.stringify(data),headers:{...headers,'content-type':'application/json'}});
  return {status:response.status,body:await response.json()};
}
const job=(all:any[],id:string)=>all.find((entry:any)=>entry.id===id);
const all=async()=> (await call('/jobs')).body;
const ref=async(id:string)=>job(await all(),id);
const mutate=async(id:string,action:string,version:number,body:any={},key:string=reviewerKey)=>call('/jobs/'+id+'/'+action,{...body,expectedVersion:version},key);
assert.equal((await call('/health',undefined,'')).status,200);
assert.equal((await call('/jobs',undefined,'')).status,401);
assert.equal((await call('/session',undefined,'')).status,401);
assert.equal((await call('/jobs',undefined,'a-malformed-key')).status,401);
assert.equal((await call('/session',undefined,coordinatorKey)).body.role,'coordinator');
assert.equal((await call('/session',undefined,reviewerKey)).body.role,'reviewer');
assert.equal((await call('/reset',{},coordinatorKey)).status,403);
assert.equal((await call('/reset',{})).status,200);
const original=await all();
assert.equal(original.length,8);
assert(original.reduce((n:number,j:any)=>n+j.messages.length,0)>=20);
const id='NL-1041';
let j=await ref(id);
assert.equal(j.version,1);
assert.equal(Object.keys(j.candidateReviews).length,0);
const firstQuantity=j.candidates.find((c:any)=>c.field==='quantity'&&c.kind==='assertion');
const quote=j.candidates.find((c:any)=>c.field==='quantity'&&c.kind==='quoted history');
let result=await call('/jobs/'+id+'/approve',{role:'reviewer'});
assert.equal(result.status,428);
assert.equal(result.body.code,'VERSION_REQUIRED');
result=await mutate(id,'approve',j.version,{role:'reviewer'},coordinatorKey);
assert.equal(result.status,403);
assert.equal(result.body.code,'FORBIDDEN');
assert.equal((await ref(id)).version,1);
result=await mutate(id,'approve',j.version,{role:'coordinator'});
assert.equal(result.status,200);
assert.equal(result.body.revisions.length,1);
assert.equal(result.body.version,2);
const approved=JSON.stringify(result.body.revisions[0]);
const initialVersion=result.body.version;

// Rejecting an already-approved candidate reopens its field; the release stays immutable.
result=await mutate(id,'review-candidate',initialVersion,{candidateId:firstQuantity.id,decision:'reject',reason:'Superseded by customer follow-up'},coordinatorKey);
assert.equal(result.status,200);
assert.equal(result.body.status,'Change review');
assert.equal(result.body.resolutions.quantity,undefined);
assert.equal(result.body.candidateReviews[firstQuantity.id].status,'rejected');
assert.equal(result.body.candidateReviews[firstQuantity.id].reason,'Superseded by customer follow-up');
assert.equal(result.body.candidateReviews[firstQuantity.id].by,'Local coordinator key');
assert.equal(result.body.candidateReviewEvents.length,1);
assert.equal(result.body.candidateReviewEvents[0].reason,'Superseded by customer follow-up');
assert.equal(result.body.candidateReviewEvents[0].by,'Local coordinator key');
assert.equal(JSON.stringify(result.body.revisions[0]),approved);
const rejectedVersion=result.body.version;

// Same rejection is idempotent; omitted or outdated versions never clobber decisions.
result=await mutate(id,'review-candidate',rejectedVersion,{candidateId:firstQuantity.id,decision:'reject',reason:'Superseded by customer follow-up'});
assert.equal(result.body.version,rejectedVersion);
result=await mutate(id,'review-candidate',initialVersion,{candidateId:firstQuantity.id,decision:'restore'});
assert.equal(result.status,409);
assert.equal(result.body.code,'STALE_WRITE');
assert.equal(result.body.currentVersion,rejectedVersion);
result=await mutate(id,'resolve',rejectedVersion,{field:'quantity',candidateId:firstQuantity.id});
assert.equal(result.status,400);
assert.match(result.body.error,/Rejected source candidates/);
result=await mutate(id,'review-candidate',rejectedVersion,{candidateId:quote.id,decision:'reject',reason:'Quote'});
assert.equal(result.status,400);
assert.equal((await ref(id)).version,rejectedVersion);
result=await mutate(id,'review-candidate',rejectedVersion,{candidateId:firstQuantity.id,decision:'restore'});
assert.equal(result.status,200);
assert(!result.body.candidateReviews[firstQuantity.id]);
assert.equal(result.body.candidateReviewEvents.length,2);
assert.deepEqual(result.body.candidateReviewEvents.map((event:any)=>event.decision),['reject','restore']);
assert.equal(result.body.candidateReviewEvents[0].reason,'Superseded by customer follow-up');
assert.equal(result.body.version,rejectedVersion+1);
result=await mutate(id,'resolve',result.body.version,{field:'quantity',candidateId:firstQuantity.id});
assert.equal(result.status,200);
assert.equal(result.body.status,'Approved');
assert.equal(JSON.stringify(result.body.revisions[0]),approved);

// Cross-field and unknown candidate attempts do not change persisted data.
let version=result.body.version;
result=await mutate(id,'resolve',version,{field:'material',candidateId:firstQuantity.id});
assert.equal(result.status,400);
assert.match(result.body.error,/different specification field/);
result=await mutate(id,'resolve',version,{field:'material',candidateId:'unknown',value:'wrong'});
assert.equal(result.status,400);
assert.equal((await ref(id)).version,version);

// New evidence creates a change review. The other tab's pre-import version cannot write.
const newSource='From: Morgan\nDate: 2026-10-29T14:00:00Z\nSubject: Approved change\nquantity: 600';
result=await mutate(id,'import',version,{text:newSource});
assert.equal(result.status,200);
assert.equal(result.body.status,'Change review');
assert.equal(result.body.resolutions.quantity,undefined);
assert.equal(JSON.stringify(result.body.revisions[0]),approved);
const incomingVersion=result.body.version;
const count=result.body.messages.length;
result=await mutate(id,'import',incomingVersion,{text:newSource});
assert.equal(result.status,200);
assert.equal(result.body.messages.length,count);
assert.equal(result.body.version,incomingVersion); // duplicate source must not advance revision.
result=await mutate(id,'resolve',version,{field:'quantity',candidateId:firstQuantity.id});
assert.equal(result.status,409);
assert.equal(result.body.currentVersion,incomingVersion);
j=await ref(id);
const sixHundred=j.candidates.find((c:any)=>c.field==='quantity'&&c.value===600);
result=await mutate(id,'approve',j.version,{role:'reviewer'});
assert.equal(result.status,400); // unresolved quantity blocks release
result=await mutate(id,'resolve',j.version,{field:'quantity',candidateId:sixHundred.id});
assert.equal(result.status,200);
result=await mutate(id,'approve',result.body.version,{role:'reviewer'});
assert.equal(result.status,200);
assert.equal(result.body.revisions.length,2);
assert.equal(result.body.revisions[1].spec.quantity.value,600);
assert.equal(JSON.stringify(result.body.revisions[0]),approved);
assert.equal(result.body.status,'Approved');
fs.writeFileSync('samples/expected-approved.json',JSON.stringify(result.body.revisions[1],null,2));

// A second reviewer cannot approve against an older state.
result=await mutate(id,'approve',incomingVersion,{role:'reviewer'});
assert.equal(result.status,409);
assert.equal((await ref(id)).revisions.length,2);
const auditAsCoordinator=await call('/jobs/'+id+'/audit',undefined,coordinatorKey);
assert.equal(auditAsCoordinator.status,200);
assert.equal(auditAsCoordinator.body.job,id);
assert(auditAsCoordinator.body.events.some((event:any)=>event.action.includes('Local coordinator key: candidate rejected')));
assert.equal((await call('/jobs/'+id+'/audit',undefined,'')).status,401);
assert.equal((await call('/jobs/not-a-job/audit')).status,400);

// PDF evidence still imports and shows blue/red source conflict.
j=await ref('NL-1046');
result=await mutate('NL-1046','pdf',j.version,{base64:fs.readFileSync('samples/specification-1.pdf').toString('base64'),name:'specification-1.pdf'});
assert.equal(result.status,200);
assert(result.body.candidates.some((c:any)=>c.field==='finish'&&c.raw==='Blue'));
assert(result.body.candidates.some((c:any)=>c.field==='finish'&&c.raw==='Red'));

fs.writeFileSync('samples/critical-thread.txt',newSource);
await call('/reset',{});
console.log('PASS: server-enforced local access, role spoof prevention, candidate-rejection audit, restoration, rejected-source gating, optimistic concurrency, version preconditions, approval immutability, idempotent import, revisions, authorization simulation, cross-field validation and PDF evidence. Demo reset.');

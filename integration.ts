import assert from 'node:assert/strict';import fs from 'node:fs';
const base='http://127.0.0.1:4317/api';async function call(p:string,data?:any){const r=await fetch(base+p,data?{method:'POST',body:JSON.stringify(data),headers:{'content-type':'application/json'}}:{});return {status:r.status,body:await r.json()};}
await call('/reset',{});let jobs=(await call('/jobs')).body;assert.equal(jobs.length,8);assert(jobs.reduce((n:number,j:any)=>n+j.messages.length,0)>=20);
const id='NL-1041';let x=await call('/jobs/'+id+'/approve',{role:'coordinator'});assert.equal(x.status,400);x=await call('/jobs/'+id+'/approve',{role:'reviewer'});assert.equal(x.body.revisions.length,1);const approved=JSON.stringify(x.body.revisions[0]);
// An assertion for quantity must never be allowed to populate a different field.
const originalJob=(await call('/jobs')).body.find((j:any)=>j.id===id);
const quantityCandidate=originalJob.candidates.find((c:any)=>c.field==='quantity'&&c.kind==='assertion');
const previousMaterial=JSON.stringify(originalJob.resolutions.material);
x=await call('/jobs/'+id+'/resolve',{field:'material',candidateId:quantityCandidate.id});
assert.equal(x.status,400);
assert.match(x.body.error,/different specification field/);
const afterRejected=(await call('/jobs')).body.find((j:any)=>j.id===id);
assert.equal(JSON.stringify(afterRejected.resolutions.material),previousMaterial);
assert.equal(JSON.stringify(afterRejected.revisions[0]),approved);
// Unknown candidate references must fail instead of silently falling back to manual data.
x=await call('/jobs/'+id+'/resolve',{field:'material',candidateId:'does-not-exist',value:'Wrong material'});
assert.equal(x.status,400);
const source='From: Morgan\nDate: 2026-10-29T14:00:00Z\nSubject: Approved change\nquantity: 600';x=await call('/jobs/'+id+'/import',{text:source});assert.equal(x.body.status,'Change review');assert.equal(x.body.resolutions.quantity,undefined);const count=x.body.messages.length;x=await call('/jobs/'+id+'/import',{text:source});assert.equal(x.body.messages.length,count);assert.equal(JSON.stringify(x.body.revisions[0]),approved);
x=await call('/jobs/'+id+'/approve',{role:'reviewer'});assert.equal(x.status,400);const c=(await call('/jobs')).body.find((j:any)=>j.id===id).candidates.find((c:any)=>c.value===600);await call('/jobs/'+id+'/resolve',{field:'quantity',candidateId:c.id});x=await call('/jobs/'+id+'/approve',{role:'reviewer'});assert.equal(x.body.revisions[1].spec.quantity.value,600);fs.writeFileSync('samples/expected-approved.json',JSON.stringify(x.body.revisions[1],null,2));
x=await call('/jobs/NL-1046/pdf',{base64:fs.readFileSync('samples/specification-1.pdf').toString('base64'),name:'specification-1.pdf'});assert.equal(x.status,200);assert(x.body.candidates.some((c:any)=>c.field==='finish'&&c.raw==='Blue'));assert(x.body.candidates.some((c:any)=>c.field==='finish'&&c.raw==='Red'));
const reread=(await call('/jobs')).body.find((j:any)=>j.id===id);assert.equal(reread.revisions.length,2);fs.writeFileSync('samples/critical-thread.txt',source);await call('/reset',{});console.log('PASS: seed count, unauthorized release, approval, late change invalidation, idempotent import, immutable snapshots, reapproval, persisted reread, PDF extraction and blue/red evidence. Demo reset.');

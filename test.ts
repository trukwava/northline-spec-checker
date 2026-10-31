import {test} from 'node:test';import assert from 'node:assert/strict';import {extract,issues,approve,hash} from './domain.ts';import {createDemoSessions} from './auth.ts';
test('questions and quoted quantities do not become instructions',()=>{const c=extract('quantity: 500\n> quantity: 300\nquantity: Would 750 be cheaper?\nquantity: 600','source');assert.deepEqual(c.filter(c=>c.kind==='assertion').map(c=>c.value),[500,600]);assert.equal(c[1].kind,'quoted history');assert.equal(c[2].kind,'question');});
test('normalizes units while retaining original input',()=>{const c=extract('width: 2 in\nheight: 5 cm\ndepth: 100','a');assert.equal(c[0].value,50.8);assert.equal(c[0].raw,'2 in');assert.equal(c[1].value,50);assert.equal(c[2].unit,null)});
test('quoted history marker applies to subsequent lines',()=>{assert.equal(extract('On Monday wrote:\nquantity: 300','a')[0].kind,'quoted history')});
const job=()=>({type:'Label',messages:[{id:'a'}],candidates:[],resolutions:Object.fromEntries(['customer','jobReference','item','quantity','width','height','unit','material','artwork','color','dueDate','delivery'].map(f=>[f,{value:f==='dueDate'?'2099-01-01':['quantity','width','height'].includes(f)?500:'confirmed',unit:'mm'}])),revisions:[]});
test('required values and missing dimension units block approval',()=>{const j=job();delete j.resolutions.artwork;assert.throws(()=>approve(j,'reviewer'));const k=job();k.resolutions.width.unit=null;assert(issues(k).some(i=>i.field==='width'))});
test('unauthorized release fails',()=>assert.throws(()=>approve(job(),'coordinator'),/authorized/));
test('approved snapshots are immutable after late change',()=>{const j=job();const r=approve(j,'reviewer');j.revisions.push(r);j.resolutions.quantity.value=600;j.messages.push({id:'late'});assert.equal(r.spec.quantity.value,500);assert.deepEqual(r.sourceIds,['a']);assert.equal(approve(j,'reviewer').number,2)});
test('idempotent source keys and competing candidates',()=>{assert.equal(hash('same'),hash('same'));const j=job();delete j.resolutions.quantity;j.candidates=extract('quantity: 500\nquantity: 600','x');assert(issues(j).some(i=>i.message.includes('Competing')))});
test('impossible date fails',()=>{const j=job();j.resolutions.dueDate.value='2099-02-31';assert(issues(j).some(i=>i.field==='dueDate'))});

test('rejected assertions are excluded from source conflicts but missing required decisions still block',()=>{
 const j=job();delete j.resolutions.quantity;
 j.candidates=extract('quantity: 500\nquantity: 600','review-source');
 j.candidateReviews={[j.candidates[0].id]:{status:'rejected',reason:'Superseded',by:'Demo reviewer'}};
 const findings=issues(j);
 assert(findings.some(i=>i.field==='quantity'&&i.message.includes('Required')));
 assert(!findings.some(i=>i.field==='quantity'&&i.message.includes('Competing')));
 j.resolutions.quantity={value:500,candidateId:j.candidates[0].id};
 assert(issues(j).some(i=>i.message.includes('has been rejected')));
 assert.throws(()=>approve(j,'reviewer'));
});
test('rejected source review is captured in approved snapshot and not shared with later draft',()=>{
 const j=job();j.candidateReviews={excluded:{status:'rejected',reason:'Superseded',by:'Demo reviewer'}};
 const release=approve(j,'reviewer');
 assert.equal(release.candidateReviewSnapshot.excluded.reason,'Superseded');
 delete j.candidateReviews.excluded;
 assert.equal(release.candidateReviewSnapshot.excluded.reason,'Superseded');
});


test('synthetic demo accounts have server-side roles and revocable sessions',()=>{
 let clock=10_000;
 const auth=createDemoSessions({NORTHLINE_COORDINATOR_KEY:'c'.repeat(64),NORTHLINE_REVIEWER_KEY:'r'.repeat(64)},()=>clock);
 assert.equal(auth.generated.reviewer,false);
 assert.equal(auth.generated.coordinator,false);
 assert.equal(auth.signIn('reviewer','wrong'),null);
 const login=auth.signIn('reviewer','r'.repeat(64));
 assert(login);
 assert.equal(login.actor.id,'reviewer');
 assert.equal(login.actor.role,'reviewer');
 assert.match(login.setCookie,/HttpOnly; SameSite=Strict; Path=\/api/);
 assert(!login.setCookie.includes('r'.repeat(64)));
 const header=login.setCookie.split(';')[0];
 const session=auth.get(header);
 assert.equal(session?.actor.role,'reviewer');
 assert(auth.validCsrf(session,login.csrfToken));
 assert(!auth.validCsrf(session,'bad'));
 const coordinator=auth.signIn('coordinator','c'.repeat(64));
 assert.equal(coordinator?.actor.role,'coordinator');
 assert.notEqual(coordinator?.csrfToken,login.csrfToken);
 auth.revoke(header);
 assert.equal(auth.get(header),null);
 const second=auth.signIn('reviewer','r'.repeat(64));
 assert(second);
 clock+=30*60*1000;
 assert.equal(auth.get(second.setCookie.split(';')[0]),null);
});
test('session account secrets are randomly generated when unconfigured',()=>{
 const a=createDemoSessions({});
 const b=createDemoSessions({});
 assert.equal(a.generated.coordinator,true);
 assert.notEqual(a.bootstrapSecrets.reviewer,b.bootstrapSecrets.reviewer);
 assert.notEqual(a.bootstrapSecrets.reviewer,a.bootstrapSecrets.coordinator);
 assert.equal(a.signIn('reviewer',b.bootstrapSecrets.reviewer),null);
});
test('local account secrets reject malformed configuration',()=>{
 for(const bad of [' '.repeat(64),'a'.repeat(63)+' ','a'.repeat(31)+'\\n'+'b'.repeat(32),'é'.repeat(40)])
   assert.throws(()=>createDemoSessions({NORTHLINE_COORDINATOR_KEY:bad}),/printable ASCII/);
 assert.throws(()=>createDemoSessions({NORTHLINE_COORDINATOR_KEY:'x'.repeat(64),NORTHLINE_REVIEWER_KEY:'x'.repeat(64)}),/must differ/);
 assert.throws(()=>createDemoSessions({NORTHLINE_COORDINATOR_KEY:'too-short'}),/32/);
});

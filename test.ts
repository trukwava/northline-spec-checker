import {test} from 'node:test';import assert from 'node:assert/strict';import {extract,issues,approve,hash} from './domain.ts';import {createDemoSessions} from './auth.ts';import {sealRelease,verifyRelease} from './receipts.ts';import {buildReleaseBundle} from './public/release-bundle.js';import {verifyBundle} from './scripts/verify-bundle.ts';import {createAttestationSigner,verifyAttestation} from './attestations.ts';import {spawnSync} from 'node:child_process';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
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
 for(const bad of [' '.repeat(64),'a'.repeat(63)+' ','a'.repeat(31)+'\n'+'b'.repeat(32),'é'.repeat(40)])
   assert.throws(()=>createDemoSessions({NORTHLINE_COORDINATOR_KEY:bad}),/printable ASCII/);
 assert.throws(()=>createDemoSessions({NORTHLINE_COORDINATOR_KEY:'x'.repeat(64),NORTHLINE_REVIEWER_KEY:'x'.repeat(64)}),/must differ/);
 assert.throws(()=>createDemoSessions({NORTHLINE_COORDINATOR_KEY:'too-short'}),/32/);
});

test('synthetic login rejects unknown accounts and temporarily locks repeated failures',()=>{
 let t=1_000_000;
 const auth=createDemoSessions({NORTHLINE_COORDINATOR_KEY:'c'.repeat(64),NORTHLINE_REVIEWER_KEY:'r'.repeat(64)},()=>t);
 assert.equal(auth.signIn('not-registered','r'.repeat(64)),null);
 for(let n=0;n<8;n++)assert.equal(auth.signIn('reviewer','wrong'),null);
 assert.equal(auth.signIn('reviewer','r'.repeat(64)),null);
 t+=5*60*1000;
 assert.equal(auth.signIn('reviewer','r'.repeat(64))?.actor.id,'reviewer');
});

test('release receipts cover approved snapshot and exact referenced source text',()=>{
 const j=job();j.messages=[{id:'s1',text:'quantity: 500'}];
 const r=approve(j,'reviewer');r.approvedBy='Demo reviewer account';r.approvedByActorId='reviewer';
 sealRelease(j,r);
 assert.equal(verifyRelease(j,r).status,'verified');
 assert.match(r.receipt.sha256,/^[a-f0-9]{64}$/);
 const digest=r.receipt.sha256;
 j.resolutions.quantity.value=900;
 assert.equal(verifyRelease(j,r).status,'verified','Later draft changes must not invalidate earlier receipts');
 j.messages.push({id:'new',text:'quantity: 900'});
 assert.equal(verifyRelease(j,r).status,'verified','New sources are not part of old approval');
 j.messages[0].text='quantity: 600';
 assert.equal(verifyRelease(j,r).status,'mismatch');
 j.messages[0].text='quantity: 500';
 assert.equal(verifyRelease(j,r).status,'verified');
 r.spec.quantity.value=123;
 assert.equal(verifyRelease(j,r).status,'mismatch');
 r.spec.quantity.value=500;
 assert.equal(verifyRelease(j,r).sha256,digest);
});
test('missing release evidence and malformed hashes fail closed; historical approvals remain unverified',()=>{
 const j=job();j.messages=[{id:'s1',text:'Artwork: R3'}];const r=approve(j,'reviewer');
 assert.equal(verifyRelease(j,r).status,'legacy');
 sealRelease(j,r);
 assert.equal(verifyRelease(j,r).status,'verified');
 r.receipt.sourceHashes[0].sha256='0'.repeat(64);
 assert.equal(verifyRelease(j,r).status,'mismatch');
 sealRelease(j,r);
 j.messages=[];
 assert.equal(verifyRelease(j,r).status,'mismatch');
});
test('canonical receipt fingerprint ignores JSON object key ordering but not changes',()=>{
 const j=job();j.messages=[{id:'a',text:'One'}];const r=approve(j,'reviewer');
 sealRelease(j,r);
 r.spec=Object.fromEntries(Object.entries(r.spec).reverse());
 assert.equal(verifyRelease(j,r).status,'verified');
 r.approvedAt='2000-01-01T00:00:00.000Z';
 assert.equal(verifyRelease(j,r).status,'mismatch');
});

test('portable evidence packet verifies independently and rejects omitted or substituted sources',()=>{
 const j=job();j.id='NL-TEST';j.name='Demo test';j.messages=[{id:'source-1',name:'Customer proof',kind:'email',text:'width: 100 mm',receivedAt:'2026-10-20T00:00:00Z'}];
 const r=approve(j,'reviewer');r.approvedBy='Demo reviewer account';sealRelease(j,r);
 const bundle=buildReleaseBundle(j,{...r,integrity:verifyRelease(j,r)});
 assert.equal(bundle.format,'northline-evidence-bundle-v1');
 assert.equal(verifyBundle(bundle).status,'verified');
 assert.equal(bundle.revision.integrity,undefined);
 bundle.sources[0].text='width: 200 mm';
 assert.equal(verifyBundle(bundle).status,'mismatch');
 bundle.sources[0].text='width: 100 mm';
 bundle.sources.push({...bundle.sources[0],id:'unsanctioned'});
 assert.equal(verifyBundle(bundle).status,'mismatch');
 bundle.sources.pop();
 const changed={...bundle,revision:{...bundle.revision,spec:{...bundle.revision.spec,quantity:{value:2000}}}};
 assert.equal(verifyBundle(changed).status,'mismatch');
});
test('evidence packets refuse integrity-mismatched releases',()=>{
 const j=job();j.id='NL-T';j.messages=[{id:'a',text:'One'}];
 const r=approve(j,'reviewer');sealRelease(j,r);
 assert.throws(()=>buildReleaseBundle(j,{...r,integrity:{status:'mismatch'}}),/mismatched/);
 assert.equal(verifyBundle({format:'northline-evidence-bundle-v1',case:{id:'NL-T'},revision:{...r,receipt:undefined},sources:[{id:'a',text:'One'}]}).status,'legacy');
});

test('actual offline verifier process returns exact exit semantics',()=>{
 const j=job();j.id='NL-CLI';j.name='Offline proof';j.messages=[{id:'source-1',text:'quantity: 500'}];
 const r=approve(j,'reviewer');r.approvedBy='Demo reviewer account';sealRelease(j,r);
 const bundle=buildReleaseBundle(j,r);
 const tmp=mkdtempSync(join(tmpdir(),'northline-verify-'));
 const file=join(tmp,'sample.bundle');
 const execute=(args:string[]=['--receipt-only'])=>spawnSync(process.execPath,['--experimental-strip-types','scripts/verify-bundle.ts',file,...args],{encoding:'utf8',timeout:15000});
 try{
  writeFileSync(file,JSON.stringify(bundle));
  const good=execute();
  assert.equal(good.status,0,good.stderr);
  assert.match(good.stdout,/SHA-256 RECEIPT VERIFIED:/);
  assert.match(good.stdout,/SHA-256: [a-f0-9]{64}/);
  bundle.sources[0].text='quantity: 999';
  writeFileSync(file,JSON.stringify(bundle));
  const bad=execute();
  assert.equal(bad.status,1,bad.stderr);
  assert.match(bad.stdout,/MISMATCH:/);
  bundle.sources[0].text='quantity: 500';
  delete bundle.revision.receipt;
  writeFileSync(file,JSON.stringify(bundle));
  const legacy=execute();
  assert.equal(legacy.status,2,legacy.stderr);
  assert.match(legacy.stdout,/UNVERIFIED LEGACY:/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('Ed25519 binds receipt and reviewer, but embedded key alone is not trustworthy',()=>{
 const signer=createAttestationSigner({}),other=createAttestationSigner({});
 const j=job();j.id='NL-SIGNED';j.messages=[{id:'a',text:'quantity: 500'}];
 const r=approve(j,'reviewer');r.approvedBy='Demo reviewer account';r.approvedByActorId='reviewer';
 sealRelease(j,r);signer.signRelease('northline-demo',j,r);
 assert.equal(verifyAttestation('northline-demo',j,r).status,'valid-untrusted');
 assert.equal(verifyAttestation('northline-demo',j,r,signer.publicKeyPem).status,'trusted');
 assert.equal(verifyAttestation('northline-demo',j,r,other.publicKeyPem).status,'untrusted');
 assert.equal(verifyAttestation('northline-demo',{id:'NL-SPOOF'},r).status,'invalid');
 assert.equal(verifyAttestation('wrong-organization',j,r).status,'invalid');
 const receipt=r.receipt.sha256;r.receipt.sha256='0'.repeat(64);
 assert.equal(verifyAttestation('northline-demo',j,r).status,'invalid');
 r.receipt.sha256=receipt;r.attestation.signature='AAAA';
 assert.equal(verifyAttestation('northline-demo',j,r).status,'invalid');
});
test('portable signed bundle requires externally pinned trust for validated identity',()=>{
 const signer=createAttestationSigner({}),other=createAttestationSigner({});
 const j=job();j.id='NL-BUNDLE';j.messages=[{id:'a',text:'Artwork revision 3'}];
 const r=approve(j,'reviewer');r.approvedBy='Demo reviewer account';r.approvedByActorId='reviewer';
 sealRelease(j,r);signer.signRelease('northline-demo',j,r);
 const bundle=buildReleaseBundle(j,r);
 assert.equal(verifyBundle(bundle).status,'verified');
 assert.equal(verifyBundle(bundle).attestation.status,'valid-untrusted');
 assert.equal(verifyBundle(bundle,{trustedPublicKeyPem:signer.publicKeyPem}).attestation.status,'trusted');
 assert.equal(verifyBundle(bundle,{trustedPublicKeyPem:other.publicKeyPem}).attestation.status,'untrusted');
 bundle.case.id='NL-FORGED';
 assert.equal(verifyBundle(bundle).attestation.status,'invalid');
 bundle.case.id='NL-BUNDLE';bundle.sources[0].text='Artwork revision 4';
 assert.equal(verifyBundle(bundle).status,'mismatch');
});
test('standalone verifier checks externally pinned Ed25519 key, not embedded key alone',()=>{
 const signer=createAttestationSigner({}),wrong=createAttestationSigner({});
 const j=job();j.id='NL-CLI-SIG';j.messages=[{id:'a',text:'Material: board'}];
 const r=approve(j,'reviewer');r.approvedBy='Demo reviewer account';r.approvedByActorId='reviewer';
 sealRelease(j,r);signer.signRelease('northline-demo',j,r);
 const dir=mkdtempSync(join(tmpdir(),'northline-sign-')),bundle=join(dir,'bundle.json'),pem=join(dir,'pinned.pem'),bad=join(dir,'wrong.pem');
 const run=(...args:string[])=>spawnSync(process.execPath,['--experimental-strip-types','scripts/verify-bundle.ts',bundle,...args],{encoding:'utf8',timeout:15000});
 try{
  writeFileSync(bundle,JSON.stringify(buildReleaseBundle(j,r)));
  writeFileSync(pem,signer.publicKeyPem);writeFileSync(bad,wrong.publicKeyPem);
  assert.equal(run().status,3);
  const trusted=run('--trusted-public-key',pem);
  assert.equal(trusted.status,0,trusted.stderr);
  assert.match(trusted.stdout,/TRUSTED SIGNATURE VERIFIED/);
  assert.equal(run('--trusted-public-key',bad).status,1);
  assert.equal(run('--receipt-only').status,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

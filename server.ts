import http from 'node:http';import {isDeepStrictEqual} from 'node:util';import os from 'node:os';import {execFileSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {fields,required,hash,extract,issues,approve} from './domain.ts';import {createDemoSessions} from './auth.ts';import {sealRelease,verifyRelease} from './receipts.ts';import {createAttestationSigner,verifyAttestation} from './attestations.ts';
const root=path.dirname(new URL(import.meta.url).pathname);fs.mkdirSync(path.join(root,'data'),{recursive:true});const db=new DatabaseSync(path.join(root,'data/northline.sqlite'));db.exec('CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, org TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT, action TEXT, job TEXT);');
const org='northline-demo';const demoSessions=createDemoSessions(process.env);const signer=createAttestationSigner(process.env);const audit=(action:string,id:string)=>db.prepare('INSERT INTO audit(at,action,job) VALUES(?,?,?)').run(new Date().toISOString(),action,id);
const save=(j:any)=>{j.version??=1;j.candidateReviews??={};j.candidateReviewEvents??=[];db.prepare('INSERT OR REPLACE INTO jobs VALUES(?,?,?)').run(j.id,org,JSON.stringify(j));};
const get=(id:string)=>{const r:any=db.prepare('SELECT body FROM jobs WHERE id=? AND org=?').get(id,org);if(!r)throw Error('Job not found');const j=JSON.parse(r.body);j.version??=1;j.candidateReviews??={};j.candidateReviewEvents??=[];return j;};
const stale=(currentVersion:number)=>Object.assign(new Error('This case changed in another review session. The latest version has been loaded; inspect it before retrying.'),{status:409,code:'STALE_WRITE',currentVersion});
const commit=(j:any,priorVersion:number)=>{j.version=priorVersion+1;j.updatedAt=new Date().toISOString();const result=db.prepare("UPDATE jobs SET body=? WHERE id=? AND org=? AND COALESCE(CAST(json_extract(body,'$.version') AS INTEGER),1)=?").run(JSON.stringify(j),j.id,org,priorVersion);if(result.changes!==1)throw stale(get(j.id).version);};
function add(j:any,text:string,kind='email',name='Pasted thread'){const id=hash(text);if(j.messages.some((m:any)=>m.id===id))return false;j.messages.push({id,text,kind,name,receivedAt:new Date().toISOString()});const incoming=extract(text,id);j.candidates.push(...incoming);for(const c of incoming){if(c.kind==='assertion'&&j.resolutions[c.field]&&String(j.resolutions[c.field].value)!==String(c.value))delete j.resolutions[c.field];}j.updatedAt=new Date().toISOString();return true;}
function seed(){for(let i=1;i<=8;i++){const type=['Sleeve','Label','Carton'][(i-1)%3];const j:any={id:'NL-'+(1040+i),name:['Botanical launch sleeves','Archive edition labels','Winter gift cartons','Studio sample sleeves','Market batch labels','Color proof cartons','Wholesale sleeve run','Approved retail labels'][i-1],type,schemaVersion:'1.0',messages:[],candidates:[],resolutions:{},revisions:[]};
const base=`From: Morgan <morgan@example.test>\nDate: 2026-10-20T14:00:00Z\nSubject: ${j.name}\ncustomer: Alder & Pine\njobReference: ${j.id}\nitem: ${type}\nquantity: 500\nwidth: 100 mm\nheight: 50 mm\ndepth: 30 mm\nunit: mm\nmaterial: ${type==='Label'?'Coated paper':'350 gsm board'}\nthickness: 0.4 mm\nartwork: AP_R3.pdf\ncolor: Blue\nprintMethod: Offset\nfinish: Matte\nfoil: None\nemboss: None\ntolerance: 0.5 mm\ndueDate: 2027-02-12\ndelivery: Courier\nhandling: Keep dry`;
add(j,(i===4||i===5)?base.split('\n').filter(l=>!/^artwork:|^unit:/.test(l)).join('\n'):base);add(j,`From: Coordinator\nDate: 2026-10-21T10:00:00Z\nSubject: Receipt\nThanks, we will review the specifications.\n> quantity: 300`);add(j,`From: Morgan\nDate: 2026-10-22T10:00:00Z\nSubject: Pricing question\nquantity: Would 750 be cheaper?`);
if(i<=3||i===8)for(const c of j.candidates.filter((c:any)=>c.kind==='assertion'))j.resolutions[c.field]={value:c.value,unit:c.unit,candidateId:c.id,basis:'manually confirmed'};
if(i===4||i===5){j.candidates=j.candidates.filter((c:any)=>!['artwork','unit'].includes(c.field));add(j,'From: Morgan\nDate: 2026-10-23T10:00:00Z\nSubject: Dimensions\nwidth: 100\nheight: 50');}
if(i===6||i===7){add(j,'Page 1\nfinish: Blue\ncolor: Blue','PDF','specification-'+(i-5)+'.pdf');add(j,'From: Morgan\nDate: 2026-10-23T10:00:00Z\nSubject: Approved change\nquantity: 600\ncolor: Red\nfinish: Red');}
if(i===8){j.revisions.push(approve(j,'reviewer'));add(j,'From: Morgan\nDate: 2026-10-24T10:00:00Z\nSubject: Late revision\nquantity: 900');delete j.resolutions.quantity;}
save(j);} }
if(!(db.prepare('SELECT count(*) AS n FROM jobs').get() as any).n)seed();
const state=(j:any)=>({...j,revisions:(j.revisions||[]).map((revision:any)=>({...revision,integrity:verifyRelease(j,revision),attestationStatus:verifyAttestation(org,j,revision)})),version:j.version??1,candidateReviews:j.candidateReviews??{},candidateReviewEvents:j.candidateReviewEvents??[],issues:issues(j),status:j.revisions.length?((j.messages.some((m:any)=>!j.revisions.at(-1).sourceIds.includes(m.id))||!isDeepStrictEqual(j.resolutions,j.revisions.at(-1).spec)||!isDeepStrictEqual(j.candidateReviews||{},j.revisions.at(-1).candidateReviewSnapshot||{}))?'Change review':'Approved'):issues(j).length?'Needs review':'Ready for approval'});
const server=http.createServer(async(req,res)=>{try{
res.setHeader('X-Content-Type-Options','nosniff');
res.setHeader('Referrer-Policy','no-referrer');
res.setHeader('Cache-Control','no-store');
res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
if(!['127.0.0.1:4317','localhost:4317'].includes(req.headers.host||''))throw Object.assign(new Error('Local loopback host required'),{status:421,code:'BAD_HOST'});
const url=new URL(req.url!,'http://localhost');if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw Error('Cross-origin request refused');if(req.method==='GET'&&url.pathname==='/api/health'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({healthy:true,mode:'synthetic-local-demo'}));return;}
if(url.pathname.startsWith('/api')){res.setHeader('Content-Type','application/json');
const readJson=async()=>{let body='';for await(const chunk of req){body+=chunk;if(body.length>2_000_000)throw Error('Input exceeds 2 MB limit');}return body?JSON.parse(body):{};};
if(req.method==='POST'&&url.pathname==='/api/login'){
  const p=await readJson();
  const login=demoSessions.signIn(p.username,p.password);
  if(!login)throw Object.assign(new Error('Invalid local demo credentials or too many unsuccessful attempts.'),{status:401,code:'INVALID_LOGIN'});
  res.setHeader('Set-Cookie',login.setCookie);
  res.end(JSON.stringify({...login.actor,csrfToken:login.csrfToken,mode:'local-demo-session',productionReady:false}));
  return;
}
const session=demoSessions.get(req.headers.cookie);
if(!session)throw Object.assign(new Error('Demo session absent or expired. Sign in again.'),{status:401,code:'ACCESS_REQUIRED'});
const actor=session.actor;
if(req.method==='GET'&&url.pathname==='/api/session'){res.end(JSON.stringify({...actor,csrfToken:session.csrf,mode:'local-demo-session',productionReady:false}));return;}
if(req.method==='GET'&&url.pathname==='/api/attestation-public-key'){res.end(JSON.stringify({algorithm:'Ed25519',keyId:signer.keyId,publicKeyPem:signer.publicKeyPem,ephemeral:signer.ephemeral,note:'Same-server public keys are not independent trust anchors'}));return;}
if(req.method==='POST'){
 if(!demoSessions.validCsrf(session,req.headers['x-northline-csrf']))throw Object.assign(new Error('Session request token missing or invalid.'),{status:403,code:'INVALID_CSRF'});
 if(url.pathname==='/api/logout'){demoSessions.revoke(req.headers.cookie);res.setHeader('Set-Cookie',demoSessions.cookie('',0));res.end('{}');return;}
}
const p=req.method==='POST'?await readJson():{};
if(req.method==='GET'&&url.pathname==='/api/jobs'){res.end(JSON.stringify((db.prepare('SELECT body FROM jobs WHERE org=?').all(org) as any[]).map(r=>state(JSON.parse(r.body)))));return;}
if(req.method==='POST'&&url.pathname==='/api/reset'){if(actor.role!=='reviewer')throw Object.assign(new Error('Only the local reviewer key may reset the demonstration'),{status:403,code:'FORBIDDEN'});db.prepare('DELETE FROM jobs WHERE org=?').run(org);seed();audit('demo reset by '+actor.label,'all');res.end('{}');return;}
if(req.method==='POST'&&url.pathname==='/api/jobs'){if(!['Sleeve','Label','Carton'].includes(p.type)||!p.name?.trim())throw Error('Enter a name and valid product type');const j={id:'NL-'+crypto.randomUUID().slice(0,8),name:String(p.name).slice(0,120),type:p.type,schemaVersion:'1.0',messages:[],candidates:[],resolutions:{},revisions:[]};save(j);audit('created by '+actor.label,j.id);res.end(JSON.stringify(state(j)));return;}
const id=url.pathname.split('/')[3];const j=get(id);
const verifyRoute=url.pathname.match(/^\/api\/jobs\/[^/]+\/releases\/(\d+)\/verify$/);
if(req.method==='GET'&&verifyRoute){
 const index=Number(verifyRoute[1]),release=j.revisions[index];
 if(!Number.isSafeInteger(index)||!release)throw Object.assign(new Error('Approved release not found'),{status:404,code:'RELEASE_NOT_FOUND'});
 res.end(JSON.stringify({caseId:j.id,revisionNumber:release.number,integrity:verifyRelease(j,release)}));return;
}
if(req.method==='GET'&&url.pathname===`/api/jobs/${id}/audit`){
const rows=db.prepare('SELECT id,at,action FROM audit WHERE job=? ORDER BY id DESC LIMIT 100').all(id);
res.end(JSON.stringify({job:id,events:rows,limit:100,note:'Local capability labels are not verified personal identities'}));return;
}
if(req.method==='POST'){const action=url.pathname.split('/')[4];
if(!Number.isSafeInteger(p.expectedVersion)||p.expectedVersion<1)throw Object.assign(new Error('An expected case version is required for changes. Refresh and retry.'),{status:428,code:'VERSION_REQUIRED'});
if(p.expectedVersion!==j.version)throw stale(j.version);
const before=JSON.stringify(j);const events:string[]=[];if(action==='import'){if(typeof p.text!=='string'||!p.text.trim())throw Error('Paste source text first');for(const part of p.text.split(/\n(?=From:)/)){if(add(j,part,p.kind,p.name))events.push('source imported');}}
else if(action==='pdf'){if(typeof p.base64!=='string'||p.base64.length>2000000)throw Error('Invalid PDF size');const buf=Buffer.from(p.base64,'base64');if(buf.subarray(0,5).toString()!=='%PDF-')throw Error('File must be a PDF');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'northline-'));try{const file=path.join(dir,'input.pdf');fs.writeFileSync(file,buf);const text=execFileSync('pdftotext',['-layout',file,'-'],{timeout:10000,maxBuffer:1000000}).toString();if(!text.trim())throw Error('No readable text; transcribe this scanned PDF manually');const pages=text.split('\f').filter(x=>x.trim()).map((x,i)=>'Page '+(i+1)+'\n'+x).join('\n');if(add(j,pages,'PDF',String(p.name||'Specification.pdf').slice(0,120)))events.push('PDF imported');}finally{fs.rmSync(dir,{recursive:true,force:true});}}
else if(action==='resolve'){if(!fields.includes(p.field))throw Error('Unknown field');if(p.reject){delete j.resolutions[p.field];}else {const c=j.candidates.find((c:any)=>c.id===p.candidateId);if(p.candidateId!==undefined&&!c)throw Error('Source candidate not found in this job');if(c&&c.field!==p.field)throw Error('Source candidate belongs to a different specification field');if(c&&c.kind!=='assertion')throw Error('Questions and quotations cannot be accepted as instructions');if(c&&j.candidateReviews?.[c.id])throw Error('Rejected source candidates must be restored before confirmation');if(c){j.resolutions[p.field]={value:c.value,unit:c.unit,candidateId:c.id,basis:'manually confirmed'};}else{if(!String(p.value||'').trim())throw Error('A manual value is required');j.resolutions[p.field]={value:String(p.value).slice(0,500),unit:p.unit==='mm'?'mm':null,basis:'manual',reason:String(p.reason||'Reviewer entered value').slice(0,500)};}}events.push('resolution updated: '+p.field);}
else if(action==='review-candidate'){
const c=j.candidates.find((candidate:any)=>candidate.id===p.candidateId);
if(!c)throw Error('Source candidate not found in this job');
if(c.kind!=='assertion')throw Error('Only direct assertions can be rejected or restored');
if(p.decision==='reject'){
if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.length>300)throw Error('Provide a rejection reason between 3 and 300 characters');
const reason=p.reason.trim();
if(!j.candidateReviews[c.id]||j.candidateReviews[c.id].reason!==reason){
const at=new Date().toISOString();j.candidateReviews[c.id]={status:'rejected',reason,at,by:actor.label};j.candidateReviewEvents.push({candidateId:c.id,field:c.field,decision:'reject',reason,at,by:actor.label});
if(j.resolutions[c.field]?.candidateId===c.id)delete j.resolutions[c.field];
events.push('candidate rejected: '+c.field);
}
}else if(p.decision==='restore'){
if(j.candidateReviews[c.id]){delete j.candidateReviews[c.id];j.candidateReviewEvents.push({candidateId:c.id,field:c.field,decision:'restore',at:new Date().toISOString(),by:actor.label});events.push('candidate restored: '+c.field);}
}else throw Error('Unknown candidate review decision');
}
else if(action==='approve'){
if(actor.role!=='reviewer')throw Object.assign(new Error('Only the local reviewer key may approve a revision'),{status:403,code:'FORBIDDEN'});
const previous=j.revisions.at(-1);
if(!previous||!isDeepStrictEqual(previous.spec,j.resolutions)||!isDeepStrictEqual(previous.sourceIds,j.messages.map((m:any)=>m.id))||!isDeepStrictEqual(previous.candidateReviewSnapshot||{},j.candidateReviews||{})){
const revision=approve(j,actor.role);revision.approvedBy=actor.label;revision.approvedByActorId=actor.id;sealRelease(j,revision);signer.signRelease(org,j,revision);j.revisions.push(revision);events.push('approved revision '+j.revisions.length);
}
}else throw Error('Unknown action');
if(JSON.stringify(j)!==before){commit(j,p.expectedVersion);for(const actionName of events)audit(actor.label+': '+actionName,id);}
}res.end(JSON.stringify(state(j)));return;}
const target=path.join(root,'public',url.pathname==='/'?'index.html':url.pathname);if(!target.startsWith(path.join(root,'public')+path.sep))throw Error('Invalid path');res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(target));}catch(e:any){res.statusCode=e.status||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message,code:e.code||'BAD_REQUEST',...(e.currentVersion?{currentVersion:e.currentVersion}:{})}));}});server.listen(4317,'127.0.0.1',()=>{
console.log('Northline: http://127.0.0.1:4317 (synthetic loopback demo)');
if(demoSessions.generated.coordinator)console.log('DEMO coordinator password (username coordinator): '+demoSessions.bootstrapSecrets.coordinator);
if(demoSessions.generated.reviewer)console.log('DEMO reviewer password (username reviewer): '+demoSessions.bootstrapSecrets.reviewer);
console.log('Local accounts are synthetic and session-based; no verified employee identity. Do not expose this service publicly.');
console.log('Signing public key fingerprint: '+signer.keyId+(signer.ephemeral?' (ephemeral key)':' (configured key)')+'. This is not independently anchored trust.');
});

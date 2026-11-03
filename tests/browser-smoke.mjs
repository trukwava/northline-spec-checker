// Browser-level acceptance test using the runner's installed Chrome and Node 24 CDP.
// No npm browser framework, network dependency, or external telemetry.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const coordinator=process.env.NORTHLINE_COORDINATOR_KEY;
const reviewer=process.env.NORTHLINE_REVIEWER_KEY;
const chromeBin=process.env.NORTHLINE_CHROME_BIN||'google-chrome';
assert(coordinator&&reviewer,'Set the same ephemeral CI credentials used by the server.');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile=mkdtempSync(join(tmpdir(),'northline-chrome-'));
const imageDir=join(process.cwd(),'artifacts','browser');
let browser,ws;
const pending=new Map();
let serial=0;
const exceptions=[];
function failOnException(payload){
 if(payload.method==='Runtime.exceptionThrown'){
   const details=payload.params.exceptionDetails;
   exceptions.push(details.exception?.description||details.text||'JavaScript exception');
 }
}
async function until(check,what,ms=12000){
 const start=Date.now();
 while(Date.now()-start<ms){
   try{const result=await check();if(result)return result;}catch{}
   await sleep(120);
 }
 throw Error('Timed out waiting for '+what);
}
async function cdp(method,params={}){
 const id=++serial;
 return new Promise((resolve,reject)=>{
   pending.set(id,{resolve,reject});
   ws.send(JSON.stringify({id,method,params}));
 });
}
async function evalInPage(expression){
 const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails)throw Error('Browser evaluation: '+(result.exceptionDetails.exception?.description||result.exceptionDetails.text));
 return result.result?.value;
}
async function ready(){await until(()=>evalInPage('document.readyState==="complete"'),'document load');}
async function screenshot(name){
 const result=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 mkdirSync(imageDir,{recursive:true});
 writeFileSync(join(imageDir,name+'.png'),Buffer.from(result.data,'base64'));
}
async function waitFor(expression,label){return until(()=>evalInPage(expression),label);}
async function click(selector){
 assert(await evalInPage('!!document.querySelector('+JSON.stringify(selector)+')'),'Missing control: '+selector);
 await evalInPage('document.querySelector('+JSON.stringify(selector)+').click()');
}
async function login(username,password){
 await waitFor('document.querySelector("#access-dialog")?.open===true','sign-in dialog');
 await evalInPage('(()=>{const f=document.querySelector("#access-form");document.querySelector("#access-user").value='+JSON.stringify(username)+';document.querySelector("#access-key").value='+JSON.stringify(password)+';f.requestSubmit();return true;})()');
 await waitFor('!document.querySelector("#access-dialog").open && !!document.querySelector("[data-job]")','signed-in case library');
 assert((await evalInPage('document.querySelector("#access-status").textContent')).includes(username.toUpperCase()),'Account badge does not match.');
}
async function navigate(url){
 await cdp('Page.navigate',{url});
 await ready();
}
async function run(){
 browser=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 browser.on('error',err=>exceptions.push('Chrome launch: '+err.message));
 const port=await until(()=>{
   const file=join(profile,'DevToolsActivePort');
   if(!existsSync(file))return null;
   return readFileSync(file,'utf8').split('\n')[0];
 },'Chrome debugging port',15000);
 const response=await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'});
 assert.equal(response.status,200);
 const target=await response.json();
 ws=new WebSocket(target.webSocketDebuggerUrl);
 ws.addEventListener('message',event=>{
   const payload=JSON.parse(event.data);
   failOnException(payload);
   if(payload.id&&pending.has(payload.id)){
     const promise=pending.get(payload.id);pending.delete(payload.id);
     if(payload.error)promise.reject(Error(payload.error.message));else promise.resolve(payload.result||{});
   }
 });
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 await cdp('Page.enable');
 await cdp('Runtime.enable');
 await navigate('http://127.0.0.1:4317/');
 await waitFor('document.querySelector("#access-dialog")?.open===true','locked opening screen');
 assert(!(await evalInPage('document.querySelector("[data-job]")')),'Unauthenticated cases must not appear.');
 await evalInPage('(()=>{document.querySelector("#access-user").value="coordinator";document.querySelector("#access-key").value="definitely-invalid";document.querySelector("#access-form").requestSubmit();return true;})()');
 await waitFor('document.querySelector("#access-error")?.textContent.length>0','visible failed-login feedback');
 assert.equal(await evalInPage('document.querySelector("#access-dialog").open'),true,'Failed login must not dismiss the gate.');
 assert.equal(await evalInPage('!!document.querySelector("[data-job]")'),false,'Failed login must not reveal jobs.');

 await login('coordinator',coordinator);
 await click('[data-job="NL-1041"]');
 await click('[data-tab="matrix"]');
 await waitFor('!!document.querySelector("#approve")','coordinator review matrix');
 assert.equal(await evalInPage('document.querySelector("#approve").disabled'),true,'Coordinator must not approve.');

 await click('#access-switch');
 await waitFor('document.querySelector("#access-dialog")?.open===true','account switch');
 await login('reviewer',reviewer);
 await click('[data-job="NL-1041"]');
 await click('[data-tab="matrix"]');
 await waitFor('!!document.querySelector("#approve")','reviewer review matrix');
 assert.equal(await evalInPage('document.querySelector("#approve").disabled'),false,'Reviewer must be able to approve fixture.');
 await click('#approve');
 await waitFor('document.querySelector(".job-card.active .job-status")?.textContent==="Approved"','approved case');
 await click('[data-tab="revisions"]');
 await waitFor('document.querySelector(".release-receipt.verified")?.textContent.includes("VERIFIED")','verified release receipt');
 await waitFor('document.querySelector(".release-attestation.valid-untrusted")?.textContent.includes("SIGNER NOT TRUSTED")','signed release without independent signer trust');
 assert(await evalInPage('!!document.querySelector("[data-signer-key]")'),'Signer public key export control missing');
 assert(await evalInPage('!!document.querySelector("[data-format=bundle]")'),'A verified release must offer an evidence packet');
 await screenshot('desktop-approved-case');
 await click('[data-tab="overview"]');
 await click('[data-tab="sources"]');
 await waitFor('!!document.querySelector(".source-card")','source evidence timeline');

 await cdp('Page.reload',{ignoreCache:true});
 await ready();
 await waitFor('document.querySelector("#access-status")?.textContent.includes("REVIEWER") && !!document.querySelector("[data-job]")','session recovered after reload');
 assert.equal(await evalInPage('document.querySelector("#access-dialog").open'),false,'Valid session should not reopen sign-in.');

 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await cdp('Page.reload',{ignoreCache:true});
 await ready();
 await waitFor('!!document.querySelector("[data-job]")','mobile session recovered');
 const metrics=await evalInPage('({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,railScrollable:document.querySelector("#jobs").scrollWidth>document.querySelector("#jobs").clientWidth})');
 assert(metrics.documentWidth<=metrics.viewport+4,'Unexpected horizontal overflow on mobile: '+JSON.stringify(metrics));
 await screenshot('mobile-case-library');
 await click('#access-switch');
 await waitFor('document.querySelector("#access-dialog")?.open===true','signed-out screen');
 const status=await evalInPage('fetch("/api/session",{credentials:"same-origin"}).then(r=>r.status)');
 assert.equal(status,401,'Switching operator must revoke the previous session.');
 assert.equal(exceptions.length,0,'Uncaught browser exceptions: '+exceptions.join('\n'));
 console.log('PASS browser: incorrect login, locked entry, coordinator restriction, reviewer approval, evidence timeline, session reload, mobile viewport, logout, screenshots and JS exceptions.');
}
try{await run();}
finally{
 if(ws?.readyState===WebSocket.OPEN)ws.close();
 browser?.kill('SIGTERM');
 // Chrome may still be flushing profile files while SIGTERM propagates.
 // Cleanup is best-effort and must not turn a successful browser test into a failed run.
 try{rmSync(profile,{recursive:true,force:true,maxRetries:20,retryDelay:250});}
 catch(error){console.warn('Chrome profile cleanup deferred: '+error.message);}

}

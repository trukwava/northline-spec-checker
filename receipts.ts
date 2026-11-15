import {createHash} from 'node:crypto';

// Self-consistency fingerprint only; an administrator can still rewrite the local
// database and recompute this digest. It is NOT a digital signature.
// v1 (older releases) covers the release snapshot and referenced source text only.
// v2 (every new release) also covers the case ID, name and type, and each referenced
// source's name, kind and receivedAt. Missing values normalize exactly as
// public/release-bundle.js exports them, so an evidence packet and the server agree.
const V1='northline-receipt-v1',V2='northline-receipt-v2';
const digest=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const canonical=(value:any):string=>{
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
};
const snapshot=(revision:any)=>({
 id:revision.id,number:revision.number,approvedAt:revision.approvedAt,
 approvedBy:revision.approvedBy,approvedByActorId:revision.approvedByActorId,
 schemaVersion:revision.schemaVersion,spec:revision.spec,
 candidateReviewSnapshot:revision.candidateReviewSnapshot||{},sourceIds:revision.sourceIds
});
const caseLabel=(job:any)=>({id:job.id,name:job.name??'',type:job.type??''});
const evidence=(job:any,revision:any,version:string)=>{
 if(!Array.isArray(revision.sourceIds)||!Array.isArray(job.messages))throw Error('Invalid release source references');
 return revision.sourceIds.map((id:string)=>{
   const source=job.messages.find((message:any)=>message.id===id);
   if(!source||typeof source.text!=='string')throw Error('Release source text is missing');
   if(version===V1)return {id,sha256:digest(source.text)};
   return {id,name:source.name??'',kind:source.kind??'',receivedAt:source.receivedAt??null,sha256:digest(source.text)};
 });
};
const recordDigest=(job:any,revision:any,hashes:any[],version:string)=>digest(canonical(version===V1?
 {snapshot:snapshot(revision),sourceHashes:hashes}:
 {version,case:caseLabel(job),snapshot:snapshot(revision),sourceHashes:hashes}));
export function sealRelease(job:any,revision:any){
 const sourceHashes=evidence(job,revision,V2);
 revision.receipt={version:V2,algorithm:'SHA-256',sha256:recordDigest(job,revision,sourceHashes,V2),sourceHashes};
 return revision;
}
export function verifyRelease(job:any,revision:any){
 if(!revision.receipt)return {status:'legacy',message:'Approval predates integrity receipts; no verification claim.'};
 const receipt=revision.receipt;
 if(![V1,V2].includes(receipt.version)||receipt.algorithm!=='SHA-256'||!/^[a-f0-9]{64}$/.test(receipt.sha256||'')||!Array.isArray(receipt.sourceHashes))
  return {status:'mismatch',message:'Malformed or unsupported release receipt.'};
 try{
  const actual=evidence(job,revision,receipt.version);
  if(canonical(actual)!==canonical(receipt.sourceHashes)||recordDigest(job,revision,actual,receipt.version)!==receipt.sha256)
   return {status:'mismatch',message:'Approved release or its covered case and source fields differ from the saved receipt.'};
  return {status:'verified',message:receipt.version===V1?'Stored release and referenced source text match this SHA-256 receipt.':
   'Stored release, case label, and referenced source text and metadata match this SHA-256 receipt.',
   sha256:receipt.sha256,sourceCount:actual.length,version:receipt.version};
 }catch{
  return {status:'mismatch',message:'One or more approved source records are missing or unreadable.'};
 }
}

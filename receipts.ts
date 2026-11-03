import {createHash} from 'node:crypto';

// Self-consistency fingerprint only; an administrator can still rewrite the local
// database and recompute this digest. It is NOT a digital signature.
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
const evidence=(job:any,revision:any)=>{
 if(!Array.isArray(revision.sourceIds)||!Array.isArray(job.messages))throw Error('Invalid release source references');
 return revision.sourceIds.map((id:string)=>{
   const source=job.messages.find((message:any)=>message.id===id);
   if(!source||typeof source.text!=='string')throw Error('Release source text is missing');
   return {id,sha256:digest(source.text)};
 });
};
const recordDigest=(revision:any,hashes:any[])=>digest(canonical({snapshot:snapshot(revision),sourceHashes:hashes}));
export function sealRelease(job:any,revision:any){
 const sourceHashes=evidence(job,revision);
 revision.receipt={version:'northline-receipt-v1',algorithm:'SHA-256',sha256:recordDigest(revision,sourceHashes),sourceHashes};
 return revision;
}
export function verifyRelease(job:any,revision:any){
 if(!revision.receipt)return {status:'legacy',message:'Approval predates integrity receipts; no verification claim.'};
 const receipt=revision.receipt;
 if(receipt.version!=='northline-receipt-v1'||receipt.algorithm!=='SHA-256'||!/^[a-f0-9]{64}$/.test(receipt.sha256||'')||!Array.isArray(receipt.sourceHashes))
  return {status:'mismatch',message:'Malformed or unsupported release receipt.'};
 try{
  const actual=evidence(job,revision);
  if(canonical(actual)!==canonical(receipt.sourceHashes)||recordDigest(revision,actual)!==receipt.sha256)
   return {status:'mismatch',message:'Approved release or referenced source text differs from its saved receipt.'};
  return {status:'verified',message:'Stored release and referenced source text match this SHA-256 receipt.',sha256:receipt.sha256,sourceCount:actual.length};
 }catch{
  return {status:'mismatch',message:'One or more approved source records are missing or unreadable.'};
 }
}

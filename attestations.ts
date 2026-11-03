
import {createHash,createPrivateKey,createPublicKey,generateKeyPairSync,sign,verify} from 'node:crypto';
import {readFileSync} from 'node:fs';

const canonical=(value:any):string=>{
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
};
const fingerprint=(publicKey:any)=>createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex');
const claims=(org:string,job:any,r:any,keyId:string)=>({
 version:'northline-attestation-claims-v1',org,caseId:job.id,revisionId:r.id,
 revisionNumber:r.number,receiptSha256:r.receipt?.sha256,
 approvedAt:r.approvedAt,approvedBy:r.approvedBy,
 approvedByActorId:r.approvedByActorId,keyId
});
export function createAttestationSigner(env:Record<string,string|undefined>){
 const file=env.NORTHLINE_ATTESTATION_PRIVATE_KEY_FILE;
 const privateKey=file?createPrivateKey(readFileSync(file,'utf8')):generateKeyPairSync('ed25519').privateKey;
 if(privateKey.asymmetricKeyType!=='ed25519')throw Error('Signing private key must be Ed25519');
 const pub=createPublicKey(privateKey),publicKeyPem=pub.export({type:'spki',format:'pem'}).toString();
 const keyId=fingerprint(pub);
 return {publicKeyPem,keyId,ephemeral:!file,signRelease(org:string,job:any,r:any){
  if(!r.receipt?.sha256||!r.approvedByActorId)throw Error('Sealed revision and reviewer attribution required');
  const payload=claims(org,job,r,keyId);
  r.attestation={version:'northline-attestation-v1',algorithm:'Ed25519',keyId,
   publicKeyPem,claims:payload,signature:sign(null,Buffer.from(canonical(payload)),privateKey).toString('base64')};
  return r;
 }};
}
export function verifyAttestation(org:string,job:any,r:any,trustedPublicKeyPem?:string){
 const att=r?.attestation;
 if(!att)return {status:'unsigned',message:'No digital signature was recorded.'};
 try{
  if(att.version!=='northline-attestation-v1'||att.algorithm!=='Ed25519'||
     typeof att.publicKeyPem!=='string'||typeof att.signature!=='string'||! /^[A-Za-z0-9+/]+={0,2}$/.test(att.signature))
   throw Error('Malformed or unsupported attestation');
  const pub=createPublicKey(att.publicKeyPem);
  if(pub.asymmetricKeyType!=='ed25519')throw Error('Signer public key is not Ed25519');
  const keyId=fingerprint(pub);
  if(att.keyId!==keyId)throw Error('Signer key fingerprint mismatch');
  const expected=claims(org,job,r,keyId);
  if(canonical(att.claims)!==canonical(expected))throw Error('Signed claims disagree with the release');
  const sig=Buffer.from(att.signature,'base64');
  if(sig.length!==64||sig.toString('base64')!==att.signature||!verify(null,Buffer.from(canonical(att.claims)),pub,sig))
   throw Error('Invalid Ed25519 signature');
  if(trustedPublicKeyPem!==undefined){
   const trusted=createPublicKey(trustedPublicKeyPem);
   if(trusted.asymmetricKeyType!=='ed25519')throw Error('Trusted key is not Ed25519');
   if(fingerprint(trusted)!==keyId)return {status:'untrusted',message:'Signer does not match independently pinned public key.',keyId};
   return {status:'trusted',message:'Ed25519 signature matches independently pinned public key.',keyId};
  }
  return {status:'valid-untrusted',message:'Signature matches embedded key, but signer identity is not independently established.',keyId};
 }catch(error){return {status:'invalid',message:(error as Error).message||'Signature verification failed'};}
}

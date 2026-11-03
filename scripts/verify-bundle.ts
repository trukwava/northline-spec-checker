import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyRelease} from '../receipts.ts';import {verifyAttestation} from '../attestations.ts';

export function verifyBundle(bundle:any,options:{trustedPublicKeyPem?:string}={}){
 if(!bundle||bundle.format!=='northline-evidence-bundle-v1'||!bundle.revision||
    !Array.isArray(bundle.sources)||!Array.isArray(bundle.revision.sourceIds)||
    typeof bundle.case?.id!=='string')
  return {status:'mismatch',message:'Missing or invalid evidence bundle envelope'};
 const expected=bundle.revision.sourceIds;
 const actual=bundle.sources.map((source:any)=>source?.id);
 if(actual.length!==expected.length||new Set(actual).size!==actual.length||
    actual.some((id:any,index:number)=>id!==expected[index]))
  return {status:'mismatch',message:'Source list differs from the approved source manifest'};
 if(bundle.sources.some((source:any)=>typeof source?.text!=='string'))
  return {status:'mismatch',message:'A source is missing its preserved text'};
 const receipt=verifyRelease({messages:bundle.sources},bundle.revision);
 if(receipt.status!=='verified')return {...receipt,attestation:{status:'unchecked',message:'Receipt verification unsuccessful'}};
 return {...receipt,attestation:verifyAttestation('northline-demo',{id:bundle.case.id},bundle.revision,options.trustedPublicKeyPem)};
}

const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const args=process.argv.slice(2);
 const filename=args[0],receiptOnly=args.includes('--receipt-only');
 const keyFlag=args.indexOf('--trusted-public-key');
 const valid=filename&&!filename.startsWith('--')&&!args.some((v,i)=>i>0&&v.startsWith('--')&&!['--receipt-only','--trusted-public-key'].includes(v))&&
   !(receiptOnly&&keyFlag>=0)&&(keyFlag<0||!!args[keyFlag+1]&&!args[keyFlag+1].startsWith('--'));
 if(!valid){
  console.error('Usage: node --experimental-strip-types scripts/verify-bundle.ts evidence.json [--trusted-public-key pinned.pem | --receipt-only]');
  process.exitCode=2;
 }else{
  try{
   const bundle=JSON.parse(readFileSync(filename,'utf8'));
   const trusted=keyFlag<0?undefined:readFileSync(args[keyFlag+1],'utf8');
   const result=verifyBundle(bundle,{trustedPublicKeyPem:trusted});
   if(result.status!=='verified'){
    console.log((result.status==='legacy'?'UNVERIFIED LEGACY':'MISMATCH')+': '+result.message);
    process.exitCode=result.status==='legacy'?2:1;
   }else{
    console.log('SHA-256 RECEIPT VERIFIED: '+result.sha256);
    const att=result.attestation;
    if(receiptOnly)console.log('RECEIPT ONLY: signer identity and signature trust not checked.');
    else if(att.status==='trusted')console.log('TRUSTED SIGNATURE VERIFIED: Ed25519 key '+att.keyId);
    else if(att.status==='valid-untrusted'){
     console.log('SIGNATURE VALID BUT UNTRUSTED: '+att.message);
     console.log('Provide --trusted-public-key from an independent trusted channel.');
     process.exitCode=3;
    }else if(att.status==='unsigned'){
     console.log('UNSIGNED RELEASE: checksum verified without signature.');
     process.exitCode=2;
    }else{
     console.log('SIGNATURE REJECTED: '+att.message);
     process.exitCode=1;
    }
   }
  }catch(error){console.error('INVALID BUNDLE: '+(error as Error).message);process.exitCode=1;}
 }
}

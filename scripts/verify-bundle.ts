import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyRelease} from '../receipts.ts';

export function verifyBundle(bundle:any){
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
 return verifyRelease({messages:bundle.sources},bundle.revision);
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const filename=process.argv[2];
 if(!filename){
  console.error('Usage: node --experimental-strip-types scripts/verify-bundle.ts path/to/evidence-bundle.json');
  process.exitCode=2;
 }else{
  try{
   const bundle=JSON.parse(readFileSync(filename,'utf8'));
   const result=verifyBundle(bundle);
   const label=result.status==='verified'?'VERIFIED':result.status==='legacy'?'UNVERIFIED LEGACY':'MISMATCH';
   console.log(label+': '+result.message);
   if(result.status==='verified')console.log('SHA-256: '+result.sha256);
   else process.exitCode=result.status==='legacy'?2:1;
  }catch(error){
   console.error('INVALID BUNDLE: '+(error as Error).message);
   process.exitCode=1;
  }
 }
}

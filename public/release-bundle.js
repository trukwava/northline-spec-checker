// Portable evidence packet constructor. Does not make any trust claims.
export function buildReleaseBundle(job,revision){
 if(!job||!revision||!Array.isArray(revision.sourceIds)||!Array.isArray(job.messages))
  throw Error('A stored approved release and its evidence are required.');
 if(revision.integrity?.status==='mismatch')throw Error('Cannot export an integrity-mismatched release');
 const sourceRecords=revision.sourceIds.map(id=>{
   const record=job.messages.find(m=>m.id===id);
   if(!record||typeof record.text!=='string')throw Error('An approved source is missing');
   return {id:record.id,name:record.name||'',kind:record.kind||'',receivedAt:record.receivedAt||null,text:record.text};
 });
 // Computed UI verification status is NOT persisted as part of the original approval.
 const {integrity,...snapshot}=revision;
 return {format:'northline-evidence-bundle-v1',case:{id:job.id,name:job.name,type:job.type},revision:snapshot,sources:sourceRecords};
}

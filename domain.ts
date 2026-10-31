import {createHash} from 'node:crypto';
export const fields=['customer','jobReference','item','quantity','width','height','depth','unit','material','thickness','artwork','color','printMethod','finish','foil','emboss','tolerance','dueDate','delivery','handling'];
export const required=(type:string)=>['customer','jobReference','item','quantity','width','height','unit','material','artwork','color','dueDate','delivery',...(type==='Carton'?['depth']:[])];
export const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export function extract(text:string, sourceId:string){
 const result:any[]=[];let quoted=false;
 text.split('\n').forEach((line,i)=>{if(/^On .*wrote:|^-+Original Message/i.test(line))quoted=true;
 const m=line.trim().replace(/^>\s*/,'').match(/^([a-zA-Z]+)\s*:\s*(.+)$/);if(!m||!fields.includes(m[1]))return;
 const question=/\?|\b(would|could|whether)\b/i.test(m[2]);const quote=quoted||/^>/.test(line);
 let raw=m[2].trim(), value:any=raw,unit=null;
 if(['width','height','depth','thickness','tolerance'].includes(m[1])){const d=raw.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|in)?$/);if(d){value=Number(d[1]);unit=d[2]||null;if(unit==='cm')value*=10;if(unit==='in')value*=25.4;if(unit)unit='mm';}}
 if(m[1]==='quantity'&&/^\d+$/.test(raw))value=Number(raw);
 result.push({id:hash(sourceId+':'+i),field:m[1],raw,value,unit,sourceId,line:i+1,kind:quote?'quoted history':question?'question':'assertion'});
 });return result;
}
export function issues(job:any){const out:any[]=[];for(const f of required(job.type)){if(!job.resolutions[f]?.value)out.push({field:f,message:'Required field unresolved'});}
 for(const f of fields){const cs=job.candidates.filter((c:any)=>c.field===f&&c.kind==='assertion'&&!job.candidateReviews?.[c.id]);const vals=new Set(cs.map((c:any)=>String(c.value)));if(vals.size>1&&!job.resolutions[f])out.push({field:f,message:'Competing source values need review'});}
 for(const [field,resolution] of Object.entries<any>(job.resolutions||{})){if(resolution.candidateId&&job.candidateReviews?.[resolution.candidateId])out.push({field,message:'Selected source candidate has been rejected'});}
 const r=job.resolutions;for(const f of ['width','height',...(job.type==='Carton'?['depth']:[])]){if(r[f]&&(!Number.isFinite(Number(r[f].value))||Number(r[f].value)<=0))out.push({field:f,message:'Dimension must be a positive number'});if(r[f]&&!r[f].unit)out.push({field:f,message:'Dimension requires an explicit source or manual unit'});}
 if(r.quantity&&(!Number.isInteger(Number(r.quantity.value))||Number(r.quantity.value)<=0))out.push({field:'quantity',message:'Quantity must be a positive integer'});
 if(r.dueDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate.value)||!Number.isFinite(Date.parse(r.dueDate.value))||new Date(r.dueDate.value).toISOString().slice(0,10)!==r.dueDate.value||r.dueDate.value<new Date().toISOString().slice(0,10)))out.push({field:'dueDate',message:'Deadline must be a valid future date'});
 return out;
}
export function approve(job:any,role:string){if(role!=='reviewer')throw Error('Only an authorized reviewer can release production');if(issues(job).length)throw Error('Resolve all blocking issues before approval');return {id:crypto.randomUUID(),number:job.revisions.length+1,approvedAt:new Date().toISOString(),approvedBy:'Seeded synthetic reviewer',schemaVersion:'1.0',spec:structuredClone(job.resolutions),candidateReviewSnapshot:structuredClone(job.candidateReviews||{}),sourceIds:job.messages.map((m:any)=>m.id)};}

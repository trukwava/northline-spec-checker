import {randomBytes,timingSafeEqual} from 'node:crypto';

export type LocalRole='coordinator'|'reviewer';
export type LocalActor={role:LocalRole,org:'northline-demo',label:string};
type LocalKeys={coordinator:string,reviewer:string};

function keyFromEnvironment(value:string|undefined,name:string){
  if(value!==undefined){
    if(value.length<32||value.length>256)throw Error(name+' must be 32–256 characters');
    return {key:value,generated:false};
  }
  return {key:randomBytes(32).toString('hex'),generated:true};
}
export function createLocalAccessKeys(env:Record<string,string|undefined>){
  const coordinator=keyFromEnvironment(env.NORTHLINE_COORDINATOR_KEY,'NORTHLINE_COORDINATOR_KEY');
  const reviewer=keyFromEnvironment(env.NORTHLINE_REVIEWER_KEY,'NORTHLINE_REVIEWER_KEY');
  if(coordinator.key===reviewer.key)throw Error('Coordinator and reviewer keys must differ');
  return {keys:{coordinator:coordinator.key,reviewer:reviewer.key},generated:{coordinator:coordinator.generated,reviewer:reviewer.generated}};
}
const equal=(a:string,b:string)=>{
  const left=Buffer.from(a,'utf8'),right=Buffer.from(b,'utf8');
  return left.length===right.length && timingSafeEqual(left,right);
};
export function authenticateLocal(authorization:string|string[]|undefined,keys:LocalKeys):LocalActor|null{
  if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))return null;
  const provided=authorization.slice(7);
  if(provided.length<32||provided.length>256)return null;
  if(equal(provided,keys.reviewer))return {role:'reviewer',org:'northline-demo',label:'Local reviewer key'};
  if(equal(provided,keys.coordinator))return {role:'coordinator',org:'northline-demo',label:'Local coordinator key'};
  return null;
}

import {createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

export type DemoRole='coordinator'|'reviewer';
export type DemoActor={id:string,label:string,role:DemoRole,org:'northline-demo'};
type Account={actor:DemoActor,salt:Buffer,hash:Buffer};
type Session={actor:DemoActor,csrf:string,expiresAt:number};
const TTL_MS=30*60*1000;
const LOCK_AFTER=8,LOCK_MS=5*60*1000;
const COOKIE='northline_session';
const strong=(value:string|undefined,name:string)=>{
 if(value!==undefined){
   if(value.length<32||value.length>256||!/^[\x21-\x7e]+$/.test(value))throw Error(name+' must be 32–256 printable ASCII characters without spaces');
   return {secret:value,generated:false};
 }
 return {secret:randomBytes(32).toString('hex'),generated:true};
};
const digest=(secret:string,salt:Buffer)=>scryptSync(secret,salt,64);
const sha256=(token:string)=>createHash('sha256').update(token).digest('hex');
const safeEqual=(a:Buffer,b:Buffer)=>a.length===b.length&&timingSafeEqual(a,b);
const cookieToken=(header:string|string[]|undefined)=>{
 if(typeof header!=='string')return null;
 const found=header.split(';').map(part=>part.trim()).find(part=>part.startsWith(COOKIE+'='));
 const token=found?.slice(COOKIE.length+1);
 return token&&/^[a-f0-9]{64}$/.test(token)?token:null;
};
export function createDemoSessions(env:Record<string,string|undefined>,now:()=>number=()=>Date.now()){
 const coordinator=strong(env.NORTHLINE_COORDINATOR_KEY,'NORTHLINE_COORDINATOR_KEY');
 const reviewer=strong(env.NORTHLINE_REVIEWER_KEY,'NORTHLINE_REVIEWER_KEY');
 if(coordinator.secret===reviewer.secret)throw Error('Coordinator and reviewer secrets must differ');
 const raw=[
  {actor:{id:'coordinator',label:'Demo coordinator account',role:'coordinator',org:'northline-demo'} as DemoActor,secret:coordinator.secret},
  {actor:{id:'reviewer',label:'Demo reviewer account',role:'reviewer',org:'northline-demo'} as DemoActor,secret:reviewer.secret}
 ];
 const accounts:Account[]=raw.map(({actor,secret})=>{const salt=randomBytes(16);return {actor,salt,hash:digest(secret,salt)};});
 const sessions=new Map<string,Session>();
 const attempts=new Map<string,{count:number,until:number}>();
 const display={coordinator:coordinator.generated,reviewer:reviewer.generated};
 const publicAccounts=accounts.map(({actor})=>actor);
 const cookie=(token:string,maxAge=1800)=>`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}`;
 const signIn=(id:string,password:string)=>{
   if(typeof id!=='string'||!['coordinator','reviewer'].includes(id)||typeof password!=='string'||password.length>256)return null;
   // Failures are counted per account name, not per client: any local process that can
   // reach the loopback port can lock an account for LOCK_MS. The count resets on expiry.
   let lock=attempts.get(id);
   if(lock&&now()>=lock.until){attempts.delete(id);lock=undefined;}
   if(lock&&lock.count>=LOCK_AFTER)return null;
   const account=accounts.find(account=>account.actor.id===id);
   // Derive a hash even for unknown users to avoid an instant negative response.
   const candidate=digest(password,account?.salt||Buffer.alloc(16));
   if(!account||!safeEqual(candidate,account.hash)){
     attempts.set(id,{count:(lock?.count||0)+1,until:now()+LOCK_MS});
     return null;
   }
   attempts.delete(id);
   for(const [key,session] of sessions)if(session.expiresAt<=now())sessions.delete(key);
   const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
   sessions.set(sha256(token),{actor:account.actor,csrf,expiresAt:now()+TTL_MS});
   return {setCookie:cookie(token),actor:account.actor,csrfToken:csrf};
 };
 const get=(header:string|string[]|undefined)=>{
   const token=cookieToken(header);
   if(!token)return null;
   const key=sha256(token),session=sessions.get(key);
   if(!session)return null;
   if(session.expiresAt<=now()){sessions.delete(key);return null;}
   return session;
 };
 const revoke=(header:string|string[]|undefined)=>{
   const token=cookieToken(header);
   if(token)sessions.delete(sha256(token));
 };
 const validCsrf=(session:Session,value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&safeEqual(Buffer.from(session.csrf,'hex'),Buffer.from(value,'hex'));
 return {signIn,get,revoke,validCsrf,cookie,publicAccounts,generated:display,sessionCount:()=>sessions.size,
   bootstrapSecrets:{coordinator:coordinator.secret,reviewer:reviewer.secret}};
}

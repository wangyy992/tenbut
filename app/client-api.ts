import type { PublicRoom } from "./game";
export type Session={code:string;token:string};
export type Mutation={room?:PublicRoom;session?:Session;left?:boolean};
async function request<T>(method:string,body:Record<string,unknown>|null,session:Session|null):Promise<T>{
 const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),12000);
 try {
  const res=await fetch('/api/game'+(method==='GET'?'?code='+session?.code:''),{method,cache:'no-store',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
  const data=await res.json() as T & {error?:string};
  if(!res.ok){const error=new Error(data.error || '连接暂时不稳定。');Object.assign(error,{status:res.status});throw error;}
  return data;
 } finally {clearTimeout(timeout);}
}
export const getRoom=(session:Session)=>request<PublicRoom>('GET',null,session);
export const post=(action:string,fields:Record<string,unknown>,session:Session|null)=>request<Mutation>('POST',{action,code:session?.code,...fields},session);

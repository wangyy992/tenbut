import { authenticate, type Room } from '../app/game';
type Env = Cloudflare.Env & {ADMIN_PASSWORD?:string};
export const featureSchema = [
 'CREATE TABLE IF NOT EXISTS discussion (id INTEGER PRIMARY KEY AUTOINCREMENT, request TEXT NOT NULL UNIQUE, room TEXT NOT NULL, round TEXT NOT NULL, player TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS discussion_room ON discussion(room,round,id)',
 'CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, visitor TEXT NOT NULL, day TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS usage (visitor TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(visitor,day))',
 'CREATE TABLE IF NOT EXISTS admin_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset INTEGER NOT NULL)',
];
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const day=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export function visitor(req:Request){return /(?:^|;\s*)tb_visitor=([a-f0-9-]{36})(?:;|$)/.exec(req.headers.get('cookie')||'')?.[1];}
export async function recordUse(req:Request,db:D1Database){const id=visitor(req);if(id)await db.prepare('INSERT OR IGNORE INTO usage(visitor,day) VALUES (?,?)').bind(id,day()).run();}
async function admin(req:Request,env:Env){
 if(!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length<16)return new Response('请先在 Cloudflare 设置 ADMIN_PASSWORD 密钥，至少 16 个字符。',{status:503});
 let password='';try{const bytes=Uint8Array.from(atob((req.headers.get('authorization')||'').replace(/^Basic /,'')),c=>c.charCodeAt(0));password=new TextDecoder().decode(bytes).split(':').slice(1).join(':');}catch{}
 const limitKey=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode((req.headers.get('cf-connecting-ip')||'unknown')+env.ADMIN_PASSWORD)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const limit=await env.DB!.prepare('SELECT attempts,reset FROM admin_attempts WHERE key=?').bind(limitKey).first<{attempts:number;reset:number}>();
 if(limit&&limit.reset>Date.now()&&limit.attempts>=10)return new Response('尝试过多，请 15 分钟后重试。',{status:429,headers:{'Retry-After':'900','Cache-Control':'no-store'}});
 const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([digest(password),digest(env.ADMIN_PASSWORD)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 if(diff){if(req.headers.has('authorization')){await env.DB!.prepare('DELETE FROM admin_attempts WHERE reset<?').bind(Date.now()).run();await env.DB!.prepare('INSERT INTO admin_attempts(key,attempts,reset) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').bind(limitKey,Date.now()+900000).run();}return new Response('请输入管理员密码（用户名任意）',{status:401,headers:{'WWW-Authenticate':'Basic realm="TEN BUT Admin", charset="UTF-8"','Cache-Control':'no-store'}});}
 await env.DB!.prepare('DELETE FROM admin_attempts WHERE key=?').bind(limitKey).run();
 const db=env.DB!;
 const daily=await db.prepare('SELECT day, COUNT(*) opens,COUNT(DISTINCT visitor) visitors,(SELECT COUNT(*) FROM usage u WHERE u.day=v.day) users FROM visits v GROUP BY day ORDER BY day DESC LIMIT 30').all();
 const totals=await db.prepare('SELECT COUNT(*) opens, COUNT(DISTINCT visitor) visitors,(SELECT COUNT(DISTINCT visitor) FROM usage) users FROM visits').first();
 const rooms=await db.prepare('SELECT COUNT(*) count FROM rooms WHERE expires>?').bind(Date.now()).first<{count:number}>();
 if(new URL(req.url).pathname==='/api/admin')return json({totals,daily:daily.results,activeRooms:rooms?.count||0});
 const cells=(r:Record<string,unknown>)=>`<tr><td>${r.day}</td><td>${r.opens}</td><td>${r.visitors}</td><td>${r.users}</td></tr>`;
 return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TEN BUT 后台</title><style>body{font:16px system-ui;margin:32px auto;padding:20px;max-width:900px;background:#fff7f5;color:#252324}h1{font-size:36px}.cards{display:flex;flex-wrap:wrap;gap:16px}.card{padding:24px;background:white;border:2px solid;border-radius:20px;flex:1}b{display:block;font-size:38px;color:#7250e8}table{width:100%;border-collapse:collapse;background:white;margin-top:24px}td,th{padding:16px;text-align:left;border-bottom:1px solid #ddd}p{line-height:1.7;color:#625a60}</style><h1>TEN BUT · 数据后台</h1><p>从此版本上线开始统计。按北京时间分日；访客与使用人数按浏览器匿名标识去重，换设备或清理 Cookie 会重新计数，不代表真实人数。未保存昵称、描述、IP 或音频。</p><div class="cards">${[['打开次数',totals?.opens||0],['访客数',totals?.visitors||0],['使用人数',totals?.users||0],['有效房间',rooms?.count||0]].map(([k,v])=>`<div class="card">${k}<b>${v}</b></div>`).join('')}</div><p>打开次数：页面加载。访客数：浏览器去重。使用人数：成功创建或加入房间的访客。有效房间：尚未过期的房间。</p><h2>最近 30 个有访问的日期</h2><table><thead><tr><th>日期</th><th>打开次数</th><th>访客数</th><th>使用人数</th></tr></thead><tbody>${daily.results.map(cells).join('')}</tbody></table><p>刷新页面更新数据。</p></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"}});
}
export async function features(req:Request,env:Env):Promise<Response|null>{
 const url=new URL(req.url),db=env.DB!;
 if(url.pathname==='/admin'||url.pathname==='/api/admin')return admin(req,env);
 if(url.pathname==='/api/visit'&&req.method==='POST'){
  if(req.headers.get('origin')!==url.origin)return json({error:'Forbidden'},403);
  const id=visitor(req)||crypto.randomUUID();
  const event=req.headers.get('x-visit-id')||'';if(!/^[a-f0-9-]{36}$/.test(event))return json({error:'Invalid event'},400);
  await db.prepare('INSERT OR IGNORE INTO visits(id,visitor,day) VALUES (?,?,?)').bind(event,id,day()).run();
  return new Response(null,{status:204,headers:{'Set-Cookie':`tb_visitor=${id}; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax`,'Cache-Control':'no-store'}});
 }
 if(url.pathname==='/api/local-use'&&req.method==='POST'){
  if(req.headers.get('origin')!==url.origin)return json({error:'Forbidden'},403);
  await recordUse(req,db);return json({ok:true});
 }
 if(url.pathname==='/api/voice')return json({error:'实时语音已关闭，请使用文字讨论。'},410);
 if(url.pathname!=='/api/discussion')return null;
 if(req.method!=='POST'||req.headers.get('origin')!==url.origin)return json({error:'Forbidden'},403);
 if(Number(req.headers.get('content-length')||0)>8192)return json({error:'Too large'},413);
 const raw=await req.text();if(raw.length>8192)return json({error:'Too large'},413);
 let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid request'},400);}
 if(!body||typeof body!=='object')return json({error:'Invalid request'},400);
 const row=await db.prepare('SELECT data,expires FROM rooms WHERE code=?').bind(String(body.code)).first<{data:string;expires:number}>();
 if(!row||row.expires<Date.now())return json({error:'房间已过期'},404);
 const room:Room=JSON.parse(row.data);let self;try{self=authenticate(room,req.headers.get('authorization')?.replace(/^Bearer /,'')||null);}catch{return json({error:'请重新加入房间'},401);}
 const round=room.round;if(!round||round.id!==body.round||room.phase!=='results')return json({error:'本轮讨论已结束'},409);
 const now=Date.now();
 if(body.action==='send'){
  await db.prepare('DELETE FROM discussion WHERE created<?').bind(now-86400000).run();
  if(typeof body.text!=='string'||!body.text.trim()||body.text.length>500||!/^[a-f0-9-]{36}$/.test(body.id))return json({error:'讨论内容需要为 1–500 个字。'},400);
  const existing=await db.prepare('SELECT id FROM discussion WHERE request=?').bind(body.id).first();
  if(!existing){
   const latest=await db.prepare('SELECT created FROM discussion WHERE room=? AND player=? ORDER BY id DESC LIMIT 1').bind(room.code,self.id).first<{created:number}>();
   if(latest&&now-latest.created<1000)return json({error:'发送太快，请稍后重试。'},429);
   const count=await db.prepare('SELECT COUNT(*) count FROM discussion WHERE room=? AND round=?').bind(room.code,round.id).first<{count:number}>();
   if((count?.count||0)>=200)return json({error:'本轮讨论已达 200 条。'},429);
   await db.prepare('INSERT OR IGNORE INTO discussion(request,room,round,player,name,text,created) VALUES (?,?,?,?,?,?,?)').bind(body.id,room.code,round.id,self.id,self.name,body.text.trim(),now).run();
  }
 }else if(body.action!=='list')return json({error:'Invalid action'},400);
 const after=Number(body.after);if(!Number.isSafeInteger(after)||after<0)return json({error:'Invalid cursor'},400);
 const messages=await db.prepare('SELECT id,player,name,text,created FROM discussion WHERE room=? AND round=? AND id>? ORDER BY id LIMIT 200').bind(room.code,round.id,after).all();
 await db.prepare('DELETE FROM discussion WHERE created<?').bind(now-86400000).run();
 return json({messages:messages.results});
}

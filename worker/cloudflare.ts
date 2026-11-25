import handler from "vinext/server/fetch-handler";
import {features,featureSchema,recordUse} from './features';

const initialized = new WeakMap<D1Database, Promise<void>>();
function initialize(db: D1Database) {
  let pending = initialized.get(db);
  if (!pending) {
    // Idempotent and safe across concurrent isolates; never replaces room data.
    pending = db.prepare(`CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      version INTEGER DEFAULT 0 NOT NULL,
      expires INTEGER NOT NULL
    )`).run().then(async () => { for(const sql of featureSchema)await db.prepare(sql).run(); }).catch(error => {
      initialized.delete(db);
      throw error;
    });
    initialized.set(db, pending);
  }
  return pending;
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const path=new URL(request.url).pathname;
    if ((path.startsWith('/api/')||path==='/admin') && env.DB) {
      try { await initialize(env.DB); }
      catch {
        return Response.json({ error: "房间服务暂不可用，请稍后重试。" }, {
          status: 503, headers: { "Cache-Control": "no-store" },
        });
      }
    }
    try {
      const extra=await features(request,env);if(extra)return extra;
      const response=await handler.fetch(request, env, ctx);
      if(path==='/api/game'&&request.method==='POST'&&response.ok&&env.DB){
        const data=await response.clone().json() as {session?:unknown};
        if(data.session)ctx.waitUntil(recordUse(request,env.DB).catch(()=>{}));
      }
      return response;
    }catch(error){console.error('feature request failed',error instanceof Error?error.message:'unknown');return Response.json({error:'服务暂不可用，请重试。'},{status:503});}
  },
};

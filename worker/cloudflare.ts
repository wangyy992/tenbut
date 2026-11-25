import handler from "vinext/server/fetch-handler";

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
    )`).run().then(() => undefined).catch(error => {
      initialized.delete(db);
      throw error;
    });
    initialized.set(db, pending);
  }
  return pending;
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/api/game" && env.DB) {
      try { await initialize(env.DB); }
      catch {
        return Response.json({ error: "房间服务暂不可用，请稍后重试。" }, {
          status: 503, headers: { "Cache-Control": "no-store" },
        });
      }
    }
    return handler.fetch(request, env, ctx);
  },
};

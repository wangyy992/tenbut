import { env } from "cloudflare:workers";
import { GameError, act, authenticate, newRoom, player, publicRoom, type Room } from "../../game";

export const dynamic = "force-dynamic";
type Row = { data: string; version: number; expires: number };
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const tokenOf = (req: Request) => req.headers.get("Authorization")?.replace(/^Bearer /, "") || null;
function database() { if (!env.DB) throw new GameError("房间服务暂不可用，请稍后重试。", 503); return env.DB; }
async function load(code: string): Promise<Row> {
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new GameError("房间码应为 6 位字母或数字。");
  const row = await database().prepare("SELECT data, version, expires FROM rooms WHERE code = ?").bind(code).first<Row>();
  if (!row || row.expires < Date.now()) throw new GameError("找不到房间，可能已过期。房间保留 24 小时。", 404);
  return row;
}
function error(e: unknown) {
  if (e instanceof GameError) return reply({ error: e.message }, e.status);
  console.error("game request failed", e instanceof Error ? e.message : "unknown");
  return reply({ error: "连接暂时不稳定，请稍后重试。" }, 503);
}
export async function GET(req: Request) {
  try {
    const code = (new URL(req.url).searchParams.get("code") || "").toUpperCase();
    const row = await load(code); const room: Room = JSON.parse(row.data);
    return reply(publicRoom(room, authenticate(room, tokenOf(req))));
  } catch (e) { return error(e); }
}
export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length") || 0) > 8192) throw new GameError("提交内容过长。", 413);
    const raw = await req.text(); if (raw.length > 8192) throw new GameError("提交内容过长。", 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { throw new GameError("请求格式有误。"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new GameError("请求格式有误。");
    const action = String(body.action);
    const db = database();
    if (action === "create") {
      const owner = player(body.name);
      // Bound abandoned room storage. Room codes and player credentials use Web Crypto.
      await db.prepare("DELETE FROM rooms WHERE expires < ?").bind(Date.now()).run();
      for (let i = 0; i < 6; i++) {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const bytes = crypto.getRandomValues(new Uint8Array(6));
        const code = Array.from(bytes, b => chars[b % chars.length]).join("");
        const room = newRoom(code, owner, body.mode, body.total);
        const result = await db.prepare("INSERT OR IGNORE INTO rooms (code, data, version, expires) VALUES (?, ?, 0, ?)").bind(code, JSON.stringify(room), Date.now() + 86400000).run();
        if (result.meta.changes) return reply({ room: publicRoom(room, owner), session: { code, token: owner.token } });
      }
      throw new GameError("建房有点拥挤，请重试。", 503);
    }
    const code = String(body.code || "").toUpperCase();
    const joining = action === "join" ? player(body.name) : null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const row = await load(code); const room: Room = JSON.parse(row.data);
      const self = joining || authenticate(room, tokenOf(req));
      if (joining) {
        if (room.players.length >= 12) throw new GameError("房间已满，最多 12 人。");
        if (room.players.some(p => p.name === joining.name)) throw new GameError("这个昵称已经有人使用，换一个吧。");
        room.players.push(joining);
      } else act(room, self, action, body);
      const updated = await db.prepare("UPDATE rooms SET data = ?, version = version + 1 WHERE code = ? AND version = ?").bind(JSON.stringify(room), code, row.version).run();
      if (updated.meta.changes) {
        if (action === "leave") return reply({ left: true });
        return reply({ room: publicRoom(room, self), ...(joining ? { session: { code, token: joining.token } } : {}) });
      }
    }
    throw new GameError("大家操作得太快啦，请再试一次。", 409);
  } catch (e) { return error(e); }
}

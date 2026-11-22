import { modes, questions, type Mode } from "./questions";

export type Player = { id: string; token: string; name: string };
export type Round = { number: number; title: string; text: string; voters: string[]; votes: Record<string, number>; revealed: boolean; names: Record<string, string> };
export type Room = { code: string; host: string; players: Player[]; mode: Mode; total: number; phase: "lobby" | "voting" | "results" | "finished"; round: Round | null; history: Round[]; custom: { mode: Mode; text: string }[]; used: string[] };
export class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }
const fail = (message: string): never => { throw new GameError(message); };
export function cleanName(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 16) fail("昵称请填写 1–16 个字。");
  return (value as string).trim();
}
export function player(name: unknown): Player { return { id: crypto.randomUUID(), token: crypto.randomUUID() + crypto.randomUUID(), name: cleanName(name) }; }
export function newRoom(code: string, owner: Player, mode: unknown, total: unknown): Room {
  if (!Object.hasOwn(modes, String(mode))) fail("请选择一种题库。");
  if (![5, 10, 20].includes(Number(total))) fail("局数需要为 5、10 或 20。");
  return { code, host: owner.id, players: [owner], mode: mode as Mode, total: Number(total), phase: "lobby", round: null, history: [], custom: [], used: [] };
}
export function authenticate(room: Room, token: string | null) {
  const p = room.players.find(p => p.token === token);
  if (!p) throw new GameError("你已离开房间，请重新加入。", 401);
  return p;
}
export function publicRoom(room: Room, self: Player) {
  const round = room.round;
  const { custom, used, players, ...safe } = room;
  void used;
  return { ...safe, self: self.id, players: players.map(({ id, name }) => ({ id, name })), customCount: custom.length,
    round: round ? { ...round, votes: round.revealed ? round.votes : {}, submitted: Object.keys(round.votes) } : null };
}
export function settle(room: Room) {
  const r = room.round;
  if (room.phase === "voting" && r && r.voters.length > 0 && r.voters.every(id => Object.hasOwn(r.votes, id))) {
    r.revealed = true; room.phase = "results";
    room.history.push(JSON.parse(JSON.stringify(r)));
  }
}
export function next(room: Room) {
  if (room.phase === "voting") fail("等大家提交评分后再开下一题；有人离线时可在成员列表移出。");
  if (room.phase === "finished") fail("本局已结束，请再来一局。");
  if (room.players.length < 2) fail("至少需要 2 位玩家才能开始。");
  if (room.history.length >= room.total) { room.phase = "finished"; return; }
  const pool = [...questions[room.mode], ...room.custom.filter(q => q.mode === room.mode).map(q => q.text)];
  let available = pool.filter(q => !room.used.includes(q));
  if (!available.length) { room.used = []; available = pool; }
  const nums = new Uint32Array(1); crypto.getRandomValues(nums);
  const text = available[nums[0] % available.length];
  room.used.push(text);
  room.round = { number: room.history.length + 1, title: modes[room.mode].title, text, voters: room.players.map(p => p.id), votes: {}, revealed: false, names: Object.fromEntries(room.players.map(p => [p.id, p.name])) };
  room.phase = "voting";
}
export function act(room: Room, self: Player, action: string, body: Record<string, unknown>) {
  if (["next", "kick", "restart", "settings"].includes(action) && room.host !== self.id) throw new GameError("这个操作需要房主来完成。", 403);
  if (action === "next") next(room);
  else if (action === "vote") {
    const r = room.round;
    if (!r || room.phase !== "voting" || body.round !== r.number) throw new GameError("这道题已经结束了，请刷新当前状态。");
    if (!r.voters.includes(self.id)) fail("你将在下一题加入评分。");
    if (!Number.isInteger(body.score) || Number(body.score) < 0 || Number(body.score) > 10) fail("请选择 0–10 分。");
    if (Object.hasOwn(r.votes, self.id)) fail("你已经提交过评分啦。");
    r.votes[self.id] = Number(body.score); settle(room);
  } else if (action === "custom") {
    if (room.custom.length >= 50) fail("每个房间最多添加 50 道题。");
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 180) fail("题目请填写 1–180 个字，只写「但是」后面的内容。");
    const mode = String(body.mode);
    if (!Object.hasOwn(modes, mode)) fail("请选择题库。");
    if (room.custom.some(q => q.mode === mode && q.text === text)) fail("这道题已经添加过了。");
    room.custom.push({ mode: mode as Mode, text });
  } else if (action === "settings") {
    if (room.phase !== "lobby") fail("开始后无法修改本局设置。");
    const fresh = newRoom(room.code, self, body.mode, body.total);
    room.mode = fresh.mode; room.total = fresh.total;
  } else if (action === "restart") {
    if (room.phase !== "finished") fail("请先玩完本局。");
    room.phase = "lobby"; room.round = null; room.history = []; room.used = [];
  } else if (action === "leave" || action === "kick") {
    const target = action === "leave" ? self.id : String(body.player);
    if (action === "kick" && target === self.id) fail("请使用离开房间。");
    if (!room.players.some(p => p.id === target)) fail("这位玩家已经离开了。");
    room.players = room.players.filter(p => p.id !== target);
    if (room.host === target) room.host = room.players[0]?.id || "";
    if (room.round && room.phase === "voting") {
      room.round.voters = room.round.voters.filter(id => id !== target);
      delete room.round.votes[target]; settle(room);
    }
  } else fail("不支持这个操作。");
}

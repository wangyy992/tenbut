import { modes, questions, type Mode } from "./questions";
import {canonicalScenario} from "./scenario-translations";

export type Player = { id: string; token: string; name: string; wins: number };
export type Round = {
  id: string; number: number; guesser: string; describer: string; names: Record<string,string>;
  title: string; target: number | null; guess: number | null; clue: string; revision: number;
  clueKey?: string | null; suggestions: string[]; matched: boolean; skipped: boolean;
};
export type Room = {
  rules: 2; code: string; host: string; players: Player[]; mode: Mode; total: number;
  phase: "lobby" | "drawing" | "describing" | "guessing" | "results" | "finished";
  round: Round | null; history: Round[]; queue: string[];
};
export class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }
const fail = (message: string): never => { throw new GameError(message); };
export function cleanName(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 16) throw new GameError("昵称请填写 1–16 个字。");
  return value.trim();
}
export function player(name: unknown): Player { return { id: crypto.randomUUID(), token: crypto.randomUUID() + crypto.randomUUID(), name: cleanName(name), wins: 0 }; }
export function newRoom(code: string, owner: Player, mode: unknown, total: unknown): Room {
  if (!Object.hasOwn(modes, String(mode))) fail("请选择一种题库。");
  if (![5, 10, 20].includes(Number(total))) fail("局数需要为 5、10 或 20。");
  return { rules: 2, code, host: owner.id, players: [owner], mode: mode as Mode, total: Number(total), phase: "lobby", round: null, history: [], queue: [] };
}
export function authenticate(room: Room, token: string | null) {
  const p = room.players.find(p => p.token === token);
  if (!p) throw new GameError("你已离开房间，请重新加入。", 401);
  return p;
}
export function publicRoom(room: Room, self: Player) {
  const r = room.round;
  const revealed = room.phase === "results" || room.phase === "finished";
  // Explicit allowlist: the guesser and spectators never receive the secret target or suggestions.
  return {
    rules: room.rules, code: room.code, host: room.host, mode: room.mode, total: room.total, phase: room.phase,
    self: self.id, players: room.players.map(({id,name,wins}) => ({id,name,wins})),
    round: r ? {
      id:r.id, number:r.number, guesser:r.guesser, describer:r.describer, names:r.names, title:r.title,
      target: revealed || self.id === r.describer ? r.target : null,
      guess: revealed ? r.guess : null, clue:r.clue, clueKey:r.clueKey||null, revision:r.revision,
      suggestions: self.id === r.describer && room.phase === "describing" ? r.suggestions : [],
      matched:r.matched, skipped:r.skipped,
    } : null,
    history: room.history.map(({id,number,guesser,describer,names,title,target,guess,clue,clueKey,matched,skipped}) => ({id,number,guesser,describer,names,title,target,guess,clue,clueKey:clueKey||null,matched,skipped})),
  };
}
export type PublicRoom = ReturnType<typeof publicRoom>;
function random(max: number) { return crypto.getRandomValues(new Uint32Array(1))[0] % max; }
const relationshipScores = [2,5,1,9,0,7,7,3,6,8,3,5,7,7,6,5,5,3,4,2,8,9,4,7,3,4,5,5,8,7,8,5,6,9,8,5,4,2,7,8,8,6];
const concertScores = [1,9,2,5,4,7,5,2,6,7,5,4,9,8,3,1,3,8,1,7,5,10,6,7,6,4,6,7,6,5,5,4,9,4,8,6,10,3,7,1];
function suggestions(mode: Mode, target: number) {
  const scores = mode === "concert" ? concertScores : relationshipScores;
  const pool = questions[mode].map((text,i) => ({text,distance:Math.abs((scores[i] ?? 5)-target),salt:random(10000)}));
  pool.sort((a,b)=>a.distance-b.distance || a.salt-b.salt);
  const shortlist=pool.slice(0,Math.max(8,pool.filter(q=>q.distance<=2).length));
  for(let i=shortlist.length-1;i>0;i--){ const j=random(i+1); [shortlist[i],shortlist[j]]=[shortlist[j],shortlist[i]]; }
  return shortlist.slice(0,4).map(q=>q.text);
}
export function next(room: Room) {
  if (room.phase !== "lobby" && room.phase !== "results") fail("请完成本轮的抽牌、描述和猜分。");
  if (room.history.length >= room.total) { room.phase="finished"; return; }
  if (room.players.length < 2) fail("至少需要 2 位玩家才能开始。");
  const ids=room.players.map(p=>p.id);
  room.queue=room.queue.filter(id=>ids.includes(id));
  for(const id of ids) if(!room.queue.includes(id)) room.queue.push(id);
  const guesser=room.queue[0],describer=room.queue[1];
  room.queue.push(room.queue.shift()!);
  room.round={id:crypto.randomUUID(),number:room.history.length+1,guesser,describer,names:Object.fromEntries(room.players.map(p=>[p.id,p.name])),title:modes[room.mode].title,target:null,guess:null,clue:"",revision:0,suggestions:[],matched:false,skipped:false};
  room.phase="drawing";
}
function saveRound(room: Room) {
  room.phase="results";
  const history=JSON.parse(JSON.stringify(room.round)) as Round;
  history.suggestions=[]; room.history.push(history);
}
function roundFor(room: Room, body: Record<string,unknown>) {
  if(!room.round || body.round !== room.round.id) throw new GameError("本轮已经变化，请重试当前操作。",409);
  return room.round;
}
export function act(room: Room, self: Player, action: string, body: Record<string,unknown>) {
  if (["next","kick","restart","settings","skip"].includes(action) && room.host !== self.id) throw new GameError("这个操作需要房主来完成。",403);
  if(action==="next") next(room);
  else if(action==="draw") {
    const r=roundFor(room,body);
    if(room.phase!=="drawing" || r.guesser!==self.id) throw new GameError("只有本轮猜分者可以抽牌。",403);
    r.target=random(11); r.suggestions=suggestions(room.mode,r.target); room.phase="describing";
  } else if(action==="draft" || action==="publish" || action==="suggestions") {
    const r=roundFor(room,body);
    if(room.phase!=="describing" || r.describer!==self.id) throw new GameError("只有本轮描述者可以在描述阶段操作。",403);
    if(action==="suggestions") { r.suggestions=suggestions(room.mode,r.target!); return; }
    if(typeof body.text!=="string" || body.text.length>500) fail("描述最多 500 个字。");
    if(!Number.isInteger(body.revision) || Number(body.revision)<=r.revision) throw new GameError("描述已更新，请等待同步后重试。",409);
    if(action==="publish" && !(body.text as string).trim()) fail("先选择一个情境，或者自己描述吧。");
    r.clue=body.text as string; r.clueKey=canonicalScenario(r.clue); r.revision=Number(body.revision);
    if(action==="publish") room.phase="guessing";
  } else if(action==="guess") {
    const r=roundFor(room,body);
    if(room.phase!=="guessing" || r.guesser!==self.id) throw new GameError("只有本轮猜分者可以在描述结束后猜分。",403);
    if(!Number.isInteger(body.score) || Number(body.score)<0 || Number(body.score)>10) fail("请选择 0–10 分。");
    r.guess=Number(body.score); r.matched=r.guess===r.target;
    if(r.matched) for(const p of room.players) if(p.id===r.guesser || p.id===r.describer) p.wins++;
    saveRound(room);
  } else if(action==="skip") {
    const r=roundFor(room,body);
    if(!["drawing","describing","guessing"].includes(room.phase)) fail("当前没有需要跳过的轮次。");
    r.skipped=true; saveRound(room);
  } else if(action==="settings") {
    if(room.phase!=="lobby") fail("开始后无法修改本局设置。");
    const fresh=newRoom(room.code,self,body.mode,body.total); room.mode=fresh.mode; room.total=fresh.total;
  } else if(action==="restart") {
    if(room.phase!=="finished") fail("请先玩完本局。");
    room.phase="lobby"; room.round=null; room.history=[]; room.queue=[];
    for(const p of room.players) p.wins=0;
  } else if(action==="leave" || action==="kick") {
    const target=action==="leave"?self.id:String(body.player);
    if(action==="kick" && target===self.id) fail("请使用离开房间。");
    if(!room.players.some(p=>p.id===target)) fail("这位玩家已经离开了。");
    room.players=room.players.filter(p=>p.id!==target); room.queue=room.queue.filter(id=>id!==target);
    if(room.host===target) room.host=room.players[0]?.id || "";
    if(room.round && ["drawing","describing","guessing"].includes(room.phase) && [room.round.guesser,room.round.describer].includes(target)) { room.round.skipped=true; saveRound(room); }
  } else fail("不支持这个操作。");
}

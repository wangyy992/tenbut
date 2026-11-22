"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Dices, DoorOpen, Heart, HelpCircle, LoaderCircle, Plus, Radio, RotateCcw, Sparkles, Ticket, Users, X } from "lucide-react";
import { modes, questions, type Mode } from "./questions";

type Session = { code: string; token: string };
type Round = { number: number; title: string; text: string; voters: string[]; votes: Record<string, number>; submitted: string[]; revealed: boolean; names: Record<string, string> };
type Room = { code: string; host: string; self: string; players: { id: string; name: string }[]; mode: Mode; total: number; phase: "lobby" | "voting" | "results" | "finished"; round: Round | null; history: Round[]; customCount: number };
const labels = ["直接归零", "不太能接受", "有点劝退", "得再想想", "有点纠结", "五五开", "可以聊聊", "问题不大", "还是喜欢", "依然心动", "这算什么！"];
const STORAGE = "tenbut-session-v1";
function Icon({ mode }: { mode: Mode }) { return mode === "concert" ? <Ticket size={19}/> : mode === "girl" ? <Heart size={19}/> : <Sparkles size={19}/>; }
function ModePicker({ mode, onChange, disabled = false }: { mode: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  return <div className="mode-picker">{(Object.keys(modes) as Mode[]).map(m => <button type="button" key={m} disabled={disabled} className={`mode ${mode === m ? "selected " + modes[m].color : ""}`} onClick={() => onChange(m)} aria-pressed={mode === m}><Icon mode={m}/>{modes[m].label}</button>)}</div>;
}
async function api(method: string, body: Record<string, unknown> | null, session: Session | null) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api/game" + (method === "GET" ? "?code=" + session?.code : ""), { method, cache: "no-store", headers: { "Content-Type": "application/json", ...(session ? { Authorization: "Bearer " + session.token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
    const data = await response.json() as Room & { error?: string; room?: Room; session?: Session; left?: boolean };
    if (!response.ok) { const err = new Error(data.error || "连接暂时不稳定。"); Object.assign(err, { status: response.status }); throw err; }
    return data;
  } finally { clearTimeout(timer); }
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("girl"); const [total, setTotal] = useState(10);
  const [tab, setTab] = useState("create"); const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [session, setSession] = useState<Session | null>(null); const [room, setRoom] = useState<Room | null>(null);
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const locked = useRef(false); const epoch = useRef(0);
  const [online, setOnline] = useState(true); const [notice, setNotice] = useState("");
  const [help, setHelp] = useState(false); const [customOpen, setCustomOpen] = useState(false); const [customText, setCustomText] = useState("");
  const [customMode, setCustomMode] = useState<Mode>("girl"); const [score, setScore] = useState<number | null>(null);
  const [demo, setDemo] = useState(0); const [confirmLeave, setConfirmLeave] = useState(false); const [kickId, setKickId] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function toast(message: string) { setNotice(message); if (noticeTimer.current) clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(""), 5000); }
  function saveSession(s: Session | null) { setSession(s); try { if (s) localStorage.setItem(STORAGE, JSON.stringify(s)); else localStorage.removeItem(STORAGE); } catch { /* Private browsing can disable storage. */ } }
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(STORAGE) || "null"); if (s?.code && s?.token) setSession(s); const n = localStorage.getItem("tenbut-name"); if (n) setName(n); } catch { /* optional storage */ }
    const invited = new URLSearchParams(location.search).get("room"); if (invited) { setCode(invited.toUpperCase()); setTab("join"); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!session) return;
    let cancelled = false; let running = false;
    const poll = async () => {
      if (running || locked.current || document.hidden) return;
      running = true; const version = epoch.current;
      try {
        const data = await api("GET", null, session);
        if (!cancelled && version === epoch.current) { setRoom(data); setOnline(true); }
      } catch (e) {
        if (!cancelled && version === epoch.current) {
          const status = (e as { status?: number }).status;
          if (status === 401 || status === 404) { saveSession(null); setRoom(null); toast((e as Error).message); }
          else setOnline(false);
        }
      } finally { running = false; }
    };
    poll(); const timer = setInterval(poll, 2000); document.addEventListener("visibilitychange", poll);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [session]);
  useEffect(() => { setScore(null); }, [room?.round?.number, room?.phase]);
  useEffect(() => { if (!help && !customOpen && !confirmLeave && !kickId) return; const close = (e: KeyboardEvent) => { if (e.key === "Escape") { setHelp(false); setCustomOpen(false); setConfirmLeave(false); setKickId(null); } }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [help, customOpen, confirmLeave, kickId]);
  async function action(actionName: string, fields: Record<string, unknown> = {}) {
    if (locked.current) return false;
    locked.current = true; setBusy(true); epoch.current++;
    try {
      const data = await api("POST", { action: actionName, code: session?.code, ...fields }, session);
      if (data.session) { saveSession(data.session); try { localStorage.setItem("tenbut-name", name.trim()); } catch {} }
      if (data.room) { setRoom(data.room); setOnline(true); }
      if (data.left) { saveSession(null); setRoom(null); history.replaceState(null, "", location.pathname); }
      return true;
    } catch (e) { toast((e as Error).name === "AbortError" ? "连接超时，请检查网络后重试。" : (e as Error).message); return false; }
    finally { locked.current = false; setBusy(false); }
  }
  async function share() {
    if (!room) return;
    const url = new URL(location.href); url.search = ""; url.searchParams.set("room", room.code); url.hash = "";
    try { await navigator.clipboard.writeText(url.toString()); toast("邀请链接已复制，发给朋友就能加入。"); } catch { toast("房间码：" + room.code + "。让朋友打开同一网页，输入房间码加入。"); }
  }
  const isHost = room?.self === room?.host;
  const r = room?.round; const submitted = !!r?.submitted?.includes(room?.self || "");
  const eligible = !!r?.voters.includes(room?.self || "");
  const average = r?.revealed && Object.keys(r.votes).length ? Object.values(r.votes).reduce((a, b) => a + b, 0) / Object.keys(r.votes).length : 0;
  const demoText = questions[mode][demo % questions[mode].length];
  const remaining = r?.voters.filter(id => !r.submitted.includes(id)).map(id => r.names[id]).join("、");

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => { if (room) setHelp(true); else window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="满分但是"><span className="brand-symbol">10<span>?</span></span><span>满分，但是<span className="brand-dot">。</span></span></button><div className="header-right"><span className="header-tag">A LITTLE BUT. A LOT TO TALK.</span><button className="icon-button" onClick={() => setHelp(true)} aria-label="怎么玩"><HelpCircle size={21}/></button></div></header>
    {session && !room ? <main className="restoring"><LoaderCircle className="spin" size={32}/><h1>正在回到朋友局…</h1><p>{online ? "找回你的房间和当前进度" : "连接暂时中断，正在重连"}</p><button className="text-button" onClick={() => { epoch.current++; saveSession(null); }}>返回首页</button></main> : !room ? <main className="home-grid">
      <section className="hero"><div className="eyebrow"><span className="mini-star">✷</span> 朋友局 · 观点碰撞小游戏</div><h1>本来是满分<span className="hero-break">但<span className="but-underline">是呢<span>？</span></span></span></h1><p className="hero-description">一点小小的「但是」，<br/>足够让你们的意见分裂。</p><div className="hero-card"><div className="card-label"><span>试阅一题</span><span>{modes[mode].icon}</span></div><p>{modes[mode].title}，<span className="but-word">但是——</span></p><h2 key={mode + demo}>{demoText}</h2><div className="demo-bottom"><span>你还愿意给几分？</span><button onClick={() => setDemo(d => d + 1)} aria-label="换一道试阅题"><Dices size={18}/> 换一题</button></div></div><div className="tiny-note"><span className="hand-star">✳</span> 没有标准答案，只有「这你都能接受？！」</div></section>
      <section className="entry-panel"><div className="panel-heading"><span className="pill">LET’S PLAY</span><span className="entry-spark">✷</span></div><h2>今晚，给几分？</h2><p className="muted">叫上朋友，一起重新定义满分。</p><div className="entry-tabs" role="tablist" aria-label="进入游戏"><button role="tab" aria-selected={tab === "create"} onClick={() => setTab("create")}>开一局</button><button role="tab" aria-selected={tab === "join"} onClick={() => setTab("join")}>加入朋友</button></div><form onSubmit={e => { e.preventDefault(); action(tab === "create" ? "create" : "join", { name, mode, total, ...(tab === "join" ? { code: code.trim().toUpperCase() } : {}) }); }}>
        <label className="field-label" htmlFor="nickname">怎么称呼你</label><input id="nickname" autoComplete="nickname" placeholder="给自己起个昵称" maxLength={16} required value={name} onChange={e => setName(e.target.value)}/>
        {tab === "create" ? <><span className="field-label space-top">今天聊什么</span><ModePicker mode={mode} onChange={m => { setMode(m); setDemo(0); }}/><div className="round-setting"><span>玩几题</span><div>{[5, 10, 20].map(n => <button type="button" key={n} onClick={() => setTotal(n)} className={total === n ? "chosen" : ""} aria-pressed={total === n}>{n} 题</button>)}</div></div></> : <><label className="field-label space-top" htmlFor="room-code">朋友的房间码</label><input id="room-code" className="code-input" placeholder="6 位房间码" autoComplete="off" maxLength={6} minLength={6} required value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))}/><p className="input-hint">让房主把邀请链接或房间码发给你。</p></>}
        <button className="primary full" type="submit" disabled={!ready || busy}>{busy ? <LoaderCircle className="spin" size={20}/> : <>{tab === "create" ? <Dices size={21}/> : <Users size={21}/>} {tab === "create" ? "创建朋友局" : "加入朋友局"}</>}</button></form><div className="entry-footer"><span><Users size={15}/> 2–12 人</span><span><Radio size={15}/> 异地也能玩</span><span>无需注册</span></div></section>
    </main> : <main className="room-layout">
      <section className="room-main"><div className="room-topline"><div className={`category-tag ${modes[room.mode].color}`}><Icon mode={room.mode}/>{modes[room.mode].label}</div><span className="round-counter">{room.phase === "lobby" ? `共 ${room.total} 题` : room.phase === "finished" ? "本局已结束" : `第 ${r?.number} / ${room.total} 题`}</span></div>
        {room.phase === "lobby" ? <div className="lobby-card"><div className="giant-dice">✳</div><span className="eyebrow">GOOD FRIENDS, DIFFERENT TAKES.</span><h1>人齐了就开聊。</h1><p>把邀请链接发给朋友，<br/>看看你们的满分能差多少。</p><button className="invite-code" onClick={share} aria-label="复制房间邀请链接"><span>房间码</span><strong>{room.code}</strong><Copy size={20}/></button><p className="small-note">同一个链接 · 同一道题 · 不同的底线</p>{isHost ? <><div className="lobby-settings"><ModePicker mode={room.mode} disabled={busy} onChange={m => action("settings", { mode: m, total: room.total })}/><div className="round-setting"><span>玩几题</span><div>{[5, 10, 20].map(n => <button disabled={busy} key={n} className={room.total === n ? "chosen" : ""} onClick={() => action("settings", { mode: room.mode, total: n })}>{n} 题</button>)}</div></div></div><button className="primary full" disabled={busy || room.players.length < 2} onClick={() => action("next")}><Dices size={20}/>{room.players.length < 2 ? "等一位朋友加入" : `人齐了，开始抽题（${room.players.length} 人）`}</button></> : <div className="waiting-note"><LoaderCircle className="spin" size={17}/> 等待房主开始游戏</div>}</div> : room.phase === "finished" ? <div className="summary"><span className="pill green">THAT WAS A GOOD TALK.</span><h1>满分各有各的<br/><span>但是很高兴有你。</span></h1><p className="muted">{room.total} 道题，{room.players.length} 位朋友。这次聊得怎么样？</p><div className="summary-stat"><strong>{(room.history.flatMap(h => Object.values(h.votes)).reduce((a, b) => a + b, 0) / (room.history.flatMap(h => Object.values(h.votes)).length || 1)).toFixed(1)}</strong><span>全局平均分 / 10</span></div><h2>本局回顾</h2><div className="history-list">{room.history.map(h => <details key={h.number}><summary><span>{h.number.toString().padStart(2, "0")}</span><p>{h.text}</p><Plus size={18}/></summary><div className="history-votes">{Object.entries(h.votes).map(([id, v]) => <span key={id}>{h.names[id]} <b>{v} 分</b></span>)}</div></details>)}</div>{isHost ? <button className="primary full" disabled={busy} onClick={() => action("restart")}><RotateCcw size={19}/> 再来一局</button> : <p className="waiting-note">等房主开启下一局，或者先离开房间。</p>}</div> : <>
          <article className={`question-card ${room.phase === "results" ? "revealed" : ""}`} key={r?.number}><div className="question-meta"><span>{room.phase === "results" ? "答案揭晓" : "TAKE YOUR TIME"}</span><span className="round-badge">{String(r?.number).padStart(2, "0")}</span></div><h1>{r?.title}，<span>但是——</span></h1><p className="question-text">{r?.text}</p><span className="question-decoration">?</span><div className="question-foot"><span>没有标准答案，凭直觉就好。</span><Sparkles size={20}/></div></article>
          {room.phase === "voting" ? <section className="voting-panel"><div className="vote-title"><h2>{submitted ? "已锁定你的答案" : eligible ? "现在，你还给几分？" : "这题先围观，下一题轮到你"}</h2><span>{r?.submitted.length} / {r?.voters.length} 已提交</span></div>{!submitted && eligible ? <><div className="score-grid">{Array.from({ length: 11 }, (_, n) => <button key={n} disabled={busy} aria-label={`${n} 分`} aria-pressed={score === n} className={score === n ? "active" : ""} onClick={() => setScore(n)}>{n}</button>)}</div><div className="score-legend"><span>完全不行</span><span>还是满分</span></div><div className="submit-score"><span>{score === null ? "选一个最真实的分数" : labels[score]}</span><button className="primary" disabled={busy || score === null} onClick={() => action("vote", { score, round: r?.number })}>{busy ? <LoaderCircle className="spin" size={18}/> : <Check size={18}/>} 锁定评分{score !== null ? ` · ${score}` : ""}</button></div></> : <div className="locked-vote"><span className="check-circle"><Check size={23}/></span><p>{submitted ? "大家交完后，答案一起揭晓。" : "你已加入房间，本题不计入评分。"}<small>正在等：{remaining || "大家提交"}</small></p></div>}</section> : <section className="results-panel"><div className="results-heading"><div><span className="eyebrow">THE VERDICT IS IN</span><h2>{average >= 8 ? "这点但是，拿捏不了你们。" : average <= 3 ? "满分？当场打回重修。" : "果然，满分各有各的标准。"}</h2></div><div className="average"><strong>{average.toFixed(1)}</strong><span>平均分</span></div></div><div className="results-list">{Object.entries(r?.votes || {}).sort((a, b) => b[1] - a[1]).map(([id, value]) => <div className="result-row" key={id}><span className="avatar small">{r?.names[id]?.slice(0, 1)}</span><span className="result-name">{r?.names[id]}{id === room.self && <small>你</small>}</span><div className="result-track"><div style={{ width: value * 10 + "%" }}/></div><strong>{value}<small>/10</small></strong></div>)}</div>{Object.values(r?.votes || {}).length > 1 && <p className="result-comment">{Math.max(...Object.values(r!.votes)) - Math.min(...Object.values(r!.votes)) >= 6 ? "分差这么大，快让最高分和最低分展开说说。" : "先别急着下一题，听听朋友们为什么这么打。"}</p>}{isHost ? <button className="primary full" disabled={busy} onClick={() => action("next")}>{r?.number === room.total ? "看看本局回顾" : "继续，下一道但是"}<Dices size={20}/></button> : <div className="waiting-note"><LoaderCircle className="spin" size={17}/> 等房主开启{r?.number === room.total ? "本局回顾" : "下一题"}</div>}</section>}
        </>}
      </section><aside className="room-sidebar"><div className="room-id"><div><span>朋友局房间码</span><strong>{room.code}</strong></div><button className="icon-button" onClick={share} aria-label="复制邀请链接"><Copy size={20}/></button></div><button className="secondary full" onClick={share}><Users size={18}/> 邀请朋友</button><div className="members-heading"><h2>在场朋友</h2><span>{room.players.length} / 12</span></div><div className="members">{room.players.map((p, i) => <div className="member" key={p.id}><span className={`avatar avatar-${i % 4}`}>{p.name.slice(0, 1)}</span><div className="member-info"><strong>{p.name}{p.id === room.self && <small>你</small>}</strong><span>{p.id === room.host ? "房主" : r && room.phase === "voting" ? !r.voters.includes(p.id) ? "下一题参与" : r.submitted.includes(p.id) ? "已提交" : "思考中" : "已加入"}</span></div>{r && room.phase === "voting" && r.submitted.includes(p.id) ? <Check size={17} className="member-check"/> : null}{isHost && p.id !== room.self && <button className="remove-member" onClick={() => setKickId(p.id)} aria-label={`移出 ${p.name}`}><X size={15}/></button>}</div>)}</div><div className="sidebar-divider"/><button className="custom-button" onClick={() => { setCustomMode(room.mode); setCustomOpen(true); }}><Plus size={20}/><span>往题库里加点料<small>已添加 {room.customCount} 道自定义题</small></span></button><p className="sidebar-tip">{isHost ? "房主小提示：有人临时离线？可以点昵称旁的 × 移出，评分就不会卡住。" : "小提示：中途加入会从下一题开始评分。刷新网页也能回到这间房。"}</p><button className="leave-button" onClick={() => setConfirmLeave(true)}><DoorOpen size={17}/> 离开朋友局</button><span className={`connection ${online ? "" : "offline"}`}><span/>{online ? "每 2 秒同步 · 房间保留 24 小时" : "连接中断，正在自动重连…"}</span></aside>
    </main>}
    <footer className="page-footer"><span>满分，但是。<span className="footer-heart">✳</span> 为那些聊不完的朋友局</span><button onClick={() => setHelp(true)}>游戏规则 <ArrowUpRight size={14}/></button></footer>
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="关闭提示"><X size={16}/></button></div>}
    {(help || customOpen || confirmLeave || kickId) && <div className="modal-overlay" onClick={() => { setHelp(false); setCustomOpen(false); setConfirmLeave(false); setKickId(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button autoFocus className="modal-close icon-button" aria-label="关闭窗口" onClick={() => { setHelp(false); setCustomOpen(false); setConfirmLeave(false); setKickId(null); }}><X size={22}/></button>{help ? <><span className="eyebrow">HOW TO PLAY</span><h2 id="modal-title">满分的 TA，多了一个但是。</h2><p>想象一个其他方面完全符合你理想的女生、男生，或者一场完美的追星线下。抽到的「但是」出现以后，你还愿意给几分？</p><ol className="rules"><li><strong>开一局，发给朋友。</strong><span>选题库，用房间码或邀请链接加入，2–12 人就能开玩。</span></li><li><strong>各自打分，先别偷看。</strong><span>每道题给 0–10 分，0 分完全不行，10 分依然满分。提交后无法修改。</span></li><li><strong>一起揭晓，展开聊聊。</strong><span>所有参与本题的人提交后自动揭晓。没有输赢，分歧就是聊天的开始。</span></li></ol><p className="fine-print">仅供朋友间的虚构情境讨论。昵称和评分会对房间成员展示；请不要在自定义题中填写他人隐私。房间 24 小时后过期并在后续建房时清理。记住房间码，刷新后可以继续；更换设备需要重新加入。</p><button className="primary full" onClick={() => setHelp(false)}>懂了，开聊！</button></> : customOpen ? <><span className="eyebrow">YOUR BUT, YOUR RULES.</span><h2 id="modal-title">这一道，你来出。</h2><p className="muted">只写「但是」后面的内容，加入对应题库后随机抽取。</p><ModePicker mode={customMode} onChange={setCustomMode}/><label className="field-label space-top" htmlFor="custom-question">{modes[customMode].title}，但是——</label><textarea id="custom-question" rows={4} maxLength={180} placeholder="例如：本命记住了你，但记住的是你上次喊破音。" value={customText} onChange={e => setCustomText(e.target.value)}/><div className="text-count">{customText.length} / 180</div><button className="primary full" disabled={busy || !customText.trim()} onClick={async () => { if (await action("custom", { mode: customMode, text: customText })) { setCustomText(""); setCustomOpen(false); toast("已加入题库，接下来的抽题可能抽到它！"); } }}><Plus size={19}/> 加入题库</button></> : <><h2 id="modal-title">{kickId ? `移出 ${room?.players.find(p => p.id === kickId)?.name}？` : "要先离开这局吗？"}</h2><p>{kickId ? "TA 本题的评分将不计入，可以用房间码重新加入，下一题继续参与。" : isHost ? "房主会自动交给下一位朋友。你可以重新输入房间码加入。" : "你本题的评分将不计入，朋友们可以继续游戏。"}</p><div className="modal-actions"><button className="secondary" onClick={() => { setConfirmLeave(false); setKickId(null); }}>再待一会</button><button className="primary" disabled={busy} onClick={async () => { if (await action(kickId ? "kick" : "leave", kickId ? { player: kickId } : {})) { setConfirmLeave(false); setKickId(null); } }}>{kickId ? "确认移出" : "离开房间"}</button></div></>}</section></div>}
  </div>;
}

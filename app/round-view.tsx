"use client";
import {useEffect,useRef,useState} from 'react';
import {Check,Dices,LoaderCircle,Mic,RefreshCw,Square,Sparkles} from 'lucide-react';
import type {PublicRoom} from './game';
import {post,type Session} from './client-api';
import {useSpeech} from './use-speech';
type Props={room:PublicRoom;session:Session;busy:boolean;onAction:(action:string,fields?:Record<string,unknown>)=>Promise<boolean>;toast:(text:string)=>void};
export default function RoundView({room,session,busy,onAction,toast}:Props){
 const r=room.round!;const isGuesser=room.self===r.guesser,isDescriber=room.self===r.describer;
 const [text,setText]=useState(r.clue),[score,setScore]=useState<number|null>(null),[syncStatus,setSyncStatus]=useState('已同步');
 const [publishing,setPublishing]=useState(false),[confirmSkip,setConfirmSkip]=useState(false);
 const draft=useRef(r.clue),saved=useRef(r.clue),revision=useRef(r.revision),chain=useRef<Promise<unknown>>(Promise.resolve()),active=useRef(true),saving=useRef(false),publishingRef=useRef(false);
 const updateText=(value:string)=>{draft.current=value;setText(value);setSyncStatus('待同步');};
 const speech=useSpeech(updateText,toast);
 const requestRef=useRef({session,round:r.id});requestRef.current={session,round:r.id};
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 function save(value:string){
  const rev=Math.max(Date.now(),revision.current+1);revision.current=rev;
  const request=requestRef.current;
  const task=chain.current.catch(()=>{}).then(()=>post('draft',{round:request.round,text:value,revision:rev},request.session));
  chain.current=task;return task;
 }
 useEffect(()=>{
  if(!isDescriber || room.phase!=='describing')return;
  const timer=setInterval(async()=>{
   if(saving.current||publishingRef.current||draft.current===saved.current)return;
   saving.current=true;const current=draft.current;setSyncStatus('同步中…');
   try{await save(current);saved.current=current;if(active.current)setSyncStatus(current===draft.current?'已同步':'待同步');}
   catch{if(active.current)setSyncStatus('同步失败，正在重试');}
   finally{saving.current=false;}
  },800);
  return()=>clearInterval(timer);
 },[isDescriber,room.phase]);
 useEffect(()=>{if(room.phase!=='describing')speech.stop();},[room.phase]);
 async function publish(){
  if(publishingRef.current)return;publishingRef.current=true;setPublishing(true);speech.stop();
  try{await chain.current.catch(()=>{});const rev=Math.max(Date.now(),revision.current+1);revision.current=rev;await onAction('publish',{round:r.id,text:draft.current,revision:rev});}
  finally{publishingRef.current=false;if(active.current)setPublishing(false);}
 }
 const stage=room.phase==='drawing'?'盲抽分数':room.phase==='describing'?'描述情境':room.phase==='guessing'?'猜猜几分':'翻牌揭晓';
 return <>
  <div className="turn-roles"><span className={isGuesser?'role-chip mine':'role-chip'}><b>A</b>{r.names[r.guesser]}<small>猜分{isGuesser?' · 你':''}</small></span><span className={isDescriber?'role-chip mine':'role-chip'}><b>B</b>{r.names[r.describer]}<small>描述{isDescriber?' · 你':''}</small></span></div>
  <div className="steps" aria-label="本轮进度">{['盲抽分数','描述情境','猜猜几分','翻牌揭晓'].map((s,i)=><span key={s} className={s===stage?'current':''}><b>{i+1}</b>{s}</span>)}</div>
  {room.phase==='drawing'?<section className="blind-stage"><button className="blind-card" disabled={!isGuesser||busy} onClick={()=>onAction('draw',{round:r.id})} aria-label="抽取隐藏分数牌"><span>满分，但是。</span><strong>?</strong><small>{isGuesser?'点击盲抽一张分数牌':'等待 A 抽牌'}</small></button><h1>{isGuesser?'抽一张，别偷看。':`等 ${r.names[r.guesser]} 抽一张分数牌。`}</h1><p>{isGuesser?`你看不到牌面，只有描述者 ${r.names[r.describer]} 能看到。`:'分数随机从 0–10 中抽取。A 看不到，B 才能看见。'}</p>{isGuesser&&<button className="primary" disabled={busy} onClick={()=>onAction('draw',{round:r.id})}><Dices size={20}/>抽取隐藏分数</button>}</section>:room.phase==='results'?<section className="guess-results"><span className={`pill ${r.matched?'green':''}`}>{r.skipped?'本轮已跳过':r.matched?'默契对上了！':'差一点就懂你！'}</span><h1>{r.skipped?'这题先放一放。':r.matched?'你真的懂我的「但是」。':'原来你心里是这个分数。'}</h1><div className="reveal-scores"><div><span>抽到的分数</span><strong>{r.target??'—'}</strong></div><span className="score-equals">{r.skipped?'·':r.matched?'=':'≠'}</span><div><span>A 猜的分数</span><strong>{r.guess??'—'}</strong></div></div>{r.clue&&<blockquote><span>{r.title}，但是——</span>{r.clue}</blockquote>}<p>{r.skipped?'描述者或猜分者离开，或由房主跳过；本轮不计猜中。':r.matched?'两个人都记 1 次默契命中。下一轮交换一下角色吧。':`差了 ${Math.abs(r.target!-r.guess!)} 分。聊聊你为什么觉得是 ${r.guess} 分？`}</p>{room.host===room.self?<button className="primary full" disabled={busy} onClick={()=>onAction('next')}><Dices size={20}/>{r.number===room.total?'查看本局默契回顾':'下一轮，换人猜'}</button>:<p className="waiting-note">等房主开启{r.number===room.total?'本局回顾':'下一轮'}</p>}</section>:<>
   {isDescriber?<div className="secret-target"><span>仅你可见的目标分数</span><strong>{r.target}<small>/10</small></strong><p>你要让 {r.names[r.guesser]} 猜到这个数字。不要直接说出分数。</p></div>:<div className="hidden-target"><span className="hidden-score">?</span><div><strong>{isGuesser?'你的分数牌已抽好，暂时保密。':'分数只对本轮描述者展示。'}</strong><p>{room.phase==='describing'?`听听 ${r.names[r.describer]} 怎么描述。`:'描述已经锁定，等待 A 猜分。'}</p></div></div>}
   {room.phase==='describing'&&isDescriber?<section className="description-editor"><div className="section-heading"><h2>想想 TA 会觉得什么值 {r.target} 分？</h2><button className="text-button" disabled={busy||publishing} onClick={()=>onAction('suggestions',{round:r.id})}><RefreshCw size={15}/> 换几个灵感</button></div><p className="muted">这些只是灵感，没有标准答案。选一个改改，或直接自己写。</p><div className="suggestion-grid">{r.suggestions.map(q=><button key={q} disabled={publishing||speech.listening||speech.starting} onClick={()=>updateText(q)} className={text===q?'picked':''}>{q}{text===q&&<Check size={16}/>}</button>)}</div><label className="field-label space-top" htmlFor="clue">{r.title}，但是——</label><textarea id="clue" rows={4} maxLength={500} disabled={publishing||speech.listening||speech.starting} placeholder="自己描述一个情境，也可以用语音输入…" value={text} onChange={e=>updateText(e.target.value)}/><div className="draft-meta"><span role="status">{syncStatus} · A 能看到你的描述草稿</span><span>{text.length}/500</span></div><div className="speech-actions"><button className={`secondary ${speech.listening?'recording':''}`} disabled={!speech.supported||publishing} onClick={()=>speech.listening||speech.starting?speech.stop():speech.start(draft.current)}>{speech.listening||speech.starting?<Square size={16}/>:<Mic size={18}/>} {speech.starting?'取消启动':speech.listening?'停止转字':'说话转成文字'}</button><span>{speech.listening?'正在听，说话会转成文字同步…':speech.supported?'文字同步给朋友，不传送语音通话音频。':'此浏览器不支持转字，可打字或用键盘语音输入。'}</span></div><p className="speech-privacy">点击后由浏览器申请麦克风权限，语音可能交由浏览器的在线识别服务处理。本站仅保存房间内的文字描述。</p><button className="primary full" disabled={publishing||busy||!text.trim()} onClick={publish}>{publishing?<LoaderCircle className="spin" size={18}/>:<Check size={19}/>}描述好了，让 A 猜分</button></section>:<section className={`question-card ${room.phase==='guessing'?'ready-to-guess':''}`}><div className="question-meta"><span>{room.phase==='describing'?'描述正在同步…':'描述已锁定'}</span><Sparkles size={19}/></div><h1>{r.title}，<span>但是——</span></h1><p className={`question-text ${!r.clue?'placeholder-clue':''}`}>{r.clue||`${r.names[r.describer]} 正在组织语言…`}</p><div className="question-foot">{room.phase==='describing'?'对方说完并确认后，你就可以猜分。':'凭你的直觉，这个情境会对应几分？'}</div></section>}
   {room.phase==='guessing'&&(isGuesser?<section className="voting-panel"><div className="vote-title"><h2>我猜你抽到的是…</h2><span>猜中相同数字就算对</span></div><div className="score-grid">{Array.from({length:11},(_,i)=><button key={i} disabled={busy} className={score===i?'active':''} aria-label={`猜 ${i} 分`} aria-pressed={score===i} onClick={()=>setScore(i)}>{i}</button>)}</div><div className="score-legend"><span>完全不行</span><span>依然满分</span></div><div className="submit-score"><span>{score===null?'选好以后就能翻牌验证':`我的答案：${score} 分`}</span><button className="primary" disabled={score===null||busy} onClick={()=>onAction('guess',{round:r.id,score})}><Check size={18}/>确认猜分，翻牌！</button></div></section>:<div className="waiting-note"><LoaderCircle className="spin" size={17}/>等 {r.names[r.guesser]} 猜一个分数</div>)}
  </>}
  {room.host===room.self&&['drawing','describing','guessing'].includes(room.phase)&&<div className="skip-round">{confirmSkip?<><span>本轮会计为跳过，不计猜中。</span><button onClick={()=>setConfirmSkip(false)}>取消</button><button disabled={busy} onClick={()=>onAction('skip',{round:r.id})}>确认跳过</button></>:<button onClick={()=>setConfirmSkip(true)}>有人暂时不在？跳过本轮</button>}</div>}
 </>;
}

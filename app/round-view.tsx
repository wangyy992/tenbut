"use client";
import {useEffect,useRef,useState} from 'react';
import {Check,Dices,LoaderCircle,Mic,RefreshCw,Square,Sparkles} from 'lucide-react';
import type {PublicRoom} from './game';
import {post,type Session} from './client-api';
import {useSpeech} from './use-speech';
import {useI18n,speechLocales} from './i18n';
import {scenarioText} from './scenario-translations';
type Props={room:PublicRoom;session:Session;busy:boolean;onAction:(action:string,fields?:Record<string,unknown>)=>Promise<boolean>;toast:(text:string)=>void};
export default function RoundView({room,session,busy,onAction,toast}:Props){
 const {lang,t}=useI18n();
 const r=room.round!;const isGuesser=room.self===r.guesser,isDescriber=room.self===r.describer;
 const [text,setText]=useState(r.clue),[score,setScore]=useState<number|null>(null),[syncStatus,setSyncStatus]=useState('已同步');
 const [publishing,setPublishing]=useState(false),[confirmSkip,setConfirmSkip]=useState(false);
 const draft=useRef(r.clue),saved=useRef(r.clue),revision=useRef(r.revision),chain=useRef<Promise<unknown>>(Promise.resolve()),active=useRef(true),saving=useRef(false),publishingRef=useRef(false);
 const updateText=(value:string)=>{draft.current=value;setText(value);setSyncStatus('待同步');};
 const speech=useSpeech(updateText,toast,speechLocales[lang]);
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
 const stage=room.phase==='drawing'?t("盲抽分数"):room.phase==='describing'?t("描述情境"):room.phase==='guessing'?t("猜猜几分"):t("翻牌揭晓");
 return <>
  <div className="turn-roles"><span className={isGuesser?'role-chip mine':'role-chip'}><b>A</b>{r.names[r.guesser]}<small>{t("猜分")}{isGuesser?t(" · 你"):''}</small></span><span className={isDescriber?'role-chip mine':'role-chip'}><b>B</b>{r.names[r.describer]}<small>{t("描述")}{isDescriber?t(" · 你"):''}</small></span></div>
  <div className="steps" aria-label={t("本轮进度")}>{[t("盲抽分数"),t("描述情境"),t("猜猜几分"),t("翻牌揭晓")].map((s,i)=><span key={s} className={s===stage?'current':''}><b>{i+1}</b>{s}</span>)}</div>
  {room.phase==='drawing'?<section className="blind-stage"><button className="blind-card" disabled={!isGuesser||busy} onClick={()=>onAction('draw',{round:r.id})} aria-label={t("抽取隐藏分数牌")}><span>{t("满分，但是。")}</span><strong>?</strong><small>{isGuesser?t("点击盲抽一张分数牌"):t("等待 A 抽牌")}</small></button><h1>{isGuesser?t("抽一张，别偷看。"):t("等 {0} 抽一张分数牌。",[r.names[r.guesser]])}</h1><p>{isGuesser?t("你看不到牌面，只有描述者 {0} 能看到。",[r.names[r.describer]]):t("分数随机从 0–10 中抽取。A 看不到，B 才能看见。")}</p>{isGuesser&&<button className="primary" disabled={busy} onClick={()=>onAction('draw',{round:r.id})}><Dices size={20}/>{t("抽取隐藏分数")}</button>}</section>:room.phase==='results'?<section className="guess-results"><span className={`pill ${r.matched?'green':''}`}>{r.skipped?t("本轮已跳过"):r.matched?t("默契对上了！"):t("差一点就懂你！")}</span><h1>{r.skipped?t("这题先放一放。"):r.matched?t("你真的懂我的「但是」。"):t("原来你心里是这个分数。")}</h1><div className="reveal-scores"><div><span>{t("抽到的分数")}</span><strong>{r.target??'—'}</strong></div><span className="score-equals">{r.skipped?'·':r.matched?'=':'≠'}</span><div><span>{t("A 猜的分数")}</span><strong>{r.guess??'—'}</strong></div></div>{r.clue&&<blockquote><span>{t(r.title)}{t("，但是——")}</span>{scenarioText(lang,r.clueKey||r.clue)}</blockquote>}<p>{r.skipped?t("描述者或猜分者离开，或由房主跳过；本轮不计猜中。"):r.matched?t("两个人都记 1 次默契命中。下一轮交换一下角色吧。"):t("差了 {0} 分。聊聊你为什么觉得是 {1} 分？",[Math.abs(r.target!-r.guess!),r.guess])}</p>{room.host===room.self?<button className="primary full" disabled={busy} onClick={()=>onAction('next')}><Dices size={20}/>{r.number===room.total?t("查看本局默契回顾"):t("下一轮，换人猜")}</button>:<p className="waiting-note">{t("等房主开启")}{r.number===room.total?t("本局回顾"):t("下一轮")}</p>}</section>:<>
   {isDescriber?<div className="secret-target"><span>{t("仅你可见的目标分数")}</span><strong>{r.target}<small>/10</small></strong><p>{t('让 {0} 猜到这个数字，不要直接说出分数。',[r.names[r.guesser]])}</p></div>:<div className="hidden-target"><span className="hidden-score">?</span><div><strong>{isGuesser?t("你的分数牌已抽好，暂时保密。"):t("分数只对本轮描述者展示。")}</strong><p>{room.phase==='describing'?t("听听 {0} 怎么描述。",[r.names[r.describer]]):t("描述已经锁定，等待 A 猜分。")}</p></div></div>}
   {room.phase==='describing'&&isDescriber?<section className="description-editor"><div className="section-heading"><h2>{t('什么情境会让 TA 觉得值 {0} 分？',[r.target])}</h2><button className="text-button" disabled={busy||publishing} onClick={()=>onAction('suggestions',{round:r.id})}><RefreshCw size={15}/> {t("换几个灵感")}</button></div><p className="muted">{t("这些只是灵感，没有标准答案。选一个改改，或直接自己写。")}</p><div className="suggestion-grid">{r.suggestions.map(q=><button key={q} disabled={publishing||speech.listening||speech.starting} onClick={()=>updateText(scenarioText(lang,q))} className={text===scenarioText(lang,q)?'picked':''}>{scenarioText(lang,q)}{text===scenarioText(lang,q)&&<Check size={16}/>}</button>)}</div><label className="field-label space-top" htmlFor="clue">{t(r.title)}{t("，但是——")}</label><textarea id="clue" rows={4} maxLength={500} disabled={publishing||speech.listening||speech.starting} placeholder={t("自己描述一个情境，也可以用语音输入…")} value={text} onChange={e=>updateText(e.target.value)}/><div className="draft-meta"><span role="status">{t(syncStatus)} · {t('A 能看到你的描述草稿')}</span><span>{text.length}/500</span></div><div className="speech-actions"><button className={`secondary ${speech.listening?'recording':''}`} disabled={!speech.supported||publishing} onClick={()=>speech.listening||speech.starting?speech.stop():speech.start(draft.current)}>{speech.listening||speech.starting?<Square size={16}/>:<Mic size={18}/>} {speech.starting?t("取消启动"):speech.listening?t("停止转字"):t("说话转成文字")}</button><span>{speech.listening?t("正在听，说话会转成文字同步…"):speech.supported?t("文字同步给朋友，不传送语音通话音频。"):t("此浏览器不支持转字，可打字或用键盘语音输入。")}</span></div><p className="custom-language-note">{t('系统情境会按各自语言显示；自定义和语音描述保留原文，不会自动翻译。')}</p><p className="speech-privacy">{t("点击后由浏览器申请麦克风权限，语音可能交由浏览器的在线识别服务处理。本站仅保存房间内的文字描述。")}</p><button className="primary full" disabled={publishing||busy||!text.trim()} onClick={publish}>{publishing?<LoaderCircle className="spin" size={18}/>:<Check size={19}/>}{t("描述好了，让 A 猜分")}</button></section>:<section className={`question-card ${room.phase==='guessing'?'ready-to-guess':''}`}><div className="question-meta"><span>{room.phase==='describing'?t("描述正在同步…"):t("描述已锁定")}</span><Sparkles size={19}/></div><h1>{t(r.title)}，<span>{t("但是——")}</span></h1><p className={`question-text ${!r.clue?'placeholder-clue':''}`}>{r.clue?scenarioText(lang,r.clueKey||r.clue):t("{0} 正在组织语言…",[r.names[r.describer]])}</p><div className="question-foot">{room.phase==='describing'?t("对方说完并确认后，你就可以猜分。"):t("凭你的直觉，这个情境会对应几分？")}</div></section>}
   {room.phase==='guessing'&&(isGuesser?<section className="voting-panel"><div className="vote-title"><h2>{t("我猜你抽到的是…")}</h2><span>{t("猜中相同数字就算对")}</span></div><div className="score-grid">{Array.from({length:11},(_,i)=><button key={i} disabled={busy} className={score===i?'active':''} aria-label={t("猜 {0} 分",[i])} aria-pressed={score===i} onClick={()=>setScore(i)}>{i}</button>)}</div><div className="score-legend"><span>{t("完全不行")}</span><span>{t("依然满分")}</span></div><div className="submit-score"><span>{score===null?t("选好以后就能翻牌验证"):t("我的答案：{0} 分",[score])}</span><button className="primary" disabled={score===null||busy} onClick={()=>onAction('guess',{round:r.id,score})}><Check size={18}/>{t("确认猜分，翻牌！")}</button></div></section>:<div className="waiting-note"><LoaderCircle className="spin" size={17}/>{t('等待 {0} 猜一个分数',[r.names[r.guesser]])}</div>)}
  </>}
  {!isDescriber&&r.clue&&!r.clueKey&&<p className="custom-language-note">{t('系统情境会按各自语言显示；自定义和语音描述保留原文，不会自动翻译。')}</p>}
  {room.host===room.self&&['drawing','describing','guessing'].includes(room.phase)&&<div className="skip-round">{confirmSkip?<><span>{t("本轮会计为跳过，不计猜中。")}</span><button onClick={()=>setConfirmSkip(false)}>{t("取消")}</button><button disabled={busy} onClick={()=>onAction('skip',{round:r.id})}>{t("确认跳过")}</button></>:<button onClick={()=>setConfirmSkip(true)}>{t("有人暂时不在？跳过本轮")}</button>}</div>}
 </>;
}

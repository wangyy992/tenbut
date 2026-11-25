"use client";
import {useEffect,useReducer,useState} from 'react';
import {initialLocal,localGame} from './local-game';
import {modes,questions,type Mode} from './questions';
import {useI18n,languageNames,type Lang} from './i18n';
import {scenarioText} from './scenario-translations';
const copy:Record<string,[string,string,string]>={
 '面对面':['Face to face','対面で遊ぶ','대면 플레이'],
 '线上联机':['Online rooms','オンライン','온라인 플레이'],
 '同一台手机，轮流传着玩':['Pass one phone around','1台のスマホを順番に回して遊ぶ','휴대폰 한 대를 돌아가며 플레이'],
 '玩家昵称（每行一个，2–12 人）':['Player names (one per line, 2–12 players)','参加者の名前（1行1人、2〜12人）','플레이어 이름 (한 줄에 한 명, 2–12명)'],
 '请输入不同的昵称，每个最多16字':['Use unique names, up to 16 characters each','重複しない名前を16文字以内で入力','각각 다른 이름을 16자 이내로 입력하세요'],
 '开始面对面':['Start face-to-face game','対面ゲームを開始','대면 게임 시작'],
 '把手机交给 {0}':['Pass the phone to {0}','{0}にスマホを渡す','{0}에게 휴대폰을 건네세요'],
 '我是 {0}，查看分数':['I am {0}. Reveal the score','{0}です。点数を見る','저는 {0}입니다. 점수 보기'],
 '我是 {0}，开始猜分':['I am {0}. Ready to guess','{0}です。点数を予想する','저는 {0}입니다. 점수 맞히기'],
 '分数已隐藏，请不要让猜分者提前看牌':['The score is hidden. Keep it secret from the guesser','点数は非表示です。予想する人に見せないでください','점수가 가려졌어요. 맞히는 사람에게 미리 보여 주지 마세요'],
 '只有描述者看这一页':['Only the describer should see this page','このページは説明役だけが見てください','이 화면은 설명하는 사람만 보세요'],
 '根据分数，口头描述一个情境。也可以选灵感或写下来。':['Describe a scenario for this score aloud. Or select an idea or write it down.','この点数に合う場面を口頭で説明。候補を選ぶか入力もできます。','이 점수에 맞는 상황을 말해 주세요. 예시를 고르거나 직접 입력해도 돼요.'],
 '隐藏分数，把手机交回猜分者':['Hide score and pass back to guesser','点数を隠して予想役に返す','점수를 숨기고 맞히는 사람에게 돌려주기'],
 '可以直接口头描述，不必输入文字':['You can speak aloud without typing','入力せず口頭で説明してもOK','입력하지 않고 말로 설명해도 돼요'],
 '听完描述，凭直觉选一个分数':['Listen to the clue, then choose your score','説明を聞いて直感で点数を選ぶ','설명을 듣고 직감으로 점수를 고르세요'],
 '隐藏画面':['Hide screen','画面を隠す','화면 가리기'],
 '点击继续查看':['Tap to continue viewing','タップして表示を再開','탭해서 계속 보기'],
 '结束本局并返回？':['End this game and return?','このゲームを終了して戻りますか？','게임을 끝내고 돌아갈까요?'],
 '返回玩法选择':['Choose play mode','遊び方の選択に戻る','플레이 방식 선택으로'],
 '本机游玩，不创建线上房间；刷新会重开。':['Plays on this device without an online room. Refreshing resets the game.','オンライン部屋は作りません。再読み込みでリセットされます。','온라인 방 없이 이 기기에서 플레이합니다. 새로고침하면 초기화돼요.'],
 '面对面直接说话即可，不需要开启麦克风。':['Speak in person; no microphone access needed.','その場で話すのでマイクの許可は不要です。','직접 이야기하면 돼요. 마이크 권한은 필요 없어요.'],
 '正在传手机，分数不会显示在这一页。':['Passing the phone. This page does not show the score.','スマホを渡す画面です。点数は表示されません。','휴대폰 전달 중. 이 화면에는 점수가 표시되지 않아요.']
};
export function useLocalText(){const {lang,t}=useI18n();return (s:string,args:unknown[]=[])=>{const row=copy[s];if(lang==='zh'||!row)return t(s,args);return row[{en:0,ja:1,ko:2}[lang]].replace(/\{(\d+)\}/g,(_,n)=>String(args[+n]??''));};}
export function PlayChoice({onFace}:{onFace:()=>void}){const t=useLocalText();return <nav className="play-choice" aria-label={t('面对面')}><button className="selected" aria-pressed="true">🌐 {t('线上联机')}</button><button onClick={onFace}>🤝 {t('面对面')}</button></nav>;}
export default function FaceToFace({onExit}:{onExit:()=>void}){
 const {lang,setLang}=useI18n(),t=useLocalText();const [s,dispatch]=useReducer(localGame,initialLocal);
 const [names,setNames]=useState(''),[mode,setMode]=useState<Mode>('boy'),[total,setTotal]=useState(5),[clue,setClue]=useState(''),[selected,setSelected]=useState<number|null>(null),[ideas,setIdeas]=useState<string[]>([]),[covered,setCovered]=useState(false),[error,setError]=useState('');
 const a=s.names[s.index%s.names.length],b=s.names[(s.index+1)%s.names.length];
 useEffect(()=>{const hide=()=>{if(document.hidden)setCovered(true);};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
 function shuffle(){const pool=[...questions[mode]];for(let i=pool.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}setIdeas(pool.slice(0,4));}
 function start(){const clean=names.split('\n').map(n=>n.trim()).filter(Boolean);if(clean.length<2||clean.length>12||clean.some(n=>n.length>16)||new Set(clean).size!==clean.length){setError(t('请输入不同的昵称，每个最多16字'));return;}setError('');dispatch({type:'start',names:clean,total});fetch('/api/local-use',{method:'POST'}).catch(()=>{});}
 function exit(){if(s.phase==='setup'||s.phase==='finished'||window.confirm(t('结束本局并返回？')))onExit();}
 const handoff=s.phase==='pass-a'||s.phase==='pass-b';
 return <div className="app-shell local-shell"><header className="topbar"><span className="brand">TEN BUT · {t('面对面')}</span><select aria-label="Language" value={lang} onChange={e=>setLang(e.target.value as Lang)}>{(Object.keys(languageNames) as Lang[]).map(l=><option value={l} key={l}>{languageNames[l]}</option>)}</select></header><main className="local-panel">
 {covered?<section className="local-cover"><span>🔒</span><h1>{t('隐藏画面')}</h1><button className="primary" onClick={()=>setCovered(false)}>{t('点击继续查看')}</button></section>:<>
 <div className="local-top"><span className="pill">🤝 {t('同一台手机，轮流传着玩')}</span>{s.phase!=='setup'&&s.phase!=='finished'&&<span>{t('第 {0} / {1} 轮',[s.index+1,s.total])}</span>}</div>
 {s.phase==='setup'?<section><h1>{t('面对面')}</h1><p>{t('本机游玩，不创建线上房间；刷新会重开。')}</p><label className="field-label" htmlFor="local-names">{t('玩家昵称（每行一个，2–12 人）')}</label><textarea id="local-names" rows={4} value={names} maxLength={204} onChange={e=>setNames(e.target.value)}/><span className="field-label space-top">{t('今天聊什么')}</span><div className="mode-picker">{(Object.keys(modes) as Mode[]).map(m=><button key={m} className={`mode ${mode===m?'selected '+modes[m].color:''}`} aria-pressed={mode===m} onClick={()=>setMode(m)}>{t(modes[m].label)}</button>)}</div><div className="round-setting"><span>{t('玩几轮')}</span><div>{[5,10,20].map(n=><button key={n} className={n===total?'chosen':''} onClick={()=>setTotal(n)}>{n}</button>)}</div></div>{error&&<p role="alert">{error}</p>}<button className="primary full" onClick={start}>{t('开始面对面')}</button></section>:
 s.phase==='draw'?<section className="local-stage"><span className="role-chip">A · {a}</span><h1>{t('抽一张，别偷看。')}</h1><p>{t('你看不到牌面，只有描述者 {0} 能看到。',[b])}</p><button className="blind-card" aria-label={t('抽取隐藏分数')} onClick={()=>{dispatch({type:'draw',target:crypto.getRandomValues(new Uint32Array(1))[0]%11});shuffle();}}><strong>?</strong><small>{t('抽取隐藏分数')}</small></button></section>:
 handoff?<section className="local-stage local-cover"><span>📱</span><h1>{t('把手机交给 {0}',[s.phase==='pass-b'?b:a])}</h1><p>{t('正在传手机，分数不会显示在这一页。')}</p><button className="primary full" onClick={()=>dispatch({type:s.phase==='pass-b'?'reveal':'ready'})}>{t(s.phase==='pass-b'?'我是 {0}，查看分数':'我是 {0}，开始猜分',[s.phase==='pass-b'?b:a])}</button></section>:
 s.phase==='describe'?<section><span className="role-chip">B · {b}</span><h1>{t('只有描述者看这一页')}</h1><div className="secret-target"><span>{t('仅你可见的目标分数')}</span><strong>{s.target}<small>/10</small></strong></div><p>{t('根据分数，口头描述一个情境。也可以选灵感或写下来。')}</p><div className="section-heading"><strong>{t(modes[mode].title)}{t('，但是——')}</strong><button className="text-button" onClick={shuffle}>{t('换几个灵感')}</button></div><div className="suggestion-grid">{ideas.map(q=><button key={q} className={q===clue?'picked':''} onClick={()=>setClue(q)}>{scenarioText(lang,q)}</button>)}</div><textarea aria-label={t('可以直接口头描述，不必输入文字')} placeholder={t('可以直接口头描述，不必输入文字')} rows={3} maxLength={500} value={scenarioText(lang,clue)} onChange={e=>setClue(e.target.value)}/><button className="primary full" onClick={()=>{dispatch({type:'hide',clue});setClue('');setIdeas([]);}}>{t('隐藏分数，把手机交回猜分者')}</button></section>:
 s.phase==='guess'?<section><span className="role-chip">A · {a}</span><h1>{t('你心里是几分？')}</h1><p>{t('听完描述，凭直觉选一个分数')}</p>{s.clue&&<blockquote>{t(modes[mode].title)}{t('，但是——')}<p>{scenarioText(lang,s.clue)}</p></blockquote>}<div className="score-grid">{Array.from({length:11},(_,i)=><button key={i} className={selected===i?'active':''} aria-pressed={selected===i} onClick={()=>setSelected(i)}>{i}</button>)}</div><button className="primary full" disabled={selected===null} onClick={()=>{if(selected!==null)dispatch({type:'guess',score:selected});setSelected(null);}}>{t('确认猜分，翻牌！')}</button></section>:
 s.phase==='result'?<section className="guess-results"><span className="pill">{t(s.guess===s.target?'默契对上了！':'差一点就懂你！')}</span><h1>{t('翻牌揭晓')}</h1><div className="reveal-scores"><div><span>{t('抽到的分数')}</span><strong>{s.target}</strong></div><span>{s.target===s.guess?'=':'≠'}</span><div><span>{t('A 猜的分数')}</span><strong>{s.guess}</strong></div></div>{s.clue&&<blockquote>{scenarioText(lang,s.clue)}</blockquote>}<p>{t('差了 {0} 分。聊聊你为什么觉得是 {1} 分？',[Math.abs(s.target!-s.guess!),s.guess])}</p><p>{t('面对面直接说话即可，不需要开启麦克风。')}</p><button className="primary full" onClick={()=>dispatch({type:'next'})}>{t(s.index+1===s.total?'查看本局默契回顾':'下一轮，换人猜')}</button></section>:
 <section><h1>{t('本局已结束')}</h1><div className="partner-scores">{s.names.map((n,i)=><span key={n}>{n}<b>{t('{0} 次命中',[s.wins[i]])}</b></span>)}</div><button className="primary full" onClick={onExit}>{t('返回玩法选择')}</button></section>}
 </>}
 <div className="local-footer">{s.phase!=='setup'&&!covered&&<button className="secondary" onClick={()=>setCovered(true)}>{t('隐藏画面')}</button>}<button className="text-button" onClick={exit}>{t('返回玩法选择')}</button></div>
 </main></div>;
}

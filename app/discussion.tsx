"use client";
import {useEffect,useRef,useState} from 'react';
import type {PublicRoom} from './game';
import type {Session} from './client-api';
import {useSpeech} from './use-speech';
import {useI18n,speechLocales} from './i18n';
type Message={id:number;player:string;name:string;text:string;created:number};
const translations:Record<string,[string,string,string]>={
 '聊聊为什么给这个分数':['Talk about your scores','この点数にした理由を話そう','이 점수를 준 이유를 이야기해요'],
 '房间文字讨论':['Room discussion','ルームのチャット','방 텍스트 채팅'],
 '还没有留言，你来开个头吧。':['No messages yet. Start the conversation.','まだメッセージがありません。話しかけてみましょう。','아직 메시지가 없어요. 먼저 이야기해 보세요.'],
 '说说你为什么给这个分数…':['Why did you choose this score?','この点数にした理由は？','왜 이 점수를 골랐나요?'],
 '发送讨论':['Send message','メッセージを送信','메시지 보내기'],
 '语音转字仅填入草稿，点击发送后房间成员才能看到。':['Speech fills your draft. Room members see it only after you send.','音声入力は下書きです。送信後にメンバーへ表示されます。','음성 입력은 초안에만 저장돼요. 전송하면 방 멤버에게 보여요.'],
 '连接暂时中断，可稍后重试。':['Connection interrupted. Try again shortly.','接続が切れました。後でもう一度お試しください。','연결이 끊겼어요. 잠시 후 다시 시도해 주세요.'],
 '刷新讨论':['Refresh discussion','チャットを更新','채팅 새로고침'],
 '文字对本房间成员可见，保留约 24 小时；请勿发送敏感信息。':['Messages are visible to room members and retained for about 24 hours. Do not share sensitive information.','メッセージはルーム内に表示され、約24時間保存されます。機密情報は送らないでください。','메시지는 방 멤버에게 공개되며 약 24시간 보관돼요. 민감한 정보는 보내지 마세요.'],
 '本轮讨论已结束':['This round’s discussion has ended','このラウンドのチャットは終了しました','이번 라운드의 채팅이 끝났어요'],
 '发送太快，请稍后重试。':['Too many messages. Try again shortly.','送信が速すぎます。少し待って再試行してください。','너무 빠르게 전송했어요. 잠시 후 다시 시도해 주세요.'],
 '本轮讨论已达 200 条。':['This round has reached 200 messages.','このラウンドは200件に達しました。','이번 라운드는 200개 메시지에 도달했어요.'],
};
export default function Discussion({room,session}:{room:PublicRoom;session:Session}){
 const {lang,t}=useI18n();const tr=(s:string)=>lang==='zh'||!translations[s]?t(s):translations[s][{en:0,ja:1,ko:2}[lang]];
 const [messages,setMessages]=useState<Message[]>([]),[text,setText]=useState(''),[sending,setSending]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),cursor=useRef(0),pending=useRef<{text:string;id:string}|null>(null),locked=useRef(false);
 const speech=useSpeech(setText,setError,speechLocales[lang]);
 function merge(batch:Message[]){if(!alive.current)return;for(const m of batch)cursor.current=Math.max(cursor.current,m.id);setMessages(old=>Array.from(new Map([...old,...batch].map(m=>[m.id,m])).values()).sort((a,b)=>a.id-b.id));}
 async function request(action:string,extra:Record<string,unknown>={}){
  const res=await fetch('/api/discussion',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({action,code:session.code,round:room.round!.id,after:cursor.current,...extra}),signal:AbortSignal.timeout(10000)});
  const data=await res.json() as {messages:Message[];error?:string};if(!res.ok)throw new Error(data.error||'连接暂时中断，可稍后重试。');merge(data.messages);if(alive.current)setError('');
 }
 useEffect(()=>{alive.current=true;let polling=false;async function poll(){if(polling||document.hidden)return;polling=true;try{await request('list');}catch{if(alive.current)setError('连接暂时中断，可稍后重试。');}finally{polling=false;}}poll();const timer=setInterval(poll,2000);return()=>{alive.current=false;clearInterval(timer);};},[]);
 async function send(){if(locked.current||!text.trim())return;locked.current=true;setSending(true);speech.stop();const value=text.trim();if(pending.current?.text!==value)pending.current={text:value,id:crypto.randomUUID()};try{await request('send',pending.current);if(alive.current){setText('');pending.current=null;}}catch(e){if(alive.current)setError((e as Error).message);}finally{locked.current=false;if(alive.current)setSending(false);}}
 return <section className="discussion"><span className="pill">{tr('房间文字讨论')}</span><h2>{tr('聊聊为什么给这个分数')}</h2><div className="discussion-messages" role="log" aria-live="polite" aria-relevant="additions">{!messages.length?<p>{tr('还没有留言，你来开个头吧。')}</p>:messages.map(m=><article key={m.id} className={m.player===room.self?'mine':''}><header><strong>{m.name}{m.player===room.self?' · '+t('你'):''}</strong><time dateTime={new Date(m.created).toISOString()}>{new Date(m.created).toLocaleTimeString(lang,{hour:'2-digit',minute:'2-digit'})}</time></header><p>{m.text}</p></article>)}</div><label className="field-label" htmlFor="discussion-text">{tr('说说你为什么给这个分数…')}</label><textarea id="discussion-text" maxLength={500} rows={3} value={text} disabled={sending||speech.listening||speech.starting} onChange={e=>setText(e.target.value)} placeholder={tr('说说你为什么给这个分数…')}/><div className="draft-meta"><span>{tr('语音转字仅填入草稿，点击发送后房间成员才能看到。')}</span><span>{text.length}/500</span></div><div className="speech-actions"><button className="secondary" disabled={!speech.supported||sending} onClick={()=>speech.listening||speech.starting?speech.stop():speech.start(text)}>{speech.listening||speech.starting?t('停止转字'):t('说话转成文字')}</button><button className="primary" disabled={!text.trim()||sending||speech.listening||speech.starting} onClick={send}>{sending?t('同步中…'):tr('发送讨论')}</button></div><p className="speech-privacy">{speech.supported?t('点击后由浏览器申请麦克风权限，语音可能交由浏览器的在线识别服务处理。本站仅保存房间内的文字描述。'):t('此浏览器不支持转字，可打字或用键盘语音输入。')}</p><p className="speech-privacy">{tr('文字对本房间成员可见，保留约 24 小时；请勿发送敏感信息。')}</p>{error&&<div role="alert"><p>{tr(error)}</p><button className="text-button" onClick={()=>request('list').catch(()=>setError('连接暂时中断，可稍后重试。'))}>{tr('刷新讨论')}</button></div>}</section>;
}

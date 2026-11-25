"use client";
import {useEffect,useRef,useState} from 'react';
import type {PublicRoom} from './game';
import type {Session} from './client-api';
import {useI18n} from './i18n';
type Peer={player:string;instance:string;name:string};
type Signal={id:number;sender:string;payload:string};
type Reply={peers:Peer[];signals:Signal[];iceServers:RTCIceServer[]};
const labels={
 zh:['聊聊为什么给这个分数','加入语音讨论','连接中…','退出语音','静音','取消静音','语音已加入，等待朋友','点击播放朋友声音','连接失败，请退出重进或换网络','请允许麦克风权限后重试','下一轮自动退出；不录音。点对点通话可能向房间语音成员暴露网络地址。部分网络需要中继才能接通。','实时语音','正在请求麦克风…'],
 en:['Talk about your scores','Join voice chat','Connecting…','Leave voice','Mute','Unmute','Joined; waiting for friends','Play friends’ audio','Connection failed; rejoin or change network','Allow microphone access and try again','Automatically leaves next round. No recording. Peer-to-peer calls can expose your network address to voice participants. Some networks need a relay.','Live voice','Requesting microphone…'],
 ja:['この点数にした理由を話そう','音声チャットに参加','接続中…','音声を退出','ミュート','ミュート解除','参加済み・友達を待っています','友達の音声を再生','接続失敗。再参加かネット変更をお試しください','マイクを許可して再試行してください','次のラウンドで自動退出。録音なし。P2P通話では参加者にネットワークアドレスが伝わる場合があります。中継が必要な回線もあります。','リアルタイム音声','マイクの許可を確認中…'],
 ko:['이 점수를 준 이유를 이야기해요','음성 채팅 참여','연결 중…','음성 나가기','음소거','음소거 해제','참여 완료·친구를 기다리는 중','친구 음성 재생','연결 실패. 다시 참여하거나 네트워크를 바꿔 주세요','마이크 권한을 허용하고 다시 시도해 주세요','다음 라운드에 자동 종료되며 녹음하지 않습니다. P2P 통화 시 참여자에게 네트워크 주소가 전달될 수 있습니다. 일부 네트워크는 중계가 필요합니다.','실시간 음성','마이크 권한 요청 중…']
};
export default function VoiceRoom({room,session}:{room:PublicRoom;session:Session}){
 const {lang}=useI18n(),l=labels[lang];
 const [joined,setJoined]=useState(false),[starting,setStarting]=useState(false),[muted,setMuted]=useState(false),[peers,setPeers]=useState<Peer[]>([]),[states,setStates]=useState<Record<string,string>>({}),[error,setError]=useState(''),[blocked,setBlocked]=useState(false);
 const runtime=useRef<{stream:MediaStream;pcs:Map<string,RTCPeerConnection>;audio:Map<string,HTMLAudioElement>;instances:Map<string,string>;candidates:Map<string,RTCIceCandidateInit[]>;timer:ReturnType<typeof setInterval>|null;instance:string;after:number;closed:boolean;busy:boolean;ice:RTCIceServer[]}|null>(null);
 const generation=useRef(0);
 async function api(action:string,fields:Record<string,unknown>={},instance=runtime.current?.instance){
  const res=await fetch('/api/voice',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({action,code:session.code,round:room.round!.id,instance,...fields}),signal:AbortSignal.timeout(10000)});
  const data=await res.json() as Reply & {error?:string};if(!res.ok)throw Object.assign(new Error(data.error),{status:res.status});return data;
 }
 function leave(){generation.current++;const rt=runtime.current;runtime.current=null;if(rt){rt.closed=true;if(rt.timer)clearInterval(rt.timer);rt.stream.getTracks().forEach(t=>t.stop());rt.pcs.forEach(pc=>pc.close());rt.audio.forEach(a=>{a.pause();a.srcObject=null;});api('leave',{},rt.instance).catch(()=>{});}setJoined(false);setStarting(false);setPeers([]);setStates({});setMuted(false);}
 useEffect(()=>()=>leave(),[]);
 async function join(){
  if(starting||runtime.current)return;setStarting(true);setError('');const gen=++generation.current;
  let stream:MediaStream|undefined;
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   if(gen!==generation.current){stream.getTracks().forEach(t=>t.stop());return;}
   const rt={stream,pcs:new Map<string,RTCPeerConnection>(),audio:new Map<string,HTMLAudioElement>(),instances:new Map<string,string>(),candidates:new Map<string,RTCIceCandidateInit[]>(),timer:null as ReturnType<typeof setInterval>|null,instance:crypto.randomUUID(),after:0,closed:false,busy:false,ice:[] as RTCIceServer[]};runtime.current=rt;
   const initial=await api('join');if(rt.closed)return;rt.ice=initial.iceServers;setJoined(true);setStarting(false);
   async function send(to:string,payload:unknown){if(!rt.closed)await api('signal',{to,payload});}
   function drop(id:string){rt.pcs.get(id)?.close();rt.pcs.delete(id);const a=rt.audio.get(id);if(a){a.pause();a.srcObject=null;}rt.audio.delete(id);rt.candidates.delete(id);rt.instances.delete(id);}
   function connection(id:string){
    let pc=rt.pcs.get(id);if(pc)return pc;
    pc=new RTCPeerConnection({iceServers:rt.ice});rt.pcs.set(id,pc);rt.stream.getTracks().forEach(track=>pc!.addTrack(track,rt.stream));
    pc.onicecandidate=e=>{if(e.candidate)send(id,{type:'candidate',candidate:e.candidate.toJSON()}).catch(()=>{if(!rt.closed)setError(l[8]);});};
    pc.onconnectionstatechange=()=>{if(rt.closed)return;setStates(s=>({...s,[id]:pc!.connectionState}));if(pc!.connectionState==='failed')setError(l[8]);};
    pc.ontrack=e=>{let audio=rt.audio.get(id);if(!audio){audio=new Audio();audio.autoplay=true;rt.audio.set(id,audio);}audio.srcObject=e.streams[0]||new MediaStream([e.track]);audio.play().catch(()=>{if(!rt.closed)setBlocked(true);});};return pc;
   }
   async function process(data:Reply){
    if(rt.closed)return;setPeers(data.peers);const others=data.peers.filter(p=>p.player!==room.self);
    for(const [id]of rt.pcs)if(!others.some(p=>p.player===id))drop(id);
    for(const p of others){if(rt.instances.get(p.player)&&rt.instances.get(p.player)!==p.instance)drop(p.player);rt.instances.set(p.player,p.instance);
     if(!rt.pcs.has(p.player)&&room.self<p.player){const pc=connection(p.player);await pc.setLocalDescription(await pc.createOffer());await send(p.player,{type:'offer',sdp:pc.localDescription});}
    }
    for(const msg of data.signals){rt.after=Math.max(rt.after,msg.id);const payload=JSON.parse(msg.payload);const p=others.find(p=>p.player===msg.sender);if(!p||payload.instance!==p.instance)continue;const pc=connection(msg.sender);
     if(payload.type==='offer'){await pc.setRemoteDescription(payload.sdp);await pc.setLocalDescription(await pc.createAnswer());await send(msg.sender,{type:'answer',sdp:pc.localDescription});}
     else if(payload.type==='answer'){if(pc.signalingState==='have-local-offer')await pc.setRemoteDescription(payload.sdp);}
     else if(payload.type==='candidate'){if(pc.remoteDescription)await pc.addIceCandidate(payload.candidate);else rt.candidates.set(msg.sender,[...(rt.candidates.get(msg.sender)||[]),payload.candidate]);}
     if(pc.remoteDescription){for(const c of rt.candidates.get(msg.sender)||[])await pc.addIceCandidate(c);rt.candidates.delete(msg.sender);}
    }
   }
   await process(initial);
   rt.timer=setInterval(async()=>{if(rt.closed||rt.busy)return;rt.busy=true;try{await process(await api('poll',{after:rt.after}));}catch(e){if(!rt.closed){if([401,404,409].includes((e as {status:number}).status))leave();setError(l[8]);}}finally{rt.busy=false;}},1500);
  }catch(e){stream?.getTracks().forEach(t=>t.stop());leave();setError(['NotAllowedError','NotFoundError','NotReadableError'].includes((e as Error).name)?l[9]:l[8]);}finally{if(gen===generation.current)setStarting(false);}
 }
 function toggle(){const rt=runtime.current;if(!rt)return;rt.stream.getAudioTracks().forEach(t=>t.enabled=muted);setMuted(!muted);}
 return <section className="voice-room"><span className="pill">{l[11]}</span><h2>{l[0]}</h2><p>{l[10]}</p>{!joined?<button className="primary" disabled={starting} onClick={join}>{starting?l[12]:l[1]}</button>:<><div className="voice-members">{peers.map(p=><span key={p.player}>{p.name} · {p.player===room.self?(muted?'🔇':'🎙'):states[p.player]==='connected'?'🔊':l[2]}</span>)}</div>{peers.length<2&&<p>{l[6]}</p>}<div className="speech-actions"><button className="secondary" onClick={toggle}>{muted?l[5]:l[4]}</button><button className="secondary" onClick={leave}>{l[3]}</button></div>{blocked&&<button className="secondary" onClick={()=>{runtime.current?.audio.forEach(a=>a.play().catch(()=>{}));setBlocked(false);}}>{l[7]}</button>}</>}{error&&<p role="alert">{error}</p>}</section>;
}

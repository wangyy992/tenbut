"use client";
import {useEffect,useRef,useState} from 'react';
type Recognition={
 lang:string;continuous:boolean;interimResults:boolean;maxAlternatives:number;
 onstart:(()=>void)|null;onend:(()=>void)|null;onerror:((e:{error:string})=>void)|null;
 onresult:((e:{results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>})=>void)|null;
 start:()=>void;abort:()=>void;
};
type SpeechWindow=Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
export function useSpeech(onText:(text:string)=>void,onError:(message:string)=>void,locale='zh-CN'){
 const [supported,setSupported]=useState(false),[listening,setListening]=useState(false),[starting,setStarting]=useState(false);
 const recognition=useRef<Recognition|null>(null),textHandler=useRef(onText),errorHandler=useRef(onError),alive=useRef(true);
 textHandler.current=onText;errorHandler.current=onError;
 useEffect(()=>{alive.current=true;const w=window as SpeechWindow;setSupported(!!(w.SpeechRecognition||w.webkitSpeechRecognition));return()=>{alive.current=false;const rec=recognition.current;if(rec){rec.onresult=null;rec.onerror=null;rec.onend=null;rec.onstart=null;rec.abort();}recognition.current=null;};},[]);
 useEffect(()=>{const rec=recognition.current;if(rec){rec.onresult=null;rec.onerror=null;rec.onend=null;rec.onstart=null;rec.abort();recognition.current=null;}setListening(false);setStarting(false);},[locale]);
 function stop(){const rec=recognition.current;recognition.current=null;if(rec){rec.onresult=null;rec.onerror=null;rec.onend=null;rec.onstart=null;rec.abort();}setListening(false);setStarting(false);}
 function start(existing:string){
  if(recognition.current)return;
  const w=window as SpeechWindow,Constructor=w.SpeechRecognition||w.webkitSpeechRecognition;
  if(!Constructor){errorHandler.current('此浏览器不支持语音转字，可打字或使用键盘的语音输入。');return;}
  const rec=new Constructor();recognition.current=rec;rec.lang=locale;rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
  rec.onstart=()=>{if(alive.current){setStarting(false);setListening(true);}};
  rec.onresult=e=>{if(!alive.current||recognition.current!==rec)return;let words='';for(let i=0;i<e.results.length;i++)words+=e.results[i][0].transcript;textHandler.current((existing+(existing.trim()?(locale.startsWith('zh')?'，':' '):'')+words).slice(0,500));};
  rec.onerror=e=>{if(!alive.current)return;const errors:Record<string,string>={'not-allowed':'麦克风或语音识别权限未开启，你仍然可以打字描述。','service-not-allowed':'浏览器的语音服务不可用，请打字描述。','audio-capture':'没有检测到可用麦克风，请检查设备。','network':'语音识别网络不可用，请打字或稍后重试。','no-speech':'暂时没有听到声音，可以再点一次开始说话。'};errorHandler.current(errors[e.error]||'转字已停止，可以继续打字。');};
  rec.onend=()=>{if(alive.current&&recognition.current===rec){recognition.current=null;setListening(false);setStarting(false);}};
  setStarting(true);try{rec.start();}catch{recognition.current=null;setStarting(false);errorHandler.current('语音服务无法启动，请打字描述。');}
 }
 return{supported,listening,starting,start,stop};
}

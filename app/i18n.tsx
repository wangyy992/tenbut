"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {translate,languageNames,type Lang} from './locale';
export {translate,languageNames,speechLocales} from './locale';
export type {Lang} from './locale';
const isLang=(v:string|null):v is Lang=>!!v&&Object.hasOwn(languageNames,v);
type Context={lang:Lang;setLang:(lang:Lang)=>void;t:(source:string,values?:unknown[])=>string};
const Locale=createContext<Context>({lang:'zh',setLang:()=>{},t:(source,values)=>translate('zh',source,values)});
export function I18nProvider({children}:{children:ReactNode}){
 const [lang,setValue]=useState<Lang>('zh');
 useEffect(()=>{let saved:string|null=null;try{saved=localStorage.getItem('tenbut-language');}catch{}const browser=navigator.language.toLowerCase().split('-')[0];setValue(isLang(saved)?saved:isLang(browser)?browser:'en');},[]);
 useEffect(()=>{document.documentElement.lang=lang==='zh'?'zh-CN':lang;document.title='TEN BUT · '+({zh:'盲抽猜分默契局',en:'Blind score guessing',ja:'ブラインド・スコアゲーム',ko:'블라인드 점수 맞히기'}[lang]);},[lang]);
 function setLang(value:Lang){setValue(value);try{localStorage.setItem('tenbut-language',value);}catch{}}
 return <Locale.Provider value={{lang,setLang,t:(source,values)=>translate(lang,source,values)}}>{children}</Locale.Provider>;
}
export const useI18n=()=>useContext(Locale);

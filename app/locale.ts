import catalog from './ui-translations.json';
import {scenarioText} from './scenario-translations';
export type Lang='zh'|'en'|'ja'|'ko';
export const languageNames:Record<Lang,string>={zh:'中文',en:'English',ja:'日本語',ko:'한국어'};
export const speechLocales:Record<Lang,string>={zh:'zh-CN',en:'en-US',ja:'ja-JP',ko:'ko-KR'};
export function translate(lang:Lang,source:string,values:unknown[]=[]){
 const key=source.trim(),row=(catalog as Record<string,string[]>)[key];
 let text=lang==='zh'?key:row?.[{en:0,ja:1,ko:2}[lang]]??scenarioText(lang,key);
 text=text.replace(/\{(\d+)\}/g,(_,n)=>String(values[Number(n)]??''));
 return (source.match(/^\s*/)?.[0]||'')+text+(source.match(/\s*$/)?.[0]||'');
}

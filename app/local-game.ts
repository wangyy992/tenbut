export type LocalPhase='setup'|'draw'|'pass-b'|'describe'|'pass-a'|'guess'|'result'|'finished';
export type LocalState={phase:LocalPhase;index:number;total:number;names:string[];wins:number[];target:number|null;guess:number|null;clue:string};
export type LocalAction={type:'start';names:string[];total:number}|{type:'draw';target:number}|{type:'reveal'}|{type:'hide';clue:string}|{type:'ready'}|{type:'guess';score:number}|{type:'next'};
export const initialLocal:LocalState={phase:'setup',index:0,total:5,names:[],wins:[],target:null,guess:null,clue:''};
export function localGame(s:LocalState,a:LocalAction):LocalState{
 if(a.type==='start'&&s.phase==='setup'){
  const names=a.names.map(n=>n.trim()).filter(Boolean);if(names.length<2||names.length>12||names.some(n=>n.length>16)||new Set(names).size!==names.length||![5,10,20].includes(a.total))return s;
  return {...initialLocal,phase:'draw',names,total:a.total,wins:names.map(()=>0)};
 }
 if(a.type==='draw'&&s.phase==='draw'&&Number.isInteger(a.target)&&a.target>=0&&a.target<=10)return {...s,phase:'pass-b',target:a.target};
 if(a.type==='reveal'&&s.phase==='pass-b')return {...s,phase:'describe'};
 if(a.type==='hide'&&s.phase==='describe')return {...s,phase:'pass-a',clue:a.clue.trim().slice(0,500)};
 if(a.type==='ready'&&s.phase==='pass-a')return {...s,phase:'guess'};
 if(a.type==='guess'&&s.phase==='guess'&&Number.isInteger(a.score)&&a.score>=0&&a.score<=10){const wins=[...s.wins];if(a.score===s.target){wins[s.index%s.names.length]++;wins[(s.index+1)%s.names.length]++;}return {...s,phase:'result',guess:a.score,wins};}
 if(a.type==='next'&&s.phase==='result')return s.index+1>=s.total?{...s,phase:'finished'}:{...s,phase:'draw',index:s.index+1,target:null,guess:null,clue:''};
 return s;
}

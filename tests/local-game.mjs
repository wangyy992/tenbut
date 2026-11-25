import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const temp=await mkdtemp(join(tmpdir(),'tenbut-local-'));
try{
 await build({entryPoints:['app/local-game.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'game.mjs')});
 const {initialLocal,localGame}=await import(pathToFileURL(join(temp,'game.mjs')));
 let s=localGame(initialLocal,{type:'start',names:['A','B'],total:5});
 assert.equal(s.phase,'draw');assert.equal(s.target,null);
 assert.equal(localGame(s,{type:'reveal'}),s,'cannot reveal before drawing');
 for(let i=0;i<5;i++){
  assert.equal(s.index,i);assert.equal(s.names[s.index%s.names.length],i%2?'B':'A');
  s=localGame(s,{type:'draw',target:i});assert.equal(s.phase,'pass-b');
  assert.equal(localGame(s,{type:'guess',score:i}),s,'cannot guess before B describes');
  s=localGame(s,{type:'reveal'});assert.equal(s.phase,'describe');
  s=localGame(s,{type:'hide',clue:i%2?'test':''});assert.equal(s.phase,'pass-a','oral descriptions may be empty');
  assert.equal(localGame(s,{type:'reveal'}),s,'no reveal action on handoff back to A');
  s=localGame(s,{type:'ready'});assert.equal(s.phase,'guess');
  s=localGame(s,{type:'guess',score:i});assert.equal(s.phase,'result');
  s=localGame(s,{type:'next'});assert.equal(s.phase,i===4?'finished':'draw');if(i<4)assert.equal(s.target,null);
 }
 assert.deepEqual(s.wins,[5,5]);
 assert.equal(localGame(initialLocal,{type:'start',names:['same','same'],total:5}),initialLocal);
 const three=localGame(initialLocal,{type:'start',names:['A','B','C'],total:10});assert.equal(three.names.length,3);
 console.log('PASS pass-and-play guarded phases, oral clues, alternating roles, score reset, exact-match scoring and validation.');
}finally{await rm(temp,{recursive:true,force:true})}

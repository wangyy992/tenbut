import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const temp = await mkdtemp(join(tmpdir(),'tenbut-tests-'));
try {
  await build({entryPoints:['app/api/game/route.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'route.mjs'),plugins:[{name:'local-sqlite-d1',setup(build){build.onResolve({filter:/^cloudflare:workers$/},()=>({path:resolve('tests/sqlite-d1.mjs'),external:true}));}}]});
  await build({entryPoints:['app/locale.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'locale.mjs')});
  await build({entryPoints:['app/scenario-translations.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'scenarios.mjs')});
  const locale=await import(pathToFileURL(join(temp,'locale.mjs'))),scenarios=await import(pathToFileURL(join(temp,'scenarios.mjs')));
  const {checkLocalization}=await import('./localization.mjs');checkLocalization(locale,scenarios);
  const {GET,POST} = await import(pathToFileURL(join(temp,'route.mjs')));
  globalThis.fetch = async (url,options={}) => { const req=new Request(url,options); return req.method==='POST'?POST(req):GET(req); };
  process.argv[2]='http://test.local';
  await import('./integration.mjs');
  const assert=(await import('node:assert/strict')).default;
  async function request(action,body={},session=null){const response=await POST(new Request('http://test.local/api/game',{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},body:JSON.stringify({action,code:session?.code,...body})}));assert.equal(response.status,200);return response.json();}
  const a=(await request('create',{name:'Local A',mode:'boy',total:5})).session;
  const b=(await request('join',{code:a.code,name:'Local B'})).session;
  const round=(await request('next',{},a)).room.round;await request('draw',{round:round.id},a);
  const key=scenarios.scenarioSources[0],english=scenarios.scenarioText('en',key);
  await request('publish',{round:round.id,text:english,revision:1},b);
  const view=await GET(new Request('http://test.local/api/game?code='+a.code,{headers:{Authorization:'Bearer '+a.token}})).then(r=>r.json());
  assert.equal(view.round.clueKey,key);assert.equal(view.round.target,null);
  assert.equal(scenarios.scenarioText('ko',view.round.clueKey),scenarios.scenarioText('ko',key));
  console.log('PASS: an English built-in clue resolves to the same scenario for a Korean viewer, without revealing the hidden score.');
} finally { await rm(temp,{recursive:true,force:true}); }

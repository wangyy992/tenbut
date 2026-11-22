import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const temp = await mkdtemp(join(tmpdir(),'tenbut-tests-'));
try {
  await build({entryPoints:['app/api/game/route.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'route.mjs'),plugins:[{name:'local-sqlite-d1',setup(build){build.onResolve({filter:/^cloudflare:workers$/},()=>({path:resolve('tests/sqlite-d1.mjs'),external:true}));}}]});
  const {GET,POST} = await import(pathToFileURL(join(temp,'route.mjs')));
  globalThis.fetch = async (url,options={}) => { const req=new Request(url,options); return req.method==='POST'?POST(req):GET(req); };
  process.argv[2]='http://test.local';
  await import('./integration.mjs');
} finally { await rm(temp,{recursive:true,force:true}); }

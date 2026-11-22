import assert from 'node:assert/strict';
const base=process.argv[2];if(!base)throw new Error('Provide a development server URL.');
async function raw(action,fields={},session=null){const res=await fetch(base+'/api/game',{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},body:JSON.stringify({action,code:session?.code,...fields})});return{status:res.status,data:await res.json()};}
async function call(action,fields={},session=null,expected=200){const result=await raw(action,fields,session);assert.equal(result.status,expected,`${action}: ${JSON.stringify(result.data)}`);return result.data;}
async function read(session,expected=200){const res=await fetch(base+'/api/game?code='+session.code,{headers:{Authorization:'Bearer '+session.token}});const data=await res.json();assert.equal(res.status,expected,JSON.stringify(data));return data;}
const host=(await call('create',{name:'测试 A',mode:'boy',total:5})).session;
await call('next',{},host,400);
const guest=(await call('join',{code:host.code,name:'测试 B'})).session;
const spectator=(await call('join',{code:host.code,name:'围观 C'})).session;
await call('next',{},guest,403);
let room=(await call('next',{},host)).room;
assert.equal(room.phase,'drawing');assert.equal(room.round.guesser,room.self);assert.equal(room.round.target,null);
let id=room.round.id;
await call('draw',{round:id},guest,403);
room=(await call('draw',{round:id},host)).room;
assert.equal(room.phase,'describing');assert.equal(room.round.target,null);assert.deepEqual(room.round.suggestions,[]);
const privateView=await read(guest),target=privateView.round.target;
assert.ok(Number.isInteger(target)&&target>=0&&target<=10);assert.equal(privateView.round.suggestions.length,4);
room=await read(spectator);assert.equal(room.round.target,null);assert.deepEqual(room.round.suggestions,[]);
assert.ok(!JSON.stringify(room).includes('token'));assert.ok(!JSON.stringify(privateView).includes(guest.token));
await call('draft',{round:id,text:'偷改',revision:1},host,403);
await call('guess',{round:id,score:3},host,403);
await call('draft',{round:id,text:'这是同步中的描述',revision:1},guest);
assert.equal((await read(host)).round.clue,'这是同步中的描述');
await call('draft',{round:id,text:'过时的草稿',revision:1},guest,409);
const concurrent=await Promise.all([raw('draft',{round:id,text:'草稿二',revision:2},guest),raw('draft',{round:id,text:'草稿三',revision:3},guest)]);
assert.ok(concurrent.every(r=>[200,409].includes(r.status)));assert.equal((await read(host)).round.clue,'草稿三');
await call('suggestions',{round:id},guest);await call('suggestions',{round:id},host,403);
room=(await call('publish',{round:id,text:'他是满分男，但是不爱洗澡。',revision:4},guest)).room;assert.equal(room.phase,'guessing');
assert.equal((await read(host)).round.target,null);
await call('draft',{round:id,text:'试图改口',revision:5},guest,403);
await call('guess',{round:id,score:target},spectator,403);
await call('guess',{round:id,score:11},host,400);
room=(await call('guess',{round:id,score:target},host)).room;
assert.equal(room.phase,'results');assert.equal(room.round.matched,true);assert.equal(room.round.target,target);assert.equal(room.history.length,1);
assert.equal(room.players.find(p=>p.id===room.round.guesser).wins,1);assert.equal(room.players.find(p=>p.id===room.round.describer).wins,1);
await call('guess',{round:id,score:target},host,403);
// Spectator leaving does not invalidate the finished round. Two-player roles swap next round.
await call('leave',{},spectator);await read(spectator,401);
const staleId=id;
room=(await call('next',{},host)).room;assert.equal(room.round.describer,room.self);
assert.equal((await read(guest)).round.guesser,(await read(guest)).self);
await call('draw',{round:staleId},guest,409);
for(let n=2;n<=5;n++){
 if(n>2)room=(await call('next',{},host)).room;
 const hostView=await read(host),guessSession=hostView.round.guesser===hostView.self?host:guest,describeSession=guessSession===host?guest:host;
 id=hostView.round.id;await call('draw',{round:id},guessSession);
 const secret=(await read(describeSession)).round.target;
 await call('publish',{round:id,text:`第 ${n} 轮自己的情境`,revision:1},describeSession);
 const score=n===3?secret:(secret+1)%11;
 const twice=await Promise.all([raw('guess',{round:id,score},guessSession),raw('guess',{round:id,score},guessSession)]);
 assert.equal(twice.filter(r=>r.status===200).length,1);assert.ok(twice.every(r=>[200,403].includes(r.status)));
 room=await read(host);assert.equal(room.history.length,n);assert.equal(room.round.matched,n===3);
}
room=(await call('next',{},host)).room;assert.equal(room.phase,'finished');
room=(await call('restart',{},host)).room;assert.equal(room.phase,'lobby');assert.ok(room.players.every(p=>p.wins===0));
await call('settings',{mode:'concert',total:5},host);
room=(await call('next',{},host)).room;
// Removing the active describer skips the turn and reveals no fabricated guess.
const guestId=(await read(guest)).self;
room=(await call('kick',{player:guestId},host)).room;assert.equal(room.phase,'results');assert.equal(room.round.skipped,true);assert.equal(room.round.guess,null);await read(guest,401);
await call('next',{},host,400);
const returning=(await call('join',{code:host.code,name:'回来的 B'})).session;
await call('next',{},host);
await call('leave',{},host);room=await read(returning);assert.equal(room.host,room.self);assert.equal(room.phase,'results');assert.equal(room.round.skipped,true);
await call('leave',{},returning);await read(returning,401);
console.log('PASS: blind target confidentiality, role permissions, speech-text draft sync, stale revision rejection, concurrent updates, exact-match scoring, rotating roles, skipped turns, host transfer and replay.');

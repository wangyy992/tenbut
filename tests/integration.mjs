import assert from 'node:assert/strict';
const base = process.argv[2];
if (!base) throw new Error('Provide a development server URL.');
async function call(action, fields = {}, session = null, expected = 200) {
  const res = await fetch(base + '/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session.token } : {}) }, body: JSON.stringify({action, code:session?.code, ...fields}) });
  const data = await res.json(); assert.equal(res.status, expected, `${action}: ${JSON.stringify(data)}`); return data;
}
async function read(session, expected = 200) {
  const res = await fetch(base + '/api/game?code=' + session.code, { headers: {Authorization:'Bearer '+session.token} });
  const data = await res.json(); assert.equal(res.status, expected, JSON.stringify(data)); return data;
}
const host = (await call('create', {name:'测试房主',mode:'concert',total:5})).session;
let room = await read(host); const hostId = room.self;
assert.equal(room.phase,'lobby'); assert.ok(!JSON.stringify(room).includes(host.token));
await call('next',{},host,400);
const guest = (await call('join',{code:host.code,name:'测试朋友'})).session;
await call('join',{code:host.code,name:'测试朋友'},null,400);
await call('next',{},guest,403);
await call('custom',{mode:'concert',text:'测试自定义情境'},guest);
room = (await call('next',{},host)).room;
assert.equal(room.round.voters.length,2);
await call('vote',{score:11,round:1},guest,400);
await call('vote',{score:8,round:99},guest,400);
await call('vote',{score:8,round:1},host);
room = await read(guest); assert.deepEqual(room.round.votes,{}); assert.equal(room.round.submitted.length,1);
assert.ok(!JSON.stringify(room).includes('token'));
await call('vote',{score:3,round:1},host,400);
const late = (await call('join',{code:host.code,name:'中途加入'})).session;
await call('vote',{score:5,round:1},late,400);
room = (await call('vote',{score:2,round:1},guest)).room;
assert.equal(room.phase,'results'); assert.deepEqual(Object.values(room.round.votes).sort((a,b)=>a-b),[2,8]);
room = (await call('next',{},host)).room;
assert.equal(room.round.voters.length,3);
await Promise.all([call('vote',{score:6,round:2},host),call('vote',{score:7,round:2},guest)]);
room = await read(host); assert.equal(room.phase,'voting'); assert.deepEqual(room.round.votes,{});
const lateId = (await read(late)).self;
room = (await call('kick',{player:lateId},host)).room; assert.equal(room.phase,'results');
await read(late,401);
const seen = new Set(room.history.map(r=>r.text));
for(let round=3;round<=5;round++) {
  room = (await call('next',{},host)).room; assert.ok(!seen.has(room.round.text)); seen.add(room.round.text);
  await Promise.all([call('vote',{score:0,round},host),call('vote',{score:10,round},guest)]);
  room = await read(guest); assert.equal(room.phase,'results'); assert.equal(room.history.length,round);
}
room = (await call('next',{},host)).room; assert.equal(room.phase,'finished');
room = (await call('restart',{},host)).room; assert.equal(room.phase,'lobby'); assert.equal(room.history.length,0);
room = (await call('settings',{mode:'girl',total:10},host)).room; assert.equal(room.mode,'girl');
await call('leave',{},host);
room=await read(guest); assert.equal(room.host,room.self); assert.notEqual(room.host,hostId);
await read(host,401);
await call('leave',{},guest);
await read(guest,401);
await read({code:'ABCDEF',token:'bad'},404);
console.log('PASS: room lifecycle, concurrent votes, secret ballots, permissions, spectators, kick, host transfer, custom questions, non-repeating rounds and replay.');

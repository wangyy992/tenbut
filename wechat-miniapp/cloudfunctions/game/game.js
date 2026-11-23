const crypto = require('crypto')
const { modes, questions } = require('./data')

class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
const fail = (message, status) => { throw new GameError(message, status) }
const uid = () => crypto.randomBytes(16).toString('hex')
const random = max => crypto.randomInt(0, max)

function cleanName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 16) fail('昵称请填写 1–16 个字。')
  return value.trim()
}

function player(openid, name) {
  return { id: openid, name: cleanName(name), wins: 0 }
}

function newRoom(code, owner, mode, total) {
  if (!Object.prototype.hasOwnProperty.call(modes, String(mode))) fail('请选择一种题库。')
  if (![5, 10, 20].includes(Number(total))) fail('局数需要为 5、10 或 20。')
  return { rules: 3, code, host: owner.id, players: [owner], mode, total: Number(total), phase: 'lobby', round: null, history: [], queue: [] }
}

function selfPlayer(room, openid) {
  const self = room.players.find(p => p.id === openid)
  if (!self) fail('你已离开房间，请重新加入。', 401)
  return self
}

function publicRoom(room, self) {
  const r = room.round
  const revealed = room.phase === 'results' || room.phase === 'finished'
  return {
    rules: room.rules, code: room.code, host: room.host, mode: room.mode, total: room.total, phase: room.phase,
    self: self.id, players: room.players.map(({ id, name, wins }) => ({ id, name, wins })),
    round: r ? {
      id: r.id, number: r.number, guesser: r.guesser, describer: r.describer, names: r.names, title: r.title,
      target: revealed || self.id === r.describer ? r.target : null,
      guess: revealed ? r.guess : null, clue: r.clue, revision: r.revision,
      suggestions: self.id === r.describer && room.phase === 'describing' ? r.suggestions : [],
      matched: r.matched, skipped: r.skipped
    } : null,
    history: room.history.map(({ suggestions, ...round }) => round)
  }
}

function makeSuggestions(mode, target) {
  const ranked = questions[mode].map(([text, score]) => ({ text, distance: Math.abs(score - target), salt: random(100000) }))
  ranked.sort((a, b) => a.distance - b.distance || a.salt - b.salt)
  const close = ranked.slice(0, Math.max(8, ranked.filter(q => q.distance <= 2).length))
  close.sort(() => random(3) - 1)
  return close.slice(0, 4).map(q => q.text)
}

function next(room) {
  if (!['lobby', 'results'].includes(room.phase)) fail('请完成本轮的抽牌、描述和猜分。')
  if (room.history.length >= room.total) { room.phase = 'finished'; return }
  if (room.players.length < 2) fail('至少需要 2 位玩家才能开始。')
  const ids = room.players.map(p => p.id)
  room.queue = room.queue.filter(id => ids.includes(id))
  ids.forEach(id => { if (!room.queue.includes(id)) room.queue.push(id) })
  const guesser = room.queue[0]
  const describer = room.queue[1]
  room.queue.push(room.queue.shift())
  room.round = {
    id: uid(), number: room.history.length + 1, guesser, describer,
    names: Object.fromEntries(room.players.map(p => [p.id, p.name])),
    title: modes[room.mode].title, target: null, guess: null, clue: '', revision: 0,
    suggestions: [], matched: false, skipped: false
  }
  room.phase = 'drawing'
}

function roundFor(room, body) {
  if (!room.round || body.round !== room.round.id) fail('本轮已经变化，请重试当前操作。', 409)
  return room.round
}

function saveRound(room) {
  room.phase = 'results'
  room.history.push(JSON.parse(JSON.stringify({ ...room.round, suggestions: [] })))
}

function act(room, self, action, body = {}) {
  if (['next', 'kick', 'restart', 'settings', 'skip'].includes(action) && room.host !== self.id) fail('这个操作需要房主来完成。', 403)
  if (action === 'next') next(room)
  else if (action === 'draw') {
    const r = roundFor(room, body)
    if (room.phase !== 'drawing' || r.guesser !== self.id) fail('只有本轮猜分者可以抽牌。', 403)
    r.target = random(11); r.suggestions = makeSuggestions(room.mode, r.target); room.phase = 'describing'
  } else if (['draft', 'publish', 'suggestions'].includes(action)) {
    const r = roundFor(room, body)
    if (room.phase !== 'describing' || r.describer !== self.id) fail('只有本轮描述者可以操作。', 403)
    if (action === 'suggestions') { r.suggestions = makeSuggestions(room.mode, r.target); return }
    if (typeof body.text !== 'string' || body.text.length > 500) fail('描述最多 500 个字。')
    if (!Number.isInteger(body.revision) || body.revision <= r.revision) fail('描述已更新，请重试。', 409)
    if (action === 'publish' && !body.text.trim()) fail('先选择一个情境，或者自己描述吧。')
    r.clue = body.text; r.revision = body.revision
    if (action === 'publish') room.phase = 'guessing'
  } else if (action === 'guess') {
    const r = roundFor(room, body)
    if (room.phase !== 'guessing' || r.guesser !== self.id) fail('只有本轮猜分者可以猜分。', 403)
    if (!Number.isInteger(body.score) || body.score < 0 || body.score > 10) fail('请选择 0–10 分。')
    r.guess = body.score; r.matched = r.guess === r.target
    if (r.matched) room.players.forEach(p => { if ([r.guesser, r.describer].includes(p.id)) p.wins += 1 })
    saveRound(room)
  } else if (action === 'skip') {
    const r = roundFor(room, body)
    if (!['drawing', 'describing', 'guessing'].includes(room.phase)) fail('当前没有需要跳过的轮次。')
    r.skipped = true; saveRound(room)
  } else if (action === 'settings') {
    if (room.phase !== 'lobby') fail('开始后无法修改本局设置。')
    const fresh = newRoom(room.code, self, body.mode, body.total); room.mode = fresh.mode; room.total = fresh.total
  } else if (action === 'restart') {
    if (room.phase !== 'finished') fail('请先玩完本局。')
    room.phase = 'lobby'; room.round = null; room.history = []; room.queue = []; room.players.forEach(p => { p.wins = 0 })
  } else if (['leave', 'kick'].includes(action)) {
    const target = action === 'leave' ? self.id : String(body.player)
    if (action === 'kick' && target === self.id) fail('请使用离开房间。')
    if (!room.players.some(p => p.id === target)) fail('这位玩家已经离开了。')
    room.players = room.players.filter(p => p.id !== target); room.queue = room.queue.filter(id => id !== target)
    if (room.host === target) room.host = room.players[0] ? room.players[0].id : ''
    if (room.round && ['drawing', 'describing', 'guessing'].includes(room.phase) && [room.round.guesser, room.round.describer].includes(target)) { room.round.skipped = true; saveRound(room) }
  } else fail('不支持这个操作。')
}

module.exports = { GameError, player, newRoom, selfPlayer, publicRoom, act }

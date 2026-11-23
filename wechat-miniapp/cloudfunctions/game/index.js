const cloud = require('wx-server-sdk')
const { GameError, player, newRoom, selfPlayer, publicRoom, act } = require('./game')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const rooms = db.collection('rooms')
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DAY = 24 * 60 * 60 * 1000
const code = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

async function createRoom(openid, event) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const roomCode = code()
    const owner = player(openid, event.name)
    const room = newRoom(roomCode, owner, event.mode || 'girl', event.total || 10)
    try {
      await rooms.add({ data: { _id: roomCode, room, expiresAt: Date.now() + DAY, updatedAt: db.serverDate() } })
      return { room: publicRoom(room, owner) }
    } catch (error) {
      if (!String(error.errMsg || error.message).includes('duplicate')) throw error
    }
  }
  throw new GameError('暂时无法生成房间码，请重试。', 503)
}

async function mutate(openid, roomCode, updater) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.collection('rooms').doc(roomCode).get()
    const doc = snapshot.data
    if (!doc || doc.expiresAt < Date.now()) throw new GameError('房间不存在或已经过期。', 404)
    const room = doc.room
    const result = await updater(room)
    if (!room.players.length) await transaction.collection('rooms').doc(roomCode).remove()
    else await transaction.collection('rooms').doc(roomCode).update({ data: { room, expiresAt: Date.now() + DAY, updatedAt: db.serverDate() } })
    return result === undefined ? room : result
  })
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext()
  try {
    const action = event.action
    if (action === 'create') return { ok: true, ...(await createRoom(OPENID, event)) }
    const roomCode = String(event.code || '').trim().toUpperCase()
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode)) throw new GameError('请输入正确的 6 位房间码。')
    if (action === 'join') {
      const room = await mutate(OPENID, roomCode, room => {
        let self = room.players.find(p => p.id === OPENID)
        if (!self) {
          if (room.players.length >= 12) throw new GameError('房间已经满员。')
          self = player(OPENID, event.name); room.players.push(self)
        } else self.name = String(event.name || self.name).trim().slice(0, 16) || self.name
        return publicRoom(room, self)
      })
      return { ok: true, room }
    }
    if (action === 'get') {
      const snapshot = await rooms.doc(roomCode).get()
      if (!snapshot.data || snapshot.data.expiresAt < Date.now()) throw new GameError('房间不存在或已经过期。', 404)
      const room = snapshot.data.room
      return { ok: true, room: publicRoom(room, selfPlayer(room, OPENID)) }
    }
    const room = await mutate(OPENID, roomCode, room => {
      const self = selfPlayer(room, OPENID)
      act(room, self, action, event)
      return room.players.some(p => p.id === OPENID) ? publicRoom(room, selfPlayer(room, OPENID)) : null
    })
    return { ok: true, room, left: !room }
  } catch (error) {
    console.error(error)
    return { ok: false, error: error.message || '操作失败，请重试。', status: error.status || 500 }
  }
}

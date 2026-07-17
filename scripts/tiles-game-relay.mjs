import {WebSocketServer} from 'ws'

const port = Number(process.env.TILES_GAME_RELAY_PORT || 19012)
const rooms = new Map()
const cards = [
  ['red', '7'], ['yellow', '2'], ['green', '7'], ['blue', '9'],
  ['red', '2'], ['yellow', '7'], ['green', '9'], ['blue', '7'],
]

const server = new WebSocketServer({port})
let nextPlayer = 1

server.on('connection', socket => {
  const playerId = `player-${nextPlayer++}`
  let room

  socket.on('message', raw => {
    let message
    try { message = JSON.parse(raw.toString()) } catch { return }
    if (message.type === 'join') {
      const roomId = String(message.room || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40)
      if (!roomId) return send(socket, {type: 'error', message: 'A room code is required.'})
      room ||= getRoom(roomId)
      if (room.players.size >= 2) return send(socket, {type: 'error', message: 'This demo room is full.'})
      room.players.set(playerId, {socket, hand: deal()})
      if (!room.turn) room.turn = playerId
      broadcast(room)
      return
    }
    if (!room || message.type !== 'play') return
    const player = room.players.get(playerId)
    if (!player || room.turn !== playerId) return send(socket, {type: 'error', message: 'It is not your turn.'})
    const index = Number(message.index)
    const card = player.hand[index]
    if (!card) return send(socket, {type: 'error', message: 'That card is not in your hand.'})
    if (card[0] !== room.top[0] && card[1] !== room.top[1]) return send(socket, {type: 'error', message: 'Match the color or number.'})
    player.hand.splice(index, 1)
    room.top = card
    room.turn = [...room.players.keys()].find(id => id !== playerId) || playerId
    broadcast(room)
  })

  socket.on('close', () => {
    if (!room) return
    room.players.delete(playerId)
    if (!room.players.size) rooms.delete(room.id)
    else {
      if (!room.players.has(room.turn)) room.turn = room.players.keys().next().value
      broadcast(room)
    }
  })
})

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, {id, players: new Map(), top: ['red', '7'], turn: undefined})
  return rooms.get(id)
}

function deal() { return cards.slice(0, 5).map(card => [...card]) }

function broadcast(room) {
  for (const [id, player] of room.players) {
    send(player.socket, {
      type: 'state', room: room.id, playerId: id, top: room.top,
      turn: room.turn, playerCount: room.players.size, hand: player.hand,
    })
  }
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload))
}

console.log(`Tiles game relay listening on ws://localhost:${port}`)

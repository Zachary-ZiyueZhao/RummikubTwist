import WebSocket from 'ws'
import type { GameTile, RoomSnapshot, ServerMessage } from '../shared/protocol.ts'

const connect = () => new Promise<WebSocket>((resolve, reject) => {
  const socket = new WebSocket('ws://localhost:8787')
  socket.once('open', () => resolve(socket))
  socket.once('error', reject)
})

const nextMessage = <T extends ServerMessage['type']>(socket: WebSocket, type: T) =>
  new Promise<Extract<ServerMessage, { type: T }>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2500)
    const listener = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString()) as ServerMessage
      if (message.type !== type) return
      clearTimeout(timeout)
      socket.off('message', listener)
      resolve(message as Extract<ServerMessage, { type: T }>)
    }
    socket.on('message', listener)
  })

const expect = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const alice = await connect()
const bob = await connect()

const created = nextMessage(alice, 'room:state')
alice.send(JSON.stringify({ type: 'room:create', playerName: 'Alice' }))
let aliceState: RoomSnapshot = (await created).state
expect(aliceState.status === 'WAITING' && aliceState.yourHand.length === 0, 'room should start in waiting state')

const aliceJoined = nextMessage(alice, 'room:state')
const bobJoined = nextMessage(bob, 'room:state')
bob.send(JSON.stringify({ type: 'room:join', roomId: aliceState.roomId, playerName: 'Bob' }))
aliceState = (await aliceJoined).state
let bobState = (await bobJoined).state
expect(aliceState.players.length === 2 && bobState.players.length === 2, 'join broadcast failed')

const aliceVoiceRoster = nextMessage(alice, 'voice:peers')
alice.send(JSON.stringify({ type: 'voice:join' }))
expect((await aliceVoiceRoster).peers.length === 0, 'first voice participant should receive an empty roster')
const aliceSawBobVoice = nextMessage(alice, 'voice:peer-joined')
const bobVoiceRoster = nextMessage(bob, 'voice:peers')
bob.send(JSON.stringify({ type: 'voice:join' }))
expect((await bobVoiceRoster).peers[0]?.playerId === aliceState.yourPlayerId, 'voice roster did not include the existing participant')
expect((await aliceSawBobVoice).peer.playerId === bobState.yourPlayerId, 'voice join was not broadcast')
const aliceSawBobMute = nextMessage(alice, 'voice:peer-muted')
bob.send(JSON.stringify({ type: 'voice:mute', muted: true }))
expect((await aliceSawBobMute).muted, 'voice mute state was not broadcast')
const aliceSawOffer = nextMessage(alice, 'voice:signal')
bob.send(JSON.stringify({ type: 'voice:signal', targetPlayerId: aliceState.yourPlayerId, signal: { kind: 'offer', sdp: 'test-offer' } }))
expect((await aliceSawOffer).signal.kind === 'offer', 'voice signaling relay failed')
const aliceSawBobLeaveVoice = nextMessage(alice, 'voice:peer-left')
bob.send(JSON.stringify({ type: 'voice:leave' }))
expect((await aliceSawBobLeaveVoice).playerId === bobState.yourPlayerId, 'voice leave was not broadcast')

const aliceStarted = nextMessage(alice, 'room:state')
const bobStarted = nextMessage(bob, 'room:state')
alice.send(JSON.stringify({ type: 'game:start', revision: aliceState.revision }))
aliceState = (await aliceStarted).state
bobState = (await bobStarted).state
expect(aliceState.status === 'PLAYING', 'game did not start')
expect(aliceState.yourHand.length === 14 && bobState.yourHand.length === 14, 'initial deal failed')
expect(aliceState.poolCount === 80, 'deck count is incorrect')
expect(aliceState.turnHasPlayedTile === false, 'commit should stay disabled before a hand tile is played')
expect(aliceState.turnDeadline !== null && aliceState.turnDeadline > Date.now(), 'turn deadline was not started')

const revisionBeforeDevNotice = aliceState.revision
const aliceSawDevActivation = nextMessage(alice, 'room:state')
const bobSawDevActivation = nextMessage(bob, 'room:state')
bob.send(JSON.stringify({ type: 'dev:activate' }))
aliceState = (await aliceSawDevActivation).state
bobState = (await bobSawDevActivation).state
expect(aliceState.developerModeUsed && bobState.developerModeUsed, 'developer activation was not broadcast to the room')
expect(typeof aliceState.developerModeActivatedAt === 'number', 'developer activation timestamp was not recorded')
expect(aliceState.developerModeActivatedAt === bobState.developerModeActivatedAt, 'developer notice timestamp differs between players')
expect(aliceState.revision === revisionBeforeDevNotice, 'developer notice unexpectedly changed the game revision')

const revisionBeforeChat = aliceState.revision
const aliceSawChat = nextMessage(alice, 'chat:message')
const bobSawChat = nextMessage(bob, 'chat:message')
bob.send(JSON.stringify({ type: 'chat:send', text: '  大家好   准备开始  ' }))
const aliceChat = (await aliceSawChat).message
const bobChat = (await bobSawChat).message
expect(aliceChat.text === '大家好 准备开始' && bobChat.id === aliceChat.id, 'chat message was not sanitized and broadcast')
expect(aliceState.revision === revisionBeforeChat, 'chat unexpectedly changed the board revision')

const tile = aliceState.yourHand[0]
const movedCells = aliceState.board.cells.map((row) => [...row])
movedCells[0][0] = tile
// 模拟客户端在左上边缘落牌后，同时向左、向上扩展一格。
movedCells.forEach((row) => row.unshift(null))
movedCells.unshift(Array(movedCells[0].length).fill(null))
const aliceMoved = nextMessage(alice, 'room:state')
const bobMoved = nextMessage(bob, 'room:state')
alice.send(JSON.stringify({
  type: 'board:update',
  revision: aliceState.revision,
  cells: movedCells,
  hand: aliceState.yourHand.slice(1),
}))
aliceState = (await aliceMoved).state
bobState = (await bobMoved).state
expect(bobState.board.cells.length === 7 && bobState.board.cells[0].length === 17, 'expanded board dimensions were rejected')
expect(bobState.board.cells[1][1]?.id === tile.id, 'expanded board broadcast failed')
expect(bobState.board.groups[0]?.isValid === null, 'board was validated before turn submission')
expect(aliceState.turnHasPlayedTile === true, 'playing a hand tile did not enable commit')
expect(aliceState.returnableTileIds.includes(tile.id), 'current-turn tile ownership was not preserved in the room snapshot')

const aliceSawValidation = nextMessage(alice, 'room:state')
const bobSawValidation = nextMessage(bob, 'room:state')
const rejected = nextMessage(alice, 'error')
alice.send(JSON.stringify({ type: 'turn:commit', revision: aliceState.revision }))
aliceState = (await aliceSawValidation).state
bobState = (await bobSawValidation).state
expect((await rejected).code === 'INVALID_GROUP', 'invalid turn was not rejected')
expect(
  aliceState.yourHand.length === 13
  && bobState.board.cells.length === 7
  && bobState.board.cells[0].length === 17
  && bobState.board.cells[1][1]?.id === tile.id
  && bobState.board.groups[0]?.isValid === false,
  'invalid turn layout was not preserved',
)

const aliceDrew = nextMessage(alice, 'room:state')
const bobTurnStarted = nextMessage(bob, 'room:state')
alice.send(JSON.stringify({ type: 'turn:draw', revision: aliceState.revision }))
aliceState = (await aliceDrew).state
bobState = (await bobTurnStarted).state
expect(aliceState.yourHand.length === 15, 'draw failed')
expect(bobState.currentTurnPlayerId === bobState.yourPlayerId, 'turn rotation failed')
expect(bobState.poolCount === 79, 'pool count did not update')
expect(bobState.board.cells.length === 6 && bobState.board.cells[0][0] === null, 'draw did not abandon turn changes')
expect(bobState.turnHasPlayedTile === false, 'new turn inherited the previous commit state')
expect(bobState.turnDeadline !== null && bobState.turnDeadline > Date.now(), 'new turn deadline was not restarted')

const devTiles: GameTile[] = []
for (const request of [
  { color: 'RED', value: 4, jokerType: 'NONE' },
  { color: 'RED', value: 5, jokerType: 'NONE' },
  { color: 'RED', value: 6, jokerType: 'NONE' },
  { color: 'BLACK', value: 0, jokerType: 'STANDARD' },
  { color: 'RED', value: 5, jokerType: 'NONE' },
  { color: 'BLUE', value: 5, jokerType: 'NONE' },
  { color: 'BLACK', value: 5, jokerType: 'NONE' },
] as const) {
  const aliceSawDevTile = nextMessage(alice, 'room:state')
  const bobGotDevTile = nextMessage(bob, 'room:state')
  bob.send(JSON.stringify({ type: 'dev:give-tile', ...request }))
  aliceState = (await aliceSawDevTile).state
  const nextBobState = (await bobGotDevTile).state
  devTiles.push(nextBobState.yourHand.find((tile) => !bobState.yourHand.some((old) => old.id === tile.id))!)
  bobState = nextBobState
}

const scoringCells = bobState.board.cells.map((row) => [...row])
devTiles.slice(0, 4).forEach((devTile, index) => { scoringCells[0][index] = devTile })
devTiles.slice(4).forEach((devTile, index) => { scoringCells[2][index] = devTile })
const aliceSawScoringRun = nextMessage(alice, 'room:state')
const bobSawScoringRun = nextMessage(bob, 'room:state')
bob.send(JSON.stringify({
  type: 'board:update',
  revision: bobState.revision,
  cells: scoringCells,
  hand: bobState.yourHand.filter((tile) => !devTiles.some((devTile) => devTile.id === tile.id)),
}))
aliceState = (await aliceSawScoringRun).state
bobState = (await bobSawScoringRun).state
expect(bobState.turnPlayedScore === 37, 'multiple groups and the resolved joker value were not added correctly')

const aliceTurnResumed = nextMessage(alice, 'room:state')
const bobCommittedOpening = nextMessage(bob, 'room:state')
bob.send(JSON.stringify({ type: 'turn:commit', revision: bobState.revision }))
aliceState = (await aliceTurnResumed).state
bobState = (await bobCommittedOpening).state
expect(bobState.players.find((player) => player.id === bobState.yourPlayerId)?.hasMelted, '30-point opening was not accepted')
expect(aliceState.currentTurnPlayerId === aliceState.yourPlayerId, 'turn did not rotate after scored opening')

// Alice 尚未完成首次出牌：允许她移动桌面旧组合，但 30 分只计算她从手牌新增的牌。
const aliceOpeningTiles: GameTile[] = []
for (const request of [
  { color: 'RED', value: 10, jokerType: 'NONE' },
  { color: 'BLUE', value: 10, jokerType: 'NONE' },
  { color: 'BLACK', value: 10, jokerType: 'NONE' },
] as const) {
  const aliceGotDevTile = nextMessage(alice, 'room:state')
  const bobSawDevTile = nextMessage(bob, 'room:state')
  alice.send(JSON.stringify({ type: 'dev:give-tile', ...request }))
  const nextAliceState = (await aliceGotDevTile).state
  bobState = (await bobSawDevTile).state
  aliceOpeningTiles.push(nextAliceState.yourHand.find((tile) => !aliceState.yourHand.some((old) => old.id === tile.id))!)
  aliceState = nextAliceState
}

const rearrangedCells = aliceState.board.cells.map((row) => [...row])
const oldRun = rearrangedCells[0].slice(0, 4)
const oldGroup = rearrangedCells[2].slice(0, 3)
rearrangedCells[0].fill(null, 0, 4)
rearrangedCells[2].fill(null, 0, 3)
oldRun.forEach((tile, index) => { rearrangedCells[1][5 + index] = tile })
oldGroup.forEach((tile, index) => { rearrangedCells[3][5 + index] = tile })
aliceOpeningTiles.forEach((tile, index) => { rearrangedCells[5][index] = tile })
const aliceSawOwnOpening = nextMessage(alice, 'room:state')
const bobSawAliceOpening = nextMessage(bob, 'room:state')
alice.send(JSON.stringify({
  type: 'board:update',
  revision: aliceState.revision,
  cells: rearrangedCells,
  hand: aliceState.yourHand.filter((tile) => !aliceOpeningTiles.some((openingTile) => openingTile.id === tile.id)),
}))
aliceState = (await aliceSawOwnOpening).state
bobState = (await bobSawAliceOpening).state
expect(aliceState.turnPlayedScore === 30, 'old table tiles were incorrectly counted toward the opening score')

const aliceCommittedOpening = nextMessage(alice, 'room:state')
const bobTurnResumed = nextMessage(bob, 'room:state')
alice.send(JSON.stringify({ type: 'turn:commit', revision: aliceState.revision }))
aliceState = (await aliceCommittedOpening).state
bobState = (await bobTurnResumed).state
expect(aliceState.players.find((player) => player.id === aliceState.yourPlayerId)?.hasMelted, 'opening with rearranged table groups was rejected')
expect(bobState.currentTurnPlayerId === bobState.yourPlayerId, 'turn did not rotate after rearranged opening')

const bobIdentity = bobState.yourPlayerId
const bobReconnectToken = bobState.reconnectToken
const aliceSawDisconnect = nextMessage(alice, 'room:state')
bob.close()
aliceState = (await aliceSawDisconnect).state
expect(aliceState.players.find((player) => player.id === bobIdentity)?.connected === false, 'disconnect grace state was not broadcast')

const bobResumed = await connect()
const aliceSawReconnect = nextMessage(alice, 'room:state')
const bobRecovered = nextMessage(bobResumed, 'room:state')
bobResumed.send(JSON.stringify({
  type: 'room:resume',
  roomId: aliceState.roomId,
  reconnectToken: bobReconnectToken,
}))
bobState = (await bobRecovered).state
aliceState = (await aliceSawReconnect).state
expect(bobState.yourPlayerId === bobIdentity, 'reconnect did not restore player identity')
expect(bobState.yourHand.length === 14, 'reconnect did not restore the private hand')
expect(aliceState.players.find((player) => player.id === bobIdentity)?.connected === true, 'reconnect was not broadcast')

alice.close()
bobResumed.close()
console.log(`Full turn smoke test passed for room ${aliceState.roomId}`)

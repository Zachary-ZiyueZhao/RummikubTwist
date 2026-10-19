import { randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import {
  MAX_BOARD_COLUMNS,
  MAX_BOARD_ROWS,
  MIN_BOARD_COLUMNS,
  MIN_BOARD_ROWS,
  JokerType,
  TileColor,
  type BoardCells,
  type BoardGroupResult,
  type ChatMessage,
  type ClientMessage,
  type GameTile,
  type PublicPlayer,
  type ReplayFrame,
  type RoomSnapshot,
  type RoomSettings,
  type ServerMessage,
  type VoicePeer,
} from '../shared/protocol.ts'
import { validateTileSet } from './validator.ts'
import { calculatePlayedScore } from './scoring.ts'

interface Player {
  id: string
  name: string
  socket: WebSocket | null
  reconnectToken: string
  disconnectedAt: number | null
  removalTimer: ReturnType<typeof setTimeout> | null
  hand: GameTile[]
  hasMelted: boolean
  lastChatAt: number
}

interface TurnSnapshot {
  playerId: string
  cells: BoardCells
  hand: GameTile[]
}

interface Room {
  id: string
  revision: number
  status: RoomSnapshot['status']
  hostPlayerId: string
  settings: RoomSettings
  players: Player[]
  currentTurnPlayerId: string
  cells: BoardCells
  groups: BoardGroupResult[]
  pool: GameTile[]
  winnerPlayerId: string | null
  turnHasChanges: boolean
  turnStart: TurnSnapshot | null
  turnDeadline: number | null
  turnTimer: ReturnType<typeof setTimeout> | null
  developerModeUsed: boolean
  developerModeActivatedAt: number | null
  lastAction: RoomSnapshot['lastAction']
  chatMessages: ChatMessage[]
  replayFrames: ReplayFrame[]
  replayStateKey: string
  voiceParticipants: Map<string, boolean>
}

interface ConnectionIdentity {
  roomId: string
  playerId: string
}

const PORT = Number(process.env.WS_PORT ?? 8787)
const RECONNECT_GRACE_MS = 60_000
const DEFAULT_ROOM_SETTINGS: RoomSettings = { turnDurationSeconds: 60, strictMode: false, scoringMode: false }
const rooms = new Map<string, Room>()
const identities = new WeakMap<WebSocket, ConnectionIdentity>()
const wss = new WebSocketServer({ port: PORT })

const emptyBoard = (): BoardCells =>
  Array.from({ length: MIN_BOARD_ROWS }, () => Array<GameTile | null>(MIN_BOARD_COLUMNS).fill(null))

const cloneCells = (cells: BoardCells): BoardCells =>
  cells.map((row) => row.map((tile) => tile ? { ...tile } : null))

const cloneHand = (hand: GameTile[]) => hand.map((tile) => ({ ...tile }))

const shuffle = <T>(items: T[]) => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[items[index], items[swapIndex]] = [items[swapIndex], items[index]]
  }
  return items
}

// 自定义牌组：两套 1–13 四色牌（104 张）+ 四种特殊 Joker 各一张。
const createFullDeck = (): GameTile[] => {
  const deck: GameTile[] = []
  for (let copy = 0; copy < 2; copy += 1) {
    for (const color of Object.values(TileColor)) {
      for (let value = 1; value <= 13; value += 1) {
        deck.push({ id: randomUUID(), color, value, jokerType: JokerType.NONE })
      }
    }
  }
  for (const jokerType of [JokerType.STANDARD, JokerType.DOUBLE, JokerType.COLOR_CHANGE, JokerType.MIRROR]) {
    deck.push({ id: randomUUID(), color: TileColor.BLACK, value: 0, jokerType })
  }
  return shuffle(deck)
}

const makeRoomId = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  do {
    id = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  } while (rooms.has(id))
  return id
}

const cleanPlayerName = (value: unknown) =>
  (typeof value === 'string' ? value.trim().slice(0, 20) : '') || '玩家'

const isTile = (value: unknown): value is GameTile => {
  if (!value || typeof value !== 'object') return false
  const tile = value as Partial<GameTile>
  return typeof tile.id === 'string'
    && typeof tile.value === 'number'
    && Object.values(TileColor).includes(tile.color as GameTile['color'])
    && Object.values(JokerType).includes(tile.jokerType as GameTile['jokerType'])
}

const isBoard = (value: unknown): value is BoardCells =>
  Array.isArray(value)
  && value.length >= MIN_BOARD_ROWS
  && value.length <= MAX_BOARD_ROWS
  && Array.isArray(value[0])
  && value[0].length >= MIN_BOARD_COLUMNS
  && value[0].length <= MAX_BOARD_COLUMNS
  && value.every((row) => Array.isArray(row)
    && row.length === value[0].length
    && row.every((cell) => cell === null || isTile(cell)))

const analyzeBoard = (cells: BoardCells, validate = false): BoardGroupResult[] => {
  const groups: BoardGroupResult[] = []
  cells.forEach((row, rowIndex) => {
    let startColumn: number | null = null
    const finish = (endColumn: number) => {
      if (startColumn === null) return
      const tiles = row.slice(startColumn, endColumn).filter((tile): tile is GameTile => tile !== null)
      const validation = validate ? validateTileSet(tiles) : null
      groups.push({
        id: groups.length + 1,
        row: rowIndex,
        startColumn,
        endColumn: endColumn - 1,
        length: tiles.length,
        isValid: validate ? validation?.isValid ?? false : null,
        score: validation?.score ?? 0,
      })
      startColumn = null
    }
    row.forEach((tile, columnIndex) => {
      if (tile && startColumn === null) startColumn = columnIndex
      if (!tile) finish(columnIndex)
    })
    finish(row.length)
  })
  return groups
}

const allBoardTiles = (cells: BoardCells) =>
  cells.flat().filter((tile): tile is GameTile => tile !== null)

const inventoryMatches = (before: GameTile[], after: GameTile[]) => {
  if (before.length !== after.length) return false
  const beforeById = new Map(before.map((tile) => [tile.id, tile]))
  if (beforeById.size !== before.length || new Set(after.map((tile) => tile.id)).size !== after.length) return false
  return after.every((tile) => {
    const original = beforeById.get(tile.id)
    return original
      && original.color === tile.color
      && original.value === tile.value
      && original.jokerType === tile.jokerType
  })
}

const boardAndHandKey = (cells: BoardCells, hand: GameTile[]) =>
  `${cells.map((row) => row.map((tile) => tile?.id ?? '-').join(',')).join('|')}::${hand.map((tile) => tile.id).sort().join(',')}`

const turnPlayedScore = (room: Room) => {
  if (!room.turnStart) return 0
  return calculatePlayedScore(room.cells, room.turnStart.hand)
}

const turnHasPlayedTile = (room: Room) => {
  if (!room.turnStart) return false
  const originalHandIds = new Set(room.turnStart.hand.map((tile) => tile.id))
  return allBoardTiles(room.cells).some((tile) => originalHandIds.has(tile.id))
}

const send = (socket: WebSocket | null, message: ServerMessage) => {
  if (!socket) return
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}
const sendError = (socket: WebSocket | null, code: string, message: string) =>
  send(socket, { type: 'error', code, message })

const snapshotFor = (room: Room, player: Player): RoomSnapshot => ({
  roomId: room.id,
  revision: room.revision,
  status: room.status,
  hostPlayerId: room.hostPlayerId,
  settings: room.settings,
  players: room.players.map(({ id, name, hand, hasMelted, socket, disconnectedAt }): PublicPlayer => ({
    id,
    name,
    handCount: hand.length,
    hasMelted,
    connected: socket?.readyState === WebSocket.OPEN,
    reconnectDeadline: disconnectedAt === null ? null : disconnectedAt + RECONNECT_GRACE_MS,
  })),
  currentTurnPlayerId: room.currentTurnPlayerId,
  poolCount: room.pool.length,
  winnerPlayerId: room.winnerPlayerId,
  turnHasChanges: room.turnHasChanges,
  turnHasPlayedTile: turnHasPlayedTile(room),
  turnDeadline: room.turnDeadline,
  turnPlayedScore: turnPlayedScore(room),
  developerModeUsed: room.developerModeUsed,
  developerModeActivatedAt: room.developerModeActivatedAt,
  chatMessages: room.chatMessages,
  board: { cells: room.cells, groups: room.groups },
  returnableTileIds: room.turnStart?.playerId === player.id
    ? room.turnStart.hand.map((tile) => tile.id)
    : [],
  yourPlayerId: player.id,
  reconnectToken: player.reconnectToken,
  yourHand: player.hand,
  lastAction: room.lastAction,
})

const sendState = (room: Room, player: Player) =>
  send(player.socket, { type: 'room:state', state: snapshotFor(room, player) })
const replayStateKey = (room: Room) => JSON.stringify({
  status: room.status,
  turn: room.currentTurnPlayerId,
  pool: room.pool.length,
  board: room.cells.map((row) => row.map((tile) => tile?.id ?? null)),
  hands: room.players.map((player) => [player.id, player.hand.map((tile) => tile.id)]),
})
const recordReplayFrame = (room: Room) => {
  if (room.status !== 'PLAYING' && room.status !== 'FINISHED') return
  const stateKey = replayStateKey(room)
  if (stateKey === room.replayStateKey) return
  room.replayStateKey = stateKey
  room.replayFrames.push({
    index: room.replayFrames.length,
    timestamp: Date.now(),
    action: { ...room.lastAction },
    status: room.status,
    currentTurnPlayerId: room.currentTurnPlayerId,
    poolCount: room.pool.length,
    board: cloneCells(room.cells),
    players: room.players.map((player) => ({ id: player.id, name: player.name, hand: cloneHand(player.hand) })),
  })
}
const broadcastState = (room: Room) => {
  recordReplayFrame(room)
  room.players.forEach((player) => {
    if (player.socket) sendState(room, player)
  })
}

const getIdentity = (socket: WebSocket) => {
  const identity = identities.get(socket)
  if (!identity) return null
  const room = rooms.get(identity.roomId)
  const player = room?.players.find((candidate) => candidate.id === identity.playerId && candidate.socket === socket)
  return room && player ? { room, player } : null
}

const requirePlayingTurn = (socket: WebSocket) => {
  const context = getIdentity(socket)
  if (!context) {
    sendError(socket, 'NOT_IN_ROOM', '请先创建或加入房间。')
    return null
  }
  if (context.room.status !== 'PLAYING') {
    sendError(socket, 'GAME_NOT_PLAYING', '游戏尚未开始或已经结束。')
    return null
  }
  if (context.room.currentTurnPlayerId !== context.player.id) {
    sendError(socket, 'NOT_YOUR_TURN', '现在不是你的回合。')
    sendState(context.room, context.player)
    return null
  }
  return context
}

const clearTurnClock = (room: Room) => {
  if (room.turnTimer) clearTimeout(room.turnTimer)
  room.turnTimer = null
  room.turnDeadline = null
}

const beginTurn = (room: Room) => {
  clearTurnClock(room)
  const player = room.players.find((candidate) => candidate.id === room.currentTurnPlayerId)
  room.turnHasChanges = false
  room.turnStart = player ? {
    playerId: player.id,
    cells: cloneCells(room.cells),
    hand: cloneHand(player.hand),
  } : null
  if (player && room.status === 'PLAYING') {
    const durationMs = room.settings.turnDurationSeconds * 1000
    room.turnDeadline = Date.now() + durationMs
    room.turnTimer = setTimeout(() => handleTurnTimeout(room, player.id), durationMs)
  }
}

const rollbackTurn = (room: Room, player: Player) => {
  const baseline = room.turnStart
  if (!baseline || baseline.playerId !== player.id) return
  room.cells = cloneCells(baseline.cells)
  player.hand = cloneHand(baseline.hand)
  room.groups = analyzeBoard(room.cells)
  room.turnHasChanges = false
}

const advanceTurn = (room: Room, currentPlayerId: string) => {
  const currentIndex = room.players.findIndex((player) => player.id === currentPlayerId)
  room.currentTurnPlayerId = room.players[(currentIndex + 1) % room.players.length].id
  beginTurn(room)
}

const drawTileAndAdvance = (room: Room, player: Player) => {
  rollbackTurn(room, player)
  const tile = room.pool.pop()
  if (tile) player.hand.push(tile)
  room.revision += 1
  room.lastAction = { type: tile ? 'TILE_DRAWN' : 'TURN_ENDED', playerId: player.id }
  advanceTurn(room, player.id)
  broadcastState(room)
}

const handleTurnTimeout = (room: Room, playerId: string) => {
  if (room.status !== 'PLAYING' || room.currentTurnPlayerId !== playerId) return
  const player = room.players.find((candidate) => candidate.id === playerId)
  if (!player) return
  room.groups = analyzeBoard(room.cells, true)
  const invalidGroup = room.groups.find((group) => group.length < 3 || group.isValid !== true)
  if (invalidGroup) {
    rollbackTurn(room, player)
    const tile = room.pool.pop()
    if (tile) player.hand.push(tile)
    room.revision += 1
    room.lastAction = { type: 'TURN_TIMEOUT_INVALID_REVERTED', playerId: player.id }
    advanceTurn(room, player.id)
    broadcastState(room)
    return
  }

  if (turnHasPlayedTile(room)) {
    if (player.hand.length === 0) {
      clearTurnClock(room)
      room.status = 'FINISHED'
      room.winnerPlayerId = player.id
      room.turnHasChanges = false
      room.turnStart = null
      room.revision += 1
      room.lastAction = { type: 'GAME_FINISHED', playerId: player.id }
      broadcastState(room)
      return
    }
    room.revision += 1
    room.lastAction = { type: 'TURN_TIMEOUT_PLAYED', playerId: player.id }
    advanceTurn(room, player.id)
    broadcastState(room)
    return
  }

  // A valid rearrangement without a newly played tile ends with a mandatory draw.
  const tile = room.pool.pop()
  if (tile) player.hand.push(tile)
  room.revision += 1
  room.lastAction = { type: 'TURN_TIMEOUT_NO_PLAY_DRAWN', playerId: player.id }
  advanceTurn(room, player.id)
  broadcastState(room)
}

const createRoom = (socket: WebSocket, playerName: unknown) => {
  if (getIdentity(socket)) return sendError(socket, 'ALREADY_IN_ROOM', '你已经在一个房间中。')
  const player: Player = {
    id: randomUUID(), name: cleanPlayerName(playerName), socket, reconnectToken: randomUUID(),
    disconnectedAt: null, removalTimer: null, hand: [], hasMelted: false, lastChatAt: 0,
  }
  const room: Room = {
    id: makeRoomId(),
    revision: 0,
    status: 'WAITING',
    hostPlayerId: player.id,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    players: [player],
    currentTurnPlayerId: player.id,
    cells: emptyBoard(),
    groups: [],
    pool: [],
    winnerPlayerId: null,
    turnHasChanges: false,
    turnStart: null,
    turnDeadline: null,
    turnTimer: null,
    developerModeUsed: false,
    developerModeActivatedAt: null,
    lastAction: { type: 'ROOM_CREATED', playerId: player.id },
    chatMessages: [],
    replayFrames: [],
    replayStateKey: '',
    voiceParticipants: new Map(),
  }
  rooms.set(room.id, room)
  identities.set(socket, { roomId: room.id, playerId: player.id })
  sendState(room, player)
}

const joinRoom = (socket: WebSocket, roomId: unknown, playerName: unknown) => {
  if (getIdentity(socket)) return sendError(socket, 'ALREADY_IN_ROOM', '你已经在一个房间中。')
  const normalizedId = typeof roomId === 'string' ? roomId.trim().toUpperCase() : ''
  const room = rooms.get(normalizedId)
  if (!room) return sendError(socket, 'ROOM_NOT_FOUND', '没有找到这个房间。')
  if (room.status !== 'WAITING') return sendError(socket, 'GAME_ALREADY_STARTED', '游戏已经开始，暂时不能中途加入。')
  if (room.players.length >= 4) return sendError(socket, 'ROOM_FULL', '房间人数已满。')

  const player: Player = {
    id: randomUUID(), name: cleanPlayerName(playerName), socket, reconnectToken: randomUUID(),
    disconnectedAt: null, removalTimer: null, hand: [], hasMelted: false, lastChatAt: 0,
  }
  room.players.push(player)
  room.revision += 1
  room.lastAction = { type: 'PLAYER_JOINED', playerId: player.id }
  identities.set(socket, { roomId: room.id, playerId: player.id })
  broadcastState(room)
}

const updateRoomSettings = (socket: WebSocket, revision: number, settings: RoomSettings) => {
  const context = getIdentity(socket)
  if (!context) return sendError(socket, 'NOT_IN_ROOM', '请先创建或加入房间。')
  const { room, player } = context
  if (room.status !== 'WAITING') return sendError(socket, 'SETTINGS_LOCKED', '游戏开始后不能修改房间设置。')
  if (player.id !== room.hostPlayerId) return sendError(socket, 'HOST_ONLY', '只有房主可以修改房间设置。')
  if (revision !== room.revision) {
    sendError(socket, 'STALE_REVISION', '房间设置刚刚发生变化，请重试。')
    sendState(room, player)
    return
  }
  const duration = settings?.turnDurationSeconds
  if (!Number.isInteger(duration) || duration < 30 || duration > 180
    || typeof settings.strictMode !== 'boolean' || typeof settings.scoringMode !== 'boolean') {
    return sendError(socket, 'INVALID_ROOM_SETTINGS', '房间设置无效。')
  }
  room.settings = { turnDurationSeconds: duration, strictMode: settings.strictMode, scoringMode: settings.scoringMode }
  room.revision += 1
  room.lastAction = { type: 'ROOM_SETTINGS_UPDATED', playerId: player.id }
  broadcastState(room)
}

const startGame = (socket: WebSocket, revision: number) => {
  const context = getIdentity(socket)
  if (!context) return sendError(socket, 'NOT_IN_ROOM', '请先创建房间。')
  const { room, player } = context
  if (player.id !== room.hostPlayerId) return sendError(socket, 'HOST_ONLY', '只有房主可以开始游戏。')
  if (room.status !== 'WAITING') return sendError(socket, 'ALREADY_STARTED', '游戏已经开始。')
  if (room.players.filter((candidate) => candidate.socket?.readyState === WebSocket.OPEN).length < 2) {
    return sendError(socket, 'NEED_MORE_PLAYERS', '至少需要两名在线玩家才能开始。')
  }
  if (revision !== room.revision) return sendError(socket, 'STALE_REVISION', '房间成员刚刚发生变化，请重试。')

  room.pool = createFullDeck()
  room.cells = emptyBoard()
  room.groups = []
  room.winnerPlayerId = null
  room.players.forEach((candidate) => {
    candidate.hand = []
    candidate.hasMelted = false
  })
  for (let count = 0; count < 14; count += 1) {
    room.players.forEach((candidate) => {
      const tile = room.pool.pop()
      if (tile) candidate.hand.push(tile)
    })
  }
  room.status = 'PLAYING'
  room.replayFrames = []
  room.replayStateKey = ''
  room.currentTurnPlayerId = room.players[0].id
  room.revision += 1
  room.lastAction = { type: 'GAME_STARTED', playerId: player.id }
  beginTurn(room)
  broadcastState(room)
}

const updateBoard = (socket: WebSocket, message: Extract<ClientMessage, { type: 'board:update' }>) => {
  const context = requirePlayingTurn(socket)
  if (!context) return
  const { room, player } = context
  if (message.revision !== room.revision) {
    sendError(socket, 'STALE_REVISION', '桌面已经更新，已恢复为最新状态。')
    sendState(room, player)
    return
  }
  if (!isBoard(message.cells) || !Array.isArray(message.hand) || !message.hand.every(isTile)) {
    sendError(socket, 'INVALID_BOARD', '桌面数据格式不正确。')
    sendState(room, player)
    return
  }
  const beforeInventory = [...allBoardTiles(room.cells), ...player.hand]
  const afterInventory = [...allBoardTiles(message.cells), ...message.hand]
  if (!inventoryMatches(beforeInventory, afterInventory)) {
    sendError(socket, 'TILE_INVENTORY_MISMATCH', '牌的数量或内容不一致，已恢复服务端状态。')
    sendState(room, player)
    return
  }
  const baselineBoardIds = new Set(allBoardTiles(room.turnStart?.cells ?? room.cells).map((tile) => tile.id))
  const nextBoardIds = new Set(allBoardTiles(message.cells).map((tile) => tile.id))
  if ([...baselineBoardIds].some((id) => !nextBoardIds.has(id))) {
    sendError(socket, 'BOARD_TILE_REMOVED', '场上已有的牌不能收回手牌。')
    sendState(room, player)
    return
  }

  room.cells = cloneCells(message.cells)
  player.hand = cloneHand(message.hand)
  // 摆牌过程中只计算横向组合的范围，合法性只在提交时统一判定。
  room.groups = analyzeBoard(room.cells, false)
  const baseline = room.turnStart
  room.turnHasChanges = baseline
    ? boardAndHandKey(room.cells, player.hand) !== boardAndHandKey(baseline.cells, baseline.hand)
    : false
  room.revision += 1
  room.lastAction = { type: 'BOARD_UPDATED', playerId: player.id }
  broadcastState(room)
}

const rejectCommit = (room: Room, player: Player, code: string, message: string) => {
  room.revision += 1
  room.lastAction = { type: 'TURN_VALIDATION_FAILED', playerId: player.id }
  broadcastState(room)
  sendError(player.socket, code, message)
}

const commitTurn = (socket: WebSocket, revision: number) => {
  const context = requirePlayingTurn(socket)
  if (!context) return
  const { room, player } = context
  if (revision !== room.revision) {
    sendError(socket, 'STALE_REVISION', '桌面已经更新，请再确认一次。')
    sendState(room, player)
    return
  }
  if (!room.turnStart || !turnHasPlayedTile(room)) {
    sendError(socket, 'NO_TURN_CHANGES', '本回合尚未出牌；如果不出牌，请选择摸一张。')
    return
  }
  room.groups = analyzeBoard(room.cells, true)
  const invalidGroup = room.groups.find((group) => group.length < 3 || group.isValid !== true)
  if (invalidGroup) {
    rejectCommit(room, player, 'INVALID_GROUP', `第 ${invalidGroup.row + 1} 行存在未完成或不合法的组合，请调整红框中的牌。`)
    return
  }

  const baselineBoardIds = new Set(allBoardTiles(room.turnStart.cells).map((tile) => tile.id))
  const currentBoardIds = new Set(allBoardTiles(room.cells).map((tile) => tile.id))
  if ([...baselineBoardIds].some((id) => !currentBoardIds.has(id))) {
    rejectCommit(room, player, 'BOARD_TILE_REMOVED', '不能把桌面已有的牌收入手牌。')
    return
  }

  const baselineHandIds = new Set(room.turnStart.hand.map((tile) => tile.id))
  const playedIds = new Set([...baselineHandIds].filter((id) => currentBoardIds.has(id)))
  if (playedIds.size === 0) {
    rejectCommit(room, player, 'NO_TILE_PLAYED', '每个提交回合至少要从手牌打出一张牌。')
    return
  }

  if (!player.hasMelted) {
    const openingScore = turnPlayedScore(room)
    if (openingScore < 30) {
      rejectCommit(room, player, 'OPENING_MELD_FAILED', `首次出牌总值需要至少 30 分，当前为 ${openingScore} 分；桌面摆法已保留。`)
      return
    }
    player.hasMelted = true
  }

  if (player.hand.length === 0) {
    clearTurnClock(room)
    room.status = 'FINISHED'
    room.winnerPlayerId = player.id
    room.turnHasChanges = false
    room.turnStart = null
    room.revision += 1
    room.lastAction = { type: 'GAME_FINISHED', playerId: player.id }
    broadcastState(room)
    return
  }

  room.revision += 1
  room.lastAction = { type: 'TURN_ENDED', playerId: player.id }
  advanceTurn(room, player.id)
  broadcastState(room)
}

const drawAndEndTurn = (socket: WebSocket, revision: number) => {
  const context = requirePlayingTurn(socket)
  if (!context) return
  const { room, player } = context
  if (revision !== room.revision) {
    sendError(socket, 'STALE_REVISION', '桌面已经更新，请重试。')
    sendState(room, player)
    return
  }
  drawTileAndAdvance(room, player)
}

// 还原只撤销当前玩家自本回合开始后的摆放；不结束回合，也不触碰倒计时。
const revertTurn = (socket: WebSocket, revision: number) => {
  const context = requirePlayingTurn(socket)
  if (!context) return
  const { room, player } = context
  if (revision !== room.revision) {
    sendError(socket, 'STALE_REVISION', '桌面已经更新，请重试。')
    sendState(room, player)
    return
  }
  if (!room.turnStart) return
  rollbackTurn(room, player)
  room.revision += 1
  room.lastAction = { type: 'TURN_REVERTED', playerId: player.id }
  broadcastState(room)
}

const markDeveloperModeUsed = (room: Room) => {
  if (room.developerModeUsed) return false
  room.developerModeUsed = true
  room.developerModeActivatedAt = Date.now()
  return true
}

const activateDeveloperMode = (socket: WebSocket) => {
  const context = getIdentity(socket)
  if (!context) return sendError(socket, 'NOT_IN_ROOM', '请先进入房间。')
  const { room } = context
  if (room.status !== 'PLAYING') return sendError(socket, 'GAME_NOT_PLAYING', '游戏尚未开始或已经结束。')
  if (markDeveloperModeUsed(room)) broadcastState(room)
}

const giveDevTile = (
  socket: WebSocket,
  message: Extract<ClientMessage, { type: 'dev:give-tile' }>,
) => {
  const context = requirePlayingTurn(socket)
  if (!context) return
  const { room, player } = context
  const isKnownColor = Object.values(TileColor).includes(message.color)
  const isKnownJoker = Object.values(JokerType).includes(message.jokerType)
  const isValidValue = Number.isInteger(message.value) && message.value >= 1 && message.value <= 13
  if (!isKnownColor || !isKnownJoker || (message.jokerType === JokerType.NONE && !isValidValue)) {
    return sendError(socket, 'INVALID_DEV_TILE', '开发者牌参数不正确。')
  }
  markDeveloperModeUsed(room)

  const poolIndex = room.pool.findIndex((tile) => message.jokerType === JokerType.NONE
    ? tile.jokerType === JokerType.NONE && tile.color === message.color && tile.value === message.value
    : tile.jokerType === message.jokerType)
  const tile = poolIndex >= 0
    ? room.pool.splice(poolIndex, 1)[0]
    : {
        id: randomUUID(),
        color: message.jokerType === JokerType.NONE ? message.color : TileColor.BLACK,
        value: message.jokerType === JokerType.NONE ? message.value : 0,
        jokerType: message.jokerType,
      }
  player.hand.push(tile)
  if (room.turnStart?.playerId === player.id) room.turnStart.hand.push({ ...tile })
  room.revision += 1
  room.lastAction = { type: 'DEV_TILE_ADDED', playerId: player.id }
  broadcastState(room)
}

const giveDevTiles = (
  socket: WebSocket,
  message: Extract<ClientMessage, { type: 'dev:give-tiles' }>,
) => {
  const context = requirePlayingTurn(socket)
  if (!context) return
  const { room, player } = context
  const requests = Array.isArray(message.tiles) ? message.tiles : []
  const isValidRequest = (request: typeof requests[number]) => {
    const isKnownColor = Object.values(TileColor).includes(request.color)
    const isKnownJoker = Object.values(JokerType).includes(request.jokerType)
    const isValidValue = Number.isInteger(request.value) && request.value >= 1 && request.value <= 13
    return isKnownColor && isKnownJoker && (request.jokerType !== JokerType.NONE || isValidValue)
  }
  if (!requests.length || requests.length > 16 || !requests.every(isValidRequest)) {
    return sendError(socket, 'INVALID_DEV_TILE', '开发者牌参数不正确。')
  }
  markDeveloperModeUsed(room)

  const tiles = requests.map((request) => {
    const poolIndex = room.pool.findIndex((tile) => request.jokerType === JokerType.NONE
      ? tile.jokerType === JokerType.NONE && tile.color === request.color && tile.value === request.value
      : tile.jokerType === request.jokerType)
    return poolIndex >= 0
      ? room.pool.splice(poolIndex, 1)[0]
      : {
          id: randomUUID(),
          color: request.jokerType === JokerType.NONE ? request.color : TileColor.BLACK,
          value: request.jokerType === JokerType.NONE ? request.value : 0,
          jokerType: request.jokerType,
        }
  })
  player.hand.push(...tiles)
  if (room.turnStart?.playerId === player.id) room.turnStart.hand.push(...tiles.map((tile) => ({ ...tile })))
  room.revision += 1
  room.lastAction = { type: 'DEV_TILE_ADDED', playerId: player.id }
  broadcastState(room)
}

const sendChatMessage = (socket: WebSocket, text: unknown) => {
  const context = getIdentity(socket)
  if (!context) return sendError(socket, 'NOT_IN_ROOM', '请先进入房间。')
  const { room, player } = context
  if (room.status !== 'PLAYING') return sendError(socket, 'CHAT_NOT_AVAILABLE', '游戏开始后才能发送局内消息。')
  const cleanText = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').slice(0, 160) : ''
  if (!cleanText) return sendError(socket, 'EMPTY_CHAT_MESSAGE', '不能发送空消息。')
  if (Date.now() - player.lastChatAt < 500) return sendError(socket, 'CHAT_TOO_FAST', '消息发送得太快了。')

  player.lastChatAt = Date.now()
  const message: ChatMessage = {
    id: randomUUID(),
    playerId: player.id,
    playerName: player.name,
    text: cleanText,
    createdAt: Date.now(),
  }
  room.chatMessages.push(message)
  if (room.chatMessages.length > 60) room.chatMessages.splice(0, room.chatMessages.length - 60)
  room.players.forEach((recipient) => send(recipient.socket, { type: 'chat:message', message }))
}

const sendReplay = (socket: WebSocket) => {
  const context = getIdentity(socket)
  if (!context) return sendError(socket, 'NOT_IN_ROOM', '请先进入房间。')
  const { room } = context
  if (room.status !== 'FINISHED') return sendError(socket, 'REPLAY_NOT_READY', '对局结束后才能查看完整回放。')
  send(socket, {
    type: 'replay:data',
    replay: { roomId: room.id, winnerPlayerId: room.winnerPlayerId, frames: room.replayFrames },
  })
}

const voicePeerFor = (room: Room, playerId: string): VoicePeer | null => {
  const player = room.players.find((candidate) => candidate.id === playerId)
  if (!player) return null
  return { playerId: player.id, playerName: player.name, muted: room.voiceParticipants.get(player.id) ?? false }
}

const leaveVoice = (room: Room, playerId: string) => {
  if (!room.voiceParticipants.delete(playerId)) return
  room.voiceParticipants.forEach((_muted, recipientId) => {
    const recipient = room.players.find((candidate) => candidate.id === recipientId)
    send(recipient?.socket ?? null, { type: 'voice:peer-left', playerId })
  })
}

const joinVoice = (socket: WebSocket) => {
  const context = getIdentity(socket)
  if (!context) return sendError(socket, 'NOT_IN_ROOM', '请先进入房间。')
  const { room, player } = context
  const wasPresent = room.voiceParticipants.has(player.id)
  const peers = [...room.voiceParticipants.keys()]
    .filter((playerId) => playerId !== player.id)
    .flatMap((playerId) => {
      const peer = voicePeerFor(room, playerId)
      return peer ? [peer] : []
    })
  room.voiceParticipants.set(player.id, false)
  send(socket, { type: 'voice:peers', peers })
  if (wasPresent) return
  const joinedPeer = voicePeerFor(room, player.id)
  if (!joinedPeer) return
  peers.forEach((peer) => {
    const recipient = room.players.find((candidate) => candidate.id === peer.playerId)
    send(recipient?.socket ?? null, { type: 'voice:peer-joined', peer: joinedPeer })
  })
}

const updateVoiceMute = (socket: WebSocket, muted: unknown) => {
  const context = getIdentity(socket)
  if (!context || !context.room.voiceParticipants.has(context.player.id) || typeof muted !== 'boolean') return
  const { room, player } = context
  room.voiceParticipants.set(player.id, muted)
  room.voiceParticipants.forEach((_state, recipientId) => {
    if (recipientId === player.id) return
    const recipient = room.players.find((candidate) => candidate.id === recipientId)
    send(recipient?.socket ?? null, { type: 'voice:peer-muted', playerId: player.id, muted })
  })
}

const relayVoiceSignal = (socket: WebSocket, message: Extract<ClientMessage, { type: 'voice:signal' }>) => {
  const context = getIdentity(socket)
  if (!context) return
  const { room, player } = context
  if (!room.voiceParticipants.has(player.id) || !room.voiceParticipants.has(message.targetPlayerId)) return
  const target = room.players.find((candidate) => candidate.id === message.targetPlayerId)
  if (!target?.socket) return
  const signal = message.signal
  const validDescription = (signal.kind === 'offer' || signal.kind === 'answer') && typeof signal.sdp === 'string'
  const validCandidate = signal.kind === 'ice' && typeof signal.candidate === 'string'
  if (!validDescription && !validCandidate) return
  send(target.socket, { type: 'voice:signal', fromPlayerId: player.id, signal })
}

const resetToWaiting = (room: Room) => {
  clearTurnClock(room)
  room.status = 'WAITING'
  room.cells = emptyBoard()
  room.groups = []
  room.pool = []
  room.winnerPlayerId = null
  room.turnStart = null
  room.turnHasChanges = false
  room.developerModeUsed = false
  room.developerModeActivatedAt = null
  room.players.forEach((player) => {
    player.hand = []
    player.hasMelted = false
  })
  room.currentTurnPlayerId = room.players[0].id
}

const removePlayer = (room: Room, player: Player) => {
  if (player.removalTimer) clearTimeout(player.removalTimer)
  player.removalTimer = null
  leaveVoice(room, player.id)
  if (room.status === 'PLAYING' && room.currentTurnPlayerId === player.id) rollbackTurn(room, player)
  const leavingIndex = room.players.findIndex((candidate) => candidate.id === player.id)
  if (leavingIndex < 0) return
  room.players.splice(leavingIndex, 1)
  if (room.players.length === 0) {
    clearTurnClock(room)
    rooms.delete(room.id)
    return
  }
  if (room.hostPlayerId === player.id) room.hostPlayerId = room.players[0].id
  if (room.status === 'PLAYING' && room.players.length < 2) {
    // 对局中有人主动离开，最后留在房间的玩家直接获胜，而不是被送回等待大厅。
    clearTurnClock(room)
    room.status = 'FINISHED'
    room.winnerPlayerId = room.players[0].id
    room.currentTurnPlayerId = room.players[0].id
    room.turnStart = null
    room.turnHasChanges = false
  } else if (room.status === 'PLAYING' && room.currentTurnPlayerId === player.id) {
    room.currentTurnPlayerId = room.players[leavingIndex % room.players.length].id
    beginTurn(room)
  }
  room.revision += 1
  room.lastAction = { type: 'PLAYER_LEFT', playerId: player.id }
  broadcastState(room)
}

const leaveRoom = (socket: WebSocket) => {
  const context = getIdentity(socket)
  if (!context) return
  identities.delete(socket)
  context.player.socket = null
  removePlayer(context.room, context.player)
}

const resumeRoom = (socket: WebSocket, roomId: unknown, reconnectToken: unknown) => {
  if (getIdentity(socket)) return sendError(socket, 'ALREADY_IN_ROOM', '你已经在一个房间中。')
  const normalizedId = typeof roomId === 'string' ? roomId.trim().toUpperCase() : ''
  const token = typeof reconnectToken === 'string' ? reconnectToken : ''
  const room = rooms.get(normalizedId)
  if (!room) return sendError(socket, 'RESUME_ROOM_NOT_FOUND', '原房间已经关闭，请重新创建或加入房间。')
  const player = room.players.find((candidate) => candidate.reconnectToken === token)
  if (!player) return sendError(socket, 'RESUME_EXPIRED', '重连凭证已失效，请重新加入房间。')
  if (player.disconnectedAt !== null && Date.now() - player.disconnectedAt > RECONNECT_GRACE_MS) {
    removePlayer(room, player)
    return sendError(socket, 'RESUME_EXPIRED', '已超过一分钟重连时间，请重新加入房间。')
  }

  if (player.removalTimer) clearTimeout(player.removalTimer)
  if (player.socket && player.socket.readyState === WebSocket.OPEN) player.socket.close(4001, '在其他页面恢复连接')
  player.socket = socket
  player.disconnectedAt = null
  player.removalTimer = null
  identities.set(socket, { roomId: room.id, playerId: player.id })
  room.revision += 1
  room.lastAction = { type: 'PLAYER_RECONNECTED', playerId: player.id }
  broadcastState(room)
}

const rematch = (socket: WebSocket, revision: number) => {
  const context = getIdentity(socket)
  if (!context) return sendError(socket, 'NOT_IN_ROOM', '请先进入房间。')
  const { room, player } = context
  if (room.status !== 'FINISHED') return sendError(socket, 'GAME_NOT_FINISHED', '当前游戏尚未结束。')
  if (room.hostPlayerId !== player.id) return sendError(socket, 'HOST_ONLY', '只有房主可以发起再来一局。')
  if (revision !== room.revision) return sendError(socket, 'STALE_REVISION', '房间状态刚刚变化，请重试。')
  resetToWaiting(room)
  room.revision += 1
  room.lastAction = { type: 'REMATCH_REQUESTED', playerId: player.id }
  broadcastState(room)
}

const markDisconnected = (socket: WebSocket) => {
  const context = getIdentity(socket)
  identities.delete(socket)
  if (!context || context.player.socket !== socket) return
  const { room, player } = context
  leaveVoice(room, player.id)
  player.socket = null
  player.disconnectedAt = Date.now()
  room.revision += 1
  room.lastAction = { type: 'PLAYER_DISCONNECTED', playerId: player.id }
  broadcastState(room)
  player.removalTimer = setTimeout(() => {
    if (player.socket || player.disconnectedAt === null) return
    removePlayer(room, player)
  }, RECONNECT_GRACE_MS)
}

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let message: ClientMessage
    try {
      message = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      sendError(socket, 'INVALID_JSON', '消息不是合法的 JSON。')
      return
    }
    switch (message.type) {
      case 'room:create': createRoom(socket, message.playerName); break
      case 'room:join': joinRoom(socket, message.roomId, message.playerName); break
      case 'room:resume': resumeRoom(socket, message.roomId, message.reconnectToken); break
      case 'room:leave': leaveRoom(socket); break
      case 'voice:join': joinVoice(socket); break
      case 'voice:leave': {
        const context = getIdentity(socket)
        if (context) leaveVoice(context.room, context.player.id)
        break
      }
      case 'voice:mute': updateVoiceMute(socket, message.muted); break
      case 'voice:signal': relayVoiceSignal(socket, message); break
      case 'room:update-settings': updateRoomSettings(socket, message.revision, message.settings); break
      case 'game:start': startGame(socket, message.revision); break
      case 'game:rematch': rematch(socket, message.revision); break
      case 'board:update': updateBoard(socket, message); break
      case 'turn:commit': commitTurn(socket, message.revision); break
      case 'turn:draw': drawAndEndTurn(socket, message.revision); break
      case 'turn:revert': revertTurn(socket, message.revision); break
      case 'replay:request': sendReplay(socket); break
      case 'dev:activate': activateDeveloperMode(socket); break
      case 'dev:give-tile': giveDevTile(socket, message); break
      case 'dev:give-tiles': giveDevTiles(socket, message); break
      case 'chat:send': sendChatMessage(socket, message.text); break
      default: sendError(socket, 'UNKNOWN_MESSAGE', '未知的消息类型。')
    }
  })
  socket.on('close', () => markDisconnected(socket))
})

console.log(`[game-server] WebSocket listening on ws://localhost:${PORT}`)

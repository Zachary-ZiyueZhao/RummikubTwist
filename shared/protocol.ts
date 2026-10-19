export const MIN_BOARD_ROWS = 6
export const MIN_BOARD_COLUMNS = 16
export const MAX_BOARD_ROWS = 11
export const MAX_BOARD_COLUMNS = 21
export const BOARD_ROWS = MIN_BOARD_ROWS
export const BOARD_COLUMNS = MIN_BOARD_COLUMNS

export const TileColor = {
  RED: 'RED',
  BLUE: 'BLUE',
  BLACK: 'BLACK',
  ORANGE: 'ORANGE',
} as const
export type TileColor = typeof TileColor[keyof typeof TileColor]

export const JokerType = {
  NONE: 'NONE',
  STANDARD: 'STANDARD',
  DOUBLE: 'DOUBLE',
  COLOR_CHANGE: 'COLOR_CHANGE',
  MIRROR: 'MIRROR',
} as const
export type JokerType = typeof JokerType[keyof typeof JokerType]

export interface GameTile {
  id: string
  color: TileColor
  value: number
  jokerType: JokerType
}

export type BoardCells = Array<Array<GameTile | null>>

export interface BoardGroupResult {
  id: number
  row: number
  startColumn: number
  endColumn: number
  length: number
  isValid: boolean | null
  score: number
}

export interface PublicPlayer {
  id: string
  name: string
  handCount: number
  hasMelted: boolean
  connected: boolean
  reconnectDeadline: number | null
}

export interface ChatMessage {
  id: string
  playerId: string
  playerName: string
  text: string
  createdAt: number
}

export interface RoomSettings {
  turnDurationSeconds: number
  strictMode: boolean
  scoringMode: boolean
}

export interface ReplayPlayerState {
  id: string
  name: string
  hand: GameTile[]
}

export interface ReplayFrame {
  index: number
  timestamp: number
  action: RoomSnapshot['lastAction']
  status: RoomSnapshot['status']
  currentTurnPlayerId: string
  poolCount: number
  board: BoardCells
  players: ReplayPlayerState[]
}

export interface ReplayData {
  roomId: string
  winnerPlayerId: string | null
  frames: ReplayFrame[]
}

export interface VoicePeer {
  playerId: string
  playerName: string
  muted: boolean
}

export type VoiceSignal =
  | { kind: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment?: string | null }

export interface RoomSnapshot {
  roomId: string
  revision: number
  status: 'WAITING' | 'PLAYING' | 'FINISHED'
  hostPlayerId: string
  settings: RoomSettings
  players: PublicPlayer[]
  currentTurnPlayerId: string
  poolCount: number
  winnerPlayerId: string | null
  turnHasChanges: boolean
  turnHasPlayedTile: boolean
  turnDeadline: number | null
  turnPlayedScore: number
  developerModeUsed: boolean
  developerModeActivatedAt: number | null
  chatMessages: ChatMessage[]
  board: {
    cells: BoardCells
    groups: BoardGroupResult[]
  }
  returnableTileIds: string[]
  yourPlayerId: string
  reconnectToken: string
  yourHand: GameTile[]
  lastAction: {
    type: 'ROOM_CREATED' | 'PLAYER_JOINED' | 'PLAYER_LEFT' | 'PLAYER_DISCONNECTED' | 'PLAYER_RECONNECTED' | 'ROOM_SETTINGS_UPDATED' | 'GAME_STARTED' | 'BOARD_UPDATED' | 'TURN_REVERTED' | 'TURN_VALIDATION_FAILED' | 'TILE_DRAWN' | 'TURN_ENDED' | 'TURN_TIMEOUT_PLAYED' | 'TURN_TIMEOUT_NO_PLAY_DRAWN' | 'TURN_TIMEOUT_INVALID_REVERTED' | 'GAME_FINISHED' | 'REMATCH_REQUESTED' | 'DEV_TILE_ADDED'
    playerId: string
  }
}

export type ClientMessage =
  | { type: 'room:create'; playerName: string }
  | { type: 'room:join'; roomId: string; playerName: string }
  | { type: 'room:resume'; roomId: string; reconnectToken: string }
  | { type: 'room:leave' }
  | { type: 'room:update-settings'; revision: number; settings: RoomSettings }
  | { type: 'game:start'; revision: number }
  | { type: 'game:rematch'; revision: number }
  | { type: 'board:update'; revision: number; cells: BoardCells; hand: GameTile[] }
  | { type: 'turn:commit'; revision: number }
  | { type: 'turn:draw'; revision: number }
  | { type: 'turn:revert'; revision: number }
  | { type: 'replay:request' }
  | { type: 'voice:join' }
  | { type: 'voice:leave' }
  | { type: 'voice:mute'; muted: boolean }
  | { type: 'voice:signal'; targetPlayerId: string; signal: VoiceSignal }
  | { type: 'dev:activate' }
  | { type: 'dev:give-tile'; color: TileColor; value: number; jokerType: JokerType }
  | { type: 'dev:give-tiles'; tiles: Array<{ color: TileColor; value: number; jokerType: JokerType }> }
  | { type: 'chat:send'; text: string }

export type ServerMessage =
  | { type: 'room:state'; state: RoomSnapshot }
  | { type: 'chat:message'; message: ChatMessage }
  | { type: 'replay:data'; replay: ReplayData }
  | { type: 'voice:peers'; peers: VoicePeer[] }
  | { type: 'voice:peer-joined'; peer: VoicePeer }
  | { type: 'voice:peer-left'; playerId: string }
  | { type: 'voice:peer-muted'; playerId: string; muted: boolean }
  | { type: 'voice:signal'; fromPlayerId: string; signal: VoiceSignal }
  | { type: 'error'; code: string; message: string }

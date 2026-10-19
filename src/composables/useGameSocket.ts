import { computed, onUnmounted, ref } from 'vue'
import type { BoardCells, ChatMessage, ClientMessage, GameTile, ReplayData, RoomSettings, RoomSnapshot, ServerMessage, VoicePeer, VoiceSignal } from '../../shared/protocol'

interface SavedRoomSession {
  roomId: string
  reconnectToken: string
}

interface RecoveryRoomSession extends SavedRoomSession {
  ownerId: string
  active: boolean
  updatedAt: number
}

const LEGACY_SESSION_KEY = 'rummikub.room-session.v1'
const TAB_SESSION_KEY = 'rummikub.room-tab-session.v1'
const RECOVERY_SESSIONS_KEY = 'rummikub.room-recovery-sessions.v2'
const SESSION_LEASE_MS = 6_000
const MAX_RECOVERY_SESSIONS = 8

const validSession = (value: Partial<SavedRoomSession> | null): value is SavedRoomSession =>
  Boolean(value && typeof value.roomId === 'string' && typeof value.reconnectToken === 'string')

const readTabSession = (): SavedRoomSession | null => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(TAB_SESSION_KEY) ?? 'null') as Partial<SavedRoomSession> | null
    return validSession(parsed) ? { roomId: parsed.roomId, reconnectToken: parsed.reconnectToken } : null
  } catch {
    return null
  }
}

const readRecoverySessions = (): RecoveryRoomSession[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECOVERY_SESSIONS_KEY) ?? '[]') as Partial<RecoveryRoomSession>[]
    if (Array.isArray(parsed)) {
      return parsed.flatMap((entry) => {
        if (typeof entry.roomId !== 'string'
          || typeof entry.reconnectToken !== 'string'
          || typeof entry.ownerId !== 'string'
          || typeof entry.active !== 'boolean'
          || typeof entry.updatedAt !== 'number') return []
        return [{
          roomId: entry.roomId,
          reconnectToken: entry.reconnectToken,
          ownerId: entry.ownerId,
          active: entry.active,
          updatedAt: entry.updatedAt,
        }]
      })
    }
  } catch {
    // Corrupt recovery history is ignored and replaced on the next room state.
  }
  return []
}

const writeRecoverySessions = (sessions: RecoveryRoomSession[]) => {
  localStorage.setItem(RECOVERY_SESSIONS_KEY, JSON.stringify(
    sessions.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, MAX_RECOVERY_SESSIONS),
  ))
}

const readSavedSession = (): SavedRoomSession | null => {
  const tabSession = readTabSession()
  if (tabSession) return tabSession

  try {
    const now = Date.now()
    const recoverable = readRecoverySessions()
      .filter((entry) => !entry.active || now - entry.updatedAt > SESSION_LEASE_MS)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]
    if (recoverable) {
      const session = { roomId: recoverable.roomId, reconnectToken: recoverable.reconnectToken }
      sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify(session))
      return session
    }

    const legacy = JSON.parse(localStorage.getItem(LEGACY_SESSION_KEY) ?? 'null') as Partial<SavedRoomSession> | null
    if (!validSession(legacy)) return null
    const session = { roomId: legacy.roomId, reconnectToken: legacy.reconnectToken }
    sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify(session))
    localStorage.removeItem(LEGACY_SESSION_KEY)
    return session
  } catch {
    return null
  }
}

export function useGameSocket() {
  // Public-IP HTTP pages may expose `crypto` without `randomUUID`.
  // Keep the lobby usable while HTTPS is being configured.
  const ownerId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const status = ref<'connecting' | 'connected' | 'disconnected'>('connecting')
  const room = ref<RoomSnapshot | null>(null)
  const error = ref('')
  const isSyncing = ref(false)
  const chatMessages = ref<ChatMessage[]>([])
  const replayData = ref<ReplayData | null>(null)
  const voiceStatus = ref<'idle' | 'requesting' | 'connected' | 'error'>('idle')
  const voiceMuted = ref(false)
  const voiceError = ref<'' | 'unsupported' | 'permission' | 'device' | 'connection'>('')
  const voicePeers = ref<VoicePeer[]>([])
  const endpointProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  // 开发环境连独立的 8787 端口；生产构建后页面和 WebSocket 同源，走反向代理的 /ws 路径。
  const endpoint = import.meta.env.VITE_WS_URL
    ?? (import.meta.env.DEV
      ? `${endpointProtocol}://${window.location.hostname}:8787`
      : `${endpointProtocol}://${window.location.host}/ws`)
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0
  let disposed = false
  let localVoiceStream: MediaStream | null = null
  let voiceDesired = false
  let voiceNeedsRejoin = false
  const voiceConnections = new Map<string, RTCPeerConnection>()
  const voiceAudios = new Map<string, HTMLAudioElement>()
  const queuedVoiceCandidates = new Map<string, RTCIceCandidateInit[]>()
  const initialSavedSession = readSavedSession()
  const hasSavedSession = ref(Boolean(initialSavedSession))

  const updateRecoveryLease = (session: SavedRoomSession, active: boolean) => {
    const sessions = readRecoverySessions().filter((entry) => entry.reconnectToken !== session.reconnectToken)
    sessions.push({ ...session, ownerId, active, updatedAt: Date.now() })
    writeRecoverySessions(sessions)
  }

  const saveSession = (state: RoomSnapshot) => {
    const session = {
      roomId: state.roomId,
      reconnectToken: state.reconnectToken,
    } satisfies SavedRoomSession
    sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify(session))
    updateRecoveryLease(session, true)
    hasSavedSession.value = true
  }

  const clearSession = () => {
    const session = readTabSession()
    sessionStorage.removeItem(TAB_SESSION_KEY)
    if (session) writeRecoverySessions(
      readRecoverySessions().filter((entry) => entry.reconnectToken !== session.reconnectToken),
    )
    localStorage.removeItem(LEGACY_SESSION_KEY)
    hasSavedSession.value = false
  }

  const releaseRecoveryLease = () => {
    const session = readTabSession()
    if (session) updateRecoveryLease(session, false)
  }

  const leaseTimer = window.setInterval(() => {
    const session = readTabSession()
    if (session && room.value) updateRecoveryLease(session, true)
  }, 2_000)
  const handlePageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) releaseRecoveryLease()
  }
  window.addEventListener('pagehide', handlePageHide)

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) return
    const delay = Math.min(5_000, 600 * (2 ** Math.min(reconnectAttempt, 3)))
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  const connect = () => {
    if (disposed || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
    status.value = 'connecting'
    socket = new WebSocket(endpoint)
    socket.addEventListener('open', () => {
      status.value = 'connected'
      error.value = ''
      reconnectAttempt = 0
      const saved = readSavedSession()
      if (saved) socket?.send(JSON.stringify({ type: 'room:resume', ...saved } satisfies ClientMessage))
    })
    socket.addEventListener('close', (event) => {
      status.value = 'disconnected'
      isSyncing.value = false
      socket = null
      closeAllVoicePeers()
      voicePeers.value = []
      if (event.code === 4001) {
        // The same seat was resumed in another tab; never leave this tab's microphone running.
        disposeVoice(false)
      } else if (voiceDesired && localVoiceStream) {
        voiceStatus.value = 'requesting'
        voiceNeedsRejoin = true
      }
      if (event.code !== 4001) scheduleReconnect()
    })
    socket.addEventListener('error', () => {
      if (!room.value) error.value = '暂时无法连接游戏服务器，正在自动重试。'
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage
      if (message.type === 'room:state') {
        room.value = message.state
        if (message.state.lastAction.type === 'GAME_STARTED') replayData.value = null
        chatMessages.value = message.state.chatMessages
        saveSession(message.state)
        error.value = ''
        isSyncing.value = false
        if (voiceDesired && localVoiceStream && voiceNeedsRejoin) {
          voiceNeedsRejoin = !send({ type: 'voice:join' })
        }
      } else if (message.type === 'chat:message') {
        chatMessages.value = [...chatMessages.value, message.message].slice(-60)
      } else if (message.type === 'replay:data') {
        replayData.value = message.replay
      } else if (message.type === 'voice:peers') {
        voicePeers.value = message.peers
        voiceStatus.value = 'connected'
        voiceError.value = ''
        void Promise.all(message.peers.map((peer) => ensureVoicePeer(peer.playerId, true))).catch(() => {
          voiceError.value = 'connection'
        })
      } else if (message.type === 'voice:peer-joined') {
        voicePeers.value = [...voicePeers.value.filter((peer) => peer.playerId !== message.peer.playerId), message.peer]
      } else if (message.type === 'voice:peer-left') {
        closeVoicePeer(message.playerId)
        voicePeers.value = voicePeers.value.filter((peer) => peer.playerId !== message.playerId)
      } else if (message.type === 'voice:peer-muted') {
        voicePeers.value = voicePeers.value.map((peer) => peer.playerId === message.playerId
          ? { ...peer, muted: message.muted }
          : peer)
      } else if (message.type === 'voice:signal') {
        void handleVoiceSignal(message.fromPlayerId, message.signal)
      } else {
        if (message.code.startsWith('RESUME_')) {
          clearSession()
          room.value = null
          disposeVoice(false)
        }
        error.value = message.message
        isSyncing.value = false
      }
    })
  }

  const send = (message: ClientMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      error.value = '连接尚未恢复，请稍候。'
      return false
    }
    socket.send(JSON.stringify(message))
    return true
  }

  const voiceIceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
  const turnUrl = import.meta.env.VITE_TURN_URL
  if (turnUrl) {
    voiceIceServers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    })
  }

  const closeVoicePeer = (playerId: string) => {
    const connection = voiceConnections.get(playerId)
    if (connection) {
      connection.ontrack = null
      connection.onicecandidate = null
      connection.onconnectionstatechange = null
      connection.close()
      voiceConnections.delete(playerId)
    }
    const audio = voiceAudios.get(playerId)
    if (audio) {
      audio.pause()
      audio.srcObject = null
      voiceAudios.delete(playerId)
    }
    queuedVoiceCandidates.delete(playerId)
  }

  const closeAllVoicePeers = () => {
    ;[...voiceConnections.keys()].forEach(closeVoicePeer)
  }

  const ensureVoicePeer = async (playerId: string, createOffer: boolean) => {
    if (!localVoiceStream || !voiceDesired) return null
    const existing = voiceConnections.get(playerId)
    if (existing && existing.connectionState !== 'closed') {
      if (createOffer && !existing.localDescription) {
        const offer = await existing.createOffer()
        await existing.setLocalDescription(offer)
        send({ type: 'voice:signal', targetPlayerId: playerId, signal: { kind: 'offer', sdp: offer.sdp ?? '' } })
      }
      return existing
    }

    const connection = new RTCPeerConnection({ iceServers: voiceIceServers })
    voiceConnections.set(playerId, connection)
    localVoiceStream.getTracks().forEach((track) => connection.addTrack(track, localVoiceStream!))
    connection.onicecandidate = (event) => {
      const candidate = event.candidate
      if (!candidate) return
      send({
        type: 'voice:signal',
        targetPlayerId: playerId,
        signal: {
          kind: 'ice',
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          usernameFragment: candidate.usernameFragment,
        },
      })
    }
    connection.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      const audio = voiceAudios.get(playerId) ?? new Audio()
      audio.autoplay = true
      audio.srcObject = stream
      voiceAudios.set(playerId, audio)
      void audio.play().catch(() => {
        voiceError.value = 'connection'
      })
    }
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed') {
        closeVoicePeer(playerId)
        voiceError.value = 'connection'
      }
    }
    if (createOffer) {
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      send({ type: 'voice:signal', targetPlayerId: playerId, signal: { kind: 'offer', sdp: offer.sdp ?? '' } })
    }
    return connection
  }

  const flushVoiceCandidates = async (playerId: string, connection: RTCPeerConnection) => {
    const candidates = queuedVoiceCandidates.get(playerId) ?? []
    queuedVoiceCandidates.delete(playerId)
    for (const candidate of candidates) await connection.addIceCandidate(candidate)
  }

  const handleVoiceSignal = async (playerId: string, signal: VoiceSignal) => {
    if (!voiceDesired || !localVoiceStream) return
    try {
      const connection = await ensureVoicePeer(playerId, false)
      if (!connection) return
      if (signal.kind === 'ice') {
        const candidate: RTCIceCandidateInit = {
          candidate: signal.candidate,
          sdpMid: signal.sdpMid,
          sdpMLineIndex: signal.sdpMLineIndex,
          usernameFragment: signal.usernameFragment,
        }
        if (connection.remoteDescription) await connection.addIceCandidate(candidate)
        else queuedVoiceCandidates.set(playerId, [...(queuedVoiceCandidates.get(playerId) ?? []), candidate])
        return
      }
      await connection.setRemoteDescription({ type: signal.kind, sdp: signal.sdp })
      await flushVoiceCandidates(playerId, connection)
      if (signal.kind === 'offer') {
        const answer = await connection.createAnswer()
        await connection.setLocalDescription(answer)
        send({ type: 'voice:signal', targetPlayerId: playerId, signal: { kind: 'answer', sdp: answer.sdp ?? '' } })
      }
    } catch {
      voiceError.value = 'connection'
    }
  }

  const joinVoiceChat = async () => {
    if (voiceDesired || voiceStatus.value === 'requesting') return
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      voiceStatus.value = 'error'
      voiceError.value = 'unsupported'
      return
    }
    voiceStatus.value = 'requesting'
    voiceError.value = ''
    try {
      localVoiceStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      voiceDesired = true
      voiceMuted.value = false
      if (!send({ type: 'voice:join' })) {
        disposeVoice(false)
        voiceStatus.value = 'error'
        voiceError.value = 'connection'
      }
    } catch (reason) {
      voiceStatus.value = 'error'
      voiceError.value = reason instanceof DOMException && reason.name === 'NotFoundError' ? 'device' : 'permission'
    }
  }

  const disposeVoice = (notifyServer: boolean) => {
    if (notifyServer && voiceDesired) send({ type: 'voice:leave' })
    voiceDesired = false
    voiceNeedsRejoin = false
    localVoiceStream?.getTracks().forEach((track) => track.stop())
    localVoiceStream = null
    closeAllVoicePeers()
    voicePeers.value = []
    voiceMuted.value = false
    voiceStatus.value = 'idle'
    voiceError.value = ''
  }

  const leaveVoiceChat = () => disposeVoice(true)
  const toggleVoiceMute = () => {
    if (!voiceDesired || !localVoiceStream) return
    voiceMuted.value = !voiceMuted.value
    localVoiceStream.getAudioTracks().forEach((track) => { track.enabled = !voiceMuted.value })
    send({ type: 'voice:mute', muted: voiceMuted.value })
  }

  const createRoom = (playerName: string) => send({ type: 'room:create', playerName })
  const joinRoom = (roomId: string, playerName: string) => send({
    type: 'room:join', roomId: roomId.trim().toUpperCase(), playerName,
  })
  const leaveRoom = () => {
    disposeVoice(true)
    send({ type: 'room:leave' })
    clearSession()
    room.value = null
    chatMessages.value = []
    replayData.value = null
    error.value = ''
    isSyncing.value = false
  }
  const startGame = () => {
    if (room.value) send({ type: 'game:start', revision: room.value.revision })
  }
  const rematch = () => {
    if (room.value) send({ type: 'game:rematch', revision: room.value.revision })
  }
  const updateRoomSettings = (settings: RoomSettings) => {
    if (!room.value) return
    isSyncing.value = true
    if (!send({ type: 'room:update-settings', revision: room.value.revision, settings })) isSyncing.value = false
  }
  const updateBoard = (cells: BoardCells, hand: GameTile[]) => {
    if (!room.value) return
    isSyncing.value = true
    if (!send({ type: 'board:update', revision: room.value.revision, cells, hand })) isSyncing.value = false
  }
  const commitTurn = () => {
    if (!room.value) return
    isSyncing.value = true
    if (!send({ type: 'turn:commit', revision: room.value.revision })) isSyncing.value = false
  }
  const drawTile = () => {
    if (!room.value) return
    isSyncing.value = true
    if (!send({ type: 'turn:draw', revision: room.value.revision })) isSyncing.value = false
  }
  const revertTurn = () => {
    if (!room.value) return
    isSyncing.value = true
    if (!send({ type: 'turn:revert', revision: room.value.revision })) isSyncing.value = false
  }
  const activateDeveloperMode = () => send({ type: 'dev:activate' })
  const giveDevTile = (color: GameTile['color'], value: number, jokerType: GameTile['jokerType']) => {
    send({ type: 'dev:give-tile', color, value, jokerType })
  }
  const giveDevTiles = (tiles: Array<Pick<GameTile, 'color' | 'value' | 'jokerType'>>) => {
    send({ type: 'dev:give-tiles', tiles })
  }
  const sendChat = (text: string) => send({ type: 'chat:send', text })
  const requestReplay = () => send({ type: 'replay:request' })

  const isMyTurn = computed(() => room.value?.currentTurnPlayerId === room.value?.yourPlayerId)
  const isRestoringSession = computed(() => !room.value && hasSavedSession.value)

  connect()
  onUnmounted(() => {
    disposed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    window.clearInterval(leaseTimer)
    window.removeEventListener('pagehide', handlePageHide)
    releaseRecoveryLease()
    disposeVoice(false)
    socket?.close()
  })

  return {
    status, room, error, isMyTurn, isSyncing, isRestoringSession, chatMessages, replayData,
    voiceStatus, voiceMuted, voiceError, voicePeers,
    createRoom, joinRoom, leaveRoom, startGame, rematch, updateRoomSettings, updateBoard, commitTurn, drawTile, revertTurn, activateDeveloperMode, giveDevTile, giveDevTiles, sendChat, requestReplay,
    joinVoiceChat, leaveVoiceChat, toggleVoiceMute,
  }
}

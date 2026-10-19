<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useGameSocket } from './composables/useGameSocket'
import { validateTileSet } from '../server/validator'
import {
  MAX_BOARD_COLUMNS,
  MAX_BOARD_ROWS,
  MIN_BOARD_COLUMNS,
  MIN_BOARD_ROWS,
  JokerType,
  TileColor,
  type BoardGroupResult,
  type GameTile as UITile,
  type ReplayFrame,
  type RoomSettings,
} from '../shared/protocol'

const HAND_COLUMNS = 16
const MIN_HAND_ROWS = 2
const TILE_RATIO = 0.7
const SETTINGS_KEY = 'rummikub.preferences.v1'
type BackgroundStyle = 'texture' | 'plain' | 'alpine' | 'ocean' | 'forest' | 'desert'

interface GameSettings {
  playerName: string
  language: 'zh' | 'en'
  motion: 'full' | 'reduced'
  theme: 'blue' | 'arcade'
  soundEnabled: boolean
  highContrast: boolean
  subtlePattern: boolean
  background: BackgroundStyle
}

const defaultSettings: GameSettings = {
  playerName: 'Player',
  language: 'en',
  motion: 'full',
  theme: 'arcade',
  soundEnabled: true,
  highContrast: true,
  subtlePattern: true,
  background: 'texture',
}

const loadSettings = (): GameSettings => {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
    if (saved.theme === 'retro') saved.theme = 'arcade'
    if (saved.theme === 'violet') saved.theme = 'blue'
    if (!['blue', 'arcade'].includes(saved.theme)) saved.theme = defaultSettings.theme
    if (!['zh', 'en'].includes(saved.language)) saved.language = defaultSettings.language
    if (!['texture', 'plain', 'alpine', 'ocean', 'forest', 'desert'].includes(saved.background)) {
      saved.background = saved.subtlePattern === false ? 'plain' : 'texture'
    }
    return { ...defaultSettings, ...saved }
  } catch {
    return { ...defaultSettings }
  }
}

const settings = ref<GameSettings>(loadSettings())
const settingsDraft = ref<GameSettings>({ ...settings.value })
const backgroundOptions = [
  { value: 'texture', label: 'backgroundTexture' },
  { value: 'plain', label: 'backgroundPlain' },
  { value: 'alpine', label: 'backgroundAlpine' },
  { value: 'ocean', label: 'backgroundOcean' },
  { value: 'forest', label: 'backgroundForest' },
  { value: 'desert', label: 'backgroundDesert' },
] as const
const copy = {
  zh: {
    rules:'玩法', chat:'聊天', voice:'语音', settings:'设置', online:'在线', connecting:'连接中', reconnecting:'重连中', language:'EN',
    restoreKicker:'正在恢复牌局', restoreTitle:'回到离开前的位置', restoreText:'正在连接房间并同步最新桌面，通常只需要几秒。',
    lobbyKicker:'PRIVATE MATCH DESK', lobbyTitle:'私人牌桌', lobbyDescription:'创建一张仅限受邀玩家进入的实时牌桌，房间状态会持续同步并在短暂断线后恢复。',
    featureRoom:'独立房间', featureSync:'实时同步', featureResume:'断线续玩',
    create:'创建房间', join:'加入房间', hostDesc:'HOST A NEW MATCH', joinDesc:'ENTER WITH ROOM CODE', nickname:'你的昵称', nicknamePlaceholder:'输入昵称', roomCode:'房间代码', pasteRoom:'粘贴房间号', createRoom:'创建新房间', enterRoom:'进入房间', resumeNote:'刷新页面或短暂断线后，会自动回到当前牌局。',
    privateRoom:'私人房间', waitingTitle:'等待玩家加入', waitingText:'将房间代码发给朋友，2–4 人即可开始。', copied:'已复制', copyCode:'复制代码', host:'房主', reconnectWait:'等待重连', ready:'已准备', empty:'空位', waitingPlayer:'等待玩家', leaveRoom:'退出房间', roomSettings:'房间设置', roomSettingsHint:'回合与规则参数', hostSettings:'房主设置', viewSettings:'查看设置', turnDuration:'单人回合时长', turnDurationHint:'每位玩家每回合可用时间', strictMode:'严格模式', strictModeHint:'预留规则：后续启用更严格校验', scoringMode:'记分模式', scoringModeHint:'预留规则：后续启用局内积分', hostOnlySettings:'仅房主可修改；当前为只读查看。', saveRoomSettings:'保存房间设置', needPlayers:'等待更多玩家', startGame:'开始游戏', waitHost:'等待房主开始',
    gameComplete:'对局结束', wins:'赢得了本局', winText:'率先打完全部手牌，漂亮的一局。', you:'你', remaining:'剩余', tiles:'张', finished:'已出完', backLobby:'返回大厅', rematch:'再来一局', waitRematch:'等待房主再开一局', replay:'对局回放', replayTitle:'整局牌面回放', replaySubtitle:'牌桌与所有玩家手牌', closeReplay:'关闭回放', playReplay:'播放', pauseReplay:'暂停', previousStep:'上一步', nextStep:'下一步', replayStep:'步骤', replayPool:'牌池剩余', replayWaiting:'正在读取回放…', replayDetailed:'完整回放', replaySimplified:'简化回放', replayDetailedHint:'显示每次摆牌操作', replaySimplifiedHint:'每回合仅保留最终结果',
    serverConnected:'服务器已连接', serverConnecting:'正在连接…', serverDisconnected:'连接已断开', room:'房间', copyRoom:'复制房间号', roomCopied:'房间号已复制', reconnectTitle:'连接中断，正在恢复牌局', reconnectText:'你的席位会保留 60 秒，请不要关闭此页面。', offlineSeat:'暂时离线，席位还会保留', seconds:'秒',
    tableKicker:'RUMMIKUB', tableTitle:'摆牌桌', groups:'个连续组合', pool:'牌池', syncing:'正在同步…', yourTurn:'你的回合', turnSuffix:'的回合', boardZone:'放置区', boardGrid:'牌桌网格', draw:'摸一张', discard:'放弃本回合改动', revert:'还原牌桌', revertHint:'撤回本回合改动', waiting:'等待中', actNow:'轮到你行动', acting:'正在行动', commit:'提交回合', validate:'校验并确认桌面', placeFirst:'先放置至少一张牌', turnTime:'回合剩余时间', hand:'手牌', perRow:'每行', cells:'格', numberSort:'数字优先', colorSort:'颜色优先',
    devMode:'开发者模式', devTitle:'合法性测试台', closeDev:'关闭开发者模式', devNoticeKicker:'对局完整性提示', devNotice:'本局游戏使用了开发者功能', turnScore:'本回合出牌总值', melted:'你已经完成首次出牌限制', scoreReady:'已达到首次出牌要求', scoreHint:'只统计最终合法组合中的新增牌', normalTiles:'普通牌', choose:'选择', number:'数字', addHand:'加入一张', addPair:'加入一对', specialTiles:'特殊牌', standard:'标准', double:'双倍', colorChange:'变色', mirror:'镜像', devStats:'实时状态', handCount:'手牌', boardTiles:'场牌', validSets:'合法组', invalidSets:'异常组', boardSize:'棋盘', quickRecipes:'快速牌型', run3:'三张顺子', run4:'四张顺子', group3:'三色同数', group4:'四色同数', colorSeries:'整套同色', allJokers:'全部 Joker', recipeHint:'快速牌型会作为一次操作加入手牌，只广播一次。', devNote:'测试牌优先从牌池取出；牌池没有对应牌时会生成一张仅供本局测试的牌。',
    roomChat:'局内聊天', closeChat:'关闭聊天', noMessages:'还没有消息', chatHello:'和牌友打个招呼吧', messagePlaceholder:'输入消息…', sendMessage:'发送消息',
    voiceKicker:'ROOM VOICE', roomVoice:'房间语音', closeVoice:'关闭语音面板', joinVoice:'加入语音', leaveVoice:'退出语音', muteVoice:'静音', unmuteVoice:'取消静音', voiceConnected:'语音已连接', voiceConnecting:'正在连接麦克风…', voiceEmpty:'暂时没有其他玩家加入语音', voiceYou:'你', voiceMuted:'已静音', voiceUnsupported:'当前浏览器不支持语音聊天。', voicePermission:'无法使用麦克风，请检查浏览器权限。', voiceDevice:'没有找到可用的麦克风。', voiceConnection:'语音连接失败；可退出语音后重试。', voicePrivacy:'声音直接在玩家浏览器之间传输。',
    preferences:'设置', defaultName:'默认昵称', defaultNameHint:'创建或加入房间时自动填入', languageSetting:'界面语言', languageHint:'保存后切换全部界面文字', chinese:'中文', english:'English', theme:'主题色', themeHint:'选择界面的整体材质', iceBlue:'冰蓝', starViolet:'星紫', arcade:'竞技', motion:'界面动效', motionHint:'减少移动与缩放动画', full:'完整', reduced:'精简', sound:'界面提示音', soundHint:'关键操作播放轻提示音', contrast:'高对比牌面', contrastHint:'加深数字和牌的轮廓', texture:'背景', textureHint:'选择普通纹理或风景背景', backgroundTexture:'普通纹理', backgroundPlain:'纯色', backgroundAlpine:'雪山晨雾', backgroundOcean:'深海黄昏', backgroundForest:'雨后森林', backgroundDesert:'荒漠星空', cancel:'取消', save:'保存设置', close:'关闭',
    quickGuide:'规则书', rule1Title:'组成组合', rule1:'同色连续数字组成顺子，或相同数字的不同颜色组成牌组；每组至少 3 张。', rule2Title:'首次出牌', rule2:'第一次提交累计打出的手牌必须达到至少 30 分。', rule3Title:'完成回合', rule3:'摆好后提交回合；如果不出牌，摸一张并结束回合。率先清空手牌获胜。', rule4Title:'操作提示', rule4:'长按场牌会连同右侧相邻牌一起拿起；长按手牌会拿起从当前位置开始的最长合法组合。', gotIt:'知道了',
    rulesGoalTitle:'游戏目标', rulesGoal:'成为第一个打完全部 14 张手牌的玩家。',
    rulesTilesTitle:'牌组构成', rulesTiles:'四种颜色（红、蓝、黑、橙）× 数字 1–13，每种两张，共 104 张；另含 4 张特殊百搭牌：标准 ★、双倍 ×2、变色 ↝、镜像 ⧉。',
    rulesMeldsTitle:'合法组合', rulesRun:'顺子：至少 3 张同色连续数字（如 红4–红5–红6）。', rulesGroup:'同数：3–4 张相同数字、不同颜色（如 7红 + 7蓝 + 7黑）。',
    rulesJokersTitle:'百搭牌', rulesJokerStandard:'标准 ★：万能牌，可代替任意一张牌。', rulesJokerDouble:'双倍 ×2：算作两张——顺子里代表连续两个数字，同数里代表两张同数不同色。', rulesJokerColor:'变色 ↝：只用于顺子，放在开头或末尾；从它之后换一种颜色。', rulesJokerMirror:'镜像 ⧉：左右两侧必须对称；它自身永远计 0 分。',
    rulesTurnTitle:'你的回合', rulesTurn1:'从手牌把牌放到桌面，或移动 / 重排桌面上已有的牌。', rulesTurn2:'回合开始时已在桌面的牌不能收回手牌；本回合从手牌打出的牌可以拿回。', rulesTurn3:'完成操作后点「提交回合」；不想出牌就「摸一张」并结束回合。',
    rulesOpeningTitle:'首次出牌（破冰）', rulesOpening:'你第一次提交，桌面组合里从你手牌新打出的牌合计必须至少 30 分；桌面旧牌可以参与重排，但不计入这 30 分。',
    rulesWinTitle:'获胜', rulesWin:'率先清空全部手牌的玩家立即获胜，本局结束。',
  },
  en: {
    rules:'RULES', chat:'CHAT', voice:'VOICE', settings:'SETTINGS', online:'ONLINE', connecting:'CONNECTING', reconnecting:'RECONNECTING', language:'中文',
    restoreKicker:'RESTORING MATCH', restoreTitle:'RETURNING TO YOUR SEAT', restoreText:'Connecting to the room and syncing the latest table state.',
    lobbyKicker:'PRIVATE MATCH DESK', lobbyTitle:'PRIVATE TABLE', lobbyDescription:'Create a live table for invited players. Room state stays synchronized and recovers after a brief disconnect.',
    featureRoom:'PRIVATE ROOM', featureSync:'LIVE SYNC', featureResume:'SESSION RESUME',
    create:'CREATE ROOM', join:'JOIN ROOM', hostDesc:'HOST A NEW MATCH', joinDesc:'ENTER WITH ROOM CODE', nickname:'DISPLAY NAME', nicknamePlaceholder:'Enter a name', roomCode:'ROOM CODE', pasteRoom:'Paste room code', createRoom:'CREATE NEW ROOM', enterRoom:'ENTER ROOM', resumeNote:'Refresh or briefly disconnect and you will return to the current match.',
    privateRoom:'PRIVATE ROOM', waitingTitle:'WAITING FOR PLAYERS', waitingText:'Share the room code. A match can start with 2–4 players.', copied:'COPIED', copyCode:'COPY CODE', host:'HOST', reconnectWait:'RECONNECTING', ready:'READY', empty:'EMPTY SEAT', waitingPlayer:'WAITING FOR PLAYER', leaveRoom:'LEAVE ROOM', roomSettings:'ROOM SETTINGS', roomSettingsHint:'TURN AND RULE PARAMETERS', hostSettings:'HOST SETTINGS', viewSettings:'VIEW SETTINGS', turnDuration:'TURN DURATION', turnDurationHint:'Time available to each player per turn', strictMode:'STRICT MODE', strictModeHint:'Reserved rule: stricter validation will be enabled later', scoringMode:'SCORING MODE', scoringModeHint:'Reserved rule: match scoring will be enabled later', hostOnlySettings:'Only the host can edit these settings. You are viewing them read-only.', saveRoomSettings:'SAVE ROOM SETTINGS', needPlayers:'NEED MORE PLAYERS', startGame:'START MATCH', waitHost:'WAITING FOR HOST',
    gameComplete:'MATCH COMPLETE', wins:'WINS THE MATCH', winText:'First to clear their entire rack.', you:'YOU', remaining:'REMAINING', tiles:'TILES', finished:'FINISHED', backLobby:'BACK TO LOBBY', rematch:'PLAY AGAIN', waitRematch:'WAITING FOR HOST', replay:'MATCH REPLAY', replayTitle:'FULL MATCH REPLAY', replaySubtitle:'TABLE AND EVERY PLAYER RACK', closeReplay:'CLOSE REPLAY', playReplay:'PLAY', pauseReplay:'PAUSE', previousStep:'PREVIOUS', nextStep:'NEXT', replayStep:'STEP', replayPool:'POOL', replayWaiting:'LOADING REPLAY…', replayDetailed:'FULL REPLAY', replaySimplified:'TURN REPLAY', replayDetailedHint:'Show every table operation', replaySimplifiedHint:'Keep only each turn result',
    serverConnected:'SERVER CONNECTED', serverConnecting:'CONNECTING…', serverDisconnected:'CONNECTION LOST', room:'ROOM', copyRoom:'Copy room code', roomCopied:'Room code copied', reconnectTitle:'CONNECTION LOST — RESTORING MATCH', reconnectText:'Your seat is reserved for 60 seconds. Keep this page open.', offlineSeat:'is offline; seat reserved for', seconds:'seconds',
    tableKicker:'RUMMIKUB', tableTitle:'MATCH TABLE', groups:'RUNS', pool:'POOL', syncing:'SYNCING…', yourTurn:'YOUR TURN', turnSuffix:'’S TURN', boardZone:'TABLE AREA', boardGrid:'TABLE GRID', draw:'DRAW TILE', discard:'DISCARD TURN CHANGES', revert:'RESET TABLE', revertHint:'UNDO THIS TURN', waiting:'WAITING', actNow:'MAKE YOUR MOVE', acting:'IS PLAYING', commit:'COMMIT TURN', validate:'VALIDATE AND CONFIRM TABLE', placeFirst:'PLACE AT LEAST ONE TILE', turnTime:'Turn time remaining', hand:'YOUR RACK', perRow:'PER ROW', cells:'CELLS', numberSort:'NUMBER FIRST', colorSort:'COLOR FIRST',
    devMode:'DEVELOPER MODE', devTitle:'VALIDATION LAB', closeDev:'Close developer mode', devNoticeKicker:'MATCH INTEGRITY NOTICE', devNotice:'DEVELOPER FEATURES WERE USED IN THIS MATCH', turnScore:'TURN PLAYED SCORE', melted:'Opening requirement already completed', scoreReady:'Opening score requirement reached', scoreHint:'Only new tiles in final valid groups are counted', normalTiles:'NUMBER TILES', choose:'Choose', number:'NUMBER', addHand:'ADD ONE', addPair:'ADD PAIR', specialTiles:'SPECIAL TILES', standard:'STANDARD', double:'DOUBLE', colorChange:'COLOR CHANGE', mirror:'MIRROR', devStats:'LIVE STATE', handCount:'RACK', boardTiles:'TABLE', validSets:'VALID', invalidSets:'ISSUES', boardSize:'BOARD', quickRecipes:'QUICK RECIPES', run3:'RUN OF 3', run4:'RUN OF 4', group3:'3-COLOR GROUP', group4:'4-COLOR GROUP', colorSeries:'FULL COLOR 1–13', allJokers:'ALL JOKERS', recipeHint:'Recipes are added as one operation and produce only one state broadcast.', devNote:'Test tiles are taken from the pool first. If unavailable, a match-only test tile is generated.',
    roomChat:'ROOM CHAT', closeChat:'Close chat', noMessages:'NO MESSAGES YET', chatHello:'Send a message to the table', messagePlaceholder:'Type a message…', sendMessage:'Send message',
    voiceKicker:'ROOM VOICE', roomVoice:'VOICE CHAT', closeVoice:'Close voice panel', joinVoice:'JOIN VOICE', leaveVoice:'LEAVE VOICE', muteVoice:'MUTE', unmuteVoice:'UNMUTE', voiceConnected:'VOICE CONNECTED', voiceConnecting:'CONNECTING MICROPHONE…', voiceEmpty:'No other players are in voice yet', voiceYou:'YOU', voiceMuted:'MUTED', voiceUnsupported:'Voice chat is not supported by this browser.', voicePermission:'Microphone access failed. Check your browser permission.', voiceDevice:'No microphone was found.', voiceConnection:'Voice connection failed. Leave voice and try again.', voicePrivacy:'Audio travels directly between player browsers.',
    preferences:'SETTINGS', defaultName:'DEFAULT NAME', defaultNameHint:'Filled automatically when creating or joining', languageSetting:'LANGUAGE', languageHint:'Apply all interface text after saving', chinese:'中文', english:'English', theme:'COLOR THEME', themeHint:'Choose the interface material', iceBlue:'ICE BLUE', starViolet:'STAR VIOLET', arcade:'ARCADE', motion:'MOTION', motionHint:'Reduce movement and scaling effects', full:'FULL', reduced:'REDUCED', sound:'UI SOUNDS', soundHint:'Play subtle feedback for key actions', contrast:'HIGH-CONTRAST TILES', contrastHint:'Strengthen tile numbers and outlines', texture:'BACKGROUND', textureHint:'Choose the standard texture or a landscape', backgroundTexture:'STANDARD TEXTURE', backgroundPlain:'SOLID', backgroundAlpine:'ALPINE DAWN', backgroundOcean:'OCEAN DUSK', backgroundForest:'RAIN FOREST', backgroundDesert:'DESERT NIGHT', cancel:'CANCEL', save:'SAVE SETTINGS', close:'Close',
    quickGuide:'RULEBOOK', rule1Title:'BUILD GROUPS', rule1:'Use consecutive numbers of one color for runs, or the same number in different colors for groups. Each needs at least 3 tiles.', rule2Title:'OPENING PLAY', rule2:'Tiles played from your rack must total at least 30 points on your first commit.', rule3Title:'END A TURN', rule3:'Commit after arranging the table. If you cannot play, draw one tile. The first player to clear their rack wins.', rule4Title:'CONTROLS', rule4:'Hold a table tile to lift its right-side chain. Hold a rack tile to lift the longest valid set starting there.', gotIt:'GOT IT',
    rulesGoalTitle:'OBJECTIVE', rulesGoal:'Be the first to play all 14 tiles from your rack.',
    rulesTilesTitle:'TILE SET', rulesTiles:'Four colors (red, blue, black, orange) × numbers 1–13, two copies each — 104 tiles, plus 4 special jokers: Standard ★, Double ×2, Color Change ↝, Mirror ⧉.',
    rulesMeldsTitle:'VALID MELDS', rulesRun:'Run: at least 3 consecutive numbers of the same color (e.g. red 4–5–6).', rulesGroup:'Group: 3–4 tiles of the same number in different colors (e.g. 7R + 7B + 7K).',
    rulesJokersTitle:'JOKERS', rulesJokerStandard:'Standard ★: wild, stands in for any single tile.', rulesJokerDouble:'Double ×2: counts as two tiles — two consecutive numbers in a run, or two same-number tiles in a group.', rulesJokerColor:'Color Change ↝: runs only, at the start or end; the color changes after it.', rulesJokerMirror:'Mirror ⧉: the two sides must mirror each other; it always scores 0.',
    rulesTurnTitle:'YOUR TURN', rulesTurn1:'Play tiles from your rack onto the table, or rearrange tiles already on the table.', rulesTurn2:'Tiles already on the table at turn start cannot be returned to your rack; tiles you played this turn can be taken back.', rulesTurn3:'Commit when done, or draw one tile to pass without playing.',
    rulesOpeningTitle:'OPENING (MELT)', rulesOpening:'Your first commit must total at least 30 points from tiles you newly play from your rack into valid melds. Old table tiles may be rearranged but do not count toward the 30.',
    rulesWinTitle:'WINNING', rulesWin:'The first player to clear their rack wins immediately.',
  },
} as const
const ui = computed(() => copy[settings.value.language])
const settingsOpen = ref(false)
const roomSettingsOpen = ref(false)
const roomSettingsDraft = ref<RoomSettings>({ turnDurationSeconds: 60, strictMode: false, scoringMode: false })
const rulesOpen = ref(false)
const lobbyMode = ref<'create' | 'join'>('create')
const chatPanelOpen = ref(false)
const voicePanelOpen = ref(false)
const developerPanelOpen = ref(false)
const chatDraft = ref('')
const chatList = ref<HTMLElement | null>(null)
const hasUnreadChat = ref(false)
const developerColor = ref<TileColor>(TileColor.RED)
const developerValue = ref(7)
const developerColors = [TileColor.RED, TileColor.BLUE, TileColor.BLACK, TileColor.ORANGE]
const now = ref(Date.now())
const clockTimer = window.setInterval(() => { now.value = Date.now() }, 250)
const shouldReduceMotion = () => settings.value.motion === 'reduced'
// —— 音效 ——
// 复用同一个 AudioContext；用短促的振荡器包络模拟机械红轴的干净触底声。
let audioContext: AudioContext | null = null
let lastUiSoundAt = 0

const ensureAudioContext = (): AudioContext | null => {
  if (!settings.value.soundEnabled) return null
  try {
    if (!audioContext) {
      audioContext = new AudioContext()
    }
    return audioContext
  } catch {
    return null
  }
}

const withRunningAudio = (play: (context: AudioContext) => void) => {
  const context = ensureAudioContext()
  if (!context) return
  if (context.state === 'running') {
    play(context)
    return
  }
  // resume 必须由真实用户手势触发；等待它完成后再创建音源，避免首个音效被静音或提前 stop。
  void context.resume().then(() => {
    if (context.state === 'running') play(context)
  }).catch(() => undefined)
}

const playMechanicalTap = (context: AudioContext, baseFrequency: number, volume: number) => {
  const now = context.currentTime
  const body = context.createOscillator()
  const bodyGain = context.createGain()
  body.type = 'triangle'
  body.frequency.setValueAtTime(baseFrequency * 1.16, now)
  body.frequency.exponentialRampToValueAtTime(baseFrequency, now + 0.052)
  bodyGain.gain.setValueAtTime(0.0001, now)
  bodyGain.gain.exponentialRampToValueAtTime(volume, now + 0.0015)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.062)
  body.connect(bodyGain)
  bodyGain.connect(context.destination)
  body.start(now)
  body.stop(now + 0.07)

  // 很轻的高频触点，保留“哒”的清晰起音，不加入任何擦噪。
  const contact = context.createOscillator()
  const contactGain = context.createGain()
  contact.type = 'sine'
  contact.frequency.setValueAtTime(920, now)
  contact.frequency.exponentialRampToValueAtTime(540, now + 0.018)
  contactGain.gain.setValueAtTime(volume * 0.22, now)
  contactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022)
  contact.connect(contactGain)
  contactGain.connect(context.destination)
  contact.start(now)
  contact.stop(now + 0.027)
}

// 机械按键“哒”：干净、短促，不使用白噪声。
const playKeyClick = () => {
  if (performance.now() - lastUiSoundAt < 55) return
  lastUiSoundAt = performance.now()
  withRunningAudio((context) => {
    playMechanicalTap(context, 175, 0.17)
  })
}

// 塑料牌放置“搭”声：略低、带一点厚实塑料感的轻击。
const playPlaceClick = () => {
  withRunningAudio((context) => {
    playMechanicalTap(context, 135, 0.22)
  })
}

const board = ref<(UITile | null)[][]>(
  Array.from({ length: MIN_BOARD_ROWS }, () => Array<UITile | null>(MIN_BOARD_COLUMNS).fill(null)),
)
const handSlots = ref<(UITile | null)[]>(Array(HAND_COLUMNS * MIN_HAND_ROWS).fill(null))
const draggingId = ref<string | null>(null)
const draggingIds = ref<string[]>([])
const pointer = ref<{ x: number; y: number } | null>(null)
const dragMotion = ref({ x: 0, y: 0, tilt: 0 })
const dragPickupOffset = ref({ x: 0, y: 0 })
const dragStripHidden = ref(false)
const handLayoutAnimating = ref(false)
const boardGeometryAnimating = ref(false)
const hasMoved = ref(false)
const copiedRoomCode = ref(false)
const returnableTileIds = ref(new Set<string>())
const arrangedHandGroups = ref<string[][]>([])
let pendingHandSortMode: 'number' | 'color' | null = null
let dragStartPoint: { x: number; y: number } | null = null
let dragSource: { zone: 'board'; row: number; column: number } | { zone: 'hand'; index: number } | null = null
let dragOrigins = new Map<string, TileRect>()
let holdTimer: ReturnType<typeof setTimeout> | null = null
let dragMotionTimer: ReturnType<typeof setTimeout> | null = null
let handLayoutTimer: ReturnType<typeof setTimeout> | null = null
let boardGeometryTimer: ReturnType<typeof setTimeout> | null = null
let boardPublishTimer: ReturnType<typeof setTimeout> | null = null
let restorePhaseTimer: ReturnType<typeof setTimeout> | null = null
type PendingBoardGeometry =
  | { kind: 'expand'; mutate: () => BoardGeometryShift }
  | { kind: 'shrink'; removeTop: number; removeBottom: number; removeLeft: number; removeRight: number }
let pendingBoardGeometry: PendingBoardGeometry | null = null
const tileAlignmentTimers = new Map<string, ReturnType<typeof setTimeout>>()
const tileSettlementTokens = new Map<string, symbol>()
const activeDragSettlements = new Map<string, { element: HTMLElement; animation: Animation; token: symbol }>()
let sortCooldownUntil = 0
let dragSessionVersion = 0
let errorTimer: ReturnType<typeof setTimeout> | null = null
const turnNotice = ref('')
let turnNoticeTimer: ReturnType<typeof setTimeout> | null = null
let lastNotifiedTurnPlayerId = ''
let lastNotifiedActionRevision = -1

const playerName = ref(settings.value.playerName)
const roomCode = ref('')
const {
  status: socketStatus,
  room,
  error: socketError,
  isMyTurn,
  isSyncing,
  isRestoringSession,
  createRoom,
  joinRoom,
  leaveRoom,
  startGame,
  rematch,
  updateRoomSettings,
  updateBoard,
  commitTurn,
  drawTile,
  revertTurn,
  activateDeveloperMode: announceDeveloperMode,
  giveDevTile,
  giveDevTiles,
  chatMessages,
  sendChat,
  replayData,
  requestReplay,
  voiceStatus,
  voiceMuted,
  voiceError,
  voicePeers,
  joinVoiceChat,
  leaveVoiceChat,
  toggleVoiceMute,
} = useGameSocket()

const voiceErrorMessage = computed(() => {
  if (!voiceError.value) return ''
  const key = {
    unsupported: 'voiceUnsupported',
    permission: 'voicePermission',
    device: 'voiceDevice',
    connection: 'voiceConnection',
  }[voiceError.value] as 'voiceUnsupported' | 'voicePermission' | 'voiceDevice' | 'voiceConnection'
  return ui.value[key]
})

type ViewStage = 'restoring' | 'lobby' | 'waiting' | 'playing' | 'finished'
const victoryBroadcast = ref<{ winnerName: string; active: boolean }>({ winnerName: '', active: false })
const replayOpen = ref(false)
const replayPlaying = ref(false)
const replayIndex = ref(0)
const replaySimplified = ref(false)
const replayStage = ref<HTMLElement | null>(null)
const replayStageSize = ref({ width: 0, height: 0 })
let replayTimer: ReturnType<typeof setInterval> | null = null
let replayResizeObserver: ResizeObserver | null = null
let replayTransitionVersion = 0
let clearReplayTransition: (() => void) | null = null
let victoryAnnounced = false
let victoryTimer: ReturnType<typeof setTimeout> | null = null
const actualViewStage = computed<ViewStage>(() => {
  if (isRestoringSession.value) return 'restoring'
  if (!room.value) return 'lobby'
  if (room.value.status === 'WAITING') return 'waiting'
  // 胜利广播期间仍停留在牌桌画面，广播播完后再进入结算页。
  if (room.value.status === 'FINISHED' && !victoryBroadcast.value.active) return 'finished'
  return 'playing'
})
const displayedViewStage = ref<ViewStage>(actualViewStage.value)
const pageTransitionActive = ref(false)
const developerUnlockFlash = ref(false)
const developerUsageNoticeActive = ref(false)
const DEVELOPER_USAGE_NOTICE_MS = 7_000
const DEVELOPER_UNLOCK_SEQUENCE = 'jayyang260334'
const DEVELOPER_UNLOCK_SESSION_KEY = 'rummikub.developer-room.v1'
const developerUnlockedRoomId = ref('')
const developerModeActive = computed(() => (
  displayedViewStage.value === 'playing'
  && Boolean(room.value?.roomId)
  && developerUnlockedRoomId.value === room.value?.roomId
))
let developerUnlockBuffer = ''
let developerUnlockFlashTimer: ReturnType<typeof window.setTimeout> | null = null
let developerUsageNoticeTimer: ReturnType<typeof window.setTimeout> | null = null
let lastDeveloperModeActivatedAt: number | null = null
let restoredDeveloperPanelRoomId = ''

try {
  developerUnlockedRoomId.value = window.sessionStorage.getItem(DEVELOPER_UNLOCK_SESSION_KEY) ?? ''
} catch {
  // The hidden entry still works for the current page when storage is unavailable.
}

const activateDeveloperMode = () => {
  const roomId = room.value?.roomId
  if (!roomId || displayedViewStage.value !== 'playing') return
  developerUnlockedRoomId.value = roomId
  try {
    window.sessionStorage.setItem(DEVELOPER_UNLOCK_SESSION_KEY, roomId)
  } catch {
    // Keeping the mode in memory is sufficient for this page session.
  }
  developerPanelOpen.value = true
  restoredDeveloperPanelRoomId = roomId
  announceDeveloperMode()
  developerUnlockFlash.value = false
  void nextTick().then(() => {
    developerUnlockFlash.value = true
    if (developerUnlockFlashTimer) window.clearTimeout(developerUnlockFlashTimer)
    developerUnlockFlashTimer = window.setTimeout(() => {
      developerUnlockFlash.value = false
      developerUnlockFlashTimer = null
    }, 420)
  })
  playKeyClick()
}

const onDeveloperSecretKeydown = (event: KeyboardEvent) => {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
  const key = event.key.toLowerCase()
  if (key.length !== 1) {
    developerUnlockBuffer = ''
    return
  }
  developerUnlockBuffer = `${developerUnlockBuffer}${key}`.slice(-DEVELOPER_UNLOCK_SEQUENCE.length)
  if (developerUnlockBuffer !== DEVELOPER_UNLOCK_SEQUENCE) return
  developerUnlockBuffer = ''
  activateDeveloperMode()
}
const gridConstructionActive = ref(false)
const gridConstructionComplete = ref(false)
const GRID_CONSTRUCTION_SESSION_KEY = 'rummikub.grid-construction-room.v1'
let gridConstructionTimer: ReturnType<typeof window.setTimeout> | null = null
const transitionTimers = new Set<ReturnType<typeof window.setTimeout>>()
const scheduleTransitionStep = (callback: () => void, delay: number) => {
  const timer = window.setTimeout(() => {
    transitionTimers.delete(timer)
    callback()
  }, delay)
  transitionTimers.add(timer)
}
const hasConstructedCurrentRoom = () => {
  const roomId = room.value?.roomId
  if (!roomId) return false
  try {
    return window.sessionStorage.getItem(GRID_CONSTRUCTION_SESSION_KEY) === roomId
  } catch {
    return false
  }
}
const rememberCurrentRoomConstruction = () => {
  const roomId = room.value?.roomId
  if (!roomId) return
  try {
    window.sessionStorage.setItem(GRID_CONSTRUCTION_SESSION_KEY, roomId)
  } catch {
    // The visual effect still works when storage is unavailable.
  }
}
const showCompletedGrid = () => {
  if (gridConstructionTimer) window.clearTimeout(gridConstructionTimer)
  gridConstructionTimer = null
  gridConstructionActive.value = true
  gridConstructionComplete.value = true
}
const startGridConstruction = () => {
  if (shouldReduceMotion() || hasConstructedCurrentRoom()) {
    showCompletedGrid()
    rememberCurrentRoomConstruction()
    return
  }
  if (gridConstructionTimer) window.clearTimeout(gridConstructionTimer)
  gridConstructionActive.value = false
  gridConstructionComplete.value = false
  void nextTick().then(() => {
    gridConstructionActive.value = true
    rememberCurrentRoomConstruction()
    gridConstructionTimer = window.setTimeout(() => {
      gridConstructionComplete.value = true
      gridConstructionTimer = null
    }, constructionAnimationDurationMs.value)
  })
}
const transitionToStage = (nextStage: ViewStage) => {
  if (nextStage === displayedViewStage.value) return
  if (shouldReduceMotion()) {
    displayedViewStage.value = nextStage
    gridConstructionActive.value = nextStage === 'playing'
    gridConstructionComplete.value = nextStage === 'playing'
    if (nextStage === 'playing') rememberCurrentRoomConstruction()
    return
  }
  if (nextStage === 'playing') {
    const alreadyConstructed = hasConstructedCurrentRoom()
    gridConstructionActive.value = alreadyConstructed
    gridConstructionComplete.value = alreadyConstructed
  }
  pageTransitionActive.value = true
  scheduleTransitionStep(() => { displayedViewStage.value = nextStage }, 350)
  scheduleTransitionStep(() => {
    pageTransitionActive.value = false
    if (nextStage === 'playing') startGridConstruction()
  }, 690)
}
watch(actualViewStage, transitionToStage, { flush: 'sync' })
const leaveRoomWithTransition = () => {
  if (shouldReduceMotion()) {
    displayedViewStage.value = 'lobby'
    leaveRoom()
    return
  }
  pageTransitionActive.value = true
  scheduleTransitionStep(() => {
    displayedViewStage.value = 'lobby'
    leaveRoom()
  }, 350)
  scheduleTransitionStep(() => { pageTransitionActive.value = false }, 690)
}

const handTiles = computed(() => handSlots.value.filter((tile): tile is UITile => tile != null))
const gridColumnCount = computed(() => board.value[0]?.length ?? MIN_BOARD_COLUMNS)
const gridRowCount = computed(() => board.value.length || MIN_BOARD_ROWS)
const constructionVerticalLines = computed(() => Array.from({ length: gridColumnCount.value + 1 }, (_, index) => index))
const constructionHorizontalLines = computed(() => Array.from({ length: gridRowCount.value + 1 }, (_, index) => index))
const constructionLineFinishMs = computed(() => Math.max(
  650 + gridColumnCount.value * 30,
  690 + gridRowCount.value * 38,
))
const constructionDotColumnCount = computed(() => gridColumnCount.value * 5)
const constructionDotRowCount = computed(() => gridRowCount.value * 7)
const CONSTRUCTION_DOT_LEAD_MS = 420
const constructionDotMaxDistance = computed(() => Math.max(1, constructionDotColumnCount.value + constructionDotRowCount.value - 2))
const constructionDotStepMs = computed(() => 820 / constructionDotMaxDistance.value)
const constructionDotRadiusY = computed(() => 1.15 * gridColumnCount.value * TILE_RATIO / gridRowCount.value)
const constructionAnimationDurationMs = computed(() => constructionLineFinishMs.value + 620)
const constructionDots = computed(() => Array.from(
  { length: constructionDotColumnCount.value * constructionDotRowCount.value },
  (_, index) => ({
    column: index % constructionDotColumnCount.value,
    row: Math.floor(index / constructionDotColumnCount.value),
  }),
))
const handRowCount = computed(() => Math.max(MIN_HAND_ROWS, Math.ceil(handSlots.value.length / HAND_COLUMNS)))
const handCellIndexes = computed(() => Array.from({ length: handRowCount.value * HAND_COLUMNS }, (_, index) => index))
const tileGroups = computed<BoardGroupResult[]>(() => room.value?.board.groups ?? [])
const validatedGroups = computed(() => tileGroups.value.filter((group) => group.length >= 3))
const invalidGroups = computed(() => tileGroups.value.filter((group) => group.isValid === false))
const developerBoardTileCount = computed(() => board.value.flat().filter(Boolean).length)
const developerValidGroupCount = computed(() => validatedGroups.value.filter((group) => group.isValid === true).length)
const developerInvalidGroupCount = computed(() => invalidGroups.value.length)
const invalidFrameStyle = (group: BoardGroupResult) => ({
  left: `calc(var(--cell-width) * ${group.startColumn})`,
  top: `calc(var(--cell-height) * ${group.row})`,
  width: `calc(var(--cell-width) * ${group.length})`,
  height: 'var(--cell-height)',
})

const groupAt = (row: number, column: number) =>
  tileGroups.value.find((group) => group.row === row && column >= group.startColumn && column <= group.endColumn)

const groupClassAt = (row: number, column: number) => {
  const group = groupAt(row, column)
  if (group?.isValid !== false) return {}
  return {
    'group-invalid': true,
    'group-invalid-start': column === group.startColumn,
    'group-invalid-end': column === group.endColumn,
  }
}

const currentPlayerName = computed(() =>
  room.value?.players.find((player) => player.id === room.value?.currentTurnPlayerId)?.name ?? '—',
)
const winnerName = computed(() =>
  room.value?.players.find((player) => player.id === room.value?.winnerPlayerId)?.name ?? '—',
)
const isHost = computed(() => room.value?.hostPlayerId === room.value?.yourPlayerId)
const canMoveTiles = computed(() =>
  room.value?.status === 'PLAYING' && isMyTurn.value && !isSyncing.value && !boardGeometryAnimating.value && socketStatus.value === 'connected',
)
const canArrangeHand = computed(() =>
  room.value?.status === 'PLAYING' && !isSyncing.value && !boardGeometryAnimating.value && socketStatus.value === 'connected',
)
const connectedPlayerCount = computed(() => room.value?.players.filter((player) => player.connected).length ?? 0)
const disconnectedPlayers = computed(() => room.value?.players.filter((player) => !player.connected) ?? [])
const yourPlayer = computed(() => room.value?.players.find((player) => player.id === room.value?.yourPlayerId))
const finalRanking = computed(() => [...(room.value?.players ?? [])].sort((left, right) => {
  if (left.id === room.value?.winnerPlayerId) return -1
  if (right.id === room.value?.winnerPlayerId) return 1
  return left.handCount - right.handCount
}))
const replayTurnBoundaryActions = new Set([
  'GAME_STARTED', 'TURN_ENDED', 'TILE_DRAWN', 'TURN_TIMEOUT_PLAYED',
  'TURN_TIMEOUT_NO_PLAY_DRAWN', 'TURN_TIMEOUT_INVALID_REVERTED', 'GAME_FINISHED', 'PLAYER_LEFT',
])
const replayFrames = computed(() => {
  const frames = replayData.value?.frames ?? []
  return replaySimplified.value
    ? frames.filter((frame) => replayTurnBoundaryActions.has(frame.action.type))
    : frames
})
const replayFrame = computed<ReplayFrame | null>(() => replayFrames.value[replayIndex.value] ?? null)
const replayFrameCount = computed(() => replayFrames.value.length)
const replayBoardMetrics = computed(() => {
  const rows = replayFrame.value?.board.length ?? MIN_BOARD_ROWS
  const columns = replayFrame.value?.board[0]?.length ?? MIN_BOARD_COLUMNS
  const aspectRatio = columns * TILE_RATIO / rows
  const stageWidth = replayStageSize.value.width || Math.max(320, window.innerWidth - 56)
  const stageHeight = replayStageSize.value.height || Math.max(260, window.innerHeight - 150)
  const frameThickness = 28
  const availableBoardWidth = Math.max(180, Math.min(900, stageWidth * .62) - frameThickness)
  const availableBoardHeight = Math.max(150, stageHeight - 36 - frameThickness)
  const boardWidth = Math.min(availableBoardWidth, availableBoardHeight * aspectRatio)
  const boardHeight = boardWidth / aspectRatio
  const cellWidth = boardWidth / columns
  const cellHeight = boardHeight / rows
  return {
    '--replay-board-width': `${boardWidth}px`,
    '--replay-board-height': `${boardHeight}px`,
    '--replay-cell-width': `${cellWidth}px`,
    '--replay-cell-height': `${cellHeight}px`,
    '--cell-width': `${cellWidth}px`,
    '--cell-height': `${cellHeight}px`,
    '--tile-width': `${Math.max(4, cellWidth - 4)}px`,
    '--tile-height': `${Math.max(6, cellHeight - 6)}px`,
    '--replay-frame-width': `${boardWidth + frameThickness}px`,
    '--replay-frame-height': `${boardHeight + frameThickness}px`,
  }
})
const replaySeatClass = (index: number, count: number) => {
  const layouts: Record<number, string[]> = {
    1: ['bottom-center'],
    2: ['middle-left', 'middle-right'],
    3: ['top-left', 'top-right', 'bottom-center'],
    4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  }
  return layouts[Math.min(4, count)]?.[index] ?? 'bottom-center'
}
const replayActionLabel = (frame: ReplayFrame) => {
  const labels: Record<string, [string, string]> = {
    GAME_STARTED: ['对局开始', 'MATCH STARTED'], BOARD_UPDATED: ['牌桌调整', 'TABLE UPDATED'],
    TURN_REVERTED: ['还原牌桌', 'TABLE RESET'], TURN_ENDED: ['提交回合', 'TURN COMMITTED'],
    TILE_DRAWN: ['摸取一张', 'TILE DRAWN'], TURN_TIMEOUT_PLAYED: ['超时自动提交', 'TIMEOUT COMMIT'],
    TURN_TIMEOUT_NO_PLAY_DRAWN: ['超时摸牌', 'TIMEOUT DRAW'], TURN_TIMEOUT_INVALID_REVERTED: ['非法牌型已撤回', 'INVALID PLAY REVERTED'],
    GAME_FINISHED: ['对局结束', 'MATCH FINISHED'], PLAYER_LEFT: ['玩家退出', 'PLAYER LEFT'],
  }
  const label = labels[frame.action.type]
  return label ? label[settings.value.language === 'zh' ? 0 : 1] : frame.action.type.replaceAll('_', ' ')
}
const stopReplay = () => {
  replayPlaying.value = false
  if (replayTimer) window.clearInterval(replayTimer)
  replayTimer = null
}
interface ReplayTileRect {
  rect: DOMRect
  element: HTMLElement
  visualClone: HTMLElement
}
const captureReplayTileRects = () => {
  const result = new Map<string, ReplayTileRect>()
  document.querySelectorAll<HTMLElement>('.replay-overlay [data-replay-tile-id]').forEach((element) => {
    const id = element.dataset.replayTileId
    if (id) result.set(id, { rect: element.getBoundingClientRect(), element, visualClone: createTileVisualClone(element) })
  })
  return result
}
const prepareReplayTransition = () => {
  clearReplayTransition?.()
  clearReplayTransition = null
  return {
    tiles: captureReplayTileRects(),
    board: document.querySelector<HTMLElement>('.replay-table-wrap')?.getBoundingClientRect() ?? null,
  }
}
const animateReplayTransition = (before: ReturnType<typeof prepareReplayTransition>, version: number) => {
  void nextTick().then(() => {
    if (version !== replayTransitionVersion) return
    if (shouldReduceMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const overlay = document.querySelector<HTMLElement>('.replay-overlay')
    if (!overlay) return
    const after = captureReplayTileRects()
    const layer = document.createElement('div')
    layer.className = 'replay-motion-layer'
    Object.assign(layer.style, {
      position: 'fixed', inset: '0', zIndex: '600', overflow: 'hidden', pointerEvents: 'none',
    })
    overlay.appendChild(layer)
    const hiddenTiles: HTMLElement[] = []
    const animations: Animation[] = []
    const boardElement = document.querySelector<HTMLElement>('.replay-table-wrap')
    const afterBoard = boardElement?.getBoundingClientRect() ?? null
    const duration = BOARD_GEOMETRY_ANIMATION_MS
    const easing = 'cubic-bezier(.2,.8,.2,1)'
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      animations.forEach((animation) => animation.cancel())
      hiddenTiles.forEach((element) => element.style.removeProperty('opacity'))
      boardElement?.style.removeProperty('transform-origin')
      layer.remove()
      if (clearReplayTransition === cleanup) clearReplayTransition = null
    }
    clearReplayTransition = cleanup

    const boardGeometryChanged = Boolean(before.board && afterBoard && (
      Math.abs(before.board.width - afterBoard.width) > 1
      || Math.abs(before.board.height - afterBoard.height) > 1
    ))
    if (boardElement && before.board && afterBoard && boardGeometryChanged) {
      const scaleX = before.board.width / Math.max(1, afterBoard.width)
      const scaleY = before.board.height / Math.max(1, afterBoard.height)
      const dx = before.board.left - afterBoard.left
      const dy = before.board.top - afterBoard.top
      boardElement.style.transformOrigin = 'top left'
      animations.push(boardElement.animate([
        { transform: `translate(${dx}px,${dy}px) scale(${scaleX},${scaleY})` },
        { transform: 'translate(0,0) scale(1,1)' },
      ], { duration, easing }))
    }

    after.forEach(({ rect, element: target }, id) => {
      const previous = before.tiles.get(id)
      if (!previous) {
        animations.push(target.animate([
          { opacity: 0, transform: 'scale(.72)' },
          { opacity: 1, transform: 'scale(1)' },
        ], { duration: 260, easing }))
        return
      }
      const moved = Math.abs(previous.rect.left - rect.left) > 1.25
        || Math.abs(previous.rect.top - rect.top) > 1.25
        || Math.abs(previous.rect.width - rect.width) > .75
        || Math.abs(previous.rect.height - rect.height) > .75
      if (!moved) return
      target.style.opacity = '0'
      hiddenTiles.push(target)
      const ghost = previous.visualClone
      ghost.removeAttribute('data-replay-tile-id')
      Object.assign(ghost.style, {
        position: 'fixed', left: `${previous.rect.left}px`, top: `${previous.rect.top}px`,
        width: `${previous.rect.width}px`, height: `${previous.rect.height}px`, margin: '0',
        pointerEvents: 'none', zIndex: '1', transform: 'none', transition: 'none',
      })
      layer.appendChild(ghost)
      animations.push(ghost.animate([
        {
          left: `${previous.rect.left}px`, top: `${previous.rect.top}px`,
          width: `${previous.rect.width}px`, height: `${previous.rect.height}px`,
        },
        {
          left: `${rect.left}px`, top: `${rect.top}px`,
          width: `${rect.width}px`, height: `${rect.height}px`,
        },
      ], { duration, easing, fill: 'forwards' }))
      for (const selector of ['.number', 'small']) {
        const ghostText = ghost.querySelector<HTMLElement>(selector)
        const targetText = target.querySelector<HTMLElement>(selector)
        if (!ghostText || !targetText) continue
        const startStyle = getComputedStyle(ghostText)
        const endStyle = getComputedStyle(targetText)
        animations.push(ghostText.animate([
          {
            fontSize: startStyle.fontSize, lineHeight: startStyle.lineHeight,
            maxWidth: startStyle.maxWidth,
          },
          {
            fontSize: endStyle.fontSize, lineHeight: endStyle.lineHeight,
            maxWidth: endStyle.maxWidth,
          },
        ], { duration, easing, fill: 'forwards' }))
      }
    })
    before.tiles.forEach(({ rect, visualClone }, id) => {
      if (after.has(id)) return
      visualClone.removeAttribute('data-replay-tile-id')
      Object.assign(visualClone.style, {
        position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`,
        height: `${rect.height}px`, margin: '0', pointerEvents: 'none', zIndex: '1', transition: 'none',
      })
      layer.appendChild(visualClone)
      animations.push(visualClone.animate([
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(.68)' },
      ], { duration: 260, easing: 'ease-in', fill: 'forwards' }))
    })
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (version === replayTransitionVersion) cleanup()
    })
  })
}
const setReplayFrameIndex = (nextIndex: number) => {
  const normalized = Math.max(0, Math.min(replayFrameCount.value - 1, nextIndex))
  if (normalized === replayIndex.value) return
  const before = prepareReplayTransition()
  replayIndex.value = normalized
  const version = ++replayTransitionVersion
  animateReplayTransition(before, version)
}
const toggleReplay = () => {
  if (replayPlaying.value || replayFrameCount.value < 2) {
    stopReplay()
    return
  }
  if (replayIndex.value >= replayFrameCount.value - 1) setReplayFrameIndex(0)
  replayPlaying.value = true
  replayTimer = window.setInterval(() => {
    if (replayIndex.value >= replayFrameCount.value - 1) {
      stopReplay()
      return
    }
    setReplayFrameIndex(replayIndex.value + 1)
  }, 720)
}
const stepReplay = (delta: number) => {
  stopReplay()
  setReplayFrameIndex(replayIndex.value + delta)
}
const seekReplay = (event: Event) => {
  stopReplay()
  setReplayFrameIndex(Number((event.target as HTMLInputElement).value))
}
const setReplayMode = (simplified: boolean) => {
  if (replaySimplified.value === simplified) return
  stopReplay()
  const before = prepareReplayTransition()
  replaySimplified.value = simplified
  replayIndex.value = 0
  const version = ++replayTransitionVersion
  animateReplayTransition(before, version)
  playKeyClick()
}
const openReplay = () => {
  stopReplay()
  replayIndex.value = 0
  replayOpen.value = true
  requestReplay()
  playKeyClick()
}
const closeReplay = () => {
  stopReplay()
  replayTransitionVersion += 1
  clearReplayTransition?.()
  clearReplayTransition = null
  replayOpen.value = false
}

watch(replayStage, (element) => {
  replayResizeObserver?.disconnect()
  replayResizeObserver = null
  if (!element) return
  const updateSize = () => {
    const rect = element.getBoundingClientRect()
    replayStageSize.value = { width: rect.width, height: rect.height }
  }
  updateSize()
  replayResizeObserver = new ResizeObserver(updateSize)
  replayResizeObserver.observe(element)
})

onUnmounted(() => {
  replayResizeObserver?.disconnect()
  clearReplayTransition?.()
})

watch(replayData, (data) => {
  if (!data || !replayOpen.value) return
  replayIndex.value = Math.min(replayIndex.value, Math.max(0, replayFrameCount.value - 1))
})

const openSettings = () => {
  settingsDraft.value = { ...settings.value, playerName: playerName.value }
  settingsOpen.value = true
}
const saveSettings = () => {
  settings.value = {
    ...settingsDraft.value,
    playerName: settingsDraft.value.playerName.trim().slice(0, 20) || (settingsDraft.value.language === 'zh' ? '玩家' : 'Player'),
    subtlePattern: settingsDraft.value.background !== 'plain',
  }
  playerName.value = settings.value.playerName
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
  settingsOpen.value = false
  playKeyClick()
}
const openRoomSettings = () => {
  if (!room.value) return
  roomSettingsDraft.value = { ...room.value.settings }
  roomSettingsOpen.value = true
  playKeyClick()
}
const saveRoomSettings = () => {
  if (!room.value || !isHost.value) return
  updateRoomSettings({ ...roomSettingsDraft.value })
  roomSettingsOpen.value = false
  playKeyClick()
}
const toggleLanguage = () => {
  const previousDefault = settings.value.language === 'zh' ? '玩家' : 'Player'
  const nextLanguage = settings.value.language === 'zh' ? 'en' : 'zh'
  if (playerName.value === previousDefault) playerName.value = nextLanguage === 'zh' ? '玩家' : 'Player'
  settings.value = { ...settings.value, language: nextLanguage, playerName: playerName.value }
  settingsDraft.value = { ...settingsDraft.value, language: nextLanguage, playerName: playerName.value }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
  playKeyClick()
}
const savePlayerName = () => {
  settings.value.playerName = playerName.value.trim().slice(0, 20) || (settings.value.language === 'zh' ? '玩家' : 'Player')
  playerName.value = settings.value.playerName
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
}
const reconnectSeconds = (deadline: number | null) => deadline
  ? Math.max(0, Math.ceil((deadline - now.value) / 1000))
  : 0
const turnRemainingMs = computed(() => room.value?.turnDeadline
  ? Math.max(0, room.value.turnDeadline - now.value)
  : 0)
const turnSeconds = computed(() => Math.ceil(turnRemainingMs.value / 1000))
const turnProgress = computed(() => {
  const durationMs = (room.value?.settings.turnDurationSeconds ?? 60) * 1000
  return Math.min(100, turnRemainingMs.value / durationMs * 100)
})
const addDeveloperTile = (jokerType: JokerType = JokerType.NONE) => {
  giveDevTile(
    jokerType === JokerType.NONE ? developerColor.value : TileColor.BLACK,
    jokerType === JokerType.NONE ? developerValue.value : 0,
    jokerType,
  )
  playKeyClick()
}
type DeveloperTileRequest = { color: TileColor; value: number; jokerType: JokerType }
const normalDeveloperTile = (color: TileColor, value: number): DeveloperTileRequest => ({
  color,
  value,
  jokerType: JokerType.NONE,
})
const addDeveloperBatch = (tiles: DeveloperTileRequest[]) => {
  if (!tiles.length || !isMyTurn.value || isSyncing.value) return
  giveDevTiles(tiles)
  playKeyClick()
}
const addDeveloperPair = () => addDeveloperBatch([
  normalDeveloperTile(developerColor.value, developerValue.value),
  normalDeveloperTile(developerColor.value, developerValue.value),
])
const addDeveloperRun = (length: 3 | 4) => {
  if (developerValue.value + length - 1 > 13) return
  addDeveloperBatch(Array.from(
    { length },
    (_, index) => normalDeveloperTile(developerColor.value, developerValue.value + index),
  ))
}
const addDeveloperGroup = (length: 3 | 4) => addDeveloperBatch(
  developerColors.slice(0, length).map((color) => normalDeveloperTile(color, developerValue.value)),
)
const addDeveloperColorSeries = () => addDeveloperBatch(
  Array.from({ length: 13 }, (_, index) => normalDeveloperTile(developerColor.value, index + 1)),
)
const addAllDeveloperJokers = () => addDeveloperBatch([
  { color: TileColor.BLACK, value: 0, jokerType: JokerType.STANDARD },
  { color: TileColor.BLACK, value: 0, jokerType: JokerType.DOUBLE },
  { color: TileColor.BLACK, value: 0, jokerType: JokerType.COLOR_CHANGE },
  { color: TileColor.BLACK, value: 0, jokerType: JokerType.MIRROR },
])
const toggleSidePanel = (panel: 'chat' | 'voice' | 'developer') => {
  if (panel === 'chat') {
    chatPanelOpen.value = !chatPanelOpen.value
    if (chatPanelOpen.value) voicePanelOpen.value = false
    if (chatPanelOpen.value) hasUnreadChat.value = false
    return
  }
  if (panel === 'voice') {
    voicePanelOpen.value = !voicePanelOpen.value
    if (voicePanelOpen.value) chatPanelOpen.value = false
    return
  }
  developerPanelOpen.value = !developerPanelOpen.value
}
const submitChat = () => {
  const text = chatDraft.value.trim()
  if (!text || socketStatus.value !== 'connected') return
  if (sendChat(text)) {
    chatDraft.value = ''
    playKeyClick()
  }
}
const chatTime = (timestamp: number) => new Intl.DateTimeFormat(settings.value.language === 'zh' ? 'zh-CN' : 'en-US', {
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(timestamp)

watch(() => settings.value.language, (language) => { document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en' }, { immediate: true })

const englishErrors: Record<string, string> = {
  '暂时无法连接游戏服务器，正在自动重试。': 'Unable to reach the game server. Retrying automatically.',
  '连接尚未恢复，请稍候。': 'The connection has not recovered yet. Please wait.',
  '原房间已经关闭，请重新创建或加入房间。': 'The previous room is closed. Create or join another room.',
  '没有找到这个房间。': 'Room not found.',
  '房间人数已满。': 'The room is full.',
  '游戏已经开始，暂时不能中途加入。': 'This match has already started.',
  '至少需要两名在线玩家才能开始。': 'At least two online players are required.',
  '现在不是你的回合。': 'It is not your turn.',
  '桌面已经更新，请再确认一次。': 'The table changed. Please review it again.',
  '场上已有的牌不能收回手牌。': 'Tiles already on the table cannot be returned to your rack.',
  '本回合尚未出牌；如果不出牌，请选择摸一张。': 'No tile has been played. Draw one tile to end the turn.',
  '请先创建或加入房间。': 'Create or join a room first.',
  '游戏尚未开始或已经结束。': 'The match has not started or has already ended.',
  '你已经在一个房间中。': 'You are already in a room.',
  '请先创建房间。': 'Create a room first.',
  '只有房主可以开始游戏。': 'Only the host can start the match.',
  '游戏已经开始。': 'The match has already started.',
  '房间成员刚刚发生变化，请重试。': 'The room roster just changed. Please try again.',
  '桌面已经更新，已恢复为最新状态。': 'The table changed and has been restored to the latest state.',
  '桌面数据格式不正确。': 'The table data is invalid.',
  '牌的数量或内容不一致，已恢复服务端状态。': 'The tile inventory did not match. The server state has been restored.',
  '不能把桌面已有的牌收入手牌。': 'Tiles already on the table cannot be moved into your rack.',
  '每个提交回合至少要从手牌打出一张牌。': 'Play at least one tile from your rack before committing.',
  '桌面已经更新，请重试。': 'The table changed. Please try again.',
  '开发者牌参数不正确。': 'The developer tile settings are invalid.',
  '请先进入房间。': 'Join a room first.',
  '游戏开始后才能发送局内消息。': 'Room chat is available after the match starts.',
  '不能发送空消息。': 'A chat message cannot be empty.',
  '消息发送得太快了。': 'Messages are being sent too quickly.',
  '重连凭证已失效，请重新加入房间。': 'Your reconnect session has expired. Please join the room again.',
  '已超过一分钟重连时间，请重新加入房间。': 'The one-minute reconnect window has expired. Please join again.',
  '当前游戏尚未结束。': 'The current match has not finished yet.',
  '只有房主可以发起再来一局。': 'Only the host can start a rematch.',
  '房间状态刚刚变化，请重试。': 'The room state just changed. Please try again.',
  '消息不是合法的 JSON。': 'The message format is invalid.',
  '未知的消息类型。': 'Unknown message type.',
}
const localizedSocketError = computed(() => {
  const message = socketError.value
  if (settings.value.language !== 'en') return message
  const invalidRow = message.match(/^第 (\d+) 行存在未完成或不合法的组合/)
  if (invalidRow) return `Row ${invalidRow[1]} contains an incomplete or invalid set. Adjust the red-framed tiles.`
  const openingScore = message.match(/^首次出牌总值需要至少 30 分，当前为 (\d+) 分/)
  if (openingScore) return `Your opening play must total at least 30 points. Current total: ${openingScore[1]}. The table layout has been preserved.`
  return englishErrors[message] ?? message
})
// 四种百搭牌各自的辨识图标
const jokerIcon = (jokerType: JokerType) => ({
  [JokerType.STANDARD]: '★',
  [JokerType.DOUBLE]: '×2',
  [JokerType.COLOR_CHANGE]: '↝',
  [JokerType.MIRROR]: '⧉',
  [JokerType.NONE]: '',
})[jokerType]

watch(() => chatMessages.value.length, (length, previousLength) => {
  if (length > previousLength && !chatPanelOpen.value) hasUnreadChat.value = true
  void nextTick().then(() => {
    if (chatList.value) chatList.value.scrollTop = chatList.value.scrollHeight
  })
})

const cellSizeFor = (_rows: number, columns: number) => {
  // 固定棋盘宽度：扩展时不再压缩格子宽度导致棋盘变窄；高度随行数自然增长以保持牌的比例。
  const cellWidth = 896 / columns
  const cellHeight = cellWidth / TILE_RATIO
  return { cellWidth, cellHeight }
}

const boardMetrics = computed(() => {
  const rows = board.value.length
  const columns = board.value[0]?.length ?? MIN_BOARD_COLUMNS
  const { cellWidth, cellHeight } = cellSizeFor(rows, columns)
  return {
    '--cell-width': `${cellWidth}px`,
    '--cell-height': `${cellHeight}px`,
    '--tile-width': `${cellWidth - 4}px`,
    '--tile-height': `${cellHeight - 6}px`,
    '--board-width': `${cellWidth * columns}px`,
    '--board-half-width': `${cellWidth * columns / 2}px`,
    '--board-height': `${cellHeight * rows}px`,
    '--hand-width': `${cellWidth * HAND_COLUMNS}px`,
  }
})

interface TileRect {
  rect: DOMRect
  element: HTMLElement
  zone: 'board' | 'hand' | 'other'
  visualClone: HTMLElement
}

let layoutAnimationVersion = 0
const activeLayoutAnimations = new Set<Animation>()
const activeAlignmentAnimations = new Map<string, Animation>()
const trackLayoutAnimation = (animation: Animation) => {
  activeLayoutAnimations.add(animation)
  void animation.finished.catch(() => undefined).finally(() => {
    activeLayoutAnimations.delete(animation)
  })
  return animation
}
const trackAlignmentAnimation = (id: string, animation: Animation) => {
  activeAlignmentAnimations.get(id)?.cancel()
  activeAlignmentAnimations.set(id, animation)
  void animation.finished.catch(() => undefined).finally(() => {
    if (activeAlignmentAnimations.get(id) === animation) activeAlignmentAnimations.delete(id)
  })
  return animation
}
const cancelActiveLayoutAnimations = () => {
  activeLayoutAnimations.forEach((animation) => animation.cancel())
  activeLayoutAnimations.clear()
}
const cancelAlignmentAnimation = (id: string) => {
  activeAlignmentAnimations.get(id)?.cancel()
  activeAlignmentAnimations.delete(id)
}

const clearTilePositionOverrides = (element: HTMLElement) => {
  ;['position', 'left', 'top', 'width', 'height', 'margin', 'translate', 'transform', 'transition', 'z-index']
    .forEach((property) => element.style.removeProperty(property))
  element.classList.remove('settling-drag')
}

const alignTileToNaturalSlot = (id: string, duration = 180) => {
  if (draggingTileSet.value.has(id)) {
    scheduleTileAlignmentCheck([id], 240)
    return
  }
  if (activeLayoutAnimations.size) {
    scheduleTileAlignmentCheck([id], 90)
    return
  }
  const element = [...document.querySelectorAll<HTMLElement>('[data-tile-id]')]
    .find((candidate) => candidate.dataset.tileId === id)
  if (!element || element.closest('#tile-parking')) return
  const current = element.getBoundingClientRect()
  cancelAlignmentAnimation(id)
  clearTilePositionOverrides(element)
  const natural = element.getBoundingClientRect()
  const dx = current.left - natural.left
  const dy = current.top - natural.top
  if (Math.abs(dx) < .75 && Math.abs(dy) < .75) return
  trackAlignmentAnimation(id, element.animate([
    { translate: `${dx}px ${dy}px` },
    { translate: '0 0' },
  ], { duration, easing: 'cubic-bezier(.2,.78,.2,1)' }))
}

function scheduleTileAlignmentCheck(ids: string[], delay = 280) {
  ids.forEach((id) => {
    const previous = tileAlignmentTimers.get(id)
    if (previous) window.clearTimeout(previous)
    const timer = window.setTimeout(() => {
      tileAlignmentTimers.delete(id)
      alignTileToNaturalSlot(id)
    }, delay)
    tileAlignmentTimers.set(id, timer)
  })
}

const releaseInterruptedDragSettlements = (exceptId = '') => {
  const interrupted = [...activeDragSettlements.entries()]
    .filter(([id]) => id !== exceptId)
  if (!interrupted.length) return
  void nextTick().then(() => {
    interrupted.forEach(([id, record]) => {
      if (activeDragSettlements.get(id) !== record) return
      const current = record.element.getBoundingClientRect()
      record.animation.cancel()
      clearTilePositionOverrides(record.element)
      const natural = record.element.getBoundingClientRect()
      const dx = current.left - natural.left
      const dy = current.top - natural.top
      activeDragSettlements.delete(id)
      if (tileSettlementTokens.get(id) === record.token) tileSettlementTokens.delete(id)
      if (Math.abs(dx) >= .75 || Math.abs(dy) >= .75) {
        trackAlignmentAnimation(id, record.element.animate([
          { translate: `${dx}px ${dy}px` },
          { translate: '0 0' },
        ], { duration: 180, easing: 'cubic-bezier(.2,.78,.2,1)' }))
      }
      scheduleTileAlignmentCheck([id], 220)
    })
  })
}
const invalidateLayoutAnimations = () => {
  layoutAnimationVersion += 1
  cancelActiveLayoutAnimations()
}
const scheduleLayoutAnimation = (before: Map<string, TileRect>) => {
  const version = ++layoutAnimationVersion
  void nextTick().then(() => {
    if (version !== layoutAnimationVersion) return
    cancelActiveLayoutAnimations()
    animateFrom(before)
  })
}

const tileZone = (element: HTMLElement): TileRect['zone'] => {
  if (element.closest('.board')) return 'board'
  if (element.closest('.hand-grid')) return 'hand'
  return 'other'
}

const preserveTileMetrics = (source: HTMLElement, clone: HTMLElement) => {
  const sourceStyle = getComputedStyle(source)
  for (const property of ['--cell-width', '--cell-height', '--tile-width', '--tile-height']) {
    clone.style.setProperty(property, sourceStyle.getPropertyValue(property))
  }
  for (const selector of ['.number', 'small']) {
    const sourceText = source.querySelector<HTMLElement>(selector)
    const cloneText = clone.querySelector<HTMLElement>(selector)
    if (!sourceText || !cloneText) continue
    const textStyle = getComputedStyle(sourceText)
    cloneText.style.fontSize = textStyle.fontSize
    cloneText.style.lineHeight = textStyle.lineHeight
    cloneText.style.maxWidth = textStyle.maxWidth
  }
}

const createTileVisualClone = (source: HTMLElement) => {
  const clone = source.cloneNode(true) as HTMLElement
  preserveTileMetrics(source, clone)
  return clone
}

const captureTileRects = () => {
  const result = new Map<string, TileRect>()
  document.querySelectorAll<HTMLElement>('[data-tile-id]').forEach((element) => {
    const id = element.dataset.tileId
    if (id) result.set(id, {
      rect: element.getBoundingClientRect(),
      element,
      zone: tileZone(element),
      visualClone: createTileVisualClone(element),
    })
  })
  return result
}

const animateFrom = (before: Map<string, TileRect>) => {
  if (shouldReduceMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const after = captureTileRects()

  after.forEach(({ rect, element, zone }, id) => {
    if (draggingTileSet.value.has(id) || element.classList.contains('settling-drag')) return
    const previous = before.get(id)
    if (previous) {
      const dx = previous.rect.left - rect.left
      const dy = previous.rect.top - rect.top
      const scaleX = previous.rect.width / rect.width
      const scaleY = previous.rect.height / rect.height
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || Math.abs(scaleX - 1) > 0.01) {
        const crossedZones = previous.zone !== zone && previous.zone !== 'other' && zone !== 'other'
        if (crossedZones) {
          const ghost = previous.visualClone.cloneNode(true) as HTMLElement
          ghost.removeAttribute('data-tile-id')
          ghost.classList.add('transfer-ghost')
          ghost.classList.remove('dimmed', 'locked')
          Object.assign(ghost.style, {
            position: 'fixed',
            left: `${previous.rect.left}px`,
            top: `${previous.rect.top}px`,
            width: `${previous.rect.width}px`,
            height: `${previous.rect.height}px`,
            margin: '0',
            pointerEvents: 'none',
            zIndex: '45',
            transition: 'none',
          })
          element.style.opacity = '0'
          document.body.appendChild(ghost)
          const animation = trackLayoutAnimation(ghost.animate([
            {
              left: `${previous.rect.left}px`, top: `${previous.rect.top}px`,
              width: `${previous.rect.width}px`, height: `${previous.rect.height}px`,
            },
            { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` },
          ], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' }))
          void animation.finished.catch(() => undefined).finally(() => {
            ghost.remove()
            element.style.removeProperty('opacity')
          })
        } else {
          const animation = trackLayoutAnimation(element.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})` },
            { transform: 'translate(0, 0) scale(1)' },
          ], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' }))
          void animation.finished.catch(() => undefined).finally(() => scheduleTileAlignmentCheck([id], 20))
        }
      }
    } else {
      const animation = trackLayoutAnimation(element.animate([
        { opacity: 0, transform: 'scale(.62) translateY(8px)' },
        { opacity: 1, transform: 'scale(1) translateY(0)' },
      ], { duration: 280, easing: 'cubic-bezier(.2,.9,.25,1)' }))
      void animation.finished.catch(() => undefined).finally(() => scheduleTileAlignmentCheck([id], 20))
    }
  })

  before.forEach(({ rect, visualClone }, id) => {
    if (after.has(id)) return
    const ghost = visualClone.cloneNode(true) as HTMLElement
    ghost.removeAttribute('data-tile-id')
    ghost.classList.add('state-ghost')
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '40',
    })
    document.body.appendChild(ghost)
    const animation = trackLayoutAnimation(ghost.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(.55) translateY(10px)' },
    ], { duration: 240, easing: 'ease-in' }))
    void animation.finished.catch(() => undefined).finally(() => ghost.remove())
  })
}

interface SnapshotRestoreOverlay {
  root: HTMLElement | null
  ghosts: Map<string, HTMLElement>
}
let activeSnapshotOverlay: SnapshotRestoreOverlay | null = null

// 快照替换前就用实体克隆覆盖旧牌。真实 DOM 牌在整个替换期间隐藏，因此目标格不会先闪一帧。
const prepareSnapshotRestore = (before: Map<string, TileRect>): SnapshotRestoreOverlay => {
  const root = document.querySelector<HTMLElement>('.game')
  const ghosts = new Map<string, HTMLElement>()
  root?.classList.add('snapshot-restoring')
  before.forEach(({ rect, visualClone }, id) => {
    const ghost = visualClone.cloneNode(true) as HTMLElement
    ghost.removeAttribute('data-tile-id')
    ghost.classList.remove('dimmed', 'locked', 'settling-drag')
    ghost.classList.add('restore-ghost')
    Object.assign(ghost.style, {
      position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`, margin: '0',
      pointerEvents: 'none', zIndex: '58', transition: 'none', transform: 'none', translate: 'none',
    })
    document.body.appendChild(ghost)
    ghosts.set(id, ghost)
  })
  const overlay = { root, ghosts }
  activeSnapshotOverlay = overlay
  return overlay
}

const clearSnapshotRestore = (overlay: SnapshotRestoreOverlay, elements: Iterable<HTMLElement> = []) => {
  overlay.ghosts.forEach((ghost) => ghost.remove())
  overlay.root?.classList.remove('snapshot-restoring')
  for (const element of elements) element.style.removeProperty('opacity')
  if (activeSnapshotOverlay === overlay) activeSnapshotOverlay = null
}

const animateSnapshotRestore = (before: Map<string, TileRect>, overlay: SnapshotRestoreOverlay) => {
  if (shouldReduceMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    clearSnapshotRestore(overlay)
    return
  }
  const after = captureTileRects()
  const easing = 'cubic-bezier(.18,.8,.2,1)'
  const animations: Animation[] = []
  const realTiles: HTMLElement[] = []

  after.forEach(({ rect, element }, id) => {
    const previous = before.get(id)
    const ghost = overlay.ghosts.get(id)
    if (!previous || !ghost || draggingTileSet.value.has(id) || element.classList.contains('settling-drag')) {
      if (ghost) ghost.remove()
      element.style.setProperty('opacity', '1', 'important')
      realTiles.push(element)
      return
    }
    const moved = Math.abs(previous.rect.left - rect.left) > 1
      || Math.abs(previous.rect.top - rect.top) > 1
      || Math.abs(previous.rect.width - rect.width) > 1
      || Math.abs(previous.rect.height - rect.height) > 1
    if (!moved) {
      ghost.remove()
      element.style.setProperty('opacity', '1', 'important')
      realTiles.push(element)
      return
    }
    cancelAlignmentAnimation(id)
    element.style.setProperty('opacity', '0', 'important')
    realTiles.push(element)
    animations.push(trackLayoutAnimation(ghost.animate([
      { left: `${previous.rect.left}px`, top: `${previous.rect.top}px`, width: `${previous.rect.width}px`, height: `${previous.rect.height}px`, opacity: 1 },
      { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, opacity: 1 },
    ], { duration: BOARD_GEOMETRY_ANIMATION_MS, easing })))
  })

  before.forEach(({ rect }, id) => {
    if (after.has(id)) return
    const ghost = overlay.ghosts.get(id)
    if (!ghost) return
    animations.push(trackLayoutAnimation(ghost.animate([
      { opacity: 1, left: `${rect.left}px`, top: `${rect.top}px` },
      { opacity: 0, left: `${rect.left}px`, top: `${rect.top + 8}px` },
    ], { duration: 180, easing: 'ease-in' })))
  })

  void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => clearSnapshotRestore(overlay, realTiles))
}

const scheduleSnapshotRestore = (before: Map<string, TileRect>, overlay: SnapshotRestoreOverlay) => {
  const version = layoutAnimationVersion
  void nextTick().then(() => {
    if (version !== layoutAnimationVersion) {
      clearSnapshotRestore(overlay)
      return
    }
    animateSnapshotRestore(before, overlay)
  })
}

const mutateWithAnimation = (mutation: () => void) => {
  invalidateLayoutAnimations()
  const before = captureTileRects()
  mutation()
  scheduleLayoutAnimation(before)
}

const buildHandLayout = (groups: string[][], orderedTiles: UITile[]) => {
  const tileMap = new Map(orderedTiles.map((tile) => [tile.id, tile]))
  const validGroups = groups.filter((group) => group.length >= 3 && group.every((id) => tileMap.has(id)))
  const groupedIds = new Set(validGroups.flat())
  const looseTiles = orderedTiles.filter((tile) => !groupedIds.has(tile.id))
  const slots: (UITile | null)[] = []
  let cursor = 0

  validGroups.forEach((group) => {
    const column = cursor % HAND_COLUMNS
    if (column + group.length > HAND_COLUMNS) cursor += HAND_COLUMNS - column
    group.forEach((id, offset) => { slots[cursor + offset] = tileMap.get(id) ?? null })
    cursor += group.length + 1
  })
  looseTiles.forEach((tile) => {
    slots[cursor] = tile
    cursor += 1
  })

  const requiredLength = Math.max(HAND_COLUMNS * MIN_HAND_ROWS, Math.ceil(Math.max(cursor, slots.length) / HAND_COLUMNS) * HAND_COLUMNS)
  const normalizedSlots = Array<UITile | null>(requiredLength).fill(null)
  slots.forEach((tile, index) => {
    if (tile) normalizedSlots[index] = tile
  })
  arrangedHandGroups.value = validGroups
  handSlots.value = normalizedSlots
}

const reflowTrackedHand = (removedIds: string[] = []) => {
  const removed = new Set(removedIds)
  if (!arrangedHandGroups.value.some((group) => group.some((id) => removed.has(id)))) return
  // Removing a sorted group must leave its cells empty. Compacting here makes every
  // later tile jump forward and also races the active drag settlement animation.
  arrangedHandGroups.value = arrangedHandGroups.value.filter((group) => !group.some((id) => removed.has(id)))
}

const resizeHandSlots = () => {
  // Keep every visual gap as an explicit null; sparse/undefined slots corrupt drag swaps and sorting.
  for (let index = 0; index < handSlots.value.length; index += 1) {
    if (handSlots.value[index] == null) handSlots.value[index] = null
  }
  const minimumLength = HAND_COLUMNS * MIN_HAND_ROWS
  while (handSlots.value.length < minimumLength) handSlots.value.push(null)
  const roundedLength = Math.ceil(handSlots.value.length / HAND_COLUMNS) * HAND_COLUMNS
  while (handSlots.value.length < roundedLength) handSlots.value.push(null)
  while (
    handSlots.value.length > minimumLength
    && handSlots.value.slice(-HAND_COLUMNS).every((tile) => tile == null)
  ) handSlots.value.splice(-HAND_COLUMNS)
}

const reconcileHand = (incoming: UITile[]) => {
  const incomingById = new Map(incoming.map((tile) => [tile.id, tile]))
  arrangedHandGroups.value = arrangedHandGroups.value
    .filter((group) => group.every((id) => incomingById.has(id)))
  const next = handSlots.value.map((tile) => tile ? incomingById.get(tile.id) ?? null : null)
  const present = new Set(next.filter((tile): tile is UITile => tile !== null).map((tile) => tile.id))
  incoming.forEach((tile) => {
    if (present.has(tile.id)) return
    const emptyIndex = next.indexOf(null)
    if (emptyIndex === -1) next.push(tile)
    else next[emptyIndex] = tile
  })
  handSlots.value = next
  resizeHandSlots()
}

const hideDeveloperUsageNotice = () => {
  developerUsageNoticeActive.value = false
  if (developerUsageNoticeTimer) window.clearTimeout(developerUsageNoticeTimer)
  developerUsageNoticeTimer = null
}

const showDeveloperUsageNotice = (activatedAt: number) => {
  const remaining = DEVELOPER_USAGE_NOTICE_MS - Math.max(0, Date.now() - activatedAt)
  if (remaining <= 0) return
  hideDeveloperUsageNotice()
  developerUsageNoticeActive.value = true
  developerUsageNoticeTimer = window.setTimeout(hideDeveloperUsageNotice, remaining)
}

watch(room, (state) => {
  if (!state) {
    hideDeveloperUsageNotice()
    lastDeveloperModeActivatedAt = null
    return
  }
  if (state.status === 'PLAYING' && state.currentTurnPlayerId !== lastNotifiedTurnPlayerId) {
    lastNotifiedTurnPlayerId = state.currentTurnPlayerId
    const currentPlayer = state.players.find((player) => player.id === state.currentTurnPlayerId)
    turnNotice.value = state.currentTurnPlayerId === state.yourPlayerId
      ? (settings.value.language === 'zh' ? '轮到你出牌了' : 'YOUR TURN — PLAY A TILE')
      : (settings.value.language === 'zh' ? `轮到 ${currentPlayer?.name ?? '玩家'} 出牌` : `${currentPlayer?.name ?? 'PLAYER'}'S TURN`)
    if (turnNoticeTimer) window.clearTimeout(turnNoticeTimer)
    turnNoticeTimer = window.setTimeout(() => { turnNotice.value = ''; turnNoticeTimer = null }, 2200)
  }
  if (state.revision !== lastNotifiedActionRevision) {
    lastNotifiedActionRevision = state.revision
    const timeoutMessages: Record<string, string> = settings.value.language === 'zh'
      ? {
          TURN_TIMEOUT_NO_PLAY_DRAWN: '时间到：你未出牌，因此摸了一张牌。',
          TURN_TIMEOUT_INVALID_REVERTED: '时间到：牌桌存在不合法组合，已撤回所有修改并摸了一张牌。',
          TURN_TIMEOUT_PLAYED: '时间到：牌桌合法，已保留本回合出牌。',
        }
      : {
          TURN_TIMEOUT_NO_PLAY_DRAWN: 'Time expired: no tile was played, so one tile was drawn.',
          TURN_TIMEOUT_INVALID_REVERTED: 'Time expired: an invalid table was reverted and one tile was drawn.',
          TURN_TIMEOUT_PLAYED: 'Time expired: the valid table play was kept.',
        }
    const message = timeoutMessages[state.lastAction.type]
    if (message) {
      turnNotice.value = message
      if (turnNoticeTimer) window.clearTimeout(turnNoticeTimer)
      turnNoticeTimer = window.setTimeout(() => { turnNotice.value = ''; turnNoticeTimer = null }, 3600)
    }
  }
  if (state.status === 'PLAYING' && state.developerModeActivatedAt) {
    if (state.developerModeActivatedAt !== lastDeveloperModeActivatedAt) {
      lastDeveloperModeActivatedAt = state.developerModeActivatedAt
      showDeveloperUsageNotice(state.developerModeActivatedAt)
    }
  } else {
    hideDeveloperUsageNotice()
    lastDeveloperModeActivatedAt = null
  }
  // 胜利广播：产生胜者时先播大屏特效、锁定操作，播完再进入结算页。
  if (state.status === 'FINISHED' && state.winnerPlayerId && !victoryAnnounced) {
    victoryAnnounced = true
    const winner = state.players.find((player) => player.id === state.winnerPlayerId)
    victoryBroadcast.value = { winnerName: winner?.name ?? '—', active: true }
    if (victoryTimer) window.clearTimeout(victoryTimer)
    victoryTimer = window.setTimeout(() => {
      victoryTimer = null
      victoryBroadcast.value.active = false
    }, 2600)
  }
  if (state.status === 'PLAYING') {
    victoryAnnounced = false
    if (victoryTimer) { window.clearTimeout(victoryTimer); victoryTimer = null }
    victoryBroadcast.value.active = false
  }
  if (
    state.status === 'PLAYING'
    && developerUnlockedRoomId.value === state.roomId
    && restoredDeveloperPanelRoomId !== state.roomId
  ) {
    developerPanelOpen.value = true
    restoredDeveloperPanelRoomId = state.roomId
  }
  if (state.status !== 'PLAYING' && developerUnlockedRoomId.value === state.roomId) {
    developerUnlockedRoomId.value = ''
    developerPanelOpen.value = false
    restoredDeveloperPanelRoomId = ''
    try {
      window.sessionStorage.removeItem(DEVELOPER_UNLOCK_SESSION_KEY)
    } catch {
      // Nothing else is required when storage is unavailable.
    }
  }
  const incomingRows = state.board.cells.length
  const incomingColumns = state.board.cells[0]?.length ?? 0
  const currentRows = board.value.length
  const currentColumns = board.value[0]?.length ?? MIN_BOARD_COLUMNS
  const boardDimensionsChanged = incomingRows !== board.value.length
    || incomingColumns !== (board.value[0]?.length ?? 0)
  const previousCells = board.value
  const beforeSize = cellSizeFor(board.value.length, board.value[0]?.length ?? MIN_BOARD_COLUMNS)
  const boardBeforeRect = boardDimensionsChanged
    ? document.querySelector<HTMLElement>('.board-inner')?.getBoundingClientRect() ?? null
    : null
  const handBeforeRect = boardDimensionsChanged
    ? document.querySelector<HTMLElement>('.hand-grid')?.getBoundingClientRect() ?? null
    : null
  const before = captureTileRects()
  const isTurnRestore = state.lastAction.type === 'TURN_REVERTED'
  const isOurPlayingTurn = state.status === 'PLAYING' && state.currentTurnPlayerId === state.yourPlayerId
  returnableTileIds.value = new Set(isOurPlayingTurn ? state.returnableTileIds : [])

  invalidateLayoutAnimations()
  if (restorePhaseTimer) {
    window.clearTimeout(restorePhaseTimer)
    restorePhaseTimer = null
  }
  if (activeSnapshotOverlay) clearSnapshotRestore(activeSnapshotOverlay)
  const restoreOverlay = isTurnRestore ? prepareSnapshotRestore(before) : null
  if (boardDimensionsChanged) {
    const shift = computeBoardShift(previousCells, state.board.cells)
    const afterSize = cellSizeFor(incomingRows, incomingColumns)

    // 还原的缩放必须分两步，不能让棋盘和牌在同一帧同时改尺寸。
    const sizeDelta = incomingRows * incomingColumns - currentRows * currentColumns
    const restoreVersion = layoutAnimationVersion
    if (isTurnRestore && sizeDelta < 0) {
      // 先把最终牌面嵌回当前（较大）棋盘，牌归位之后才收紧空边。
      const stagingOffset = computeBoardShift(state.board.cells, previousCells)
      const staged = stageBoardAtSize(state.board.cells, currentRows, currentColumns, stagingOffset)
      board.value = staged
      reconcileHand(state.yourHand.map((tile) => ({ ...tile })))
      scheduleSnapshotRestore(before, restoreOverlay!)
      restorePhaseTimer = window.setTimeout(() => {
        restorePhaseTimer = null
        if (restoreVersion !== layoutAnimationVersion) return
        const phaseBoardRect = document.querySelector<HTMLElement>('.board-inner')?.getBoundingClientRect() ?? null
        const phaseHandRect = document.querySelector<HTMLElement>('.hand-grid')?.getBoundingClientRect() ?? null
        const phaseShift = computeBoardShift(staged, state.board.cells)
        board.value = state.board.cells.map((row) => row.map((tile) => tile ? { ...tile } : null))
        beginBoardGeometryAnimation()
        void nextTick().then(() => animateBoardGeometry(phaseShift, beforeSize, afterSize, phaseBoardRect, phaseHandRect))
      }, BOARD_GEOMETRY_ANIMATION_MS)
      return
    }
    if (isTurnRestore && sizeDelta > 0) {
      // 扩张时反过来：先扩棋盘，维持当前牌面；扩张完成才让牌滑入还原位置。
      const staged = stageBoardAtSize(previousCells, incomingRows, incomingColumns, shift)
      board.value = staged
      beginBoardGeometryAnimation()
      void nextTick().then(() => animateBoardGeometry(shift, beforeSize, afterSize, boardBeforeRect, handBeforeRect))
      restorePhaseTimer = window.setTimeout(() => {
        restorePhaseTimer = null
        if (restoreVersion !== layoutAnimationVersion) return
        // 第一阶段的覆盖牌只负责遮住扩张；第二阶段会从扩张后的实际位置重新取样。
        restoreOverlay!.ghosts.forEach((ghost) => ghost.remove())
        const phaseBefore = captureTileRects()
        const phaseOverlay = prepareSnapshotRestore(phaseBefore)
        board.value = state.board.cells.map((row) => row.map((tile) => tile ? { ...tile } : null))
        reconcileHand(state.yourHand.map((tile) => ({ ...tile })))
        scheduleSnapshotRestore(phaseBefore, phaseOverlay)
      }, BOARD_GEOMETRY_ANIMATION_MS)
      return
    }

    beginBoardGeometryAnimation()
    board.value = state.board.cells.map((row) => row.map((tile) => tile ? { ...tile } : null))
    reconcileHand(state.yourHand.map((tile) => ({ ...tile })))
    void nextTick().then(() => animateBoardGeometry(shift, beforeSize, afterSize, boardBeforeRect, handBeforeRect))
    if (isTurnRestore) scheduleSnapshotRestore(before, restoreOverlay!)
  } else {
    board.value = state.board.cells.map((row) => row.map((tile) => tile ? { ...tile } : null))
    reconcileHand(state.yourHand.map((tile) => ({ ...tile })))
    if (isTurnRestore) scheduleSnapshotRestore(before, restoreOverlay!)
    else scheduleLayoutAnimation(before)
  }
})

watch(socketError, (message) => {
  if (errorTimer) window.clearTimeout(errorTimer)
  if (!message) return
  errorTimer = window.setTimeout(() => {
    if (socketError.value === message) socketError.value = ''
  }, 4200)
})

const submitCreateRoom = () => {
  savePlayerName()
  playKeyClick()
  createRoom(playerName.value)
}
const submitJoinRoom = () => {
  savePlayerName()
  playKeyClick()
  joinRoom(roomCode.value, playerName.value)
}
const publishBoard = () => updateBoard(board.value, handTiles.value)

const revertBoard = () => {
  if (!isMyTurn.value || isSyncing.value || boardGeometryAnimating.value || !room.value?.turnHasChanges) return
  // 不让尚未发出的本地拖放更新在还原后又覆盖服务端快照。
  if (boardPublishTimer) {
    window.clearTimeout(boardPublishTimer)
    boardPublishTimer = null
  }
  pendingBoardGeometry = null
  revertTurn()
  playKeyClick()
}
const copyRoomCode = async () => {
  if (!room.value) return
  try {
    await navigator.clipboard.writeText(room.value.roomId)
  } catch {
    const input = document.createElement('textarea')
    input.value = room.value.roomId
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    input.remove()
  }
  copiedRoomCode.value = true
  playKeyClick()
  window.setTimeout(() => { copiedRoomCode.value = false }, 1200)
}
const pasteRoomCode = async () => {
  try {
    const pasted = (await navigator.clipboard.readText()).trim().toUpperCase()
    if (/^[A-HJ-NP-Z2-9]{6}$/.test(pasted)) roomCode.value = pasted
  } catch {
    // 浏览器拒绝剪贴板读取时保持原输入，不用无效内容覆盖它。
  }
}

const boardLocation = (id: string) => {
  for (let row = 0; row < board.value.length; row += 1) {
    const column = board.value[row].findIndex((tile) => tile?.id === id)
    if (column !== -1) return { row, column }
  }
  return null
}

const removeTile = (id: string): UITile | null => {
  const handIndex = handSlots.value.findIndex((tile) => tile?.id === id)
  if (handIndex !== -1) {
    const tile = handSlots.value[handIndex]
    handSlots.value[handIndex] = null
    return tile
  }
  const location = boardLocation(id)
  if (!location) return null
  const tile = board.value[location.row][location.column]
  board.value[location.row][location.column] = null
  return tile
}

const rowIsEmpty = (index: number) => board.value[index].every((tile) => tile === null)
const columnIsEmpty = (index: number) => board.value.every((row) => row[index] === null)

interface BoardGeometryShift {
  columns: number
  rows: number
}

const shrinkUnusedEdges = (): BoardGeometryShift => {
  let columns = 0
  let rows = 0
  while (board.value.length > MIN_BOARD_ROWS && rowIsEmpty(0) && rowIsEmpty(1)) {
    board.value.shift()
    rows -= 1
  }
  while (
    board.value.length > MIN_BOARD_ROWS
    && rowIsEmpty(board.value.length - 1)
    && rowIsEmpty(board.value.length - 2)
  ) board.value.pop()

  let columnCount = board.value[0].length
  while (columnCount > MIN_BOARD_COLUMNS && columnIsEmpty(0) && columnIsEmpty(1)) {
    board.value.forEach((row) => row.shift())
    columnCount -= 1
    columns -= 1
  }
  while (columnCount > MIN_BOARD_COLUMNS && columnIsEmpty(columnCount - 1) && columnIsEmpty(columnCount - 2)) {
    board.value.forEach((row) => row.pop())
    columnCount -= 1
  }
  return { columns, rows }
}

const boardWouldShrink = () => {
  if (board.value.length > MIN_BOARD_ROWS
    && ((rowIsEmpty(0) && rowIsEmpty(1))
      || (rowIsEmpty(board.value.length - 1) && rowIsEmpty(board.value.length - 2)))) return true
  const columns = board.value[0]?.length ?? 0
  return columns > MIN_BOARD_COLUMNS
    && ((columnIsEmpty(0) && columnIsEmpty(1))
      || (columnIsEmpty(columns - 1) && columnIsEmpty(columns - 2)))
}

// 计算本应被裁掉的边缘行/列数量，但不修改数据源（供“整体放大、把空行列推出屏幕外”的动画使用）。
const computeShrinkEdges = () => {
  let removeTop = 0
  let removeBottom = 0
  let removeLeft = 0
  let removeRight = 0
  const rows = board.value.length
  const columns = board.value[0]?.length ?? 0
  let top = 0
  let bottom = rows - 1
  while (rows - (removeTop + removeBottom) > MIN_BOARD_ROWS && rowIsEmpty(top) && rowIsEmpty(top + 1)) {
    removeTop += 1
    top += 1
  }
  while (rows - (removeTop + removeBottom) > MIN_BOARD_ROWS && rowIsEmpty(bottom) && rowIsEmpty(bottom - 1)) {
    removeBottom += 1
    bottom -= 1
  }
  let left = 0
  let right = columns - 1
  while (columns - (removeLeft + removeRight) > MIN_BOARD_COLUMNS && columnIsEmpty(left) && columnIsEmpty(left + 1)) {
    removeLeft += 1
    left += 1
  }
  while (columns - (removeLeft + removeRight) > MIN_BOARD_COLUMNS && columnIsEmpty(right) && columnIsEmpty(right - 1)) {
    removeRight += 1
    right -= 1
  }
  return { removeTop, removeBottom, removeLeft, removeRight }
}

const expandForPlacement = (
  row: number,
  startColumn: number,
  endColumn: number,
  rowsBefore: number,
  columnsBefore: number,
): BoardGeometryShift => {
  const addLeft = startColumn === 0 && columnsBefore < MAX_BOARD_COLUMNS
  const addRight = endColumn === columnsBefore - 1 && columnsBefore < MAX_BOARD_COLUMNS
  const addTop = row === 0 && rowsBefore < MAX_BOARD_ROWS
  const addBottom = row === rowsBefore - 1 && rowsBefore < MAX_BOARD_ROWS

  if (addLeft) board.value.forEach((boardRow) => boardRow.unshift(null))
  if (addRight) board.value.forEach((boardRow) => boardRow.push(null))
  const newColumnCount = board.value[0].length
  if (addTop) board.value.unshift(Array<UITile | null>(newColumnCount).fill(null))
  if (addBottom) board.value.push(Array<UITile | null>(newColumnCount).fill(null))
  return { columns: addLeft ? 1 : 0, rows: addTop ? 1 : 0 }
}

const placementNeedsExpansion = (row: number, startColumn: number, endColumn: number, rows: number, columns: number) =>
  (columns < MAX_BOARD_COLUMNS && (startColumn === 0 || endColumn === columns - 1))
  || (rows < MAX_BOARD_ROWS && (row === 0 || row === rows - 1))

const BOARD_GEOMETRY_ANIMATION_MS = 420

const beginBoardGeometryAnimation = () => {
  if (boardGeometryTimer) window.clearTimeout(boardGeometryTimer)
  boardGeometryAnimating.value = true
  boardGeometryTimer = window.setTimeout(() => {
    boardGeometryAnimating.value = false
    boardGeometryTimer = null
  }, BOARD_GEOMETRY_ANIMATION_MS)
}

const computeBoardShift = (before: (UITile | null)[][], after: (UITile | null)[][]): BoardGeometryShift => {
  const counts = new Map<string, { columns: number; rows: number; count: number }>()
  before.forEach((row, rowIndex) => {
    row.forEach((tile, column) => {
      if (!tile) return
      for (let afterRow = 0; afterRow < after.length; afterRow += 1) {
        const afterColumn = after[afterRow].findIndex((candidate) => candidate?.id === tile.id)
        if (afterColumn === -1) continue
        const delta = { columns: afterColumn - column, rows: afterRow - rowIndex }
        const key = `${delta.columns},${delta.rows}`
        const existing = counts.get(key)
        counts.set(key, existing ? { ...existing, count: existing.count + 1 } : { ...delta, count: 1 })
        return
      }
    })
  })
  let best: { columns: number; rows: number; count: number } | null = null
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry
  }
  return best ? { columns: best.columns, rows: best.rows } : { columns: 0, rows: 0 }
}

// 把一份牌面嵌入指定尺寸的临时棋盘。还原时用它保留“牌先动 / 桌子后变”的视觉顺序。
const stageBoardAtSize = (
  cells: (UITile | null)[][],
  rows: number,
  columns: number,
  offset: BoardGeometryShift,
) => {
  const staged = Array.from({ length: rows }, () => Array<UITile | null>(columns).fill(null))
  cells.forEach((row, rowIndex) => row.forEach((tile, column) => {
    const targetRow = rowIndex + offset.rows
    const targetColumn = column + offset.columns
    if (tile && targetRow >= 0 && targetRow < rows && targetColumn >= 0 && targetColumn < columns) {
      staged[targetRow][targetColumn] = { ...tile }
    }
  }))
  return staged
}

/**
 * 把牌桌网格（网格线 + 牌）当作一个整体做一次仿射变换，而不是逐牌 FLIP。
 * 这样牌就像粘在各自 cell 里，和牌桌一起平移 + 等比例缩放，消除网格线与牌的割裂感。
 */
const animateBoardGeometry = (
  shift: BoardGeometryShift,
  beforeSize: { cellWidth: number; cellHeight: number },
  afterSize: { cellWidth: number; cellHeight: number },
  boardBeforeRect: DOMRect | null,
  handBeforeRect: DOMRect | null,
) => {
  if (shouldReduceMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const fromScaleX = beforeSize.cellWidth / afterSize.cellWidth
  const fromScaleY = beforeSize.cellHeight / afterSize.cellHeight
  const easing = 'cubic-bezier(.2,.8,.2,1)'

  const boardInnerElement = document.querySelector<HTMLElement>('.board-inner')
  if (boardInnerElement) {
    const afterRect = boardInnerElement.getBoundingClientRect()
    const fromTx = (boardBeforeRect ? boardBeforeRect.left - afterRect.left : 0)
      - shift.columns * beforeSize.cellWidth
    const fromTy = (boardBeforeRect ? boardBeforeRect.top - afterRect.top : 0)
      - shift.rows * beforeSize.cellHeight
    boardInnerElement.style.transformOrigin = 'center'
    const tx = fromTx + (fromScaleX - 1) * (afterRect.width / 2)
    const ty = fromTy + (fromScaleY - 1) * (afterRect.height / 2)
    const animation = trackLayoutAnimation(boardInnerElement.animate([
      { transform: `translate(${tx}px, ${ty}px) scale(${fromScaleX}, ${fromScaleY})` },
      { transform: 'translate(0px, 0px) scale(1, 1)' },
    ], { duration: BOARD_GEOMETRY_ANIMATION_MS, easing }))
    void animation.finished.catch(() => undefined).finally(() => {
      boardInnerElement.style.removeProperty('transform-origin')
    })
  }

  const handGridElement = document.querySelector<HTMLElement>('.hand-grid')
  if (handGridElement) {
    const afterRect = handGridElement.getBoundingClientRect()
    const fromTx = handBeforeRect ? handBeforeRect.left - afterRect.left : 0
    const fromTy = handBeforeRect ? handBeforeRect.top - afterRect.top : 0
    handGridElement.style.transformOrigin = 'center'
    const tx = fromTx + (fromScaleX - 1) * (afterRect.width / 2)
    const ty = fromTy + (fromScaleY - 1) * (afterRect.height / 2)
    const animation = trackLayoutAnimation(handGridElement.animate([
      { transform: `translate(${tx}px, ${ty}px) scale(${fromScaleX}, ${fromScaleY})` },
      { transform: 'translate(0px, 0px) scale(1, 1)' },
    ], { duration: BOARD_GEOMETRY_ANIMATION_MS, easing }))
    void animation.finished.catch(() => undefined).finally(() => {
      handGridElement.style.removeProperty('transform-origin')
    })
  }
}

// 缩小：保持数据不变，用“整体放大 + 观察窗口收紧”把空行列推出可视区（被 .board 的 overflow 裁掉）。
// 画框、窗口、内容层全部由 WAAPI 在同一时间轴驱动，保证完全同步；内容层按删除方向锚定到对侧边缘。
const animateShrinkZoom = (
  beforeBoard: { width: number; height: number },
  afterBoard: { width: number; height: number },
  scaleX: number,
  scaleY: number,
  originX: string,
  originY: string,
): { finished: Promise<void>; cleanup: () => void; restoreTransitions: () => void } | null => {
  if (shouldReduceMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null
  const frameElement = document.querySelector<HTMLElement>('.board-frame')
  const boardElement = document.querySelector<HTMLElement>('.board')
  const boardInnerElement = document.querySelector<HTMLElement>('.board-inner')
  const handElement = document.querySelector<HTMLElement>('.hand')
  const handGridElement = document.querySelector<HTMLElement>('.hand-grid')
  if (!frameElement || !boardElement || !boardInnerElement) return null

  const easing = 'cubic-bezier(.2,.8,.2,1)'
  const options = { duration: BOARD_GEOMETRY_ANIMATION_MS, easing, fill: 'forwards' as const }

  // 窗口尺寸由 WAAPI 接管，先压掉 CSS 过渡，避免双驱动。
  frameElement.style.transition = 'none'
  boardElement.style.transition = 'none'
  if (handElement) handElement.style.transition = 'none'

  // 内容层锚定到“被删除边的对侧”，让空行列从正确的边缘滑出裁剪窗口。
  boardInnerElement.style.position = 'absolute'
  for (const side of ['left', 'right', 'top', 'bottom']) boardInnerElement.style.removeProperty(side)
  if (originX === '100%') boardInnerElement.style.right = '0'
  else boardInnerElement.style.left = '0'
  if (originY === '100%') boardInnerElement.style.bottom = '0'
  else boardInnerElement.style.top = '0'
  boardInnerElement.style.transformOrigin = `${originX} ${originY}`

  const frameBefore = frameElement.getBoundingClientRect()
  const frameAfterWidth = Math.min(afterBoard.width + 28, window.innerWidth - 38)
  const frameAfterHeight = afterBoard.height + 28
  const handBefore = handElement
    ? { width: handElement.clientWidth, height: handElement.clientHeight }
    : null
  const handGridBefore = handGridElement?.getBoundingClientRect() ?? null
  const handAfterWidth = handBefore
    ? Math.min(handGridBefore ? handGridBefore.width * scaleX : handBefore.width, window.innerWidth - 38)
    : 0
  const handAfterHeight = handBefore && handGridBefore
    ? handBefore.height - handGridBefore.height + handGridBefore.height * scaleY
    : 0

  const animations: Animation[] = [
    frameElement.animate([
      { width: `${frameBefore.width}px`, height: `${frameBefore.height}px` },
      { width: `${frameAfterWidth}px`, height: `${frameAfterHeight}px` },
    ], options),
    boardElement.animate([
      { width: `${beforeBoard.width}px`, height: `${beforeBoard.height}px` },
      { width: `${afterBoard.width}px`, height: `${afterBoard.height}px` },
    ], options),
    boardInnerElement.animate([
      { transform: 'scale(1, 1)' },
      { transform: `scale(${scaleX}, ${scaleY})` },
    ], options),
  ]
  if (handElement && handBefore) {
    animations.push(handElement.animate([
      { width: `${handBefore.width}px`, height: `${handBefore.height}px` },
      { width: `${handAfterWidth}px`, height: `${handAfterHeight}px` },
    ], options))
  }
  if (handGridElement) {
    handGridElement.style.transformOrigin = 'left top'
    animations.push(handGridElement.animate([
      { transform: 'scale(1, 1)' },
      { transform: `scale(${scaleX}, ${scaleY})` },
    ], options))
  }
  animations.forEach((animation) => trackLayoutAnimation(animation))

  const finished = Promise.all(animations.map((animation) => animation.finished)).then(() => undefined)
  const cleanup = () => {
    animations.forEach((animation) => animation.cancel())
    boardInnerElement.style.removeProperty('position')
    for (const side of ['left', 'right', 'top', 'bottom']) boardInnerElement.style.removeProperty(side)
    boardInnerElement.style.removeProperty('transform-origin')
    handGridElement?.style.removeProperty('transform-origin')
    // transition:none 保留到数据提交的渲染之后，避免提交时再触发一次 CSS 过渡。
  }
  const restoreTransitions = () => {
    frameElement.style.removeProperty('transition')
    boardElement.style.removeProperty('transition')
    handElement?.style.removeProperty('transition')
  }
  return { finished, cleanup, restoreTransitions }
}

const flushPendingBoardGeometry = () => {
  const pending = pendingBoardGeometry
  pendingBoardGeometry = null
  if (!pending) return
  invalidateLayoutAnimations()

  if (pending.kind === 'expand') {
    beginBoardGeometryAnimation()
    const beforeSize = cellSizeFor(board.value.length, board.value[0]?.length ?? MIN_BOARD_COLUMNS)
    const boardBeforeRect = document.querySelector<HTMLElement>('.board-inner')?.getBoundingClientRect() ?? null
    const handBeforeRect = document.querySelector<HTMLElement>('.hand-grid')?.getBoundingClientRect() ?? null
    const shift = pending.mutate()
    const afterSize = cellSizeFor(board.value.length, board.value[0]?.length ?? MIN_BOARD_COLUMNS)
    void nextTick().then(() => animateBoardGeometry(shift, beforeSize, afterSize, boardBeforeRect, handBeforeRect))
    if (boardPublishTimer) window.clearTimeout(boardPublishTimer)
    boardPublishTimer = window.setTimeout(() => {
      boardPublishTimer = null
      publishBoard()
    }, BOARD_GEOMETRY_ANIMATION_MS)
    return
  }

  // shrink
  if (boardGeometryTimer) window.clearTimeout(boardGeometryTimer)
  boardGeometryTimer = null
  boardGeometryAnimating.value = true

  const rows = board.value.length
  const columns = board.value[0]?.length ?? MIN_BOARD_COLUMNS
  const beforeSize = cellSizeFor(rows, columns)
  const targetRows = rows - pending.removeTop - pending.removeBottom
  const targetCols = columns - pending.removeLeft - pending.removeRight
  const afterSize = cellSizeFor(targetRows, targetCols)
  const beforeBoard = { width: beforeSize.cellWidth * columns, height: beforeSize.cellHeight * rows }
  const afterBoard = { width: afterSize.cellWidth * targetCols, height: afterSize.cellHeight * targetRows }
  const scaleX = afterSize.cellWidth / beforeSize.cellWidth
  const scaleY = afterSize.cellHeight / beforeSize.cellHeight
  const originX = pending.removeLeft > 0 ? (pending.removeRight > 0 ? '50%' : '100%') : '0%'
  const originY = pending.removeTop > 0 ? (pending.removeBottom > 0 ? '50%' : '100%') : '0%'

  let zoomRun: { finished: Promise<void>; cleanup: () => void; restoreTransitions: () => void } | null = null
  let committed = false
  const commitShrink = () => {
    if (committed) return
    committed = true
    boardGeometryAnimating.value = true
    shrinkUnusedEdges()
    void nextTick().then(() => {
      // 保留动画的最终帧，直到新 cell 尺寸已经写入 DOM；随后在同一帧解除临时缩放，
      // 避免手牌网格短暂回到旧尺寸后再被新尺寸放大。
      zoomRun?.cleanup()
      // 强制浏览器先在 transition 被禁用时确认新的自然尺寸。若立刻解除锁定，浏览器会把
      // 两次样式更新合并，让每张牌的 width/height transition 再播放一遍。
      document.querySelector<HTMLElement>('.hand-grid')?.getBoundingClientRect()
      document.querySelector<HTMLElement>('.hand')?.getBoundingClientRect()
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        zoomRun?.restoreTransitions()
        boardGeometryAnimating.value = false
        publishBoard()
      }))
    })
  }

  void nextTick().then(() => {
    zoomRun = animateShrinkZoom(beforeBoard, afterBoard, scaleX, scaleY, originX, originY)
    if (!zoomRun) {
      commitShrink()
      return
    }
    void zoomRun.finished.then(commitShrink, commitShrink)
    // 兜底：极端情况下（如后台标签页动画被挂起）强制提交。
    boardPublishTimer = window.setTimeout(() => {
      boardPublishTimer = null
      commitShrink()
    }, BOARD_GEOMETRY_ANIMATION_MS + 140)
  })
}

const tileById = (id: string) =>
  handTiles.value.find((tile) => tile.id === id)
  ?? board.value.flat().find((tile): tile is UITile => tile?.id === id)
  ?? null

const placeDraggedOnBoard = (row: number, column: number) => {
  if (!canMoveTiles.value) return false
  const ids = [...draggingIds.value]
  const tiles = ids.map(tileById)
  const columns = board.value[0]?.length ?? 0
  if (!ids.length || tiles.some((tile) => !tile) || !board.value[row] || column + ids.length > columns) return false

  const sourceIds = new Set(ids)
  const destination = board.value[row].slice(column, column + ids.length)
  if (destination.some((tile) => tile && !sourceIds.has(tile.id))) return false

  const isNoop = ids.every((id, offset) => {
    const location = boardLocation(id)
    return location?.row === row && location.column === column + offset
  })
  if (isNoop) return true

  const rowsBefore = board.value.length
  const columnsBefore = columns
  ids.forEach(removeTile)
  tiles.forEach((tile, offset) => { board.value[row][column + offset] = tile })
  reflowTrackedHand(ids)
  if (placementNeedsExpansion(row, column, column + ids.length - 1, rowsBefore, columnsBefore)) {
    pendingBoardGeometry = {
      kind: 'expand',
      mutate: () => expandForPlacement(
        row,
        column,
        column + ids.length - 1,
        rowsBefore,
        columnsBefore,
      ),
    }
  } else if (boardWouldShrink()) {
    pendingBoardGeometry = { kind: 'shrink', ...computeShrinkEdges() }
  }
  resizeHandSlots()
  if (!pendingBoardGeometry) publishBoard()
  return true
}

const findEmptyHandSpan = (length: number) => {
  for (let row = 0; row < handSlots.value.length / HAND_COLUMNS; row += 1) {
    for (let column = 0; column <= HAND_COLUMNS - length; column += 1) {
      const index = row * HAND_COLUMNS + column
      if (handSlots.value.slice(index, index + length).every((tile) => tile == null)) return index
    }
  }
  handSlots.value.push(...Array<UITile | null>(HAND_COLUMNS).fill(null))
  return handSlots.value.length - HAND_COLUMNS
}

const findHandTailSpan = (length: number) => {
  let index = 0
  for (let cursor = handSlots.value.length - 1; cursor >= 0; cursor -= 1) {
    if (handSlots.value[cursor] != null) {
      index = cursor + 1
      break
    }
  }
  const column = index % HAND_COLUMNS
  if (column + length > HAND_COLUMNS) index += HAND_COLUMNS - column
  while (handSlots.value.length < index + length) {
    handSlots.value.push(...Array<UITile | null>(HAND_COLUMNS).fill(null))
  }
  return index
}

const placeDraggedInHand = (targetIndex: number) => {
  const ids = [...draggingIds.value]
  const tiles = ids.map(tileById)
  if (!ids.length || tiles.some((tile) => !tile)) return false

  const boardIds = ids.filter((id) => boardLocation(id) !== null)
  if (boardIds.length && !canMoveTiles.value) return false
  if (boardIds.some((id) => !returnableTileIds.value.has(id))) return false

  const sourceHandIndex = ids.length === 1
    ? handSlots.value.findIndex((tile) => tile?.id === ids[0])
    : -1
  if (sourceHandIndex !== -1) {
    if (sourceHandIndex === targetIndex) return true
    const slots = [...handSlots.value]
    ;[slots[sourceHandIndex], slots[targetIndex]] = [slots[targetIndex], slots[sourceHandIndex]]
    arrangedHandGroups.value = []
    handSlots.value = slots
    return true
  }

  const sourceIds = new Set(ids)
  const targetFitsRow = targetIndex % HAND_COLUMNS + ids.length <= HAND_COLUMNS
  const targetIsFree = targetFitsRow && handSlots.value
    .slice(targetIndex, targetIndex + ids.length)
    .every((tile) => tile == null || sourceIds.has(tile.id))
  const destinationIndex = !targetIsFree && boardIds.length === ids.length
    ? findHandTailSpan(ids.length)
    : targetIndex
  if (!targetIsFree && boardIds.length !== ids.length) return false

  ids.forEach(removeTile)
  arrangedHandGroups.value = []
  tiles.forEach((tile, offset) => { handSlots.value[destinationIndex + offset] = tile })
  resizeHandSlots()
  if (boardWouldShrink()) {
    pendingBoardGeometry = { kind: 'shrink', ...computeShrinkEdges() }
  } else {
    publishBoard()
  }
  return true
}

const colorOrder = [TileColor.RED, TileColor.BLUE, TileColor.BLACK, TileColor.ORANGE]
const jokerRank = (tile: UITile) => tile.jokerType === JokerType.NONE ? 0 : 1

const extractRuns = (tiles: UITile[]) => {
  const groups: UITile[][] = []
  colorOrder.forEach((color) => {
    const buckets = new Map<number, UITile[]>()
    tiles.filter((tile) => tile.jokerType === JokerType.NONE && tile.color === color).forEach((tile) => {
      const bucket = buckets.get(tile.value) ?? []
      bucket.push(tile)
      buckets.set(tile.value, bucket)
    })
    let foundRun = true
    while (foundRun) {
      foundRun = false
      const values = [...buckets.entries()].filter(([, bucket]) => bucket.length).map(([value]) => value).sort((a, b) => a - b)
      let start = 0
      while (start < values.length) {
        let end = start + 1
        while (end < values.length && values[end] === values[end - 1] + 1) end += 1
        if (end - start >= 3) {
          groups.push(values.slice(start, end).map((value) => buckets.get(value)!.shift()!))
          foundRun = true
        }
        start = end
      }
    }
  })
  return groups
}

const extractColorGroups = (tiles: UITile[]) => {
  const groups: UITile[][] = []
  const masks = [0b1111, 0b0111, 0b1011, 0b1101, 0b1110]
  for (let value = 1; value <= 13; value += 1) {
    const buckets = new Map<TileColor, UITile[]>()
    colorOrder.forEach((color) => buckets.set(color, tiles.filter((tile) => (
      tile.jokerType === JokerType.NONE && tile.value === value && tile.color === color
    ))))
    const memo = new Map<string, number[]>()
    const solve = (counts: number[]): number[] => {
      const key = counts.join(',')
      const cached = memo.get(key)
      if (cached) return cached
      let best: number[] = []
      masks.forEach((mask) => {
        if (counts.some((count, index) => (mask & (1 << index)) && count === 0)) return
        const nextCounts = counts.map((count, index) => count - ((mask & (1 << index)) ? 1 : 0))
        const candidate = [mask, ...solve(nextCounts)]
        const candidateSize = candidate.reduce((sum, item) => sum + colorOrder.filter((_, index) => item & (1 << index)).length, 0)
        const bestSize = best.reduce((sum, item) => sum + colorOrder.filter((_, index) => item & (1 << index)).length, 0)
        if (candidateSize > bestSize || (candidateSize === bestSize && candidate[0] === 0b1111)) best = candidate
      })
      memo.set(key, best)
      return best
    }
    const plan = solve(colorOrder.map((color) => buckets.get(color)!.length))
    plan.forEach((mask) => {
      groups.push(colorOrder.flatMap((color, index) => mask & (1 << index) ? [buckets.get(color)!.shift()!] : []))
    })
  }
  return groups
}

const sortHand = (mode: 'number' | 'color') => {
  if (draggingId.value) {
    pendingHandSortMode = mode
    return
  }
  const now = window.performance.now()
  if (now < sortCooldownUntil) return
  sortCooldownUntil = now + 360
  handTiles.value.forEach((tile) => cancelAlignmentAnimation(tile.id))
  handLayoutAnimating.value = true
  if (handLayoutTimer) window.clearTimeout(handLayoutTimer)
  if (boardGeometryTimer) window.clearTimeout(boardGeometryTimer)
  if (boardPublishTimer) window.clearTimeout(boardPublishTimer)
  if (restorePhaseTimer) window.clearTimeout(restorePhaseTimer)
  if (activeSnapshotOverlay) clearSnapshotRestore(activeSnapshotOverlay)
  handLayoutTimer = window.setTimeout(() => {
    handLayoutAnimating.value = false
    handLayoutTimer = null
    scheduleTileAlignmentCheck(handTiles.value.map((tile) => tile.id), 0)
  }, 410)
  const sorted = [...handTiles.value].sort((left, right) => {
    const jokerDifference = jokerRank(left) - jokerRank(right)
    if (jokerDifference) return jokerDifference
    if (left.jokerType !== JokerType.NONE || right.jokerType !== JokerType.NONE) {
      return left.jokerType.localeCompare(right.jokerType)
    }
    const numberDifference = left.value - right.value
    const colorDifference = colorOrder.indexOf(left.color) - colorOrder.indexOf(right.color)
    return mode === 'number' ? colorDifference || numberDifference : numberDifference || colorDifference
  })
  const groups = (mode === 'number' ? extractRuns(sorted) : extractColorGroups(sorted)).map((group) => group.map((tile) => tile.id))
  mutateWithAnimation(() => {
    buildHandLayout(groups, sorted)
  })
}

const validHandSequenceFrom = (startIndex: number) => {
  const rowEnd = (Math.floor(startIndex / HAND_COLUMNS) + 1) * HAND_COLUMNS
  const candidate: UITile[] = []
  let longestValid: string[] = []
  for (let index = startIndex; index < rowEnd; index += 1) {
    const tile = handSlots.value[index]
    if (!tile) break
    candidate.push(tile)
    if (candidate.length >= 3 && validateTileSet(candidate).isValid) {
      longestValid = candidate.map((item) => item.id)
    }
  }
  return longestValid
}

const onPointerMove = (event: PointerEvent) => {
  if (!draggingId.value) return
  const previousPointer = pointer.value
  if (previousPointer) {
    const deltaX = event.clientX - previousPointer.x
    const deltaY = event.clientY - previousPointer.y
    dragMotion.value = {
      x: Math.max(-12, Math.min(12, -deltaX * .9)),
      y: Math.max(-8, Math.min(8, -deltaY * .5)),
      tilt: Math.max(-9, Math.min(9, deltaX * .9)),
    }
    if (dragMotionTimer) window.clearTimeout(dragMotionTimer)
    dragMotionTimer = window.setTimeout(() => {
      dragMotion.value = { x: 0, y: 0, tilt: 0 }
      dragMotionTimer = null
    }, 140)
  }
  if (dragStartPoint && Math.hypot(event.clientX - dragStartPoint.x, event.clientY - dragStartPoint.y) > 3) {
    hasMoved.value = true
  }
  pointer.value = {
    x: Math.min(Math.max(event.clientX, 30), window.innerWidth - 30),
    y: Math.min(Math.max(event.clientY, 42), window.innerHeight - 42),
  }

  if (holdTimer && dragSource) {
    const element = document.elementFromPoint(event.clientX, event.clientY)
    const remainsOnSource = dragSource.zone === 'board'
      ? Number(element?.closest<HTMLElement>('[data-board-cell]')?.dataset.row) === dragSource.row
        && Number(element?.closest<HTMLElement>('[data-board-cell]')?.dataset.column) === dragSource.column
      : Number(element?.closest<HTMLElement>('[data-hand-cell]')?.dataset.handIndex) === dragSource.index
    if (!remainsOnSource) {
      window.clearTimeout(holdTimer)
      holdTimer = null
    }
  }
}

const clearHoldTimer = () => {
  if (holdTimer) window.clearTimeout(holdTimer)
  holdTimer = null
}

const stopDragging = () => {
  const queuedSort = pendingHandSortMode
  pendingHandSortMode = null
  dragSessionVersion += 1
  clearHoldTimer()
  draggingId.value = null
  draggingIds.value = []
  pointer.value = null
  dragMotion.value = { x: 0, y: 0, tilt: 0 }
  dragPickupOffset.value = { x: 0, y: 0 }
  dragStripHidden.value = false
  if (dragMotionTimer) window.clearTimeout(dragMotionTimer)
  dragMotionTimer = null
  hasMoved.value = false
  dragStartPoint = null
  dragSource = null
  dragOrigins.clear()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  if (queuedSort) void nextTick().then(() => sortHand(queuedSort))
}

const captureDragGhosts = () => {
  const result = new Map<string, TileRect>()
  document.querySelectorAll<HTMLElement>('[data-drag-id]').forEach((element) => {
    const id = element.dataset.dragId
    if (id) result.set(id, {
      rect: element.getBoundingClientRect(),
      element,
      zone: 'other',
      visualClone: createTileVisualClone(element),
    })
  })
  return result
}

const animateDragToDestination = (ghosts: Map<string, TileRect>) => {
  const session = dragSessionVersion
  clearHoldTimer()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  void nextTick().then(() => {
    if (session !== dragSessionVersion) return
    if (shouldReduceMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stopDragging()
      flushPendingBoardGeometry()
      return
    }
    const handoffs: { id: string; ghost: HTMLElement; targetRect: DOMRect; move: Animation; token: symbol }[] = []
    ghosts.forEach(({ rect, element }, id) => {
      const handIndex = handSlots.value.findIndex((tile) => tile?.id === id)
      const boardPosition = handIndex < 0 ? boardLocation(id) : null
      const selector = handIndex >= 0
        ? `#hand-slot-${handIndex}`
        : boardPosition
          ? `#board-slot-${boardPosition.row}-${boardPosition.column}`
          : ''
      const target = selector ? document.querySelector<HTMLElement>(selector) : null
      if (!target) return
      const cellRect = target.getBoundingClientRect()
      const targetRect = new DOMRect(
        cellRect.left + (cellRect.width - rect.width) / 2,
        cellRect.top + (cellRect.height - rect.height) / 2,
        rect.width,
        rect.height,
      )
      const token = Symbol(id)
      tileSettlementTokens.set(id, token)
      element.classList.add('settling-drag')
      const settledBaseRect = element.getBoundingClientRect()
      const move = element.animate([
        { translate: `${rect.left - settledBaseRect.left}px ${rect.top - settledBaseRect.top}px` },
        {
          translate: `${targetRect.left - settledBaseRect.left}px ${targetRect.top - settledBaseRect.top}px`,
        },
      ], { duration: 190, easing: 'cubic-bezier(.2,.78,.2,1)', fill: 'forwards' })
      activeDragSettlements.set(id, { element, animation: move, token })
      handoffs.push({ id, ghost: element, targetRect, move, token })
    })
    if (!handoffs.length) {
      if (session === dragSessionVersion) stopDragging()
      flushPendingBoardGeometry()
      return
    }
    void Promise.allSettled(handoffs.map(({ move }) => move.finished)).then(() => {
      if (session !== dragSessionVersion) {
        releaseInterruptedDragSettlements()
        return
      }
      handoffs.forEach(({ ghost, targetRect, move }) => {
        Object.assign(ghost.style, {
          position: 'fixed',
          left: `${targetRect.left}px`,
          top: `${targetRect.top}px`,
          width: `${targetRect.width}px`,
          height: `${targetRect.height}px`,
          margin: '0',
          translate: 'none',
          transform: 'none',
          transition: 'none',
          zIndex: '55',
        })
        move.cancel()
      })
      const queuedSort = pendingHandSortMode
      pendingHandSortMode = null
      stopDragging()
      void nextTick().then(() => window.requestAnimationFrame(() => {
        handoffs.forEach(({ id, ghost, token }) => {
          if (tileSettlementTokens.get(id) !== token) return
          const current = ghost.getBoundingClientRect()
          clearTilePositionOverrides(ghost)
          const natural = ghost.getBoundingClientRect()
          const dx = current.left - natural.left
          const dy = current.top - natural.top
          if (Math.abs(dx) >= .75 || Math.abs(dy) >= .75) {
            trackAlignmentAnimation(id, ghost.animate([
              { translate: `${dx}px ${dy}px` },
              { translate: '0 0' },
            ], { duration: 180, easing: 'cubic-bezier(.2,.78,.2,1)' }))
          }
          tileSettlementTokens.delete(id)
          activeDragSettlements.delete(id)
        })
        scheduleTileAlignmentCheck(handoffs.map(({ id }) => id), 240)
        flushPendingBoardGeometry()
        if (queuedSort) window.setTimeout(() => sortHand(queuedSort), 200)
      }))
    })
  })
}

const animateDragReturn = () => {
  const session = dragSessionVersion
  clearHoldTimer()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  if (shouldReduceMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stopDragging()
    return
  }
  const animations = [...document.querySelectorAll<HTMLElement>('[data-drag-id]')].flatMap((element) => {
    const id = element.dataset.dragId
    const origin = id ? dragOrigins.get(id) : null
    if (!origin) return []
    const current = element.getBoundingClientRect()
    const ghost = element.cloneNode(true) as HTMLElement
    preserveTileMetrics(element, ghost)
    ghost.removeAttribute('data-drag-id')
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${current.left}px`,
      top: `${current.top}px`,
      width: `${current.width}px`,
      height: `${current.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '55',
      transition: 'none',
    })
    document.body.appendChild(ghost)
    const animation = ghost.animate([
      { left: `${current.left}px`, top: `${current.top}px`, transform: 'rotate(2deg) scale(1.025)' },
      { left: `${origin.rect.left}px`, top: `${origin.rect.top}px`, transform: 'rotate(0deg) scale(1)' },
    ], { duration: 260, easing: 'cubic-bezier(.22,.8,.22,1)', fill: 'forwards' })
    void animation.finished.finally(() => ghost.remove())
    return [animation]
  })
  dragStripHidden.value = true
  if (!animations.length) {
    if (session === dragSessionVersion) stopDragging()
    return
  }
  void Promise.allSettled(animations.map((animation) => animation.finished)).finally(() => {
    if (session === dragSessionVersion) stopDragging()
  })
}

const onPointerUp = (event: PointerEvent) => {
  const id = draggingId.value
  if (!id) return
  clearHoldTimer()
  if (!hasMoved.value) {
    stopDragging()
    return
  }

  const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
  const boardCell = element?.closest<HTMLElement>('[data-board-cell]')
  const handCell = element?.closest<HTMLElement>('[data-hand-cell]')
  const handZone = element?.closest<HTMLElement>('[data-hand-zone]')
  const dragGhosts = captureDragGhosts()
  let succeeded = false
  if (boardCell) {
    succeeded = placeDraggedOnBoard(Number(boardCell.dataset.row), Number(boardCell.dataset.column))
  } else if (handCell) {
    succeeded = placeDraggedInHand(Number(handCell.dataset.handIndex))
  } else if (handZone && draggingIds.value.length <= HAND_COLUMNS) {
    succeeded = placeDraggedInHand(findEmptyHandSpan(draggingIds.value.length))
  }

  if (succeeded) {
    if (boardCell) playPlaceClick()
    animateDragToDestination(dragGhosts)
  } else {
    animateDragReturn()
  }
}

const animateFollowerPickup = (ids: string[], origins: Map<string, TileRect>, session: number) => {
  const followerIds = new Set(ids.slice(1))
  if (!followerIds.size || shouldReduceMotion()) return
  void nextTick().then(() => {
    if (session !== dragSessionVersion) return
    const followers = [...document.querySelectorAll<HTMLElement>('[data-drag-id]')]
      .filter((element) => followerIds.has(element.dataset.dragId ?? ''))
    followers.forEach((element) => {
      const id = element.dataset.dragId
      const origin = id ? origins.get(id) : null
      if (!origin) return
      const destination = element.getBoundingClientRect()
      element.classList.add('joining-drag')
      element.style.setProperty('--join-x', `${origin.rect.left - destination.left}px`)
      element.style.setProperty('--join-y', `${origin.rect.top - destination.top + 3}px`)
      element.style.setProperty('--join-opacity', '.18')
    })
    const strip = document.querySelector<HTMLElement>('.drag-ghost-strip')
    if (strip) void strip.getBoundingClientRect()
    window.requestAnimationFrame(() => {
      if (session !== dragSessionVersion) return
      followers.forEach((element) => {
        element.style.setProperty('--join-x', '0px')
        element.style.setProperty('--join-y', '0px')
        element.style.setProperty('--join-opacity', '1')
      })
    })
    window.setTimeout(() => {
      followers.forEach((element) => {
        element.classList.remove('joining-drag')
        element.style.removeProperty('--join-x')
        element.style.removeProperty('--join-y')
        element.style.removeProperty('--join-opacity')
      })
    }, 230)
  })
}

const onPointerDown = (event: PointerEvent, tile: UITile) => {
  if (pendingBoardGeometry) return
  const boardSource = boardLocation(tile.id)
  const handIndex = handSlots.value.findIndex((candidate) => candidate?.id === tile.id)
  if (boardSource ? !canMoveTiles.value : !canArrangeHand.value || handIndex < 0) return
  if (activeDragSettlements.has(tile.id)) return
  event.preventDefault()
  tileSettlementTokens.delete(tile.id)
  cancelAlignmentAnimation(tile.id)
  const alignmentTimer = tileAlignmentTimers.get(tile.id)
  if (alignmentTimer) window.clearTimeout(alignmentTimer)
  tileAlignmentTimers.delete(tile.id)
  dragSessionVersion += 1
  const session = dragSessionVersion
  dragStripHidden.value = false
  const sourceElement = event.currentTarget as HTMLElement
  const sourceRect = sourceElement.getBoundingClientRect()
  invalidateLayoutAnimations()
  const pointerX = Math.min(Math.max(event.clientX, 30), window.innerWidth - 30)
  const pointerY = Math.min(Math.max(event.clientY, 42), window.innerHeight - 42)
  draggingId.value = tile.id
  draggingIds.value = [tile.id]
  pointer.value = { x: pointerX, y: pointerY }
  dragPickupOffset.value = shouldReduceMotion()
    ? { x: 0, y: 0 }
    : {
        x: sourceRect.left + sourceRect.width / 2 - pointerX,
        y: sourceRect.top + sourceRect.height / 2 - pointerY,
      }
  dragStartPoint = { x: event.clientX, y: event.clientY }
  dragSource = boardSource
    ? { zone: 'board', ...boardSource }
    : { zone: 'hand', index: handIndex }
  dragOrigins = new Map([[
    tile.id,
    {
      rect: sourceElement.getBoundingClientRect(),
      element: sourceElement,
      zone: tileZone(sourceElement),
      visualClone: createTileVisualClone(sourceElement),
    },
  ]])
  hasMoved.value = false
  releaseInterruptedDragSettlements(tile.id)

  if (!shouldReduceMotion()) {
    void nextTick().then(() => {
      const strip = document.querySelector<HTMLElement>('.drag-ghost-strip')
      if (!strip || !draggingId.value) return
      // Commit the source-aligned first frame before easing the tile under the pointer.
      void strip.getBoundingClientRect()
      dragPickupOffset.value = { x: 0, y: 0 }
    })
  }

  if (boardSource) {
    holdTimer = window.setTimeout(() => {
      if (!draggingId.value || dragSource?.zone !== 'board' || !pointer.value) return
      const cell = document.elementFromPoint(pointer.value.x, pointer.value.y)?.closest<HTMLElement>('[data-board-cell]')
      if (
        Number(cell?.dataset.row) !== boardSource.row
        || Number(cell?.dataset.column) !== boardSource.column
      ) return

      const connected: string[] = []
      for (let column = boardSource.column; column < board.value[boardSource.row].length; column += 1) {
        const connectedTile = board.value[boardSource.row][column]
        if (!connectedTile) break
        connected.push(connectedTile.id)
      }
      const rects = captureTileRects()
      connected.forEach((connectedId) => {
        const origin = rects.get(connectedId)
        if (origin) dragOrigins.set(connectedId, origin)
      })
      draggingIds.value = connected
      animateFollowerPickup(connected, rects, session)
      holdTimer = null
    }, 460)
  } else {
    holdTimer = window.setTimeout(() => {
      if (!draggingId.value || dragSource?.zone !== 'hand' || !pointer.value) return
      const cell = document.elementFromPoint(pointer.value.x, pointer.value.y)?.closest<HTMLElement>('[data-hand-cell]')
      if (Number(cell?.dataset.handIndex) !== dragSource.index) return
      const validSequence = validHandSequenceFrom(dragSource.index)
      if (validSequence.length < 3) return
      const rects = captureTileRects()
      validSequence.forEach((groupTileId) => {
        const origin = rects.get(groupTileId)
        if (origin) dragOrigins.set(groupTileId, origin)
      })
      draggingIds.value = validSequence
      animateFollowerPickup(validSequence, rects, session)
      holdTimer = null
    }, 460)
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

const draggingTileSet = computed(() => new Set(draggingIds.value))
const draggingTiles = computed(() => draggingIds.value.map(tileById).filter((tile): tile is UITile => tile !== null))
const renderedTiles = computed(() => {
  const tiles = new Map<string, UITile>()
  board.value.flat().forEach((tile) => { if (tile) tiles.set(tile.id, tile) })
  handSlots.value.forEach((tile) => { if (tile) tiles.set(tile.id, tile) })
  return [...tiles.values()]
})
const tileTargetSelector = (id: string) => {
  if (draggingTileSet.value.has(id)) return '#active-drag-strip'
  const handIndex = handSlots.value.findIndex((tile) => tile?.id === id)
  if (handIndex >= 0) return `#hand-slot-${handIndex}`
  const location = boardLocation(id)
  return location ? `#board-slot-${location.row}-${location.column}` : '#tile-parking'
}
const tileIsLocked = (id: string) => boardLocation(id) ? !canMoveTiles.value : !canArrangeHand.value
const draggingTileIndex = (id: string) => draggingIds.value.indexOf(id)

const onGlobalButtonPointerDown = (event: PointerEvent) => {
  if (event.button !== 0 || !(event.target instanceof Element)) return
  const button = event.target.closest('button')
  if (!button || button.disabled) return
  playKeyClick()
}

onMounted(() => {
  window.addEventListener('keydown', onDeveloperSecretKeydown)
  // 捕获阶段确保声音在按钮点击改变页面前就由用户手势解锁。
  window.addEventListener('pointerdown', onGlobalButtonPointerDown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onDeveloperSecretKeydown)
  window.removeEventListener('pointerdown', onGlobalButtonPointerDown, true)
  stopDragging()
  invalidateLayoutAnimations()
  window.clearInterval(clockTimer)
  if (errorTimer) window.clearTimeout(errorTimer)
  if (turnNoticeTimer) window.clearTimeout(turnNoticeTimer)
  if (handLayoutTimer) window.clearTimeout(handLayoutTimer)
  if (boardGeometryTimer) window.clearTimeout(boardGeometryTimer)
  if (boardPublishTimer) window.clearTimeout(boardPublishTimer)
  tileAlignmentTimers.forEach((timer) => window.clearTimeout(timer))
  tileAlignmentTimers.clear()
  activeAlignmentAnimations.forEach((animation) => animation.cancel())
  activeAlignmentAnimations.clear()
  activeDragSettlements.forEach(({ animation }) => animation.cancel())
  activeDragSettlements.clear()
  tileSettlementTokens.clear()
  if (gridConstructionTimer) window.clearTimeout(gridConstructionTimer)
  if (developerUnlockFlashTimer) window.clearTimeout(developerUnlockFlashTimer)
  if (developerUsageNoticeTimer) window.clearTimeout(developerUsageNoticeTimer)
  if (victoryTimer) window.clearTimeout(victoryTimer)
  if (replayTimer) window.clearInterval(replayTimer)
  transitionTimers.forEach((timer) => window.clearTimeout(timer))
  transitionTimers.clear()
})
</script>

<template>
  <main
    class="game"
    :class="[{ 'reduced-motion': settings.motion === 'reduced', 'theme-arcade': settings.theme === 'arcade', 'language-en': settings.language === 'en', 'high-contrast': settings.highContrast, 'no-pattern': settings.background === 'plain', 'board-geometry-animating': boardGeometryAnimating, 'turn-warning': displayedViewStage === 'playing' && isMyTurn && turnSeconds > 0 && turnSeconds <= 10 }, `background-${settings.background}`]"
    :style="boardMetrics"
  >
    <header class="app-chrome">
      <button class="brand-button" :aria-label="ui.backLobby" :disabled="Boolean(room)" @click="lobbyMode = 'create'">
        <span class="brand-mark">R</span><span><b>RUMMIKUB</b><small>SANDBOX</small></span>
      </button>
      <div class="chrome-actions">
        <span class="compact-connection" :class="socketStatus"><i></i>{{ socketStatus === 'connected' ? ui.online : socketStatus === 'connecting' ? ui.connecting : ui.reconnecting }}</span>
        <button class="chrome-button language-button" @click="toggleLanguage">{{ ui.language }}</button>
        <button class="chrome-button" @click="rulesOpen = true">{{ ui.rules }}</button>
        <button v-if="displayedViewStage === 'playing'" class="chrome-button chat-button" :class="{ active: chatPanelOpen, unread: hasUnreadChat }" @click="toggleSidePanel('chat')">{{ ui.chat }}</button>
        <button v-if="room" class="chrome-button voice-button" :class="{ active: voicePanelOpen, joined: voiceStatus === 'connected' }" @click="toggleSidePanel('voice')"><i aria-hidden="true"></i>{{ ui.voice }}</button>
        <button v-if="displayedViewStage === 'playing'" class="chrome-button leave-match-button" @click="leaveRoomWithTransition">{{ ui.leaveRoom }}</button>
        <button class="chrome-button settings-button" @click="openSettings"><span>⚙</span> {{ ui.settings }}</button>
      </div>
    </header>

    <section v-if="displayedViewStage === 'restoring'" class="lobby-shell restore-screen">
      <div class="loading-emblem"><i></i><i></i><i></i></div>
      <p class="eyebrow">{{ ui.restoreKicker }}</p>
      <h1>{{ ui.restoreTitle }}</h1>
      <p>{{ ui.restoreText }}</p>
    </section>

    <section v-else-if="displayedViewStage === 'lobby'" class="lobby-shell">
      <div class="lobby-copy lobby-info-card">
        <p class="eyebrow">{{ ui.lobbyKicker }}</p>
        <h1>{{ ui.lobbyTitle }}</h1>
        <p class="lobby-lead">{{ ui.lobbyDescription }}</p>
        <div class="lobby-info-list"><div><b>01</b><span>{{ ui.featureRoom }}</span></div><div><b>02</b><span>{{ ui.featureSync }}</span></div><div><b>03</b><span>{{ ui.featureResume }}</span></div></div>
        <div class="lobby-table-mark" aria-hidden="true"><i>7</i><i>8</i><i>9</i><i>★</i></div>
      </div>
      <div class="entry-card" :class="lobbyMode">
        <div class="entry-tabs" role="tablist">
          <button :aria-label="ui.create" :class="{ active: lobbyMode === 'create' }" @click="lobbyMode = 'create'"><b>01</b><span>{{ ui.create }}<small>{{ ui.hostDesc }}</small></span></button>
          <button :aria-label="ui.join" :class="{ active: lobbyMode === 'join' }" @click="lobbyMode = 'join'"><b>02</b><span>{{ ui.join }}<small>{{ ui.joinDesc }}</small></span></button>
        </div>
        <label class="field-label">{{ ui.nickname }}</label>
        <input v-model="playerName" class="lobby-input" maxlength="20" :placeholder="ui.nicknamePlaceholder" @keydown.enter="lobbyMode === 'create' ? submitCreateRoom() : submitJoinRoom()">
        <div class="join-fields" :class="{ open: lobbyMode === 'join' }" :aria-hidden="lobbyMode !== 'join'">
          <div><label class="field-label room-label">{{ ui.roomCode }}</label>
            <div class="lobby-room-input">
              <input v-model="roomCode" class="lobby-input" maxlength="6" placeholder="ABC123" :tabindex="lobbyMode === 'join' ? 0 : -1" @input="roomCode = roomCode.toUpperCase()" @keydown.enter="submitJoinRoom">
              <button :aria-label="ui.pasteRoom" :title="ui.pasteRoom" :tabindex="lobbyMode === 'join' ? 0 : -1" @click="pasteRoomCode"><svg viewBox="0 0 24 24"><path d="M8 5h2a2 2 0 0 1 4 0h2v2H8V5Zm-2 1H4v15h13v-2H6V6Zm12 3h-7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2Zm0 8h-7v-6h7v6Z"/></svg></button>
            </div>
          </div>
        </div>
        <button v-if="lobbyMode === 'create'" class="primary-cta" :disabled="socketStatus !== 'connected'" @click="submitCreateRoom">{{ ui.createRoom }} <span>→</span></button>
        <button v-else class="primary-cta" :disabled="socketStatus !== 'connected' || !/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode)" @click="submitJoinRoom">{{ ui.enterRoom }} <span>→</span></button>
        <p v-if="socketError" class="lobby-error">{{ localizedSocketError }}</p>
        <p class="entry-note">{{ ui.resumeNote }}</p>
      </div>
    </section>

    <section v-else-if="displayedViewStage === 'waiting' && room" class="room-lobby">
      <div class="room-heading"><p class="eyebrow">{{ ui.privateRoom }}</p><h1>{{ ui.waitingTitle }}</h1><p>{{ ui.waitingText }}</p></div>
      <div class="room-code-card"><span>{{ ui.roomCode }}</span><strong>{{ room.roomId }}</strong><button :class="{ copied: copiedRoomCode }" @click="copyRoomCode"><svg v-if="!copiedRoomCode" viewBox="0 0 24 24"><path d="M8 7V4h12v13h-3v3H4V7h4Zm2 0h7v8h1V6h-8v1Zm5 2H6v9h9V9Z"/></svg><span>{{ copiedRoomCode ? ui.copied : ui.copyCode }}</span></button></div>
      <div class="seat-grid">
        <div v-for="slot in 4" :key="slot" class="player-seat" :class="{ empty: !room.players[slot - 1], offline: room.players[slot - 1] && !room.players[slot - 1].connected }">
          <template v-if="room.players[slot - 1]"><div class="player-avatar">{{ room.players[slot - 1].name.slice(0, 1).toUpperCase() }}</div><div><strong>{{ room.players[slot - 1].name }}</strong><span v-if="room.players[slot - 1].id === room.hostPlayerId">{{ ui.host }}</span><small v-if="!room.players[slot - 1].connected">{{ ui.reconnectWait }} {{ reconnectSeconds(room.players[slot - 1].reconnectDeadline) }}s</small><small v-else>{{ ui.ready }}</small></div></template>
          <template v-else><div class="empty-avatar">+</div><div><strong>{{ ui.empty }}</strong><small>{{ ui.waitingPlayer }}</small></div></template>
        </div>
      </div>
      <div class="room-lobby-actions"><button class="secondary-cta" @click="leaveRoomWithTransition">{{ ui.leaveRoom }}</button><button class="secondary-cta" @click="openRoomSettings">{{ isHost ? ui.hostSettings : ui.viewSettings }}</button><button class="primary-cta" :disabled="!isHost || connectedPlayerCount < 2" @click="startGame">{{ isHost ? (connectedPlayerCount < 2 ? ui.needPlayers : ui.startGame) : ui.waitHost }}</button></div>
    </section>

    <section v-else-if="displayedViewStage === 'finished' && room" class="result-screen">
      <div class="victory-badge">◆</div><p class="eyebrow">{{ ui.gameComplete }}</p><h1><em>{{ winnerName }}</em> {{ ui.wins }}</h1><p>{{ ui.winText }}</p>
      <div class="ranking-card"><div v-for="(player, index) in finalRanking" :key="player.id" class="ranking-row" :class="{ champion: index === 0 }"><b>{{ index + 1 }}</b><div class="mini-avatar">{{ player.name.slice(0, 1).toUpperCase() }}</div><strong>{{ player.name }} <small v-if="player.id === room.yourPlayerId">{{ ui.you }}</small></strong><span>{{ player.handCount ? `${ui.remaining} ${player.handCount} ${ui.tiles}` : ui.finished }}</span></div></div>
      <div class="result-actions"><button class="secondary-cta" @click="leaveRoomWithTransition">{{ ui.backLobby }}</button><button class="secondary-cta replay-open-button" @click="openReplay">▶ {{ ui.replay }}</button><button class="primary-cta" :disabled="!isHost" @click="rematch">{{ isHost ? ui.rematch : ui.waitRematch }}</button></div>
    </section>

    <section v-if="displayedViewStage === 'playing' && room" class="network-panel">
      <div class="connection-state" :class="socketStatus"><i></i>{{ socketStatus === 'connected' ? ui.serverConnected : socketStatus === 'connecting' ? ui.serverConnecting : ui.serverDisconnected }}</div>
      <template v-if="!room">
        <input v-model.trim="playerName" maxlength="20" aria-label="玩家昵称" placeholder="玩家昵称">
        <button :disabled="socketStatus !== 'connected'" @click="submitCreateRoom">创建房间</button>
        <span class="network-or">或</span>
        <div class="room-input-wrap">
          <input v-model.trim="roomCode" class="room-input" maxlength="6" aria-label="房间号" placeholder="房间号">
          <button class="icon-button paste-room" aria-label="粘贴房间号" title="粘贴房间号" @click="pasteRoomCode">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h2a2 2 0 0 1 4 0h2v2H8V5Zm-2 1H4v15h13v-2H6V6Zm12 3h-7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2Zm0 8h-7v-6h7v6Z"/></svg>
          </button>
        </div>
        <button :disabled="socketStatus !== 'connected' || roomCode.length < 6" @click="submitJoinRoom">加入房间</button>
      </template>
      <template v-else>
        <div class="room-code-wrap">
          <strong class="room-code">{{ ui.room }} {{ room.roomId }}</strong>
          <button class="icon-button copy-room" :class="{ copied: copiedRoomCode }" :aria-label="copiedRoomCode ? ui.roomCopied : ui.copyRoom" :title="copiedRoomCode ? ui.copied : ui.copyRoom" @click="copyRoomCode">
            <svg v-if="!copiedRoomCode" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V4h12v13h-3v3H4V7h4Zm2 0h7v8h1V6h-8v1Zm5 2H6v9h9V9Z"/></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="m9.2 17.2-4.4-4.4 1.7-1.7 2.7 2.7 7.8-7.8 1.7 1.7-9.5 9.5Z"/></svg>
          </button>
        </div>
        <div class="players">
          <span v-for="player in room.players" :key="player.id" :class="{ active: player.id === room.currentTurnPlayerId }">{{ player.name }} · {{ player.handCount }}<b v-if="player.id === room.yourPlayerId">{{ ui.you }}</b></span>
        </div>
      </template>
    </section>
    <p v-if="socketError && room" class="network-error">{{ localizedSocketError }}</p>
    <div v-if="displayedViewStage === 'playing' && socketStatus !== 'connected'" class="reconnect-banner"><span class="spinner"></span><div><strong>{{ ui.reconnectTitle }}</strong><small>{{ ui.reconnectText }}</small></div></div>
    <div v-if="displayedViewStage === 'playing' && disconnectedPlayers.length" class="player-offline-banner">{{ disconnectedPlayers.map((player) => player.name).join(settings.language === 'zh' ? '、' : ', ') }} {{ ui.offlineSeat }} {{ Math.max(...disconnectedPlayers.map((player) => reconnectSeconds(player.reconnectDeadline))) }} {{ ui.seconds }}</div>

    <header v-if="displayedViewStage === 'playing' && room" class="titlebar">
      <div><p>{{ ui.tableKicker }}</p><h1>{{ ui.tableTitle }}</h1></div>
      <span>{{ validatedGroups.length }} {{ ui.groups }} · {{ ui.pool }} {{ room?.poolCount }} · {{ isMyTurn ? (isSyncing ? ui.syncing : ui.yourTurn) : `${currentPlayerName}${ui.turnSuffix}` }}</span>
    </header>
    <Transition name="turn-notice"><div v-if="turnNotice && displayedViewStage === 'playing'" class="turn-notice" role="status" aria-live="polite">{{ turnNotice }}</div></Transition>

    <section v-if="displayedViewStage === 'playing' && room" class="board-frame" :class="{ 'developer-rgb-board': developerModeActive }" :aria-label="ui.boardZone">
      <div class="board-recess">
      <div
        class="board construction-surface"
        :class="{ 'grid-constructing': gridConstructionActive }"
        :aria-label="ui.boardGrid"
      >
        <div
          class="board-inner"
          :style="{ gridTemplateColumns: `repeat(${board[0]?.length ?? MIN_BOARD_COLUMNS}, var(--cell-width))` }"
        >
        <svg
          v-if="gridConstructionActive"
          v-memo="[gridColumnCount, gridRowCount, gridConstructionComplete]"
          class="grid-construction"
          :class="{ complete: gridConstructionComplete }"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            v-for="(line, index) in constructionVerticalLines"
            :key="`vertical-${line}`"
            class="construction-line vertical-line"
            :x1="line / gridColumnCount * 1000"
            y1="0"
            :x2="line / gridColumnCount * 1000"
            y2="1000"
            pathLength="1"
            :style="{ '--construction-delay': `${index * 30}ms` }"
          />
          <line
            v-for="(line, index) in constructionHorizontalLines"
            :key="`horizontal-${line}`"
            class="construction-line horizontal-line"
            x1="0"
            :y1="line / gridRowCount * 1000"
            x2="1000"
            :y2="line / gridRowCount * 1000"
            pathLength="1"
            :style="{ '--construction-delay': `${40 + index * 38}ms` }"
          />
          <ellipse
            v-for="dot in constructionDots"
            :key="`dot-${dot.row}-${dot.column}`"
            class="construction-dot"
            :cx="(dot.column + .5) / constructionDotColumnCount * 1000"
            :cy="(dot.row + .5) / constructionDotRowCount * 1000"
            rx="1.15"
            :ry="constructionDotRadiusY"
            :style="{ '--construction-delay': `${constructionLineFinishMs - CONSTRUCTION_DOT_LEAD_MS + ((constructionDotColumnCount - 1 - dot.column) + (constructionDotRowCount - 1 - dot.row)) * constructionDotStepMs}ms` }"
          />
        </svg>
        <template v-for="(row, rowIndex) in board" :key="`row-${rowIndex}`">
          <div
            v-for="(_, columnIndex) in row"
            :key="`${rowIndex}-${columnIndex}`"
            :id="`board-slot-${rowIndex}-${columnIndex}`"
            class="cell"
            :class="groupClassAt(rowIndex, columnIndex)"
            :data-row="rowIndex"
            :data-column="columnIndex"
            data-board-cell
          >
          </div>
        </template>
        <TransitionGroup name="invalid-frame">
          <div
            v-for="group in invalidGroups"
            :key="`${group.row}-${group.startColumn}-${group.endColumn}`"
            class="invalid-group-frame"
            :style="invalidFrameStyle(group)"
          ></div>
        </TransitionGroup>
        </div>
      </div>
      </div>
    </section>

    <section v-if="displayedViewStage === 'playing' && room" class="game-action-dock">
      <div class="turn-actions-left">
        <button class="large-action draw-action" :disabled="!isMyTurn || isSyncing || boardGeometryAnimating" @click="drawTile"><i>＋</i><span><strong>{{ ui.draw }}</strong><small>{{ ui.discard }}</small></span></button>
        <button class="revert-action" :disabled="!isMyTurn || isSyncing || boardGeometryAnimating || !room.turnHasChanges" @click="revertBoard"><i>↶</i><span><strong>{{ ui.revert }}</strong><small>{{ ui.revertHint }}</small></span></button>
      </div>
      <div class="turn-indicator" :class="{ mine: isMyTurn }">
        <span>{{ isMyTurn ? ui.yourTurn : ui.waiting }}</span><strong>{{ isMyTurn ? ui.actNow : `${currentPlayerName} ${ui.acting}` }}</strong>
        <div class="turn-progress" :class="{ urgent: turnSeconds <= 10 }" role="progressbar" :aria-label="ui.turnTime" aria-valuemin="0" aria-valuemax="60" :aria-valuenow="turnSeconds"><i :style="{ width: `${turnProgress}%` }"></i><b>{{ turnSeconds }}s</b></div>
      </div>
      <button class="large-action commit-action" :disabled="!isMyTurn || isSyncing || boardGeometryAnimating || !room.turnHasPlayedTile" @click="commitTurn"><span><strong>{{ ui.commit }}</strong><small>{{ room.turnHasPlayedTile ? ui.validate : ui.placeFirst }}</small></span><i>✓</i></button>
    </section>

    <section v-if="displayedViewStage === 'playing' && room" class="hand" :class="{ 'layout-animating': handLayoutAnimating }" :aria-label="ui.hand" data-hand-zone>
      <div class="hand-toolbar">
        <div><strong>{{ ui.hand }}</strong><span>{{ handTiles.length }} {{ ui.tiles }} · {{ ui.perRow }} {{ HAND_COLUMNS }} {{ ui.cells }}</span></div>
        <div class="sort-actions">
          <button :disabled="handTiles.length < 2" @click="sortHand('color')">{{ ui.numberSort }}</button>
          <button :disabled="handTiles.length < 2" @click="sortHand('number')">{{ ui.colorSort }}</button>
        </div>
      </div>
      <div class="hand-scroll" data-hand-zone>
        <div class="hand-grid">
          <div v-for="index in handCellIndexes" :id="`hand-slot-${index}`" :key="index" class="hand-cell" :data-hand-index="index" data-hand-cell></div>
        </div>
      </div>
    </section>

    <div id="active-drag-strip" v-show="draggingTiles.length && pointer" class="drag-ghost-strip" :class="{ stack: draggingTiles.length > 1, hidden: dragStripHidden }" :style="{ left: `${pointer?.x ?? -200}px`, top: `${pointer?.y ?? -200}px`, '--drag-tilt': `${dragMotion.tilt}deg`, '--pickup-x': `${dragPickupOffset.x}px`, '--pickup-y': `${dragPickupOffset.y}px` }" aria-hidden="true"></div>
    <div id="tile-parking" hidden></div>
    <template v-if="displayedViewStage === 'playing' && room">
      <Teleport v-for="tile in renderedTiles" :key="tile.id" :to="tileTargetSelector(tile.id)">
        <div
          class="tile"
          :class="[tile.color, { 'drag-ghost-tile': draggingTileSet.has(tile.id), locked: tileIsLocked(tile.id) }]"
          :style="draggingTileSet.has(tile.id) ? { order: draggingTileIndex(tile.id), '--drag-lag-x': `${dragMotion.x * Math.min(draggingTileIndex(tile.id), 4)}px`, '--drag-lag-y': `${dragMotion.y * Math.min(draggingTileIndex(tile.id), 4)}px` } : undefined"
          :data-tile-id="tile.id"
          :data-drag-id="draggingTileSet.has(tile.id) ? tile.id : undefined"
          :data-joker="tile.jokerType !== JokerType.NONE ? tile.jokerType : undefined"
          @pointerdown="onPointerDown($event, tile)"
        >
          <span v-if="tile.jokerType === JokerType.NONE" class="number">{{ tile.value }}</span>
          <span v-else class="number joker-icon">{{ jokerIcon(tile.jokerType) }}</span>
        </div>
      </Teleport>
    </template>

    <aside v-if="developerModeActive && developerPanelOpen && displayedViewStage === 'playing' && room" class="developer-panel side-panel">
      <div class="developer-heading"><div><p>{{ ui.devMode }}</p><h2>{{ ui.devTitle }}</h2></div><button :aria-label="ui.closeDev" @click="developerPanelOpen = false">×</button></div>
      <div class="score-monitor" :class="{ ready: room.turnPlayedScore >= 30 }"><span>{{ ui.turnScore }}</span><strong>{{ room.turnPlayedScore }}<small>/ 30</small></strong><div><i :style="{ width: `${Math.min(100, room.turnPlayedScore / 30 * 100)}%` }"></i></div><p>{{ yourPlayer?.hasMelted ? ui.melted : room.turnPlayedScore >= 30 ? ui.scoreReady : ui.scoreHint }}</p></div>
      <section class="developer-section developer-stats-section">
        <label>{{ ui.devStats }}</label>
        <div class="developer-stats">
          <div><span>{{ ui.handCount }}</span><b>{{ handTiles.length }}</b></div>
          <div><span>{{ ui.boardTiles }}</span><b>{{ developerBoardTileCount }}</b></div>
          <div><span>{{ ui.validSets }}</span><b>{{ developerValidGroupCount }}</b></div>
          <div :class="{ warning: developerInvalidGroupCount }"><span>{{ ui.invalidSets }}</span><b>{{ developerInvalidGroupCount }}</b></div>
          <div><span>{{ ui.boardSize }}</span><b>{{ gridColumnCount }}×{{ gridRowCount }}</b></div>
        </div>
      </section>
      <section class="developer-section">
        <label>{{ ui.normalTiles }}</label>
        <div class="dev-color-row"><button v-for="color in developerColors" :key="color" :class="[color, { active: developerColor === color }]" :aria-label="`${ui.choose} ${color}`" @click="developerColor = color"></button></div>
        <div class="dev-number-grid"><button v-for="value in 13" :key="value" :class="{ active: developerValue === value }" @click="developerValue = value">{{ value }}</button></div>
        <div class="dev-primary-actions"><button :disabled="!isMyTurn || isSyncing" @click="addDeveloperTile()">{{ ui.addHand }}</button><button :disabled="!isMyTurn || isSyncing" @click="addDeveloperPair">{{ ui.addPair }}</button></div>
      </section>
      <section class="developer-section">
        <label>{{ ui.quickRecipes }}</label>
        <div class="dev-recipe-grid">
          <button :disabled="!isMyTurn || isSyncing || developerValue > 11" @click="addDeveloperRun(3)"><b>{{ ui.run3 }}</b><small>{{ developerValue }}–{{ developerValue + 2 }}</small></button>
          <button :disabled="!isMyTurn || isSyncing || developerValue > 10" @click="addDeveloperRun(4)"><b>{{ ui.run4 }}</b><small>{{ developerValue }}–{{ developerValue + 3 }}</small></button>
          <button :disabled="!isMyTurn || isSyncing" @click="addDeveloperGroup(3)"><b>{{ ui.group3 }}</b><small>× {{ developerValue }}</small></button>
          <button :disabled="!isMyTurn || isSyncing" @click="addDeveloperGroup(4)"><b>{{ ui.group4 }}</b><small>× {{ developerValue }}</small></button>
          <button :disabled="!isMyTurn || isSyncing" @click="addDeveloperColorSeries"><b>{{ ui.colorSeries }}</b><small>{{ developerColor }}</small></button>
          <button :disabled="!isMyTurn || isSyncing" @click="addAllDeveloperJokers"><b>{{ ui.allJokers }}</b><small>★ ×2 ↝ ⧉</small></button>
        </div>
        <p class="developer-recipe-note">{{ ui.recipeHint }}</p>
      </section>
      <section class="developer-section"><label>{{ ui.specialTiles }}</label><div class="joker-palette"><button :disabled="!isMyTurn || isSyncing" @click="addDeveloperTile(JokerType.STANDARD)"><b>★</b><span>{{ ui.standard }}</span></button><button :disabled="!isMyTurn || isSyncing" @click="addDeveloperTile(JokerType.DOUBLE)"><b>×2</b><span>{{ ui.double }}</span></button><button :disabled="!isMyTurn || isSyncing" @click="addDeveloperTile(JokerType.COLOR_CHANGE)"><b>↝</b><span>{{ ui.colorChange }}</span></button><button :disabled="!isMyTurn || isSyncing" @click="addDeveloperTile(JokerType.MIRROR)"><b>⧉</b><span>{{ ui.mirror }}</span></button></div></section>
      <p class="developer-note">{{ ui.devNote }}</p>
    </aside>

    <aside v-if="chatPanelOpen && displayedViewStage === 'playing' && room" class="chat-panel side-panel">
      <div class="developer-heading"><div><p>ROOM CHAT</p><h2>{{ ui.roomChat }}</h2></div><button :aria-label="ui.closeChat" @click="chatPanelOpen = false">×</button></div>
      <div ref="chatList" class="chat-list">
        <div v-if="!chatMessages.length" class="chat-empty"><i>···</i><strong>{{ ui.noMessages }}</strong><span>{{ ui.chatHello }}</span></div>
        <article v-for="message in chatMessages" :key="message.id" :class="{ mine: message.playerId === room.yourPlayerId }">
          <div><strong>{{ message.playerName }}</strong><time>{{ chatTime(message.createdAt) }}</time></div><p>{{ message.text }}</p>
        </article>
      </div>
      <form class="chat-compose" @submit.prevent="submitChat"><input v-model="chatDraft" maxlength="160" :placeholder="ui.messagePlaceholder"><button :disabled="!chatDraft.trim() || socketStatus !== 'connected'" :aria-label="ui.sendMessage">➤</button></form>
    </aside>

    <aside v-if="voicePanelOpen && room" class="voice-panel side-panel">
      <div class="developer-heading"><div><p>{{ ui.voiceKicker }}</p><h2>{{ ui.roomVoice }}</h2></div><button :aria-label="ui.closeVoice" @click="voicePanelOpen = false">×</button></div>
      <div class="voice-state" :class="voiceStatus">
        <span class="voice-state-icon"><i></i><i></i><i></i></span>
        <div>
          <strong>{{ voiceStatus === 'connected' ? ui.voiceConnected : voiceStatus === 'requesting' ? ui.voiceConnecting : ui.joinVoice }}</strong>
          <small>{{ ui.voicePrivacy }}</small>
        </div>
      </div>
      <p v-if="voiceErrorMessage" class="voice-error" role="alert">{{ voiceErrorMessage }}</p>
      <template v-if="voiceStatus === 'connected'">
        <div class="voice-roster">
          <article class="voice-peer self" :class="{ muted: voiceMuted }">
            <span class="voice-avatar">{{ (yourPlayer?.name ?? ui.voiceYou).slice(0, 1).toUpperCase() }}</span>
            <div><strong>{{ yourPlayer?.name ?? ui.voiceYou }} <b>{{ ui.voiceYou }}</b></strong><small>{{ voiceMuted ? ui.voiceMuted : ui.voiceConnected }}</small></div>
            <span class="voice-mic" aria-hidden="true">{{ voiceMuted ? '╳' : '●' }}</span>
          </article>
          <article v-for="peer in voicePeers" :key="peer.playerId" class="voice-peer" :class="{ muted: peer.muted }">
            <span class="voice-avatar">{{ peer.playerName.slice(0, 1).toUpperCase() }}</span>
            <div><strong>{{ peer.playerName }}</strong><small>{{ peer.muted ? ui.voiceMuted : ui.voiceConnected }}</small></div>
            <span class="voice-mic" aria-hidden="true">{{ peer.muted ? '╳' : '●' }}</span>
          </article>
          <p v-if="!voicePeers.length" class="voice-empty">{{ ui.voiceEmpty }}</p>
        </div>
        <div class="voice-actions"><button class="voice-mute-action" :class="{ active: voiceMuted }" @click="toggleVoiceMute">{{ voiceMuted ? ui.unmuteVoice : ui.muteVoice }}</button><button class="voice-leave-action" @click="leaveVoiceChat">{{ ui.leaveVoice }}</button></div>
      </template>
      <button v-else class="voice-join-action" :disabled="voiceStatus === 'requesting' || socketStatus !== 'connected'" @click="joinVoiceChat">{{ voiceStatus === 'requesting' ? ui.voiceConnecting : ui.joinVoice }}</button>
    </aside>

    <Transition name="modal"><div v-if="settingsOpen" class="modal-backdrop" @pointerdown.self="settingsOpen = false">
      <section class="modal-card settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="modal-heading"><div><p class="eyebrow">PREFERENCES</p><h2 id="settings-title">{{ ui.preferences }}</h2></div><button class="modal-close" :aria-label="ui.close" @click="settingsOpen = false">×</button></div>
        <label class="settings-row"><span><strong>{{ ui.defaultName }}</strong><small>{{ ui.defaultNameHint }}</small></span><input v-model="settingsDraft.playerName" maxlength="20"></label>
        <div class="settings-row"><span><strong>{{ ui.languageSetting }}</strong><small>{{ ui.languageHint }}</small></span><div class="segmented"><button :class="{ active: settingsDraft.language === 'zh' }" @click="settingsDraft.language = 'zh'">{{ ui.chinese }}</button><button :class="{ active: settingsDraft.language === 'en' }" @click="settingsDraft.language = 'en'">{{ ui.english }}</button></div></div>
        <div class="settings-row"><span><strong>{{ ui.theme }}</strong><small>{{ ui.themeHint }}</small></span><div class="segmented"><button :class="{ active: settingsDraft.theme === 'blue' }" @click="settingsDraft.theme = 'blue'">{{ ui.iceBlue }}</button><button :class="{ active: settingsDraft.theme === 'arcade' }" @click="settingsDraft.theme = 'arcade'">{{ ui.arcade }}</button></div></div>
        <div class="settings-row"><span><strong>{{ ui.motion }}</strong><small>{{ ui.motionHint }}</small></span><div class="segmented"><button :class="{ active: settingsDraft.motion === 'full' }" @click="settingsDraft.motion = 'full'">{{ ui.full }}</button><button :class="{ active: settingsDraft.motion === 'reduced' }" @click="settingsDraft.motion = 'reduced'">{{ ui.reduced }}</button></div></div>
        <label class="settings-row"><span><strong>{{ ui.sound }}</strong><small>{{ ui.soundHint }}</small></span><input v-model="settingsDraft.soundEnabled" class="switch" type="checkbox"></label>
        <label class="settings-row"><span><strong>{{ ui.contrast }}</strong><small>{{ ui.contrastHint }}</small></span><input v-model="settingsDraft.highContrast" class="switch" type="checkbox"></label>
        <div class="background-setting">
          <span><strong>{{ ui.texture }}</strong><small>{{ ui.textureHint }}</small></span>
          <div class="background-picker">
            <button
              v-for="option in backgroundOptions"
              :key="option.value"
              :class="[`background-preview-${option.value}`, { active: settingsDraft.background === option.value }]"
              :aria-label="ui[option.label]"
              @click="settingsDraft.background = option.value"
            ><i></i><b>{{ ui[option.label] }}</b></button>
          </div>
        </div>
        <div class="modal-actions"><button class="secondary-cta" @click="settingsOpen = false">{{ ui.cancel }}</button><button class="primary-cta" @click="saveSettings">{{ ui.save }}</button></div>
      </section>
    </div></Transition>

    <Transition name="modal"><div v-if="roomSettingsOpen && room" class="modal-backdrop" @pointerdown.self="roomSettingsOpen = false">
      <section class="modal-card settings-modal room-settings-modal" role="dialog" aria-modal="true" aria-labelledby="room-settings-title">
        <div class="modal-heading"><div><p class="eyebrow">ROOM PARAMETERS</p><h2 id="room-settings-title">{{ ui.roomSettings }}</h2></div><button class="modal-close" :aria-label="ui.close" @click="roomSettingsOpen = false">×</button></div>
        <p v-if="!isHost" class="room-settings-readonly">{{ ui.hostOnlySettings }}</p>
        <div class="settings-row"><span><strong>{{ ui.turnDuration }}</strong><small>{{ ui.turnDurationHint }}</small></span><div class="segmented"><button v-for="seconds in [30, 60, 90, 120, 180]" :key="seconds" :disabled="!isHost" :class="{ active: roomSettingsDraft.turnDurationSeconds === seconds }" @click="roomSettingsDraft.turnDurationSeconds = seconds">{{ seconds }}s</button></div></div>
        <label class="settings-row"><span><strong>{{ ui.strictMode }}</strong><small>{{ ui.strictModeHint }}</small></span><input v-model="roomSettingsDraft.strictMode" class="switch" type="checkbox" :disabled="!isHost"></label>
        <label class="settings-row"><span><strong>{{ ui.scoringMode }}</strong><small>{{ ui.scoringModeHint }}</small></span><input v-model="roomSettingsDraft.scoringMode" class="switch" type="checkbox" :disabled="!isHost"></label>
        <div class="modal-actions"><button class="secondary-cta" @click="roomSettingsOpen = false">{{ isHost ? ui.cancel : ui.close }}</button><button v-if="isHost" class="primary-cta" :disabled="isSyncing" @click="saveRoomSettings">{{ ui.saveRoomSettings }}</button></div>
      </section>
    </div></Transition>

    <Transition name="modal"><div v-if="rulesOpen" class="modal-backdrop" @pointerdown.self="rulesOpen = false">
      <section class="modal-card rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <div class="modal-heading"><div><p class="eyebrow">RULES</p><h2 id="rules-title">{{ ui.quickGuide }}</h2></div><button class="modal-close" :aria-label="ui.close" @click="rulesOpen = false">×</button></div>
        <div class="rules-book">
          <section class="rules-chapter"><h3><b>01</b>{{ ui.rulesGoalTitle }}</h3><p>{{ ui.rulesGoal }}</p></section>
          <section class="rules-chapter"><h3><b>02</b>{{ ui.rulesTilesTitle }}</h3><p>{{ ui.rulesTiles }}</p></section>
          <section class="rules-chapter"><h3><b>03</b>{{ ui.rulesMeldsTitle }}</h3><ul><li>{{ ui.rulesRun }}</li><li>{{ ui.rulesGroup }}</li></ul></section>
          <section class="rules-chapter"><h3><b>04</b>{{ ui.rulesJokersTitle }}</h3><ul><li><em>★</em>{{ ui.rulesJokerStandard }}</li><li><em>×2</em>{{ ui.rulesJokerDouble }}</li><li><em>↝</em>{{ ui.rulesJokerColor }}</li><li><em>⧉</em>{{ ui.rulesJokerMirror }}</li></ul></section>
          <section class="rules-chapter"><h3><b>05</b>{{ ui.rulesTurnTitle }}</h3><ul><li>{{ ui.rulesTurn1 }}</li><li>{{ ui.rulesTurn2 }}</li><li>{{ ui.rulesTurn3 }}</li></ul></section>
          <section class="rules-chapter"><h3><b>06</b>{{ ui.rulesOpeningTitle }}</h3><p>{{ ui.rulesOpening }}</p></section>
          <section class="rules-chapter"><h3><b>07</b>{{ ui.rulesWinTitle }}</h3><p>{{ ui.rulesWin }}</p></section>
        </div>
        <div class="modal-actions"><button class="primary-cta" @click="rulesOpen = false">{{ ui.gotIt }}</button></div>
      </section>
    </div></Transition>

    <Transition name="modal"><div v-if="replayOpen" class="replay-overlay">
      <section class="replay-shell" role="dialog" aria-modal="true" aria-labelledby="replay-title">
        <header class="replay-header"><div><p class="eyebrow">MATCH ARCHIVE</p><h2 id="replay-title">{{ ui.replayTitle }}</h2><span>{{ ui.replaySubtitle }}</span></div><div class="replay-mode-switch" role="group" :aria-label="ui.replay"><button :class="{ active: !replaySimplified }" @click="setReplayMode(false)"><strong>{{ ui.replayDetailed }}</strong><small>{{ ui.replayDetailedHint }}</small></button><button :class="{ active: replaySimplified }" @click="setReplayMode(true)"><strong>{{ ui.replaySimplified }}</strong><small>{{ ui.replaySimplifiedHint }}</small></button></div><button class="modal-close" :aria-label="ui.closeReplay" @click="closeReplay">×</button></header>
        <div v-if="!replayFrame" class="replay-loading">{{ ui.replayWaiting }}</div>
        <div v-else ref="replayStage" class="replay-stage">
          <section
            v-for="(player, playerIndex) in replayFrame.players"
            :key="player.id"
            class="replay-rack"
            :class="[replaySeatClass(playerIndex, replayFrame.players.length), { active: player.id === replayFrame.currentTurnPlayerId }]"
          >
            <header><strong>{{ player.name }}</strong><span>{{ player.hand.length }} {{ ui.tiles }}</span></header>
            <div class="replay-hand"><div v-for="tile in player.hand" :key="tile.id" class="tile replay-tile" :class="tile.color" :data-replay-tile-id="tile.id" :data-joker="tile.jokerType !== JokerType.NONE ? tile.jokerType : undefined"><span v-if="tile.jokerType === JokerType.NONE" class="number">{{ tile.value }}</span><span v-else class="number joker-icon">{{ jokerIcon(tile.jokerType) }}</span></div></div>
          </section>
          <div class="replay-table-anchor">
            <div class="replay-table-wrap" :style="replayBoardMetrics">
              <div class="replay-table-frame">
                <div class="replay-table-recess">
                  <div class="replay-table" :style="{ gridTemplateColumns: `repeat(${replayFrame.board[0]?.length ?? MIN_BOARD_COLUMNS}, var(--replay-cell-width))` }">
                    <template v-for="(row, rowIndex) in replayFrame.board" :key="rowIndex"><div v-for="(tile, columnIndex) in row" :key="`${rowIndex}-${columnIndex}`" class="replay-cell"><div v-if="tile" class="tile replay-tile table-tile" :class="tile.color" :data-replay-tile-id="tile.id" :data-joker="tile.jokerType !== JokerType.NONE ? tile.jokerType : undefined"><span v-if="tile.jokerType === JokerType.NONE" class="number">{{ tile.value }}</span><span v-else class="number joker-icon">{{ jokerIcon(tile.jokerType) }}</span></div></div></template>
                  </div>
                </div>
                <div class="replay-glass-cover" aria-hidden="true">
                  <i class="replay-glass-edge top"></i>
                  <i class="replay-glass-edge right"></i>
                  <i class="replay-glass-edge bottom"></i>
                  <i class="replay-glass-edge left"></i>
                </div>
              </div>
            </div>
          </div>
          <div class="replay-status"><strong>{{ replayActionLabel(replayFrame) }}</strong><span>{{ ui.replayPool }} {{ replayFrame.poolCount }}</span></div>
        </div>
        <footer class="replay-controls">
          <button :disabled="replayIndex <= 0" :aria-label="ui.previousStep" @click="stepReplay(-1)">‹</button>
          <button class="replay-play" :disabled="replayFrameCount < 2" @click="toggleReplay">{{ replayPlaying ? 'Ⅱ' : '▶' }} <span>{{ replayPlaying ? ui.pauseReplay : ui.playReplay }}</span></button>
          <button :disabled="replayIndex >= replayFrameCount - 1" :aria-label="ui.nextStep" @click="stepReplay(1)">›</button>
          <input :value="replayIndex" type="range" min="0" :max="Math.max(0, replayFrameCount - 1)" step="1" :aria-label="ui.replay" @input="seekReplay">
          <output>{{ ui.replayStep }} {{ replayFrameCount ? replayIndex + 1 : 0 }} / {{ replayFrameCount }}</output>
        </footer>
      </section>
    </div></Transition>

    <div v-if="developerUnlockFlash" class="developer-unlock-flash" aria-hidden="true"></div>

    <Transition name="developer-notice">
      <div v-if="developerUsageNoticeActive" class="developer-usage-notice" role="alert" aria-live="assertive">
        <i>DEV</i>
        <span><small>{{ ui.devNoticeKicker }}</small><strong>{{ ui.devNotice }}</strong></span>
      </div>
    </Transition>

    <Transition name="victory" :duration="{ enter: 900, leave: 650 }">
      <div v-if="victoryBroadcast.active" class="victory-broadcast" aria-hidden="true">
        <div class="victory-ribbon">
          <span class="victory-kicker">WINNER</span>
          <strong class="victory-user">{{ victoryBroadcast.winnerName }}</strong>
        </div>
      </div>
    </Transition>

    <div v-if="pageTransitionActive" class="page-transition" aria-hidden="true">
      <i v-for="band in 5" :key="band"></i>
    </div>
  </main>
</template>

<style scoped>
.game { min-height: 100vh; overflow-x: clip; padding: 14px 18px 24px; color: #e8eef8; background-color: #0b1325; background-image: radial-gradient(circle at 12% 0%, rgba(59,130,246,.32), transparent 34%), radial-gradient(circle at 88% 100%, rgba(139,92,246,.12), transparent 30%), repeating-linear-gradient(135deg, rgba(148,163,184,.032) 0 1px, transparent 1px 26px); font-family: Inter, system-ui, sans-serif; }
.network-panel,.titlebar,.network-error { width: min(calc(var(--board-width) + 28px), calc(100vw - 38px)); margin-inline: auto; }.network-panel { display:flex; min-height:42px; margin-bottom:10px; padding:7px; gap:7px; align-items:center; border:1px solid rgba(181,211,255,.3); border-radius:5px; background:rgba(15,29,53,.9); box-shadow:0 3px 0 #071022,inset 0 1px rgba(255,255,255,.07); }.connection-state{display:flex;gap:7px;align-items:center;padding:0 8px;color:#adc0db;font-size:11px;white-space:nowrap}.connection-state i{width:7px;height:7px;border-radius:2px;background:#fbbf24;box-shadow:0 0 7px currentColor}.connection-state.connected i{background:#4ade80}.connection-state.disconnected i{background:#fb7185}.network-panel input{width:132px;height:28px;padding:0 9px;border:1px solid rgba(148,184,230,.27);border-radius:3px;outline:none;background:#0b172c;color:#eef5ff;font:inherit;font-size:12px}.network-panel input:focus{border-color:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,.13)}.network-panel .room-input{width:88px;text-transform:uppercase;letter-spacing:.12em}.network-panel button,.sort-actions button{height:28px;padding:0 11px;border:1px solid #5b83b6;border-radius:3px;background:linear-gradient(#3e679a,#284b78);color:#fff;font:inherit;font-size:11px;font-weight:750;cursor:pointer;box-shadow:0 2px 0 #101d33}.network-panel button:hover:not(:disabled),.sort-actions button:hover:not(:disabled){filter:brightness(1.12)}button:disabled{opacity:.42;cursor:not-allowed}.network-or{color:#64748b;font-size:10px}.room-code{color:#7dd3fc;font-size:12px;letter-spacing:.08em;white-space:nowrap}.players{display:flex;min-width:0;flex:1;gap:5px;overflow-x:auto;scrollbar-width:none}.players span{display:inline-flex;gap:5px;align-items:center;padding:4px 7px;border:1px solid rgba(148,184,230,.18);border-radius:3px;color:#9fb1cb;font-size:10px;white-space:nowrap}.players span.active{border-color:rgba(74,222,128,.45);color:#d9ffe8;background:rgba(74,222,128,.08)}.players b{padding:1px 3px;border-radius:2px;background:#3b82f6;color:#fff;font-size:8px}.turn-button,.turn-actions,.winner{margin-left:auto}.turn-actions{display:flex;gap:6px}.network-panel .draw-button{border-color:#718096;background:linear-gradient(#45556f,#303d54)}.winner{color:#86efac;font-size:12px}.network-error{margin-top:-3px;margin-bottom:8px;color:#fdba74;font-size:11px}
.titlebar{display:flex;align-items:end;justify-content:space-between;margin-bottom:10px}.titlebar p{margin:0 0 2px;color:#76d5ff;font-size:10px;font-weight:800;letter-spacing:.16em}.titlebar h1{margin:0;color:#fff;font-size:26px;letter-spacing:-.04em;text-shadow:0 2px 0 #162443}.titlebar>span{color:#a9bad5;font-size:12px}
.board-panel{position:relative;box-sizing:content-box;width:var(--board-width);height:var(--board-height);max-width:calc(100vw - 38px);margin:0 auto;padding:0;overflow:auto;border:1px solid rgba(181,211,255,.45);border-radius:5px;background:#152440;box-shadow:inset 0 2px rgba(255,255,255,.11),0 5px 0 #071022,0 7px 0 rgba(49,82,126,.75),0 15px 35px rgba(0,0,0,.3);transition:width .42s cubic-bezier(.2,.8,.2,1),height .42s cubic-bezier(.2,.8,.2,1)}.board{width:var(--board-width);height:var(--board-height);overflow:hidden;border-radius:4px;background-color:#15213a;background-image:linear-gradient(180deg,rgba(255,255,255,.032),transparent 30%),radial-gradient(rgba(187,222,251,.11) 1px,transparent 1px);background-size:auto,14px 14px;transition:width .42s cubic-bezier(.2,.8,.2,1),height .42s cubic-bezier(.2,.8,.2,1)}.board-inner{display:grid;grid-auto-rows:var(--cell-height);width:max-content;height:max-content}.cell{position:relative;isolation:isolate;display:flex;width:var(--cell-width);height:var(--cell-height);align-items:center;justify-content:center;border-right:1px solid rgba(168,197,235,.14);border-bottom:1px solid rgba(168,197,235,.14);transition:background-color .2s}.cell:hover{background-color:rgba(88,183,255,.08)}.cell::before,.cell::after{position:absolute;z-index:-1;pointer-events:none;opacity:0;content:''}.cell::before{inset:0;transition:opacity .38s}.cell::after{right:0;bottom:0;left:0;height:3px;transform:scaleX(.25);transform-origin:left;transition:opacity .3s,transform .38s cubic-bezier(.2,.8,.2,1)}.cell.group-valid::before{opacity:1;background:linear-gradient(180deg,rgba(74,222,128,.11),rgba(74,222,128,.015))}.cell.group-valid::after{opacity:1;transform:scaleX(1);background:#4ade80;box-shadow:0 0 8px rgba(74,222,128,.5)}.cell.group-invalid::before{opacity:1;background:linear-gradient(180deg,rgba(251,146,60,.13),rgba(251,146,60,.018))}.cell.group-invalid::after{opacity:1;transform:scaleX(1);background:#fb923c;box-shadow:0 0 8px rgba(251,146,60,.5)}
.hand{box-sizing:content-box;width:var(--hand-width);max-width:calc(100vw - 38px);margin:16px auto 0;overflow:hidden;border:1px solid rgba(181,211,255,.39);border-radius:5px;background:linear-gradient(180deg,rgba(53,76,112,.97),rgba(25,39,64,.97));box-shadow:inset 0 2px rgba(255,255,255,.11),0 5px 0 #071022,0 7px 0 rgba(43,68,103,.72),0 13px 26px rgba(0,0,0,.28);transition:width .42s cubic-bezier(.2,.8,.2,1)}.hand-toolbar{display:flex;height:38px;padding:5px 8px;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(168,197,235,.18)}.hand-toolbar>div:first-child{display:flex;gap:8px;align-items:baseline}.hand-toolbar strong{font-size:14px}.hand-toolbar span{color:#9db0cc;font-size:10px}.sort-actions{display:flex;gap:5px}.sort-actions button{height:25px;padding:0 8px;background:linear-gradient(#435f86,#2d4668);font-size:10px}.hand-scroll{max-height:calc(var(--cell-height) * 2);overflow-x:hidden;overflow-y:auto;scrollbar-color:rgba(125,166,218,.55) transparent;scrollbar-width:thin}.hand-grid{display:grid;grid-template-columns:repeat(16,var(--cell-width));grid-auto-rows:var(--cell-height);width:var(--hand-width)}.hand-cell{display:flex;width:var(--cell-width);height:var(--cell-height);align-items:center;justify-content:center;border-right:1px solid rgba(168,197,235,.12);border-bottom:1px solid rgba(168,197,235,.12);background:rgba(10,22,42,.12)}.hand-cell:hover{background:rgba(88,183,255,.07)}
.tile{position:relative;z-index:1;display:flex;width:var(--tile-width);height:var(--tile-height);flex:0 0 auto;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(15,23,42,.15);border-radius:4px;background:linear-gradient(135deg,#fff 0%,#eef4fb 50%,#cbd9e9 100%);box-shadow:0 3px 0 #879bb2,0 5px 9px rgba(0,0,0,.3),inset 0 2px rgba(255,255,255,.98);cursor:grab;font-weight:900;touch-action:none;user-select:none;transition:filter .2s,opacity .2s}.tile::after{position:absolute;inset:3px;border:1px solid rgba(255,255,255,.34);border-radius:2px;pointer-events:none;content:''}.tile:hover{transform:translateY(-1px);filter:brightness(1.04)}.tile:active{cursor:grabbing}.tile.dimmed{opacity:.2;pointer-events:none}.tile.locked{cursor:not-allowed;filter:saturate(.68) brightness(.86)}.tile.locked:hover{transform:none}.number{font-size:clamp(20px,calc(var(--tile-width) * .56),29px);line-height:1}.tile small{max-width:calc(var(--tile-width) - 4px);margin-top:3px;color:#7c3aed;font-size:6px;line-height:1;text-align:center;overflow-wrap:anywhere}.tile.RED{color:#ef4a60}.tile.BLUE{color:#2789eb}.tile.BLACK{color:#1e293b}.tile.ORANGE{color:#ec8a31}.drag-ghost{position:fixed;z-index:50;margin:calc(var(--tile-height) / -2) 0 0 calc(var(--tile-width) / -2);pointer-events:none;transform:rotate(3deg) scale(1.04)}
.room-code-wrap{display:flex;align-items:center;gap:5px}.network-panel .copy-room{height:22px;padding:0 7px;border-color:rgba(125,211,252,.38);background:#152b48;color:#bae6fd;font-size:9px;box-shadow:0 1px 0 #071022}.tile.dimmed{opacity:.14}.drag-ghost-strip{position:fixed;z-index:50;display:flex;gap:calc(var(--cell-width) - var(--tile-width));margin:calc(var(--tile-height) / -2) 0 0 calc(var(--tile-width) / -2);pointer-events:none;filter:drop-shadow(0 10px 10px rgba(0,0,0,.26));transform:rotate(2deg) scale(1.025);transform-origin:calc(var(--tile-width) / 2) center}.drag-ghost-tile{box-shadow:0 4px 0 #879bb2,0 8px 13px rgba(0,0,0,.34),inset 0 2px rgba(255,255,255,.98)}.source-ghost{filter:saturate(.75)}
.cell.group-invalid::before,.cell.group-invalid::after{opacity:0!important}.cell.group-invalid{border-top:2px solid #ff4964;border-bottom:2px solid #ff4964;background:rgba(255,44,78,.08);box-shadow:inset 0 0 10px rgba(255,44,78,.12)}.cell.group-invalid-start{border-left:2px solid #ff4964;border-radius:4px 0 0 4px}.cell.group-invalid-end{border-right:2px solid #ff4964;border-radius:0 4px 4px 0}
.room-input-wrap{position:relative;display:flex;align-items:center}.network-panel .room-input-wrap .room-input{width:112px;padding-right:31px}.network-panel .icon-button{display:grid;width:24px;height:22px;padding:0;place-items:center;border-color:rgba(125,211,252,.38);background:#152b48;color:#bae6fd;box-shadow:0 1px 0 #071022}.icon-button svg{width:14px;height:14px;fill:currentColor}.network-panel .paste-room{position:absolute;right:3px}.network-panel .copy-room{width:24px;height:22px;padding:0}.network-panel .copy-room.copied{border-color:rgba(74,222,128,.55);color:#86efac}
.cell.group-invalid{border-top:0;border-bottom:1px solid rgba(168,197,235,.14);background:rgba(255,44,78,.05);box-shadow:none}.cell.group-invalid-start{border-left:0;border-radius:0}.cell.group-invalid-end{border-right:1px solid rgba(168,197,235,.14);border-radius:0}.cell.group-invalid::before{inset:0;z-index:6;opacity:1!important;border-top:2px solid #ff4964;border-bottom:2px solid #ff4964;background:transparent!important;box-shadow:inset 0 0 8px rgba(255,44,78,.12)}.cell.group-invalid-start::before{border-left:2px solid #ff4964;border-radius:4px 0 0 4px}.cell.group-invalid-end::before{border-right:2px solid #ff4964;border-radius:0 4px 4px 0}.cell.group-invalid::after{opacity:0!important}
.game{--panel:#111f38;--panel-deep:#0b172b;--line:rgba(173,205,244,.22);padding-top:76px}.game.no-pattern{background-image:radial-gradient(circle at 12% 0%,rgba(59,130,246,.28),transparent 34%),radial-gradient(circle at 88% 100%,rgba(139,92,246,.1),transparent 30%)}.app-chrome{position:absolute;top:0;left:0;display:flex;box-sizing:border-box;width:100%;height:60px;padding:0 max(18px,calc((100vw - 1040px)/2));align-items:center;justify-content:space-between;border-bottom:1px solid rgba(173,205,244,.12);background:rgba(7,15,29,.72);box-shadow:0 8px 30px rgba(0,0,0,.1);backdrop-filter:blur(14px)}.brand-button,.chrome-button{border:0;background:none;color:inherit;font:inherit;cursor:pointer}.brand-button{display:flex;gap:9px;align-items:center;padding:0}.brand-button:disabled{opacity:1;cursor:default}.brand-mark{display:grid;width:31px;height:31px;place-items:center;border:1px solid rgba(147,197,253,.6);border-radius:6px;background:linear-gradient(145deg,#4b91e9,#285696);box-shadow:inset 0 1px rgba(255,255,255,.35),0 3px 0 #071123;color:#fff;font-weight:950;transform:skew(-4deg)}.brand-button>span:last-child{display:flex;align-items:flex-start;flex-direction:column;line-height:1}.brand-button b{font-size:12px;letter-spacing:.1em}.brand-button small{margin-top:4px;color:#7292b8;font-size:7px;letter-spacing:.22em}.chrome-actions{display:flex;gap:8px;align-items:center}.chrome-button{height:30px;padding:0 10px;border:1px solid rgba(160,196,239,.2);border-radius:5px;background:rgba(18,35,61,.7);box-shadow:0 2px 0 rgba(3,9,19,.9);color:#b8c9df;font-size:11px}.chrome-button:hover{border-color:rgba(125,211,252,.42);color:#fff}.compact-connection{display:flex;gap:6px;align-items:center;margin-right:4px;color:#7890ae;font-size:10px}.compact-connection i{width:6px;height:6px;border-radius:2px;background:#fbbf24;box-shadow:0 0 6px currentColor}.compact-connection.connected i{background:#45dc8a}.compact-connection.disconnected i{background:#fb7185}
.eyebrow{margin:0 0 9px!important;color:#67d3ff!important;font-size:10px!important;font-weight:850;letter-spacing:.2em;text-transform:uppercase}.lobby-shell,.room-lobby,.result-screen{box-sizing:border-box;width:min(1040px,calc(100vw - 36px));min-height:calc(100vh - 116px);margin:0 auto}.lobby-shell{display:grid;grid-template-columns:1.15fr .85fr;gap:74px;align-items:center;padding:30px 56px}.lobby-copy{position:relative}.lobby-copy h1,.room-heading h1,.result-screen h1{margin:0;color:#f8fbff;font-size:clamp(44px,6vw,76px);line-height:.98;letter-spacing:-.065em;text-shadow:0 3px 0 #10223f}.lobby-copy h1 em,.result-screen h1 em{color:#77dcff;font-style:normal}.lobby-lead{max-width:470px;margin:24px 0 18px;color:#a6b7ce;font-size:14px;line-height:1.8}.feature-pills{display:flex;gap:7px}.feature-pills span{padding:5px 9px;border:1px solid rgba(130,177,230,.18);border-radius:4px;background:rgba(18,37,66,.55);color:#86a0bf;font-size:9px;letter-spacing:.08em}.decorative-tiles{display:flex;height:94px;margin-top:35px;align-items:end}.decorative-tiles i{display:grid;width:54px;height:76px;margin-right:-5px;place-items:center;border:1px solid #c7d3df;border-radius:5px;background:linear-gradient(145deg,#fff,#d7e2ed);box-shadow:0 5px 0 #758ba2,0 12px 25px rgba(0,0,0,.3);font-size:27px;font-style:normal;font-weight:950;transform:rotate(-7deg);color:#ef4a60}.decorative-tiles i:nth-child(2){color:#2789eb;transform:translateY(-7px) rotate(-2deg)}.decorative-tiles i:nth-child(3){color:#ec8a31;transform:translateY(-3px) rotate(3deg)}.decorative-tiles i:nth-child(4){color:#7c3aed;transform:translateY(3px) rotate(8deg)}
.entry-card,.room-code-card,.ranking-card,.modal-card{border:1px solid rgba(176,211,251,.28);border-radius:7px;background:linear-gradient(160deg,rgba(24,44,76,.98),rgba(11,25,47,.98));box-shadow:inset 0 1px rgba(255,255,255,.09),0 5px 0 #060d1b,0 7px 0 rgba(41,68,103,.7),0 24px 65px rgba(0,0,0,.34)}.entry-card{padding:10px 25px 24px}.entry-tabs{display:grid;grid-template-columns:1fr 1fr;margin:0 -15px 24px;border-bottom:1px solid rgba(166,201,241,.16)}.entry-tabs button{height:48px;border:0;border-bottom:2px solid transparent;background:none;color:#7289a6;font:inherit;font-size:12px;font-weight:750;cursor:pointer}.entry-tabs button.active{border-bottom-color:#67d3ff;color:#f2f8ff}.field-label{display:block;margin:0 0 7px;color:#9eb2cc;font-size:10px;font-weight:700}.field-label.room-label{margin-top:15px}.lobby-input,.settings-row input:not(.switch){box-sizing:border-box;width:100%;height:42px;padding:0 13px;border:1px solid rgba(159,194,235,.25);border-radius:5px;outline:none;background:#09172c;color:#f4f8ff;font:inherit;font-size:13px;box-shadow:inset 0 2px 5px rgba(0,0,0,.18)}.lobby-input:focus,.settings-row input:focus{border-color:#58bdf2;box-shadow:0 0 0 3px rgba(88,189,242,.1),inset 0 2px 5px rgba(0,0,0,.18)}.lobby-room-input{position:relative}.lobby-room-input input{padding-right:46px;text-transform:uppercase;letter-spacing:.22em}.lobby-room-input button{position:absolute;top:5px;right:5px;display:grid;width:32px;height:32px;padding:0;place-items:center;border:1px solid rgba(125,211,252,.25);border-radius:4px;background:#142a49;color:#9edfff;cursor:pointer}.lobby-room-input svg,.room-code-card svg{width:15px;height:15px;fill:currentColor}.primary-cta,.secondary-cta{min-height:39px;padding:0 17px;border-radius:5px;color:#fff;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.primary-cta{border:1px solid #65bdec;background:linear-gradient(#3f9bd2,#2871aa);box-shadow:inset 0 1px rgba(255,255,255,.25),0 3px 0 #0b365d}.entry-card>.primary-cta{display:flex;width:100%;height:43px;margin-top:20px;align-items:center;justify-content:space-between}.primary-cta:hover:not(:disabled),.secondary-cta:hover:not(:disabled){filter:brightness(1.12)}.primary-cta:disabled,.secondary-cta:disabled{opacity:.4;cursor:not-allowed}.secondary-cta{border:1px solid rgba(162,194,232,.27);background:linear-gradient(#263d5d,#192c48);box-shadow:inset 0 1px rgba(255,255,255,.08),0 3px 0 #071021}.entry-note{margin:16px 0 0;color:#617b9b;font-size:9px;line-height:1.5;text-align:center}
.restore-screen{display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center}.restore-screen h1{margin:5px 0 12px;font-size:30px}.restore-screen>p:last-child{color:#879db9;font-size:12px}.loading-emblem{position:relative;width:72px;height:58px;margin-bottom:22px}.loading-emblem i{position:absolute;top:0;width:31px;height:46px;border:1px solid #c9d7e7;border-radius:4px;background:linear-gradient(145deg,#fff,#cedae8);box-shadow:0 4px 0 #607891;animation:loading-tiles 1.2s ease-in-out infinite}.loading-emblem i:nth-child(1){left:0}.loading-emblem i:nth-child(2){left:21px;animation-delay:.12s}.loading-emblem i:nth-child(3){left:42px;animation-delay:.24s}@keyframes loading-tiles{50%{transform:translateY(-8px)}}
.room-lobby{display:flex;max-width:820px;align-items:center;flex-direction:column;justify-content:center;padding:28px}.room-heading{text-align:center}.room-heading h1{font-size:42px}.room-heading>p:last-child,.result-screen>p{margin:13px 0 24px;color:#91a7c2;font-size:12px}.room-code-card{display:flex;width:min(520px,100%);padding:17px 20px;align-items:center}.room-code-card>span{color:#7590b1;font-size:10px}.room-code-card>strong{margin-left:18px;color:#eaf8ff;font-size:23px;letter-spacing:.23em}.room-code-card button{display:flex;height:31px;margin-left:auto;padding:0 10px;gap:6px;align-items:center;border:1px solid rgba(125,211,252,.26);border-radius:4px;background:#142b4b;color:#9edfff;font:inherit;font-size:9px;cursor:pointer}.room-code-card button.copied{border-color:rgba(74,222,128,.45);color:#86efac}.seat-grid{display:grid;width:min(570px,100%);margin:25px 0;grid-template-columns:1fr 1fr;gap:9px}.player-seat{display:flex;min-height:62px;padding:9px 12px;gap:11px;align-items:center;border:1px solid rgba(162,198,239,.2);border-radius:6px;background:rgba(18,35,61,.74);box-shadow:inset 0 1px rgba(255,255,255,.06),0 3px 0 rgba(5,12,25,.7)}.player-avatar,.empty-avatar,.mini-avatar{display:grid;flex:0 0 auto;place-items:center;border-radius:5px;background:linear-gradient(145deg,#469dd3,#315e9c);box-shadow:inset 0 1px rgba(255,255,255,.2),0 3px 0 #0d2849;color:#fff;font-weight:900}.player-avatar,.empty-avatar{width:43px;height:43px}.player-seat>div:last-child{display:grid;min-width:0;grid-template-columns:auto auto;column-gap:6px;align-items:center}.player-seat strong{overflow:hidden;color:#e6effa;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.player-seat span{padding:2px 4px;border-radius:3px;background:#315f96;color:#cceaff;font-size:7px}.player-seat small{grid-column:1/-1;margin-top:4px;color:#5ee29a;font-size:8px}.player-seat.empty{border-style:dashed;background:rgba(13,27,50,.4)}.empty-avatar{border:1px dashed rgba(155,190,231,.28);background:none;box-shadow:none;color:#5f7898;font-size:20px;font-weight:400}.player-seat.empty strong,.player-seat.empty small{color:#607897}.player-seat.offline{border-color:rgba(251,191,36,.28);filter:saturate(.65)}.player-seat.offline small{color:#fbbf24}.room-lobby-actions,.result-actions{display:flex;gap:10px}.room-lobby-actions .primary-cta{min-width:150px}
.result-screen{display:flex;max-width:620px;align-items:center;flex-direction:column;justify-content:center;padding:26px;text-align:center}.victory-badge{display:grid;width:58px;height:58px;margin-bottom:19px;place-items:center;border:1px solid #8bdcff;border-radius:10px;background:linear-gradient(145deg,#4facdf,#2d639e);box-shadow:inset 0 2px rgba(255,255,255,.25),0 5px 0 #0c2d51,0 0 32px rgba(103,211,255,.22);color:#fff;font-size:24px;transform:rotate(45deg)}.result-screen h1{font-size:39px}.ranking-card{box-sizing:border-box;width:min(470px,100%);padding:7px}.ranking-row{display:grid;min-height:50px;padding:6px 10px;grid-template-columns:24px 34px 1fr auto;gap:8px;align-items:center;border-bottom:1px solid rgba(158,193,234,.12);text-align:left}.ranking-row:last-child{border-bottom:0}.ranking-row>b{color:#647d9d;font-size:11px}.mini-avatar{width:29px;height:29px;border-radius:4px;font-size:10px}.ranking-row>strong{color:#dce8f7;font-size:11px}.ranking-row>strong small{padding:2px 4px;border-radius:3px;background:#285989;color:#bee9ff;font-size:7px}.ranking-row>span{color:#7690ae;font-size:9px}.ranking-row.champion{border-radius:4px;background:rgba(70,190,232,.08)}.ranking-row.champion>b{color:#78ddff}.result-actions{margin-top:23px}.result-actions button{min-width:125px}
.modal-backdrop{position:fixed;z-index:100;inset:0;display:grid;padding:18px;place-items:center;background:rgba(2,7,16,.72);backdrop-filter:blur(7px)}.modal-card{box-sizing:border-box;width:min(470px,100%);padding:21px}.modal-heading{display:flex;margin-bottom:15px;align-items:start;justify-content:space-between}.modal-heading h2{margin:0;color:#f3f8ff;font-size:24px}.modal-close{display:grid;width:30px;height:30px;padding:0;place-items:center;border:1px solid rgba(161,195,235,.2);border-radius:4px;background:#142641;color:#8ea5c1;font-size:19px;cursor:pointer}.settings-row{display:flex;min-height:56px;padding:8px 0;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(159,194,235,.12)}.settings-row>span{display:flex;align-items:flex-start;flex-direction:column}.settings-row strong{color:#dce8f6;font-size:11px}.settings-row small{margin-top:4px;color:#7188a5;font-size:8px}.settings-row input:not(.switch){width:150px;height:34px}.segmented{display:flex;padding:2px;border:1px solid rgba(160,195,237,.18);border-radius:4px;background:#09172b}.segmented button{height:27px;padding:0 11px;border:0;border-radius:3px;background:none;color:#7189a7;font:inherit;font-size:9px;cursor:pointer}.segmented button.active{background:#285c91;color:#dff5ff;box-shadow:inset 0 1px rgba(255,255,255,.12)}.switch{position:relative;width:35px;height:20px;appearance:none;border:1px solid rgba(160,195,237,.25);border-radius:10px;background:#09172b;cursor:pointer;transition:.2s}.switch::after{position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:#6f86a2;content:'';transition:.2s}.switch:checked{border-color:#4fa9db;background:#1c527d}.switch:checked::after{left:18px;background:#bdeeff}.modal-actions{display:flex;margin-top:20px;gap:8px;justify-content:flex-end}.rules-modal{width:min(620px,100%)}.rules-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rules-grid article{padding:13px;border:1px solid rgba(157,192,233,.14);border-radius:5px;background:rgba(7,20,39,.42)}.rules-grid article>b{color:#5fcffb;font-size:9px;letter-spacing:.12em}.rules-grid h3{margin:6px 0;color:#dce8f7;font-size:12px}.rules-grid p{margin:0;color:#7f96b2;font-size:9px;line-height:1.65}
.reconnect-banner{position:fixed;z-index:80;top:72px;left:50%;display:flex;padding:10px 14px;gap:11px;align-items:center;border:1px solid rgba(251,191,36,.35);border-radius:6px;background:rgba(40,30,12,.95);box-shadow:0 5px 20px rgba(0,0,0,.3);transform:translateX(-50%)}.reconnect-banner div{display:flex;align-items:flex-start;flex-direction:column}.reconnect-banner strong{color:#fde68a;font-size:10px}.reconnect-banner small{margin-top:2px;color:#aa8d51;font-size:8px}.spinner{width:15px;height:15px;border:2px solid rgba(251,191,36,.25);border-top-color:#fbbf24;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(1turn)}}.player-offline-banner{width:min(896px,calc(100vw - 36px));margin:-2px auto 9px;color:#f5bf53;font-size:9px;text-align:center}.game.high-contrast .tile{border-color:#5b6a7b;background:linear-gradient(135deg,#fff,#e4edf7 60%,#b9c9da);box-shadow:0 3px 0 #687d94,0 5px 10px rgba(0,0,0,.44),inset 0 2px #fff}.game.high-contrast .tile.RED{color:#d91f3c}.game.high-contrast .tile.BLUE{color:#0872d4}.game.high-contrast .tile.BLACK{color:#080e18}.game.high-contrast .tile.ORANGE{color:#d26700}.game.reduced-motion *,.game.reduced-motion *::before,.game.reduced-motion *::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}
@media(max-width:760px){.game{padding:72px 13px 20px}.app-chrome{padding:0 13px}.compact-connection{display:none}.lobby-shell{display:flex;min-height:auto;padding:32px 8px;gap:35px;align-items:stretch;flex-direction:column}.lobby-copy h1{font-size:48px}.lobby-lead{font-size:12px}.decorative-tiles{display:none}.entry-card{padding-inline:20px}.room-lobby,.result-screen{min-height:calc(100vh - 100px);padding:15px 4px}.room-heading h1,.result-screen h1{font-size:32px}.room-code-card{box-sizing:border-box}.room-code-card>strong{font-size:18px}.seat-grid{grid-template-columns:1fr}.rules-grid{grid-template-columns:1fr}.settings-row input:not(.switch){width:120px}.network-panel{flex-wrap:wrap}.connection-state{width:100%}.network-panel input{flex:1}.titlebar>span{display:none}.hand-toolbar{height:auto;min-height:42px}.hand-toolbar>div:first-child{align-items:flex-start;flex-direction:column;gap:1px}}
.lobby-error{margin:12px 0 -5px;padding:8px 10px;border:1px solid rgba(251,113,133,.24);border-radius:4px;background:rgba(127,29,29,.16);color:#fda4af;font-size:9px;line-height:1.5}.game.theme-violet{background-color:#100f25;background-image:radial-gradient(circle at 12% 0%,rgba(124,93,255,.3),transparent 34%),radial-gradient(circle at 88% 100%,rgba(81,207,255,.1),transparent 30%),repeating-linear-gradient(135deg,rgba(180,169,255,.032) 0 1px,transparent 1px 26px)}.game.theme-violet .brand-mark,.game.theme-violet .primary-cta,.game.theme-violet .player-avatar,.game.theme-violet .mini-avatar{border-color:#9f8cff;background:linear-gradient(145deg,#826df0,#51409d);box-shadow:inset 0 1px rgba(255,255,255,.25),0 3px 0 #21164f}.game.theme-violet .eyebrow,.game.theme-violet .lobby-copy h1 em,.game.theme-violet .result-screen h1 em{color:#aa9cff!important}.game.theme-violet .entry-tabs button.active{border-bottom-color:#9f8cff}.game.theme-violet .segmented button.active{background:#5948a6}.game.theme-violet .switch:checked{border-color:#8e7bea;background:#4f3d98}
.network-error{position:fixed;z-index:92;top:70px;left:50%;box-sizing:border-box;width:auto;max-width:min(560px,calc(100vw - 28px));margin:0;padding:9px 13px;border:1px solid rgba(251,113,133,.42);border-radius:5px;background:rgba(76,20,32,.96);box-shadow:0 5px 0 rgba(24,5,11,.7),0 14px 30px rgba(0,0,0,.3);color:#fecdd3;font-size:10px;line-height:1.45;text-align:center;transform:translateX(-50%);animation:toast-in .2s ease-out}@keyframes toast-in{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}.dev-button{border-color:rgba(167,139,250,.32);color:#c4b5fd;font-size:8px;font-weight:900;letter-spacing:.12em}.dev-button.active{border-color:#9b87f5;background:#4f418b;color:#fff}.developer-panel{position:fixed;z-index:70;top:70px;right:12px;box-sizing:border-box;width:260px;max-height:calc(100vh - 84px);padding:15px;overflow:auto;border:1px solid rgba(180,166,255,.36);border-radius:7px;background:linear-gradient(160deg,rgba(28,37,67,.98),rgba(12,20,39,.98));box-shadow:inset 0 1px rgba(255,255,255,.09),0 5px 0 #060a17,0 20px 50px rgba(0,0,0,.42);animation:dev-in .22s cubic-bezier(.2,.8,.2,1)}@keyframes dev-in{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}.developer-heading{display:flex;align-items:start;justify-content:space-between}.developer-heading p{margin:0 0 4px;color:#a99cff;font-size:7px;font-weight:900;letter-spacing:.18em}.developer-heading h2{margin:0;color:#f1efff;font-size:16px}.developer-heading>button{display:grid;width:26px;height:26px;padding:0;place-items:center;border:1px solid rgba(181,169,246,.2);border-radius:4px;background:#1c2947;color:#9caaca;font:inherit;font-size:16px;cursor:pointer}.score-monitor{margin:14px 0;padding:12px;border:1px solid rgba(163,184,222,.15);border-radius:5px;background:#091428}.score-monitor>span{color:#8095b4;font-size:8px}.score-monitor strong{display:block;margin:3px 0 8px;color:#f1f6ff;font-size:27px;line-height:1}.score-monitor strong small{margin-left:3px;color:#607898;font-size:10px}.score-monitor>div{height:4px;overflow:hidden;border-radius:2px;background:#1c2a42}.score-monitor i{display:block;height:100%;border-radius:2px;background:linear-gradient(90deg,#5d8bea,#a184f5);box-shadow:0 0 8px rgba(126,145,255,.45);transition:width .25s}.score-monitor.ready{border-color:rgba(74,222,128,.32)}.score-monitor.ready i{background:#4ade80}.score-monitor p{margin:7px 0 0;color:#657c9b;font-size:7px;line-height:1.5}.score-monitor.ready p{color:#72dba0}.developer-section{padding:12px 0;border-top:1px solid rgba(159,180,218,.12)}.developer-section>label{display:block;margin-bottom:9px;color:#aab9cf;font-size:9px;font-weight:800}.dev-color-row{display:flex;gap:6px}.dev-color-row button{width:26px;height:21px;padding:0;border:2px solid transparent;border-radius:4px;box-shadow:inset 0 1px rgba(255,255,255,.25),0 2px 0 #050b17;cursor:pointer}.dev-color-row button.RED{background:#e94b61}.dev-color-row button.BLUE{background:#2789eb}.dev-color-row button.BLACK{background:#283548}.dev-color-row button.ORANGE{background:#e98a34}.dev-color-row button.active{border-color:#fff;transform:translateY(-1px)}.dev-value-row{display:grid;margin-top:9px;grid-template-columns:1fr auto;gap:6px}.dev-value-row select{height:31px;padding:0 7px;border:1px solid rgba(155,181,221,.22);border-radius:4px;outline:none;background:#0a172b;color:#dce7f5;font:inherit;font-size:9px}.dev-value-row button,.joker-palette button{border:1px solid rgba(146,175,219,.26);border-radius:4px;background:linear-gradient(#314e73,#213958);box-shadow:0 2px 0 #060d1a;color:#e7f1ff;font:inherit;font-size:8px;font-weight:800;cursor:pointer}.dev-value-row button{padding:0 10px}.joker-palette{display:grid;grid-template-columns:1fr 1fr;gap:6px}.joker-palette button{display:flex;min-height:44px;gap:7px;align-items:center;justify-content:center}.joker-palette b{color:#b7a6ff;font-size:14px}.joker-palette span{font-size:8px}.developer-panel button:disabled{opacity:.38;cursor:not-allowed}.developer-note{margin:3px 0 0;color:#566d8b;font-size:7px;line-height:1.55}
.game-action-dock{display:grid;box-sizing:border-box;width:min(var(--board-width),calc(100vw - 38px));min-height:58px;margin:13px auto 0;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center}.turn-actions-left{display:flex;gap:9px;justify-self:start;align-items:center}.large-action{display:flex;width:170px;min-height:48px;padding:5px 11px;gap:10px;align-items:center;border-radius:6px;color:#fff;font:inherit;cursor:pointer;transition:transform .15s,filter .15s,box-shadow .15s}.large-action:hover:not(:disabled){filter:brightness(1.12);transform:translateY(-1px)}.large-action:active:not(:disabled){transform:translateY(2px)}.large-action i{display:grid;width:30px;height:30px;flex:0 0 auto;place-items:center;border-radius:4px;background:rgba(255,255,255,.1);font-size:17px;font-style:normal}.large-action span{display:flex;align-items:flex-start;flex-direction:column}.large-action strong{font-size:12px}.large-action small{margin-top:3px;color:rgba(234,243,255,.62);font-size:7px;white-space:nowrap}.draw-action{justify-self:start;border:1px solid #d09b55;background:linear-gradient(145deg,#8a6845,#5a432e);box-shadow:inset 2px 2px rgba(255,236,196,.2),inset -2px -2px rgba(33,18,8,.32),0 4px 0 #24170d}.revert-action{display:flex;min-height:42px;padding:4px 9px;gap:7px;align-items:center;border:1px solid #6e8296;border-radius:5px;background:linear-gradient(145deg,#3d5265,#263646);box-shadow:inset 2px 2px rgba(222,239,255,.13),inset -2px -2px rgba(8,17,27,.36),0 3px 0 #111b25;color:#eef6ff;font:inherit;cursor:pointer;transition:transform .15s,filter .15s,box-shadow .15s}.revert-action i{display:grid;width:22px;height:22px;place-items:center;background:rgba(255,255,255,.08);border-radius:3px;font-size:16px;font-style:normal}.revert-action span{display:flex;align-items:flex-start;flex-direction:column}.revert-action strong{font-size:10px}.revert-action small{margin-top:2px;color:rgba(234,243,255,.6);font-size:6px;white-space:nowrap}.revert-action:hover:not(:disabled){filter:brightness(1.15);transform:translateY(-1px)}.revert-action:active:not(:disabled){transform:translateY(1px);box-shadow:inset 2px 2px rgba(8,17,27,.3),0 1px 0 #111b25}.revert-action:disabled{opacity:.36;cursor:not-allowed;filter:saturate(.45)}.commit-action{justify-self:end;justify-content:flex-end;border:1px solid #58bce9;background:linear-gradient(145deg,#358fc4,#205e91);box-shadow:inset 2px 2px rgba(220,247,255,.22),inset -2px -2px rgba(5,26,55,.34),0 4px 0 #092a4b;text-align:right}.large-action:disabled{opacity:.36;cursor:not-allowed;filter:saturate(.45)}.turn-indicator{display:flex;min-width:150px;align-items:center;flex-direction:column}.turn-indicator span{color:#5f7898;font-size:7px;font-weight:900;letter-spacing:.18em}.turn-indicator strong{margin-top:4px;color:#8298b4;font-size:10px}.turn-indicator.mine span{color:#67d3ff}.turn-indicator.mine strong{color:#dcecff}
.chat-button{position:relative}.chat-button b{display:grid;min-width:14px;height:14px;margin-left:4px;padding:0 3px;place-items:center;border-radius:7px;background:#368ac0;color:#fff;font-size:7px}.side-panel{isolation:isolate}.chat-panel{position:fixed;z-index:70;top:70px;right:12px;display:flex;box-sizing:border-box;width:286px;height:min(520px,calc(100vh - 84px));padding:15px;flex-direction:column;border:1px solid rgba(145,193,238,.32);border-radius:7px;background:linear-gradient(160deg,rgba(25,42,70,.985),rgba(10,20,38,.985));box-shadow:inset 1px 1px rgba(255,255,255,.09),inset -2px -2px rgba(0,0,0,.22),0 5px 0 #050b16,0 20px 50px rgba(0,0,0,.42);animation:dev-in .22s cubic-bezier(.2,.8,.2,1)}.chat-list{display:flex;min-height:0;margin:13px -4px 10px;padding:2px 4px;gap:8px;flex:1;flex-direction:column;overflow-y:auto;scrollbar-color:rgba(116,160,207,.5) transparent;scrollbar-width:thin}.chat-empty{display:flex;margin:auto;align-items:center;flex-direction:column;color:#607793}.chat-empty i{display:grid;width:42px;height:34px;margin-bottom:7px;place-items:center;border:1px solid rgba(147,184,225,.16);border-radius:6px;background:#0b192e;font-style:normal;letter-spacing:.12em}.chat-empty strong{font-size:10px}.chat-empty span{margin-top:4px;font-size:7px}.chat-list article{max-width:87%;align-self:flex-start}.chat-list article.mine{align-self:flex-end}.chat-list article>div{display:flex;margin:0 3px 3px;gap:7px;align-items:center}.chat-list article strong{color:#9cb4d0;font-size:8px}.chat-list article time{color:#526984;font-size:6px}.chat-list article p{margin:0;padding:8px 10px;border:1px solid rgba(151,185,225,.17);border-radius:3px 7px 7px 7px;background:#152944;color:#dce8f6;font-size:9px;line-height:1.5;overflow-wrap:anywhere}.chat-list article.mine>div{justify-content:flex-end}.chat-list article.mine p{border-color:rgba(96,194,235,.3);border-radius:7px 3px 7px 7px;background:#245b82;color:#f2fbff}.chat-compose{display:grid;grid-template-columns:1fr 34px;gap:6px}.chat-compose input{min-width:0;height:35px;padding:0 10px;border:1px solid rgba(151,187,228,.22);border-radius:5px;outline:none;background:#08162a;color:#edf6ff;font:inherit;font-size:9px}.chat-compose input:focus{border-color:#55b8e8;box-shadow:0 0 0 2px rgba(85,184,232,.1)}.chat-compose button{height:35px;padding:0;border:1px solid #4ca9d9;border-radius:5px;background:linear-gradient(145deg,#378fc0,#235f90);box-shadow:inset 1px 1px rgba(255,255,255,.2),0 2px 0 #071f37;color:#fff;cursor:pointer}.chat-compose button:disabled{opacity:.35;cursor:not-allowed}
.modal-enter-active,.modal-leave-active{transition:opacity .2s ease}.modal-enter-active .modal-card,.modal-leave-active .modal-card{transition:transform .24s cubic-bezier(.2,.86,.2,1),opacity .18s ease}.modal-enter-from,.modal-leave-to{opacity:0}.modal-enter-from .modal-card{opacity:0;transform:translateY(14px) scale(.96)}.modal-leave-to .modal-card{opacity:0;transform:translateY(8px) scale(.98)}
.entry-tabs button>b,.entry-tabs button small{display:none}

/* Original competitive-arcade theme: sharp, dense and deliberately game-like. */
.game.theme-arcade{
  --arcade-cyan:#48dcff;
  --arcade-blue:#0879c9;
  --arcade-orange:#ff653a;
  --arcade-yellow:#ffd13d;
  --arcade-ink:#03060b;
  color:#eaf7ff;
  background-color:#03060b;
  background-image:
    radial-gradient(ellipse at 76% -8%,rgba(0,174,255,.22),transparent 36%),
    radial-gradient(ellipse at -8% 82%,rgba(255,63,32,.12),transparent 34%),
    repeating-linear-gradient(118deg,transparent 0 68px,rgba(68,202,255,.025) 69px,transparent 70px 139px),
    linear-gradient(180deg,#080d16,#03060b 70%);
  font-family:"Bahnschrift Condensed","Arial Narrow",Inter,sans-serif;
}
.theme-arcade::before{position:fixed;z-index:0;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.014) 1px,transparent 1px),repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,0,0,.13) 4px);background-size:54px 54px,54px 54px,100% 4px;mask-image:linear-gradient(90deg,rgba(0,0,0,.85),transparent 78%);content:""}
.theme-arcade .app-chrome{height:62px;border:0;border-bottom:1px solid rgba(72,220,255,.48);background:linear-gradient(100deg,rgba(4,9,17,.98),rgba(9,22,36,.94) 65%,rgba(3,7,13,.98));box-shadow:0 2px 0 rgba(0,0,0,.9),0 9px 28px rgba(0,0,0,.5);backdrop-filter:none}.theme-arcade .app-chrome::after{position:absolute;right:0;bottom:-3px;width:34%;height:3px;background:linear-gradient(90deg,transparent,var(--arcade-cyan));box-shadow:0 0 13px rgba(72,220,255,.65);content:""}
.theme-arcade .brand-mark{width:34px;height:34px;border:1px solid #8aeaff;border-radius:1px;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);background:linear-gradient(145deg,#28cfff,#07528c);box-shadow:inset 1px 1px rgba(255,255,255,.45);filter:drop-shadow(4px 5px 0 #00111d);transform:skew(-5deg)}.theme-arcade .brand-button b{font-size:13px;font-weight:950;letter-spacing:.16em}.theme-arcade .brand-button small{color:#59b7df;letter-spacing:.28em}
.theme-arcade .chrome-button,.theme-arcade .sort-actions button{position:relative;border:1px solid rgba(98,181,222,.35);border-radius:0;clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px);background:linear-gradient(135deg,#13263a,#08111e);box-shadow:none;color:#91a9bb;font-weight:850;letter-spacing:.07em;text-transform:uppercase;transition:transform .14s ease,filter .14s ease,color .14s ease}.theme-arcade .chrome-button:hover,.theme-arcade .sort-actions button:hover:not(:disabled){border-color:var(--arcade-cyan);color:#fff;filter:brightness(1.45) drop-shadow(0 0 7px rgba(72,220,255,.26));transform:translateY(-1px) scale(1.035)}.theme-arcade .chrome-button.active{border-color:var(--arcade-cyan);background:linear-gradient(135deg,#114b6b,#092439);color:#dffaff}
.theme-arcade .lobby-shell{grid-template-columns:.78fr 1.22fr;gap:34px;padding:24px 20px}.theme-arcade .lobby-copy{z-index:2;padding-left:18px}.theme-arcade .lobby-copy::before{position:absolute;z-index:-1;top:-45px;left:-54px;width:210px;height:210px;border:1px solid rgba(72,220,255,.12);background:repeating-linear-gradient(135deg,rgba(72,220,255,.04) 0 2px,transparent 2px 10px);clip-path:polygon(0 18%,78% 0,100% 62%,28% 100%);content:"";transform:rotate(-7deg)}.theme-arcade .eyebrow{margin-bottom:14px!important;color:var(--arcade-cyan)!important;font-size:9px!important;font-weight:900;letter-spacing:.34em}.theme-arcade .lobby-copy h1,.theme-arcade .room-heading h1,.theme-arcade .result-screen h1,.theme-arcade .titlebar h1{font-family:Impact,"Arial Narrow",sans-serif;font-weight:900;text-transform:uppercase}.theme-arcade .lobby-copy h1{max-width:500px;font-size:clamp(58px,7vw,94px);line-height:.82;letter-spacing:-.035em;text-shadow:5px 6px 0 #071a29,-1px -1px 0 rgba(166,239,255,.45);transform:skew(-3deg)}.theme-arcade .lobby-copy h1 em,.theme-arcade .result-screen h1 em{color:var(--arcade-cyan);text-shadow:0 0 22px rgba(72,220,255,.35),5px 6px 0 #04263a}.theme-arcade .lobby-lead{max-width:390px;margin:28px 0 18px;padding-left:12px;border-left:3px solid var(--arcade-orange);color:#8797a7;font-size:12px;line-height:1.65;letter-spacing:.04em}.theme-arcade .feature-pills span{border-color:rgba(72,220,255,.24);border-radius:0;clip-path:polygon(5px 0,100% 0,calc(100% - 5px) 100%,0 100%);background:#0b1724;color:#7d9db0;font-weight:800;letter-spacing:.14em}.theme-arcade .decorative-tiles{margin-top:28px;filter:drop-shadow(0 14px 17px rgba(0,0,0,.46))}.theme-arcade .decorative-tiles i{border-radius:1px;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));box-shadow:inset 2px 2px #fff,0 5px 0 #6f8496}
.theme-arcade .entry-card{position:relative;padding:12px 28px 25px;border:1px solid rgba(89,201,246,.35);border-radius:0;clip-path:polygon(18px 0,100% 0,100% calc(100% - 20px),calc(100% - 20px) 100%,0 100%,0 18px);background:linear-gradient(145deg,rgba(17,31,47,.98),rgba(5,10,18,.99) 66%);box-shadow:none;filter:drop-shadow(10px 14px 0 rgba(0,0,0,.58)) drop-shadow(0 0 24px rgba(0,126,190,.08));transition:filter .18s ease}.theme-arcade .entry-card::after{position:absolute;top:0;right:0;width:36%;height:3px;background:linear-gradient(90deg,transparent,var(--arcade-cyan));box-shadow:0 0 12px rgba(72,220,255,.58);content:""}.theme-arcade .entry-tabs{display:flex;margin:0 -16px 22px;padding:5px 0 10px;gap:5px;flex-direction:column;border:0}.theme-arcade .entry-tabs button{position:relative;display:flex;height:76px;padding:0 24px 0 18px;gap:15px;align-items:center;border:1px solid rgba(112,151,179,.18);border-left:4px solid #496170;border-bottom:1px solid rgba(112,151,179,.18);clip-path:polygon(0 0,100% 0,calc(100% - 18px) 100%,0 100%);background:linear-gradient(100deg,rgba(31,46,61,.82),rgba(9,16,25,.68));color:#64798a;text-align:left;transition:transform .16s ease,filter .16s ease,opacity .16s ease,background .16s ease}.theme-arcade .entry-tabs button>b{display:block;min-width:43px;color:#3e5260;font-family:Impact,sans-serif;font-size:34px;font-style:italic}.theme-arcade .entry-tabs button>span{font-size:25px;font-weight:950;line-height:.9;letter-spacing:-.02em}.theme-arcade .entry-tabs button small{display:block;margin-top:8px;color:#567083;font-size:7px;font-weight:700;letter-spacing:.23em}.theme-arcade .entry-tabs button::after{position:absolute;right:9px;width:74px;height:130%;background:repeating-linear-gradient(135deg,transparent 0 8px,rgba(255,255,255,.04) 8px 10px);content:"";transform:skew(-10deg)}.theme-arcade .entry-tabs button.active{z-index:2;border-left-color:var(--arcade-cyan);background:linear-gradient(100deg,rgba(14,101,143,.82),rgba(8,27,42,.92) 70%);color:#f2fcff;filter:brightness(1.16) drop-shadow(7px 8px 0 rgba(0,0,0,.44)) drop-shadow(0 0 11px rgba(72,220,255,.2));transform:translateX(-8px) scale(1.018)}.theme-arcade .entry-tabs button.active>b,.theme-arcade .entry-tabs button.active small{color:#81e9ff}.theme-arcade .entry-tabs button:nth-child(2).active{border-left-color:var(--arcade-orange);background:linear-gradient(100deg,rgba(142,46,29,.78),rgba(41,16,15,.94) 70%);filter:brightness(1.16) drop-shadow(7px 8px 0 rgba(0,0,0,.44)) drop-shadow(0 0 11px rgba(255,101,58,.2))}.theme-arcade .entry-tabs button:nth-child(2).active>b,.theme-arcade .entry-tabs button:nth-child(2).active small{color:#ff9a7d}.theme-arcade .entry-tabs:has(button:hover) button:not(:hover){opacity:.46;filter:brightness(.65)}.theme-arcade .entry-tabs button:hover{z-index:3;filter:brightness(1.35) drop-shadow(7px 9px 0 rgba(0,0,0,.5));transform:translateX(-10px) scale(1.025)}
.theme-arcade .field-label{color:#7e94a5;font-size:9px;letter-spacing:.14em;text-transform:uppercase}.theme-arcade .lobby-input,.theme-arcade .settings-row input:not(.switch),.theme-arcade .chat-compose input{border:1px solid rgba(91,170,209,.3);border-radius:0;clip-path:polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px);background:#050d17;color:#f1fbff;box-shadow:inset 4px 0 rgba(72,220,255,.08)}.theme-arcade .lobby-input:focus,.theme-arcade .settings-row input:focus,.theme-arcade .chat-compose input:focus{border-color:var(--arcade-cyan);box-shadow:inset 4px 0 var(--arcade-cyan),0 0 13px rgba(72,220,255,.16)}.theme-arcade .lobby-room-input button{border-radius:0;clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)}
.theme-arcade .primary-cta,.theme-arcade .secondary-cta{position:relative;border-radius:0;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);font-weight:950;letter-spacing:.1em;text-transform:uppercase;transition:transform .14s,filter .14s}.theme-arcade .primary-cta{border-color:#68e5ff;background:linear-gradient(110deg,#0b9fd4,#075282);box-shadow:inset 0 1px rgba(255,255,255,.34),0 4px 0 #001c2e,0 0 18px rgba(38,200,255,.17)}.theme-arcade .entry-card>.primary-cta{height:53px;padding-inline:18px;font-size:13px}.theme-arcade .primary-cta:hover:not(:disabled),.theme-arcade .secondary-cta:hover:not(:disabled){filter:brightness(1.35) drop-shadow(0 0 8px rgba(72,220,255,.3));transform:translateY(-2px) scale(1.012)}.theme-arcade .secondary-cta{border-color:rgba(255,101,58,.48);background:linear-gradient(110deg,#6c291e,#321311);box-shadow:0 4px 0 #160604;color:#ffb29e}
.theme-arcade .room-code-card,.theme-arcade .ranking-card,.theme-arcade .modal-card,.theme-arcade .developer-panel,.theme-arcade .chat-panel,.theme-arcade .network-panel,.theme-arcade .hand{border-color:rgba(75,199,248,.34);border-radius:0;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);background:linear-gradient(145deg,rgba(17,31,47,.98),rgba(5,10,18,.985));box-shadow:inset 1px 1px rgba(172,237,255,.1),inset -2px -2px rgba(0,0,0,.45),5px 7px 0 rgba(0,0,0,.58),0 17px 38px rgba(0,0,0,.35)}.theme-arcade .room-code-card>strong{color:var(--arcade-yellow);font-family:Impact,sans-serif;font-size:28px;text-shadow:0 0 15px rgba(255,209,61,.25)}.theme-arcade .player-seat{border-radius:0;clip-path:polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px);background:linear-gradient(100deg,rgba(20,43,62,.82),rgba(6,14,24,.88));transition:transform .16s,filter .16s}.theme-arcade .player-seat:not(.empty):hover{filter:brightness(1.25);transform:translateX(4px)}.theme-arcade .player-avatar,.theme-arcade .mini-avatar{border-radius:0;clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px);background:linear-gradient(145deg,#24c9f3,#075084)}
.theme-arcade .titlebar{position:relative}.theme-arcade .titlebar h1{font-size:32px;letter-spacing:.015em;text-shadow:3px 4px 0 #001522;transform:skew(-4deg)}.theme-arcade .titlebar p{color:var(--arcade-cyan);letter-spacing:.3em}.theme-arcade .titlebar>span{padding:4px 10px;border-right:3px solid var(--arcade-orange);background:rgba(7,18,28,.72);color:#90a5b5;font-size:10px;letter-spacing:.06em}
.theme-arcade .board-panel{border:2px solid rgba(80,209,255,.5);border-radius:0;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);background:#06111d;box-shadow:inset 2px 2px rgba(179,239,255,.1),inset -4px -4px rgba(0,0,0,.58),5px 7px 0 #010307,0 0 24px rgba(25,177,236,.11);scrollbar-color:#147c9e #030811;scrollbar-width:thin}.theme-arcade .board-panel::-webkit-scrollbar{width:9px;height:9px}.theme-arcade .board-panel::-webkit-scrollbar-track{background:#030811}.theme-arcade .board-panel::-webkit-scrollbar-thumb{border:2px solid #030811;background:linear-gradient(135deg,#1fb6dc,#0a526d);box-shadow:inset 1px 1px rgba(190,246,255,.3)}.theme-arcade .board-panel::-webkit-scrollbar-corner{background:#030811}.theme-arcade .board{border-radius:0;background-color:#081522;background-image:linear-gradient(135deg,rgba(72,220,255,.035),transparent 34%),repeating-linear-gradient(0deg,transparent 0 calc(var(--cell-height) - 1px),rgba(81,166,201,.18) calc(var(--cell-height) - 1px) var(--cell-height)),repeating-linear-gradient(90deg,transparent 0 calc(var(--cell-width) - 1px),rgba(81,166,201,.18) calc(var(--cell-width) - 1px) var(--cell-width)),radial-gradient(rgba(81,205,255,.09) 1px,transparent 1px);background-size:auto,auto,auto,11px 11px}.theme-arcade .cell{border-color:rgba(92,177,211,.16)}.theme-arcade .cell:hover{background:linear-gradient(135deg,rgba(72,220,255,.13),rgba(72,220,255,.02));box-shadow:inset 0 0 12px rgba(72,220,255,.1)}
.theme-arcade .hand{filter:drop-shadow(0 10px 18px rgba(0,0,0,.35))}.theme-arcade .hand-toolbar{border-bottom-color:rgba(72,220,255,.24);background:linear-gradient(90deg,rgba(16,65,87,.46),transparent)}.theme-arcade .hand-toolbar strong{font-family:Impact,sans-serif;font-size:17px;letter-spacing:.08em;text-transform:uppercase}.theme-arcade .hand-cell{border-color:rgba(84,164,198,.15);background:rgba(4,12,21,.38)}.theme-arcade .tile{border-radius:2px;background:linear-gradient(135deg,#fff 0%,#e9f1f5 55%,#aabcc7 100%);box-shadow:inset 2px 2px rgba(255,255,255,.9),inset -2px -2px rgba(30,48,61,.18),2px 4px 0 #526875,0 7px 10px rgba(0,0,0,.4)}.theme-arcade .tile::after{border-radius:0;border-color:rgba(25,57,72,.13)}.theme-arcade .tile:hover{filter:brightness(1.12) drop-shadow(0 0 6px rgba(72,220,255,.22));transform:translateY(-2px) scale(1.02)}
.theme-arcade .game-action-dock{position:relative;padding:3px 0}.theme-arcade .large-action{width:190px;min-height:53px;border-radius:0;clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);font-family:"Bahnschrift Condensed","Arial Narrow",sans-serif;transition:transform .13s,filter .13s}.theme-arcade .large-action strong{font-size:14px;letter-spacing:.08em;text-transform:uppercase}.theme-arcade .large-action i{border-radius:0;clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)}.theme-arcade .draw-action{border-color:#ff815d;background:linear-gradient(110deg,#91331f,#42140e);box-shadow:inset 1px 1px rgba(255,205,189,.24),0 4px 0 #1a0502}.theme-arcade .commit-action{border-color:#63e2ff;background:linear-gradient(110deg,#0e9dcc,#064c7c);box-shadow:inset 1px 1px rgba(219,250,255,.3),0 4px 0 #001a2d}.theme-arcade .large-action:hover:not(:disabled){filter:brightness(1.38) drop-shadow(0 0 9px currentColor);transform:translateY(-2px) scale(1.025)}.theme-arcade .turn-indicator span{color:var(--arcade-cyan);letter-spacing:.34em}.theme-arcade .turn-indicator strong{font-size:11px;text-transform:uppercase}
.theme-arcade .modal-backdrop{background:rgba(0,3,7,.83);backdrop-filter:blur(3px)}.theme-arcade .modal-card{filter:drop-shadow(13px 16px 0 rgba(0,0,0,.62))}.theme-arcade .modal-heading h2,.theme-arcade .developer-heading h2{font-family:Impact,"Arial Narrow",sans-serif;font-size:28px;letter-spacing:.06em;text-transform:uppercase}.theme-arcade .modal-close{border-radius:0;clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px);background:#182739}.theme-arcade .settings-row{border-bottom-color:rgba(78,169,205,.16)}.theme-arcade .segmented{border-radius:0;background:#040b13}.theme-arcade .segmented button{border-radius:0;clip-path:polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%)}.theme-arcade .segmented button.active{background:#0874a8;color:#e8fbff;box-shadow:inset 0 2px #69e4ff}.theme-arcade .rules-grid article{border-radius:0;clip-path:polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px);background:linear-gradient(135deg,rgba(13,41,58,.68),rgba(4,12,21,.7))}.theme-arcade .rules-grid article>b{color:var(--arcade-yellow)}.theme-arcade .modal-enter-active .modal-card,.theme-arcade .modal-leave-active .modal-card{transition:transform .18s cubic-bezier(.2,.9,.2,1),opacity .14s linear}.theme-arcade .modal-enter-from .modal-card{transform:translateX(30px) skew(-2deg) scale(.97)}
.theme-arcade .developer-panel,.theme-arcade .chat-panel{animation:arcade-panel-in .17s cubic-bezier(.2,.9,.2,1)}@keyframes arcade-panel-in{from{opacity:0;transform:translateX(38px) skew(-2deg) scale(.98)}to{opacity:1;transform:none}}.theme-arcade .chat-list article p{border-radius:0;clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px);background:#10263a}.theme-arcade .chat-list article.mine p{border-color:rgba(72,220,255,.42);background:#075178}.theme-arcade .chat-compose button{border-radius:0;clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px);background:linear-gradient(135deg,#12a9d6,#075383)}
/* Tactile acrylic construction. Every raised surface uses the same upper-left light. */
.game.theme-arcade{--physical-top:#0d1821;--physical-top-2:#121f29;--physical-side:#03080c;--physical-highlight:rgba(198,238,248,.16);--physical-contact:rgba(0,0,0,.68);background-color:#070b10;background-image:repeating-linear-gradient(112deg,rgba(255,255,255,.009) 0 1px,transparent 1px 23px)}
.theme-arcade::before{opacity:.42;background-image:radial-gradient(rgba(190,216,224,.055) .55px,transparent .8px),repeating-linear-gradient(0deg,transparent 0 4px,rgba(0,0,0,.055) 5px);background-size:9px 9px,100% 5px;mask-image:none}
.theme-arcade .app-chrome{border-bottom-color:#020508;background:#0b1219;box-shadow:inset 0 1px rgba(210,244,251,.12),inset 0 -4px #03070a,0 4px 5px rgba(0,0,0,.62)}.theme-arcade .app-chrome::after{bottom:0;height:1px;background:#2a7f98;box-shadow:none;opacity:.72}
.theme-arcade .entry-card,.theme-arcade .room-code-card,.theme-arcade .ranking-card,.theme-arcade .modal-card,.theme-arcade .developer-panel,.theme-arcade .chat-panel,.theme-arcade .network-panel,.theme-arcade .hand{border-color:rgba(146,196,211,.2);background:linear-gradient(to bottom,var(--physical-top-2) 0 calc(100% - 5px),var(--physical-side) calc(100% - 5px) 100%);box-shadow:inset 1px 1px var(--physical-highlight),inset -3px 0 rgba(0,0,0,.3);filter:drop-shadow(3px 5px 3px var(--physical-contact))}.theme-arcade .entry-card::after{top:1px;height:1px;background:#46a5bf;box-shadow:none;opacity:.66}
.theme-arcade .board-panel{border-color:rgba(113,175,195,.38);background:linear-gradient(to bottom,#0b151d 0 calc(100% - 6px),#020609 calc(100% - 6px) 100%);box-shadow:inset 1px 1px rgba(215,244,250,.14),inset -4px 0 rgba(0,0,0,.38);filter:drop-shadow(4px 6px 3px rgba(0,0,0,.72))}.theme-arcade .board{background-color:#091620;background-image:repeating-linear-gradient(0deg,transparent 0 calc(var(--cell-height) - 1px),rgba(81,145,166,.17) calc(var(--cell-height) - 1px) var(--cell-height)),repeating-linear-gradient(90deg,transparent 0 calc(var(--cell-width) - 1px),rgba(81,145,166,.17) calc(var(--cell-width) - 1px) var(--cell-width)),radial-gradient(rgba(151,194,205,.045) .7px,transparent .9px);background-size:auto,auto,10px 10px;box-shadow:inset 2px 2px 3px rgba(197,231,239,.04),inset -3px -3px 4px rgba(0,0,0,.27)}
.theme-arcade .player-seat,.theme-arcade .rules-grid article,.theme-arcade .score-monitor,.theme-arcade .ranking-row{background:linear-gradient(to bottom,#111e27 0 calc(100% - 4px),#04090d calc(100% - 4px) 100%);box-shadow:inset 1px 1px rgba(207,239,247,.1),inset -2px 0 rgba(0,0,0,.25);filter:drop-shadow(2px 3px 2px rgba(0,0,0,.52))}
.theme-arcade .brand-mark,.theme-arcade .player-avatar,.theme-arcade .mini-avatar{background:linear-gradient(to bottom,#168bb0 0 calc(100% - 4px),#043247 calc(100% - 4px) 100%);box-shadow:inset 1px 1px rgba(225,250,255,.3),inset -2px 0 rgba(0,0,0,.28);filter:drop-shadow(2px 4px 2px rgba(0,0,0,.62))}
.theme-arcade .chrome-button,.theme-arcade .sort-actions button,.theme-arcade .primary-cta,.theme-arcade .secondary-cta,.theme-arcade .large-action,.theme-arcade .room-code-card button,.theme-arcade .modal-close,.theme-arcade .chat-compose button,.theme-arcade .dev-value-row button,.theme-arcade .joker-palette button{--button-top:#172630;--button-side:#050a0e;background:linear-gradient(to bottom,var(--button-top) 0 calc(100% - 4px),var(--button-side) calc(100% - 4px) 100%);box-shadow:inset 1px 1px rgba(218,244,250,.15),inset -2px 0 rgba(0,0,0,.28);filter:drop-shadow(2px 4px 2px rgba(0,0,0,.62));transform:translateY(0);transition:transform .13s ease,filter .13s ease,background .13s ease}.theme-arcade .primary-cta,.theme-arcade .commit-action,.theme-arcade .chat-compose button{--button-top:#087ba2;--button-side:#023248}.theme-arcade .secondary-cta,.theme-arcade .draw-action{--button-top:#743123;--button-side:#260b07}.theme-arcade .chrome-button:hover,.theme-arcade .sort-actions button:hover:not(:disabled),.theme-arcade .primary-cta:hover:not(:disabled),.theme-arcade .secondary-cta:hover:not(:disabled),.theme-arcade .large-action:hover:not(:disabled),.theme-arcade .room-code-card button:hover,.theme-arcade .modal-close:hover,.theme-arcade .chat-compose button:hover:not(:disabled){filter:brightness(1.1) drop-shadow(3px 6px 2px rgba(0,0,0,.62));transform:translate(-1px,-2px)}.theme-arcade .chrome-button:active,.theme-arcade .sort-actions button:active:not(:disabled),.theme-arcade .primary-cta:active:not(:disabled),.theme-arcade .secondary-cta:active:not(:disabled),.theme-arcade .large-action:active:not(:disabled),.theme-arcade .room-code-card button:active,.theme-arcade .modal-close:active,.theme-arcade .chat-compose button:active:not(:disabled){background:linear-gradient(to bottom,var(--button-top) 0 calc(100% - 1px),var(--button-side) calc(100% - 1px) 100%);filter:brightness(.97) drop-shadow(1px 1px 1px rgba(0,0,0,.55));transform:translate(1px,3px)}
.theme-arcade .entry-tabs button{--tab-top:#17242d;--tab-side:#05090d;padding-bottom:4px;background:linear-gradient(to bottom,var(--tab-top) 0 calc(100% - 5px),var(--tab-side) calc(100% - 5px) 100%);box-shadow:inset 1px 1px rgba(213,241,247,.12),inset -3px 0 rgba(0,0,0,.3);filter:drop-shadow(3px 5px 2px rgba(0,0,0,.58))}.theme-arcade .entry-tabs button.active{--tab-top:#125a73;--tab-side:#032632;filter:brightness(1.03) drop-shadow(3px 6px 2px rgba(0,0,0,.64));transform:translate(-7px,-1px) scale(1.012)}.theme-arcade .entry-tabs button:nth-child(2).active{--tab-top:#783122;--tab-side:#270b07;filter:brightness(1.03) drop-shadow(3px 6px 2px rgba(0,0,0,.64))}.theme-arcade .entry-tabs button:hover{filter:brightness(1.1) drop-shadow(4px 7px 2px rgba(0,0,0,.68));transform:translate(-9px,-2px) scale(1.018)}.theme-arcade .entry-tabs button:active{padding-bottom:1px;background:linear-gradient(to bottom,var(--tab-top) 0 calc(100% - 1px),var(--tab-side) calc(100% - 1px) 100%);filter:brightness(.98) drop-shadow(1px 2px 1px rgba(0,0,0,.55));transform:translate(-6px,3px) scale(1.008)}.theme-arcade .entry-tabs:has(button:hover) button:not(:hover){opacity:.62;filter:brightness(.78) drop-shadow(2px 3px 1px rgba(0,0,0,.48))}
.theme-arcade .segmented{padding:3px 3px 5px;border-color:rgba(129,176,191,.2);background:#050a0e;box-shadow:inset 1px 1px rgba(211,240,247,.06),inset -1px -1px rgba(0,0,0,.5)}.theme-arcade .segmented button{background:linear-gradient(to bottom,#111d25 0 calc(100% - 3px),#03070a calc(100% - 3px) 100%);box-shadow:inset 1px 1px rgba(213,241,247,.09);transform:translateY(0);transition:transform .12s,filter .12s}.theme-arcade .segmented button.active{background:linear-gradient(to bottom,#126886 0 calc(100% - 3px),#032431 calc(100% - 3px) 100%);box-shadow:inset 1px 1px rgba(225,248,253,.18);filter:drop-shadow(1px 2px 1px rgba(0,0,0,.55))}.theme-arcade .segmented button:active{transform:translateY(2px)}
.theme-arcade .lobby-input,.theme-arcade .settings-row input:not(.switch),.theme-arcade .chat-compose input{background:#080f15;box-shadow:inset 2px 3px 3px rgba(0,0,0,.5),inset -1px -1px rgba(181,220,231,.05)}.theme-arcade .switch{border-color:rgba(126,166,179,.3);background:#050a0e;box-shadow:inset 2px 2px 3px rgba(0,0,0,.6),1px 2px rgba(205,238,245,.04)}.theme-arcade .switch::after{box-shadow:inset 1px 1px rgba(255,255,255,.18),1px 2px 2px rgba(0,0,0,.65)}
.theme-arcade .tile{background:linear-gradient(to bottom,#e7ecec 0 calc(100% - 5px),#758791 calc(100% - 5px) 100%);box-shadow:inset 1px 1px rgba(255,255,255,.82),inset -2px 0 rgba(34,51,60,.15);filter:drop-shadow(2px 4px 2px rgba(0,0,0,.52))}.theme-arcade .tile:hover{filter:brightness(1.035) drop-shadow(3px 6px 2px rgba(0,0,0,.58));transform:translate(-1px,-2px) scale(1.01)}.theme-arcade .tile:active{background:linear-gradient(to bottom,#e7ecec 0 calc(100% - 2px),#758791 calc(100% - 2px) 100%);filter:drop-shadow(1px 2px 1px rgba(0,0,0,.5));transform:translate(1px,2px)}
.theme-arcade .chat-list article p{background:linear-gradient(to bottom,#132630 0 calc(100% - 3px),#050a0e calc(100% - 3px) 100%);box-shadow:inset 1px 1px rgba(211,241,248,.09);filter:drop-shadow(1px 2px 1px rgba(0,0,0,.48))}.theme-arcade .chat-list article.mine p{background:linear-gradient(to bottom,#125773 0 calc(100% - 3px),#03212d calc(100% - 3px) 100%)}
.theme-arcade .modal-backdrop{background:rgba(2,5,8,.86);backdrop-filter:none}.theme-arcade .modal-card{filter:drop-shadow(4px 6px 3px rgba(0,0,0,.74))}.theme-arcade .cell:hover{background:rgba(80,168,194,.09);box-shadow:inset 1px 1px rgba(182,225,235,.04)}
/* Quiet physical slabs: plain silhouettes, four explicit edge faces, matte fronts. */
.theme-arcade{--slab-edge:3px;--slab-front:#111b23;--slab-top:#293640;--slab-left:#222f38;--slab-right:#081017;--slab-bottom:#040a0f;--slab-contact:rgba(0,0,0,.58)}
.theme-arcade .brand-mark,.theme-arcade .chrome-button,.theme-arcade .sort-actions button,.theme-arcade .primary-cta,.theme-arcade .secondary-cta,.theme-arcade .large-action,.theme-arcade .room-code-card button,.theme-arcade .modal-close,.theme-arcade .chat-compose button,.theme-arcade .dev-value-row button,.theme-arcade .joker-palette button,.theme-arcade .entry-tabs button,.theme-arcade .entry-card,.theme-arcade .room-code-card,.theme-arcade .ranking-card,.theme-arcade .modal-card,.theme-arcade .developer-panel,.theme-arcade .chat-panel,.theme-arcade .network-panel,.theme-arcade .hand,.theme-arcade .board-panel,.theme-arcade .player-seat,.theme-arcade .rules-grid article,.theme-arcade .score-monitor,.theme-arcade .ranking-row,.theme-arcade .player-avatar,.theme-arcade .mini-avatar,.theme-arcade .segmented button,.theme-arcade .lobby-input,.theme-arcade .settings-row input:not(.switch),.theme-arcade .chat-compose input,.theme-arcade .chat-list article p,.theme-arcade .feature-pills span,.theme-arcade .decorative-tiles i{
  border:0!important;
  border-radius:2px!important;
  clip-path:none!important;
  background:
    linear-gradient(var(--slab-top),var(--slab-top)) top/100% var(--slab-edge) no-repeat,
    linear-gradient(var(--slab-left),var(--slab-left)) left/var(--slab-edge) 100% no-repeat,
    linear-gradient(var(--slab-right),var(--slab-right)) right/var(--slab-edge) 100% no-repeat,
    linear-gradient(var(--slab-bottom),var(--slab-bottom)) bottom/100% var(--slab-edge) no-repeat,
    linear-gradient(var(--slab-front),var(--slab-front)) center/100% 100% no-repeat!important;
  box-shadow:none!important;
  filter:drop-shadow(2px 3px 2px var(--slab-contact));
}
.theme-arcade .entry-card,.theme-arcade .room-code-card,.theme-arcade .ranking-card,.theme-arcade .modal-card,.theme-arcade .developer-panel,.theme-arcade .chat-panel,.theme-arcade .network-panel,.theme-arcade .hand,.theme-arcade .board-panel{--slab-front:#111b23;--slab-top:#2b3740;--slab-left:#222e36;--slab-right:#070e14;--slab-bottom:#03080c;filter:drop-shadow(3px 4px 2px rgba(0,0,0,.62))}
.theme-arcade .player-seat,.theme-arcade .rules-grid article,.theme-arcade .score-monitor,.theme-arcade .ranking-row{--slab-front:#15212a;--slab-top:#2d3941;--slab-left:#253139;--slab-right:#0b1319;--slab-bottom:#070c11}
.theme-arcade .chrome-button,.theme-arcade .sort-actions button,.theme-arcade .room-code-card button,.theme-arcade .modal-close,.theme-arcade .dev-value-row button,.theme-arcade .joker-palette button,.theme-arcade .segmented button{--slab-front:#1a2832;--slab-top:#34434d;--slab-left:#2b3a43;--slab-right:#0b141b;--slab-bottom:#060c11}
.theme-arcade .primary-cta,.theme-arcade .commit-action,.theme-arcade .chat-compose button{--slab-front:#0e7897;--slab-top:#45a6bc;--slab-left:#2f91a9;--slab-right:#075268;--slab-bottom:#043747;color:#f1fbfd}
.theme-arcade .secondary-cta,.theme-arcade .draw-action{--slab-front:#76382c;--slab-top:#a15b4b;--slab-left:#904a3d;--slab-right:#4c2019;--slab-bottom:#32130f;color:#ffe3dc}
.theme-arcade .brand-mark,.theme-arcade .player-avatar,.theme-arcade .mini-avatar{--slab-front:#187f9e;--slab-top:#50a9bc;--slab-left:#3695aa;--slab-right:#0b566c;--slab-bottom:#073a49}
.theme-arcade .entry-tabs button{--slab-front:#19252d;--slab-top:#344149;--slab-left:#2c3941;--slab-right:#0c141a;--slab-bottom:#070c10;padding-bottom:var(--slab-edge)}.theme-arcade .entry-tabs button.active{--slab-front:#155d72;--slab-top:#4a91a2;--slab-left:#378193;--slab-right:#0c3f4f;--slab-bottom:#082a35}.theme-arcade .entry-tabs button:nth-child(2).active{--slab-front:#77372b;--slab-top:#a45d4e;--slab-left:#924b3f;--slab-right:#4b211a;--slab-bottom:#30130f}
.theme-arcade .lobby-input,.theme-arcade .settings-row input:not(.switch),.theme-arcade .chat-compose input{--slab-front:#0a1117;--slab-top:#1c272e;--slab-left:#182229;--slab-right:#03070a;--slab-bottom:#020507;filter:none}.theme-arcade .chat-list article p{--slab-front:#182731;--slab-top:#30404a;--slab-left:#283842;--slab-right:#0b151c;--slab-bottom:#071016}.theme-arcade .chat-list article.mine p{--slab-front:#185970;--slab-top:#43899d;--slab-left:#34798e;--slab-right:#0c3c4d;--slab-bottom:#082833}
.theme-arcade .feature-pills span{--slab-edge:2px;--slab-front:#17232b;--slab-top:#2e3a42;--slab-left:#27333b;--slab-right:#0a1218;--slab-bottom:#060b0f}.theme-arcade .decorative-tiles i{--slab-front:#e7ebeb;--slab-top:#fff;--slab-left:#f4f6f6;--slab-right:#9aa9ae;--slab-bottom:#74848a}.theme-arcade .tile{--slab-edge:3px;--slab-front:#e7ebeb;--slab-top:#fff;--slab-left:#f5f7f7;--slab-right:#9aa9ae;--slab-bottom:#74848a;border:0;border-radius:2px;background:linear-gradient(var(--slab-top),var(--slab-top)) top/100% var(--slab-edge) no-repeat,linear-gradient(var(--slab-left),var(--slab-left)) left/var(--slab-edge) 100% no-repeat,linear-gradient(var(--slab-right),var(--slab-right)) right/var(--slab-edge) 100% no-repeat,linear-gradient(var(--slab-bottom),var(--slab-bottom)) bottom/100% var(--slab-edge) no-repeat,linear-gradient(var(--slab-front),var(--slab-front)) center/100% 100% no-repeat;box-shadow:none;filter:drop-shadow(2px 3px 2px rgba(0,0,0,.5))}
.theme-arcade .entry-card::after,.theme-arcade .entry-tabs button::after,.theme-arcade .app-chrome::after,.theme-arcade .lobby-copy::before{display:none}.theme-arcade .lobby-copy h1,.theme-arcade .titlebar h1{transform:none;text-shadow:2px 2px 0 rgba(0,0,0,.55)}.theme-arcade .lobby-copy h1 em,.theme-arcade .result-screen h1 em{color:#54c5df;text-shadow:2px 2px 0 rgba(0,0,0,.55)}.theme-arcade .app-chrome{background:#0d151c;box-shadow:inset 0 2px #28343c,inset 2px 0 #212c34,inset -2px 0 #070d12,inset 0 -2px #04090c,0 3px 2px rgba(0,0,0,.58)}.theme-arcade .board{background-color:#0c1921;background-image:repeating-linear-gradient(0deg,transparent 0 calc(var(--cell-height) - 1px),rgba(92,145,158,.16) calc(var(--cell-height) - 1px) var(--cell-height)),repeating-linear-gradient(90deg,transparent 0 calc(var(--cell-width) - 1px),rgba(92,145,158,.16) calc(var(--cell-width) - 1px) var(--cell-width)),radial-gradient(rgba(176,200,204,.035) .7px,transparent .9px);box-shadow:none}.theme-arcade .entry-tabs:has(button:hover) button:not(:hover){opacity:.78;filter:brightness(.9) drop-shadow(2px 3px 2px rgba(0,0,0,.5))}
.theme-arcade .chrome-button:hover,.theme-arcade .sort-actions button:hover:not(:disabled),.theme-arcade .primary-cta:hover:not(:disabled),.theme-arcade .secondary-cta:hover:not(:disabled),.theme-arcade .large-action:hover:not(:disabled),.theme-arcade .room-code-card button:hover,.theme-arcade .modal-close:hover,.theme-arcade .chat-compose button:hover:not(:disabled),.theme-arcade .entry-tabs button:hover,.theme-arcade .tile:hover{--slab-edge:4px;filter:brightness(1.04) drop-shadow(3px 5px 2px rgba(0,0,0,.6));transform:translateY(-1px)!important}
.theme-arcade .chrome-button:active,.theme-arcade .sort-actions button:active:not(:disabled),.theme-arcade .primary-cta:active:not(:disabled),.theme-arcade .secondary-cta:active:not(:disabled),.theme-arcade .large-action:active:not(:disabled),.theme-arcade .room-code-card button:active,.theme-arcade .modal-close:active,.theme-arcade .chat-compose button:active:not(:disabled),.theme-arcade .entry-tabs button:active,.theme-arcade .tile:active{--slab-edge:1px;filter:brightness(.98) drop-shadow(1px 1px 1px rgba(0,0,0,.48));transform:translateY(2px)!important}
.theme-arcade .modal-backdrop{background:rgba(4,7,10,.84)}.theme-arcade .modal-card{filter:drop-shadow(3px 4px 2px rgba(0,0,0,.68))}.theme-arcade .segmented{border-radius:2px;background:#070c10;box-shadow:inset 2px 2px 2px rgba(0,0,0,.55),inset -1px -1px rgba(181,213,220,.05)}
.theme-arcade button:not(.brand-button),.theme-arcade select{--slab-edge:3px;--slab-front:#1a2832;--slab-top:#34434d;--slab-left:#2b3a43;--slab-right:#0b141b;--slab-bottom:#060c11;border:0!important;border-radius:2px!important;clip-path:none!important;background:linear-gradient(var(--slab-top),var(--slab-top)) top/100% var(--slab-edge) no-repeat,linear-gradient(var(--slab-left),var(--slab-left)) left/var(--slab-edge) 100% no-repeat,linear-gradient(var(--slab-right),var(--slab-right)) right/var(--slab-edge) 100% no-repeat,linear-gradient(var(--slab-bottom),var(--slab-bottom)) bottom/100% var(--slab-edge) no-repeat,linear-gradient(var(--slab-front),var(--slab-front)) center/100% 100% no-repeat!important;box-shadow:none!important;filter:drop-shadow(2px 3px 2px rgba(0,0,0,.58))}.theme-arcade button:not(.brand-button):hover:not(:disabled){--slab-edge:4px;filter:brightness(1.04) drop-shadow(3px 5px 2px rgba(0,0,0,.6));transform:translateY(-1px)}.theme-arcade button:not(.brand-button):active:not(:disabled){--slab-edge:1px;filter:brightness(.98) drop-shadow(1px 1px 1px rgba(0,0,0,.48));transform:translateY(2px)}
.theme-arcade .primary-cta,.theme-arcade .commit-action,.theme-arcade .chat-compose button{--slab-front:#0e7897!important;--slab-top:#45a6bc!important;--slab-left:#2f91a9!important;--slab-right:#075268!important;--slab-bottom:#043747!important}.theme-arcade .secondary-cta,.theme-arcade .draw-action{--slab-front:#76382c!important;--slab-top:#a15b4b!important;--slab-left:#904a3d!important;--slab-right:#4c2019!important;--slab-bottom:#32130f!important}.theme-arcade .entry-tabs button.active{--slab-front:#155d72!important;--slab-top:#4a91a2!important;--slab-left:#378193!important;--slab-right:#0c3f4f!important;--slab-bottom:#082a35!important}.theme-arcade .entry-tabs button:nth-child(2).active{--slab-front:#77372b!important;--slab-top:#a45d4e!important;--slab-left:#924b3f!important;--slab-right:#4b211a!important;--slab-bottom:#30130f!important}.theme-arcade .segmented button.active{--slab-front:#176b84!important;--slab-top:#4a97a9!important;--slab-left:#388899!important;--slab-right:#0c4657!important;--slab-bottom:#082f3b!important}
.theme-arcade .switch{width:35px;height:20px;border:0;border-radius:2px;background:#060b0f;box-shadow:inset 0 2px #18242b,inset 2px 0 #141f25,inset -2px 0 #020507,inset 0 -2px #010304;filter:drop-shadow(1px 1px 1px rgba(0,0,0,.48))}.theme-arcade .switch::after{top:4px;left:4px;width:12px;height:12px;border-radius:1px;background:#687983;box-shadow:inset 1px 1px rgba(255,255,255,.18),inset -1px -1px rgba(0,0,0,.25),1px 2px 1px rgba(0,0,0,.55)}.theme-arcade .switch:checked{background:#0b3d4c;box-shadow:inset 0 2px #2f7181,inset 2px 0 #245f70,inset -2px 0 #062732,inset 0 -2px #041b23}.theme-arcade .switch:checked::after{left:19px;background:#b8dfe7}.theme-arcade .chat-button b,.theme-arcade .player-seat span,.theme-arcade .ranking-row>strong small{border-radius:2px}
.theme-arcade button:not(.brand-button),.theme-arcade select,.theme-arcade .entry-card,.theme-arcade .room-code-card,.theme-arcade .ranking-card,.theme-arcade .modal-card,.theme-arcade .developer-panel,.theme-arcade .chat-panel,.theme-arcade .network-panel,.theme-arcade .hand,.theme-arcade .board-panel,.theme-arcade .player-seat,.theme-arcade .rules-grid article,.theme-arcade .score-monitor,.theme-arcade .ranking-row,.theme-arcade .player-avatar,.theme-arcade .mini-avatar,.theme-arcade .lobby-input,.theme-arcade .settings-row input:not(.switch),.theme-arcade .chat-compose input,.theme-arcade .chat-list article p,.theme-arcade .feature-pills span,.theme-arcade .decorative-tiles i,.theme-arcade .tile{filter:drop-shadow(2px 2px 1px rgba(0,0,0,.58))}
.theme-arcade button:not(.brand-button):hover:not(:disabled),.theme-arcade .tile:hover{filter:brightness(1.04) drop-shadow(2px 3px 1px rgba(0,0,0,.6));transform:translateY(-1px)!important}.theme-arcade button:not(.brand-button):active:not(:disabled),.theme-arcade .tile:active{filter:brightness(.98) drop-shadow(1px 1px 0 rgba(0,0,0,.48));transform:translateY(1px)!important}
.theme-arcade .entry-tabs button,.theme-arcade .entry-tabs button.active{transform:none!important}.theme-arcade .entry-tabs button:hover,.theme-arcade .entry-tabs button.active:hover{transform:translateY(-1px)!important}.theme-arcade .entry-tabs button:active,.theme-arcade .entry-tabs button.active:active{transform:translateY(1px)!important}
.join-fields{display:grid;grid-template-rows:0fr;opacity:0;transform:translateY(-4px);transition:grid-template-rows .24s cubic-bezier(.2,.8,.2,1),opacity .16s ease,transform .24s cubic-bezier(.2,.8,.2,1)}.join-fields.open{grid-template-rows:1fr;opacity:1;transform:none}.join-fields>div{min-height:0;overflow:hidden}.join-fields .room-label{padding-top:15px}
.lobby-info-card{box-sizing:border-box;padding:28px;border:1px solid rgba(176,211,251,.24);border-radius:3px;background:#111f38;box-shadow:0 4px 0 #060d1b,0 8px 16px rgba(0,0,0,.25)}.lobby-info-card .lobby-lead{margin:18px 0 22px}.lobby-info-list{display:grid;gap:7px}.lobby-info-list>div{display:flex;min-height:34px;padding:0 11px;gap:12px;align-items:center;border-left:2px solid #55c8eb;background:rgba(8,18,31,.52)}.lobby-info-list b{color:#5fcff2;font-size:10px;letter-spacing:.12em}.lobby-info-list span{color:#a1b2c4;font-size:10px;font-weight:750;letter-spacing:.08em}.lobby-table-mark{display:flex;margin-top:22px;align-items:end}.lobby-table-mark i{display:grid;width:35px;height:48px;margin-right:4px;place-items:center;border-radius:2px;background:#e7ecec;box-shadow:0 3px 0 #73858c;color:#df4359;font-size:17px;font-style:normal;font-weight:900}.lobby-table-mark i:nth-child(2){color:#2789eb}.lobby-table-mark i:nth-child(3){color:#d97b24}.lobby-table-mark i:nth-child(4){color:#7c3aed}
.theme-arcade{font-family:"Bahnschrift","Segoe UI",Arial,sans-serif}.theme-arcade .lobby-copy h1,.theme-arcade .room-heading h1,.theme-arcade .result-screen h1,.theme-arcade .titlebar h1,.theme-arcade .modal-heading h2,.theme-arcade .developer-heading h2{font-family:"Arial Black","Segoe UI Black","Segoe UI",Arial,sans-serif;font-stretch:normal}.theme-arcade .lobby-info-card{--slab-edge:3px;--slab-front:#111b23;--slab-top:#2b3740;--slab-left:#222e36;--slab-right:#070e14;--slab-bottom:#03080c;border:0;border-radius:2px;background:linear-gradient(var(--slab-top),var(--slab-top)) top/100% var(--slab-edge) no-repeat,linear-gradient(var(--slab-left),var(--slab-left)) left/var(--slab-edge) 100% no-repeat,linear-gradient(var(--slab-right),var(--slab-right)) right/var(--slab-edge) 100% no-repeat,linear-gradient(var(--slab-bottom),var(--slab-bottom)) bottom/100% var(--slab-edge) no-repeat,linear-gradient(var(--slab-front),var(--slab-front)) center/100% 100% no-repeat;box-shadow:none;filter:drop-shadow(2px 2px 1px rgba(0,0,0,.58))}.theme-arcade .lobby-info-card h1{font-size:clamp(37px,4.6vw,58px);line-height:.92;letter-spacing:-.035em}.theme-arcade .lobby-info-list>div{border-left-color:#3f98ae;background:#0c151c}.theme-arcade .lobby-table-mark i{--slab-edge:2px;background:linear-gradient(#fff,#fff) top/100% var(--slab-edge) no-repeat,linear-gradient(#f5f7f7,#f5f7f7) left/var(--slab-edge) 100% no-repeat,linear-gradient(#9aa9ae,#9aa9ae) right/var(--slab-edge) 100% no-repeat,linear-gradient(#74848a,#74848a) bottom/100% var(--slab-edge) no-repeat,linear-gradient(#e7ebeb,#e7ebeb) center/100% 100% no-repeat;box-shadow:none;filter:drop-shadow(2px 2px 1px rgba(0,0,0,.5))}
.board-frame{box-sizing:border-box;width:min(calc(var(--board-width) + 14px),calc(100vw - 38px));height:calc(var(--board-height) + 14px);margin:0 auto;padding:7px;border-radius:3px;background:#152440;box-shadow:inset 0 2px rgba(255,255,255,.12),inset 2px 0 rgba(255,255,255,.06),inset -3px 0 #071022,inset 0 -3px #050b17,0 4px 3px rgba(0,0,0,.42);transition:width .42s cubic-bezier(.2,.8,.2,1),height .42s cubic-bezier(.2,.8,.2,1)}.board-recess{box-sizing:border-box;width:100%;height:100%;overflow:auto;border-radius:1px;background:#050b12;box-shadow:inset 3px 3px 4px rgba(0,0,0,.72),inset -1px -1px rgba(170,211,225,.06);scrollbar-color:rgba(20,124,158,.9) #030811;scrollbar-width:thin}.board-recess::-webkit-scrollbar{width:9px;height:9px}.board-recess::-webkit-scrollbar-track{background:#030811}.board-recess::-webkit-scrollbar-thumb{border:2px solid #030811;background:#147c9e}.board-recess::-webkit-scrollbar-corner{background:#030811}
.theme-arcade .board-frame{--frame-edge:3px;border:0;border-radius:2px;background:linear-gradient(#34434b,#34434b) top/100% var(--frame-edge) no-repeat,linear-gradient(#2a3941,#2a3941) left/var(--frame-edge) 100% no-repeat,linear-gradient(#081117,#081117) right/var(--frame-edge) 100% no-repeat,linear-gradient(#040a0e,#040a0e) bottom/100% var(--frame-edge) no-repeat,#18242c;box-shadow:none;filter:drop-shadow(2px 2px 1px rgba(0,0,0,.62))}.theme-arcade .board-recess{background:#050b10;box-shadow:inset 4px 4px 5px rgba(0,0,0,.78),inset -2px -2px rgba(151,198,210,.055)}
.theme-arcade .board{background-color:#0c1921;background-image:radial-gradient(rgba(176,200,204,.035) .7px,transparent .9px);background-size:10px 10px;box-shadow:inset 1px 0 rgba(92,145,158,.18),inset 0 1px rgba(92,145,158,.18)}
.theme-arcade .cell,.theme-arcade .cell.group-invalid,.theme-arcade .cell.group-invalid-start,.theme-arcade .cell.group-invalid-end{border:0;border-radius:0;box-shadow:inset -1px -1px rgba(92,145,158,.18)}.theme-arcade .cell:hover{box-shadow:inset -1px -1px rgba(92,145,158,.18),inset 1px 1px rgba(72,220,255,.09)}
.hand-scroll{max-height:none;overflow:visible;scrollbar-width:none}.hand-grid{box-sizing:border-box}.hand-cell{box-sizing:border-box}.tile .number{font-family:Arial,"Microsoft YaHei",sans-serif;font-weight:700;letter-spacing:0;transform:none}
.drag-ghost-strip{align-items:center;transform:scale(1.025);transform-origin:calc(var(--tile-width) / 2) center}.drag-ghost-strip .drag-ghost-tile{margin:0;transform:rotate(2deg);transform-origin:center}.board{position:relative}.cell.group-invalid::before{opacity:0!important;border:0!important;animation:none!important}.invalid-group-frame{position:absolute;z-index:12;box-sizing:border-box;border:2px solid #ff4964;border-radius:4px;background:rgba(255,44,78,.035);box-shadow:inset 0 0 8px rgba(255,44,78,.13);pointer-events:none;transform:scale(1)}.invalid-frame-enter-active{transform-origin:left top;transition:transform 260ms ease,opacity 220ms ease}.invalid-frame-leave-active{transform-origin:right bottom;transition:transform 260ms ease,opacity 220ms ease}.invalid-frame-enter-from,.invalid-frame-leave-to{opacity:0;transform:scale(.06)}
.turn-progress{position:relative;width:150px;height:5px;margin-top:7px;background:#071016;box-shadow:inset 1px 1px 1px rgba(0,0,0,.72),inset -1px -1px rgba(167,207,218,.07)}.turn-progress i{display:block;width:100%;height:100%;background:#38a7c2;box-shadow:inset 0 1px rgba(208,246,255,.18);transition:width .25s linear,background-color .18s ease}.turn-progress b{position:absolute;right:0;bottom:7px;color:#74909c;font-size:7px;font-weight:800;line-height:1}.turn-progress.urgent i{background:#df5a42}.turn-progress.urgent b{color:#ef8a74}
.turn-notice{position:fixed;z-index:180;top:74px;left:50%;padding:9px 15px;border:1px solid rgba(111,204,228,.38);border-radius:3px;background:#13232c;color:#e8f7fa;box-shadow:inset 2px 2px rgba(211,244,250,.12),inset -2px -2px rgba(0,0,0,.3),0 4px 0 #050a0e,0 10px 22px rgba(0,0,0,.32);font-size:11px;font-weight:800;letter-spacing:.04em;pointer-events:none;transform:translateX(-50%)}.turn-notice-enter-active,.turn-notice-leave-active{transition:opacity .18s ease,transform .22s cubic-bezier(.2,.8,.2,1)}.turn-notice-enter-from,.turn-notice-leave-to{opacity:0;transform:translate(-50%,-9px)}
.game.turn-warning::after{position:fixed;z-index:170;inset:0;box-shadow:inset 0 0 48px 8px rgba(214,48,52,.3),inset 0 0 110px 20px rgba(130,18,25,.16);pointer-events:none;content:"";animation:turn-warning-breathe 2s ease-in-out infinite}@keyframes turn-warning-breathe{50%{box-shadow:inset 0 0 64px 11px rgba(234,68,68,.42),inset 0 0 128px 25px rgba(130,18,25,.22)}}
.page-transition{position:fixed;z-index:300;inset:0;overflow:hidden;pointer-events:auto;isolation:isolate}.page-transition i{--band-front:#101820;--band-top:#31404a;--band-left:#27353e;--band-right:#080e13;--band-bottom:#04080b;position:absolute;top:-20vh;left:-12vw;width:34vw;height:140vh;border-radius:1px;background:linear-gradient(var(--band-top),var(--band-top)) top/100% 3px no-repeat,linear-gradient(var(--band-left),var(--band-left)) left/3px 100% no-repeat,linear-gradient(var(--band-right),var(--band-right)) right/3px 100% no-repeat,linear-gradient(var(--band-bottom),var(--band-bottom)) bottom/100% 3px no-repeat,linear-gradient(var(--band-front),var(--band-front)) center/100% 100% no-repeat;filter:drop-shadow(3px 3px 1px rgba(0,0,0,.55));transform:translateX(150vw) skewX(-19deg);animation:route-band-sweep 560ms cubic-bezier(.76,0,.24,1) both}.page-transition i:nth-child(2){--band-front:#263640;--band-top:#455861;--band-left:#394b54;--band-right:#111c22;--band-bottom:#0a1217;left:13vw;animation-delay:30ms}.page-transition i:nth-child(3){--band-front:#1b6071;--band-top:#3b8290;--band-left:#2d7483;--band-right:#0c3944;--band-bottom:#072a32;left:38vw;animation-delay:60ms}.page-transition i:nth-child(4){--band-front:#182832;--band-top:#354852;--band-left:#2b3d47;--band-right:#09141a;--band-bottom:#050d12;left:63vw;animation-delay:90ms}.page-transition i:nth-child(5){--band-front:#080d12;--band-top:#253039;--band-left:#1b262e;--band-right:#020406;--band-bottom:#010203;left:88vw;animation-delay:120ms}@keyframes route-band-sweep{0%{transform:translateX(150vw) skewX(-19deg)}36%,68%{transform:translateX(-10vw) skewX(-19deg)}100%{transform:translateX(-165vw) skewX(-19deg)}}
.language-en .lobby-info-card h1{font-size:clamp(34px,4.2vw,52px);letter-spacing:-.025em}.language-en .entry-tabs button>span{font-size:22px;letter-spacing:.015em}.language-en .entry-tabs button small{font-size:8px;letter-spacing:.12em}.language-en .lobby-lead{font-size:12px;line-height:1.55}.language-en .settings-modal{width:min(530px,100%)}.language-en .settings-row strong{font-size:10px;letter-spacing:.025em}.language-en .settings-row small{max-width:230px;line-height:1.3}.language-en .large-action{width:205px}.language-en .large-action strong{font-size:12px}.language-en .large-action small{font-size:7px}.language-en .room-heading h1{font-size:38px;letter-spacing:-.02em}
@media(max-width:760px){.theme-arcade .lobby-shell{gap:24px;padding:24px 4px}.theme-arcade .lobby-copy{padding-left:5px}.theme-arcade .lobby-copy h1{font-size:58px}.theme-arcade .entry-tabs button{height:66px}.theme-arcade .entry-tabs button>span{font-size:21px}.theme-arcade .entry-card{padding-inline:20px}.theme-arcade .large-action{width:100%}}
@media(max-width:760px){.game-action-dock{grid-template-columns:1fr 1fr;gap:8px}.turn-actions-left{width:100%;flex-direction:column;align-items:stretch;gap:6px}.turn-actions-left .large-action,.theme-arcade .turn-actions-left .large-action,.turn-actions-left .revert-action{box-sizing:border-box;width:100%;min-width:0}.turn-indicator{display:none}.large-action{width:100%;min-width:0}.large-action small{white-space:normal}.chat-panel,.developer-panel{right:8px;width:min(286px,calc(100vw - 16px))}}
@media(max-width:760px){.theme-arcade .lobby-info-card{padding:20px}.theme-arcade .lobby-info-card h1{font-size:40px}.theme-arcade.language-en .lobby-info-card h1{font-size:36px}.language-en .chrome-actions{gap:4px}.language-en .chrome-button{padding-inline:7px;font-size:9px}.language-en .settings-row{gap:12px}.language-en .settings-row small{max-width:180px}.board-frame{width:min(calc(var(--board-width) + 14px),calc(100vw - 26px))}}
@media(max-width:480px){.brand-button>span:last-child{display:none}.chrome-actions{gap:4px}.chrome-button{padding-inline:6px}.lobby-info-card{padding:18px}.lobby-info-list>div{min-height:31px}.lobby-table-mark{margin-top:16px}}
@media(prefers-reduced-motion:reduce){.board-frame,.board-recess,.board,.hand,.tile,.cell::before,.cell::after{transition:none!important}.page-transition{display:none}}

/* Readable system typography and restrained luminous emphasis. */
.game,.theme-arcade{font-family:"Microsoft YaHei","Segoe UI",Arial,sans-serif;font-stretch:normal}
.theme-arcade .room-code-card>strong,.room-code,.room-code-card>strong,.chat-panel,.chat-compose input{font-family:"Microsoft YaHei","Segoe UI",Arial,sans-serif}
.room-code-card,.room-code-wrap,.theme-arcade .room-code-card{filter:drop-shadow(0 0 5px rgba(83,194,226,.18))}
.room-code-card>strong,.room-code{text-shadow:0 0 9px rgba(97,218,247,.27)}
.lobby-copy h1,.room-heading h1,.result-screen h1,.titlebar h1,.modal-heading h2,.developer-heading h2{text-shadow:0 0 10px rgba(109,208,235,.12),2px 2px 0 rgba(0,0,0,.5)}
.game{background-attachment:fixed}
.game::before{position:fixed}

/* Larger chat surface, compact message bubbles, and a quiet unread edge cue. */
.chat-panel{width:min(370px,calc(100vw - 24px));height:min(620px,calc(100vh - 84px));padding:18px}
.chat-list{gap:12px;margin-top:16px}
.chat-list article{width:fit-content;max-width:92%}
.chat-list article>div{margin-bottom:5px}
.chat-list article strong{font-size:11px}
.chat-list article time{font-size:9px}
.chat-list article p{box-sizing:border-box;width:fit-content;max-width:100%;padding:10px 12px;font-size:13px;line-height:1.55;white-space:pre-wrap}
.chat-empty strong{font-size:13px}.chat-empty span{font-size:10px}
.chat-compose{grid-template-columns:1fr 42px;gap:8px}.chat-compose input,.chat-compose button{height:42px}.chat-compose input{font-size:13px}
.chat-button.unread:not(.active){filter:drop-shadow(0 0 3px rgba(250,204,72,.72)) drop-shadow(0 0 7px rgba(250,204,72,.3))}
.chat-button.unread:not(.active)::after{position:absolute;inset:1px;border:1px solid rgba(250,204,72,.45);border-radius:2px;pointer-events:none;content:""}

/* Physical drag response: a quick single-tile sway and firm chained follow-through. */
.drag-ghost-strip{translate:var(--pickup-x,0) var(--pickup-y,0);transform:rotate(var(--drag-tilt,0deg)) scale(1.035);opacity:1;transition:translate 165ms cubic-bezier(.2,.78,.2,1),transform 86ms cubic-bezier(.18,.72,.24,1),opacity 55ms linear}
.drag-ghost-strip .drag-ghost-tile{transform:rotate(2.2deg);transition:transform 90ms cubic-bezier(.2,.75,.3,1)}
.drag-ghost-strip.stack{transform:scale(1.025)}
.drag-ghost-strip.stack .drag-ghost-tile{transform:translate(var(--drag-lag-x,0),var(--drag-lag-y,0)) rotate(2deg);transition:transform 190ms cubic-bezier(.18,.72,.22,1)}
.drag-ghost-strip.hidden{opacity:0}
.drag-ghost-strip .drag-ghost-tile.joining-drag{translate:var(--join-x,0) var(--join-y,0);opacity:var(--join-opacity,1);transition:translate 190ms cubic-bezier(.2,.78,.2,1),opacity 145ms ease,transform 190ms cubic-bezier(.18,.72,.22,1)}
.hand.layout-animating .tile{filter:none!important}
.game.board-geometry-animating .tile:not(.drag-ghost-tile){transition:none!important}
.game.board-geometry-animating .board-recess{overflow:hidden!important}
.theme-arcade .tile,.theme-arcade .tile:hover,.theme-arcade .tile:active,.drag-ghost-tile.settling-drag{filter:none!important}
.drag-ghost-tile.settling-drag{transform:none!important;transition:none!important}
.snapshot-restoring [data-tile-id]{opacity:0!important}
.room-settings-modal{max-width:590px}.room-settings-readonly{margin:0 0 12px;padding:9px 11px;border:1px solid rgba(250,204,21,.26);border-radius:4px;background:rgba(95,70,13,.22);color:#e9ce83;font-size:9px;line-height:1.45}.room-settings-modal .segmented{flex-wrap:wrap;justify-content:flex-end}.room-settings-modal .segmented button:disabled{opacity:.72;cursor:default}
.theme-arcade .large-action,.theme-arcade .large-action:hover:not(:disabled),.theme-arcade .large-action:active:not(:disabled),.theme-arcade .large-action:disabled{filter:none!important;box-shadow:0 3px 2px rgba(0,0,0,.52)!important}
.chat-list article.mine{display:flex;margin-right:0;margin-left:auto;align-items:flex-end;align-self:flex-end;flex-direction:column}
.chat-list article.mine>div,.chat-list article.mine>p{align-self:flex-end}

/* One continuous raised slab frames the recessed table, with no corner joins. */
.board-frame{position:relative;width:min(calc(var(--board-width) + 28px),calc(100vw - 38px));height:calc(var(--board-height) + 28px);padding:14px}
.theme-arcade .board-frame{--slab-edge:4px;--slab-front:#1a2831;--slab-top:#41515b;--slab-left:#34464f;--slab-right:#091219;--slab-bottom:#040a0e;border:0;border-radius:2px;background:linear-gradient(var(--slab-top),var(--slab-top)) top/100% var(--slab-edge) no-repeat,linear-gradient(var(--slab-left),var(--slab-left)) left/var(--slab-edge) 100% no-repeat,linear-gradient(var(--slab-right),var(--slab-right)) right/var(--slab-edge) 100% no-repeat,linear-gradient(var(--slab-bottom),var(--slab-bottom)) bottom/100% var(--slab-edge) no-repeat,linear-gradient(var(--slab-front),var(--slab-front)) center/100% 100% no-repeat;box-shadow:none;filter:drop-shadow(2px 3px 2px rgba(0,0,0,.5))}
.theme-arcade .board-recess{background:#050b10;box-shadow:inset 3px 3px 4px rgba(0,0,0,.66),inset -1px -1px rgba(151,198,210,.045)}
.board .cell:has(.tile){z-index:40}.board .cell:has(.tile:hover){z-index:55}.board .invalid-group-frame{z-index:60}
.hand-cell{z-index:auto}.hand-cell>.tile{z-index:2}.hand-cell>.tile:hover{z-index:55}.hand.layout-animating .hand-cell{z-index:auto!important}
.theme-arcade .board .cell>.tile,.theme-arcade .hand-cell>.tile{transform:translateY(-1px);transition:filter .2s,opacity .2s,transform 130ms cubic-bezier(.2,.75,.25,1)}
.theme-arcade .board .cell>.tile:hover,.theme-arcade .hand-cell>.tile:hover{transform:translateY(-3px)!important}
.theme-arcade .board .cell>.tile:active,.theme-arcade .hand-cell>.tile:active{transform:translateY(-1px)!important}
.grid-construction{position:absolute;z-index:5;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.construction-line{fill:none;stroke:rgba(112,168,185,.28);stroke-width:1;vector-effect:non-scaling-stroke;stroke-dasharray:1;stroke-dashoffset:1;animation:grid-line-draw 650ms cubic-bezier(.22,.72,.25,1) var(--construction-delay) both}
.construction-dot{fill:rgba(145,194,205,.34);opacity:0;transform:scale(.42);transform-box:fill-box;transform-origin:center;animation:grid-dot-build 180ms cubic-bezier(.2,.76,.25,1) var(--construction-delay) both}
.grid-construction.complete .construction-line{animation:none;stroke-dashoffset:0}
.grid-construction.complete .construction-dot{animation:none;opacity:.34;transform:scale(1)}
.board.construction-surface{background-image:none!important}
.board.construction-surface .cell{border-color:transparent!important;box-shadow:none!important}
@keyframes grid-line-draw{to{stroke-dashoffset:0}}
@keyframes grid-dot-build{0%{opacity:0;transform:scale(.42)}72%{opacity:.39;transform:scale(1.08)}100%{opacity:.34;transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.drag-ghost-strip,.drag-ghost-strip .drag-ghost-tile{transition:none!important;transform:none!important}.construction-line{animation:none;stroke-dashoffset:0}.construction-dot{animation:none;opacity:.34;transform:scale(1)}}
@media(max-width:760px){.chat-panel{right:8px;width:min(350px,calc(100vw - 16px))}.board-frame{width:min(calc(var(--board-width) + 28px),calc(100vw - 26px))}}

/* The validation lab is a hidden per-match mode, revealed from the left. */
.developer-panel{right:auto;bottom:12px;left:12px;width:clamp(330px,27vw,420px);height:calc(100vh - 82px);max-height:none;padding:30px 22px 28px;animation:developer-panel-in-left .22s cubic-bezier(.2,.8,.2,1)}
.theme-arcade .developer-panel{animation:developer-panel-in-left .18s cubic-bezier(.2,.9,.2,1)}
@keyframes developer-panel-in-left{from{opacity:0;transform:translateX(-24px) scale(.985)}to{opacity:1;transform:none}}

/* A restrained RGB edge marks the board while developer mode is active. */
.board-frame.developer-rgb-board::after{position:absolute;z-index:75;inset:-4px;padding:3px;border-radius:4px;background:linear-gradient(90deg,#f05a67,#f39a3d,#f0d84d,#45c987,#40bce8,#627bf2,#d15bd2,#f05a67);background-size:300% 100%;pointer-events:none;content:"";-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:developer-rgb-edge 4.6s linear infinite;filter:drop-shadow(0 0 3px rgba(82,190,225,.34))}
@keyframes developer-rgb-edge{to{background-position:300% 0}}

.developer-unlock-flash{position:fixed;z-index:340;inset:0;pointer-events:none;background:#edfaff;animation:developer-unlock-flash 420ms ease-out both}
@keyframes developer-unlock-flash{0%{opacity:0}20%{opacity:.72}100%{opacity:0}}

.developer-usage-notice{position:fixed;z-index:440;top:82px;left:50%;display:grid;box-sizing:border-box;width:min(620px,calc(100vw - 32px));min-height:76px;padding:14px 22px;grid-template-columns:54px 1fr;gap:15px;align-items:center;border-radius:4px;background:#111b23;box-shadow:inset 3px 3px #2d3b45,inset -3px -3px #050a0e,0 7px 0 #020507,0 14px 24px rgba(0,0,0,.52);pointer-events:none;transform:translateX(-50%)}
.developer-usage-notice::before{position:absolute;z-index:-1;inset:-4px;padding:3px;border-radius:6px;background:linear-gradient(90deg,#f05a67,#f39a3d,#f0d84d,#45c987,#40bce8,#627bf2,#d15bd2,#f05a67);background-size:300% 100%;content:"";-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:developer-rgb-edge 2.8s linear infinite;filter:drop-shadow(0 0 5px rgba(88,205,235,.65)) drop-shadow(0 0 12px rgba(177,86,229,.3))}
.developer-usage-notice>i{display:grid;width:54px;height:44px;place-items:center;border-radius:3px;background:#251c32;box-shadow:inset 2px 2px #584469,inset -2px -2px #0c0811;color:#fff;font-size:15px;font-style:normal;font-weight:900;letter-spacing:.12em;text-shadow:0 0 8px rgba(212,146,255,.62)}
.developer-usage-notice>span{display:flex;min-width:0;flex-direction:column}.developer-usage-notice small{color:#a996ba;font-size:9px;font-weight:800;letter-spacing:.18em}.developer-usage-notice strong{margin-top:5px;color:#f7f2fb;font-size:clamp(15px,2vw,22px);font-weight:900;letter-spacing:.035em;text-shadow:0 0 10px rgba(216,169,246,.3)}
.developer-notice-enter-active{transition:opacity .24s ease,transform .3s cubic-bezier(.18,.86,.25,1)}.developer-notice-leave-active{transition:opacity .38s ease,transform .38s ease}.developer-notice-enter-from{opacity:0;transform:translate(-50%,-18px) scale(.96)}.developer-notice-leave-to{opacity:0;transform:translate(-50%,-9px) scale(.985)}
@media(max-width:600px){.developer-usage-notice{top:72px;min-height:68px;padding:11px 14px;grid-template-columns:44px 1fr;gap:11px}.developer-usage-notice>i{width:44px;height:40px}.developer-usage-notice small{font-size:7px}.developer-usage-notice strong{font-size:14px}}

/* 胜利广播：右下角 Winner+用户名，从右往左扫入，期间锁定操作。 */
.victory-broadcast{position:fixed;z-index:420;inset:0;display:flex;padding:44px 52px;align-items:flex-end;justify-content:flex-end;overflow:hidden;pointer-events:auto;background:radial-gradient(circle at 78% 88%,rgba(30,58,102,.52),rgba(2,6,14,.8))}
.victory-ribbon{position:relative;display:flex;min-width:min(560px,86vw);padding:30px 40px;gap:20px;align-items:flex-end;flex-direction:column;border-top:1px solid rgba(255,255,255,.32);border-bottom:1px solid rgba(255,255,255,.32);background:linear-gradient(100deg,rgba(255,255,255,.04),rgba(255,255,255,.16) 45%,rgba(255,255,255,.04));box-shadow:0 0 70px rgba(70,150,255,.28),0 18px 50px rgba(0,0,0,.45);overflow:hidden}
.victory-ribbon::after{position:absolute;inset:0;background:linear-gradient(115deg,transparent 22%,rgba(255,255,255,.3) 44%,transparent 62%);transform:translateX(-130%);content:"";animation:victory-shine 1.6s ease .5s infinite}
.victory-kicker{color:#fff;font-size:clamp(40px,8vw,104px);line-height:.9;font-weight:950;letter-spacing:.1em;text-shadow:0 0 26px rgba(120,190,255,.75),0 2px 0 rgba(0,0,0,.55)}
.victory-user{color:#ffd76b;font-size:clamp(22px,4vw,46px);font-weight:900;text-shadow:0 0 22px rgba(255,190,60,.65),0 2px 0 rgba(0,0,0,.5)}
.victory-enter-active,.victory-leave-active{transition:opacity .45s ease}
.victory-enter-from,.victory-leave-to{opacity:0}
.victory-enter-active .victory-ribbon{animation:victory-sweep .85s cubic-bezier(.19,.95,.28,1) both}
.victory-leave-active .victory-ribbon{animation:victory-sweep-out .6s cubic-bezier(.65,.05,.35,1) both}
@keyframes victory-sweep{from{transform:translateX(120%)}to{transform:translateX(0)}}
@keyframes victory-sweep-out{to{transform:translateX(120%)}}
@keyframes victory-shine{to{transform:translateX(130%)}}
@media(prefers-reduced-motion:reduce){.victory-ribbon,.victory-enter-active .victory-ribbon,.victory-leave-active .victory-ribbon{animation:none}.victory-ribbon::after{animation:none}}

/* —— 逻辑快照回放：中央牌桌 + 四角/均分玩家手牌 —— */
.replay-overlay{position:fixed;z-index:520;inset:0;padding:12px;background:#070c11;color:#eef7fb}
.replay-shell{display:flex;box-sizing:border-box;width:100%;height:100%;padding:14px 16px 12px;flex-direction:column;border:1px solid #283944;border-radius:3px;background:#0d151b;box-shadow:inset 2px 2px #263640,inset -3px -3px #030709}
.replay-header{display:flex;min-height:58px;padding:0 2px 10px;align-items:flex-start;justify-content:space-between;border-bottom:1px solid #26343c}.replay-header h2{margin:0;font-size:26px;letter-spacing:.04em}.replay-header p{margin-bottom:4px!important}.replay-header span{color:#718692;font-size:9px;letter-spacing:.1em}.replay-loading{display:grid;flex:1;place-items:center;color:#7f96a2;font-size:12px;letter-spacing:.14em}
.replay-mode-switch{display:flex;margin-left:auto;margin-right:12px;padding:2px;gap:2px;border:1px solid #263943;border-radius:3px;background:#070d11}.replay-mode-switch button{display:flex;min-width:142px;height:42px;padding:5px 10px;align-items:flex-start;flex-direction:column;justify-content:center;border:1px solid transparent;border-radius:2px;background:#111b21;color:#82949d;font:inherit;cursor:pointer}.replay-mode-switch button strong{font-size:9px;letter-spacing:.06em}.replay-mode-switch button small{margin-top:3px;color:#5e737d;font-size:7px}.replay-mode-switch button.active{border-color:#4daec6;background:#173440;color:#d7f6ff;box-shadow:inset 1px 1px #3d6170,inset -2px -2px #081115}.replay-mode-switch button.active small{color:#86abb8}
.replay-stage{position:relative;min-height:0;flex:1;overflow:hidden}.replay-table-anchor{position:absolute;z-index:1;inset:0;display:grid;place-items:center;pointer-events:none}.replay-table-wrap{position:relative;width:var(--replay-frame-width);height:var(--replay-frame-height);will-change:transform}.replay-table-frame{position:relative;box-sizing:border-box;width:100%;height:100%;padding:14px;overflow:hidden;border-radius:3px;background:#152440;box-shadow:inset 0 2px rgba(255,255,255,.12),inset 2px 0 rgba(255,255,255,.06),inset -3px 0 #071022,inset 0 -3px #050b17,0 4px 3px rgba(0,0,0,.42)}.theme-arcade .replay-table-frame{--slab-edge:4px;border-radius:2px;background:linear-gradient(#41515b,#41515b) top/100% var(--slab-edge) no-repeat,linear-gradient(#34464f,#34464f) left/var(--slab-edge) 100% no-repeat,linear-gradient(#091219,#091219) right/var(--slab-edge) 100% no-repeat,linear-gradient(#040a0e,#040a0e) bottom/100% var(--slab-edge) no-repeat,#1a2831;box-shadow:none;filter:drop-shadow(2px 3px 2px rgba(0,0,0,.5))}.replay-table-recess{position:relative;z-index:1;box-sizing:border-box;width:100%;height:100%;overflow:hidden;border-radius:1px;background:#050b10;box-shadow:inset 3px 3px 4px rgba(0,0,0,.66),inset -1px -1px rgba(151,198,210,.045)}.replay-table-frame::after{position:absolute;z-index:4;inset:14px;pointer-events:none;border-radius:1px;background:linear-gradient(118deg,transparent 0 15%,rgba(211,235,240,.025) 20%,rgba(222,243,247,.075) 25%,rgba(202,230,236,.025) 30%,transparent 36% 67%,rgba(213,238,242,.045) 72%,transparent 79%);background-position:18% center;background-size:180% 100%;box-shadow:inset 0 0 0 1px rgba(196,224,230,.035);content:"";animation:replay-glass-shift 8s ease-in-out infinite alternate}@keyframes replay-glass-shift{to{background-position:82% center}}.replay-table{display:grid;width:var(--replay-board-width);height:var(--replay-board-height);grid-auto-rows:var(--replay-cell-height);overflow:hidden;background-color:#081522;background-image:repeating-linear-gradient(0deg,transparent 0 calc(var(--replay-cell-height) - 1px),rgba(112,168,185,.28) calc(var(--replay-cell-height) - 1px) var(--replay-cell-height)),repeating-linear-gradient(90deg,transparent 0 calc(var(--replay-cell-width) - 1px),rgba(112,168,185,.28) calc(var(--replay-cell-width) - 1px) var(--replay-cell-width)),radial-gradient(circle,rgba(64,91,101,.16) 0 1px,transparent 1.15px);background-size:auto,auto,11px 11px}.replay-cell{position:relative;display:grid;box-sizing:border-box;width:var(--replay-cell-width);height:var(--replay-cell-height);min-width:0;min-height:0;place-items:center}
.replay-rack{--tile-width:18px;--tile-height:26px;position:absolute;z-index:3;box-sizing:border-box;width:clamp(180px,21vw,292px);max-height:27%;padding:7px;border:1px solid #2a3b45;border-radius:3px;background:#111c23;box-shadow:inset 1px 1px #354650,inset -2px -2px #05090c,2px 3px 2px rgba(0,0,0,.56);overflow:hidden}.replay-rack.top-left{top:12px;left:10px}.replay-rack.top-right{top:12px;right:10px}.replay-rack.bottom-left{bottom:12px;left:10px}.replay-rack.bottom-right{right:10px;bottom:12px}.replay-rack.bottom-center{bottom:12px;left:50%;transform:translateX(-50%)}.replay-rack.middle-left{top:50%;left:10px;transform:translateY(-50%)}.replay-rack.middle-right{top:50%;right:10px;transform:translateY(-50%)}.replay-rack.active{border-color:#5bc8e4;box-shadow:inset 1px 1px #46717e,inset -2px -2px #05090c,0 0 10px rgba(69,185,214,.2),2px 3px 2px rgba(0,0,0,.56)}.replay-rack header{display:flex;margin-bottom:5px;align-items:center;justify-content:space-between}.replay-rack header strong{font-size:10px}.replay-rack header span{color:#7b909b;font-size:8px}.replay-hand{display:flex;gap:2px;align-content:flex-start;flex-wrap:wrap}
.replay-tile{box-sizing:border-box;flex:0 0 auto;margin:0;pointer-events:none;cursor:default;transition:none!important}.replay-hand .replay-tile{width:var(--tile-width);height:var(--tile-height)}.replay-cell .replay-tile{position:relative;inset:auto;width:var(--tile-width);height:var(--tile-height)}.replay-tile:hover{filter:none!important;transform:none!important}.replay-tile .number{font-size:calc(var(--tile-width) * .56)}
.replay-status{position:absolute;z-index:4;top:10px;left:50%;display:flex;padding:5px 9px;gap:10px;align-items:center;border:1px solid #31444e;border-radius:2px;background:#111d24;box-shadow:1px 2px 1px rgba(0,0,0,.5);transform:translateX(-50%)}.replay-status strong{font-size:9px;color:#bfefff}.replay-status span{font-size:8px;color:#8297a2}
.replay-controls{display:grid;min-height:52px;padding-top:10px;grid-template-columns:34px 104px 34px minmax(120px,1fr) auto;gap:7px;align-items:center;border-top:1px solid #26343c}.replay-controls button{height:32px;border:1px solid #334751;border-radius:2px;background:#17242c;color:#dcebf0;font:inherit;font-size:14px;cursor:pointer;box-shadow:inset 1px 1px #40515a,inset -2px -2px #070c0f,1px 2px 1px rgba(0,0,0,.54)}.replay-controls button:disabled{opacity:.35;cursor:default}.replay-controls .replay-play{font-size:10px}.replay-controls .replay-play span{margin-left:5px}.replay-controls input{width:100%;accent-color:#55c7e4}.replay-controls output{min-width:82px;color:#a8bbc4;font-size:9px;text-align:right}
@media(max-width:760px){.replay-overlay{padding:5px}.replay-shell{padding:9px}.replay-header>div:first-child span{display:none}.replay-mode-switch{margin-right:7px}.replay-mode-switch button{min-width:62px;height:36px;padding:4px 6px}.replay-mode-switch button small{display:none}.replay-rack{--tile-width:16px;--tile-height:23px;width:39vw;max-height:26%;padding:5px}.replay-rack.middle-left{top:12px;transform:none}.replay-rack.middle-right{top:12px;transform:none}.replay-controls{grid-template-columns:30px 72px 30px 1fr}.replay-controls output{display:none}.replay-controls .replay-play span{display:none}}

.replay-table-frame::after{display:none}
.replay-glass-cover{position:absolute;z-index:5;inset:14px;overflow:hidden;pointer-events:none;border-radius:2px;background:radial-gradient(ellipse 58% 42% at 8% 4%,rgba(205,225,230,.032),rgba(205,225,230,.012) 38%,transparent 72%),radial-gradient(ellipse 46% 54% at 94% 28%,rgba(151,181,190,.022),transparent 69%),radial-gradient(ellipse 58% 36% at 34% 103%,rgba(201,219,223,.018),transparent 74%);box-shadow:2px 3px 3px rgba(0,0,0,.2),0 1px 1px rgba(0,0,0,.12)}
.replay-glass-cover::after{position:absolute;right:8px;bottom:6px;color:rgba(214,232,236,.18);font-family:Arial,"Microsoft YaHei",sans-serif;font-size:6px;font-weight:700;letter-spacing:.22em;text-shadow:0 1px rgba(0,0,0,.3);content:"REPLAY //"}
.replay-glass-edge{position:absolute;z-index:2;display:block;pointer-events:none;backdrop-filter:blur(.4px) contrast(1.015)}
.replay-glass-edge.top{top:0;left:0;width:100%;height:3px;background:rgba(214,235,240,.15);box-shadow:0 1px rgba(229,243,246,.035)}
.replay-glass-edge.left{top:0;left:0;width:3px;height:100%;background:rgba(194,220,226,.11);box-shadow:1px 0 rgba(229,243,246,.025)}
.replay-glass-edge.right{top:0;right:0;width:3px;height:100%;background:rgba(7,19,24,.24);box-shadow:-1px 0 rgba(135,169,178,.035)}
.replay-glass-edge.bottom{bottom:0;left:0;width:100%;height:3px;background:rgba(4,13,17,.3);box-shadow:0 -1px rgba(132,163,171,.03)}

/* 规则书 */
.rules-modal{width:min(760px,100%);display:flex;max-height:min(88vh,780px);flex-direction:column}
.rules-modal .modal-heading{flex:0 0 auto}
.rules-modal .modal-actions{flex:0 0 auto}
.rules-book{flex:1 1 auto;min-height:0;overflow-y:auto;padding-right:8px;scrollbar-color:rgba(125,166,218,.55) transparent;scrollbar-width:thin}
.rules-book::-webkit-scrollbar{width:8px}
.rules-book::-webkit-scrollbar-thumb{border-radius:4px;background:rgba(125,166,218,.45)}
.rules-chapter{padding:14px 0;border-bottom:1px solid rgba(157,192,233,.14)}
.rules-chapter:last-child{border-bottom:0}
.rules-chapter h3{display:flex;margin:0 0 9px;gap:10px;align-items:center;color:#e9f2fc;font-size:13px;font-weight:850}
.rules-chapter h3 b{display:grid;flex:0 0 auto;width:27px;height:27px;place-items:center;border-radius:5px;background:#285c91;color:#dff5ff;font-size:11px}
.rules-chapter p{margin:0;color:#aebed0;font-size:11.5px;line-height:1.7}
.rules-chapter ul{margin:0;padding:0;list-style:none}
.rules-chapter li{position:relative;padding:4px 0 4px 18px;color:#aebed0;font-size:11.5px;line-height:1.65}
.rules-chapter li::before{position:absolute;left:4px;color:#67d3ff;content:"›"}
.rules-chapter li em{display:inline-flex;min-width:24px;margin-right:7px;justify-content:center;font-style:normal;font-weight:900;color:#ffd76b}

/* Preserve the four tile-color choices against the global physical-button skin. */
.theme-arcade .developer-panel .dev-color-row button.RED{--slab-front:#e94b61;--slab-top:#ff7888;--slab-left:#f26375;--slab-right:#9f2539;--slab-bottom:#751b2a}
.theme-arcade .developer-panel .dev-color-row button.BLUE{--slab-front:#2789eb;--slab-top:#65adf5;--slab-left:#469bec;--slab-right:#145a9e;--slab-bottom:#0c3e70}
.theme-arcade .developer-panel .dev-color-row button.BLACK{--slab-front:#283548;--slab-top:#506074;--slab-left:#3d4d61;--slab-right:#111a27;--slab-bottom:#090f18}
.theme-arcade .developer-panel .dev-color-row button.ORANGE{--slab-front:#e98a34;--slab-top:#ffb060;--slab-left:#f19b4c;--slab-right:#99531d;--slab-bottom:#6d3610}
.developer-panel .developer-heading h2{font-size:clamp(24px,2.2vw,31px)}
.developer-panel .score-monitor{margin:16px 0;padding:14px}.developer-panel .score-monitor strong{font-size:32px}
.developer-panel .developer-section{padding:14px 0}.developer-panel .developer-section>label{margin-bottom:10px;font-size:10px;letter-spacing:.08em}
.developer-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.developer-stats>div{display:flex;min-height:44px;padding:7px 9px;align-items:center;justify-content:space-between;background:#09141c;box-shadow:inset 2px 2px #182630,inset -2px -2px #03080c}.developer-stats>div:last-child{grid-column:1/-1}.developer-stats span{color:#78909f;font-size:8px;font-weight:800;letter-spacing:.08em}.developer-stats b{color:#e8f4f7;font-size:17px}.developer-stats .warning b{color:#ff745f}
.developer-panel .dev-color-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.developer-panel .dev-color-row button{width:auto;height:31px}.developer-panel .dev-color-row button.active{outline:2px solid rgba(255,255,255,.9);outline-offset:1px}
.dev-number-grid{display:grid;margin-top:11px;grid-template-columns:repeat(7,1fr);gap:5px}.dev-number-grid button{height:29px;padding:0;color:#aebec7;font-size:10px;font-weight:850}.theme-arcade .dev-number-grid button.active{--slab-front:#176b84!important;--slab-top:#4a97a9!important;--slab-left:#388899!important;--slab-right:#0c4657!important;--slab-bottom:#082f3b!important;color:#fff}
.dev-primary-actions{display:grid;margin-top:9px;grid-template-columns:1fr 1fr;gap:7px}.dev-primary-actions button{min-height:35px;color:#e7f4f7;font-size:9px;font-weight:900}
.dev-recipe-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.dev-recipe-grid button{display:flex;min-height:48px;padding:8px 10px;align-items:flex-start;justify-content:center;flex-direction:column;text-align:left}.dev-recipe-grid b{color:#e6f4f7;font-size:9px;letter-spacing:.04em}.dev-recipe-grid small{margin-top:3px;color:#79a6b4;font-size:7px;letter-spacing:.06em}.developer-recipe-note{margin:9px 1px 0;color:#627985;font-size:8px;line-height:1.5}
.developer-panel .joker-palette{gap:7px}.developer-panel .joker-palette button{min-height:48px}.developer-panel .developer-note{padding-bottom:3px;font-size:8px}
.developer-panel{scrollbar-width:none}.developer-panel::-webkit-scrollbar{display:none;width:0;height:0}.developer-panel>.developer-heading{position:relative;z-index:3;margin:0;padding:0 0 13px;background:transparent;box-shadow:none}
.chat-panel,.developer-panel{container-type:inline-size;width:max(120px,calc(50vw - var(--board-half-width) - 50px));height:calc(100vh - 82px);max-height:none;bottom:12px;transition:width .42s cubic-bezier(.2,.8,.2,1),height .42s cubic-bezier(.2,.8,.2,1)}
.chat-panel{right:12px;padding:18px}.developer-panel{left:12px}
@container(max-width:220px){.developer-panel .developer-heading h2,.chat-panel .developer-heading h2{font-size:20px}.developer-panel .score-monitor{padding:10px}.developer-panel .developer-section{padding:11px 0}.developer-stats{grid-template-columns:1fr}.developer-stats>div:last-child{grid-column:auto}.dev-number-grid{grid-template-columns:repeat(5,1fr)}.dev-recipe-grid{grid-template-columns:1fr}.chat-compose{grid-template-columns:minmax(0,1fr) 36px}}
@media(max-width:760px){.chat-panel,.developer-panel{bottom:8px;width:min(300px,calc(100vw - 16px));height:calc(100vh - 86px)}.chat-panel{right:8px}.developer-panel{right:auto;left:8px}}
@media(prefers-reduced-motion:reduce){.developer-panel,.theme-arcade .developer-panel{animation:none}.board-frame.developer-rgb-board::after{animation:none}.developer-unlock-flash{animation-duration:180ms}}

/* Joker 沿用普通数字牌的牌胚、字重和视觉尺度，仅保留实色识别色。 */
.tile[data-joker]{--joker-ink:#334155;--joker-edge:#94a3b8;--joker-glow:rgba(148,163,184,.42);isolation:isolate}
.tile .joker-icon{position:relative;z-index:3;display:grid;width:100%;height:1em;place-items:center;font-family:Arial,"Microsoft YaHei","Segoe UI Symbol",sans-serif;font-size:clamp(20px,calc(var(--tile-width) * .56),29px);font-weight:700;line-height:1;letter-spacing:0;white-space:nowrap;color:var(--joker-ink);background:none;-webkit-text-fill-color:currentColor;text-shadow:none}
.tile[data-joker="STANDARD"]{--joker-ink:#7651b5;--joker-edge:#a78bfa;--joker-glow:rgba(139,92,246,.48)}
.tile[data-joker="DOUBLE"]{--joker-ink:#128176;--joker-edge:#3bc9ba;--joker-glow:rgba(20,184,166,.46)}
.tile[data-joker="COLOR_CHANGE"]{--joker-ink:#c56816;--joker-edge:#f0a33a;--joker-glow:rgba(234,128,20,.48)}
.tile[data-joker="MIRROR"]{--joker-ink:#3478bd;--joker-edge:#6aacee;--joker-glow:rgba(59,130,246,.46)}
/* 独立贴边光层不会覆盖普通牌胚原有的厚度、接触阴影和内框。 */
.tile[data-joker]::before{content:"";position:absolute;z-index:2;inset:-2px;pointer-events:none;border:2px solid color-mix(in srgb,var(--joker-edge) 88%,white);border-radius:4px;opacity:.96;box-shadow:0 0 2px 1px var(--joker-edge),0 0 7px 3px var(--joker-glow),0 0 14px 4px color-mix(in srgb,var(--joker-glow) 72%,transparent),inset 0 0 4px 1px color-mix(in srgb,var(--joker-edge) 58%,transparent)}
.tile[data-joker]::after{content:"";position:absolute;z-index:2;inset:-2px;box-sizing:border-box;padding:2px;pointer-events:none;border:0;border-radius:4px;background:var(--joker-edge);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.tile.locked[data-joker]::before,.tile.locked[data-joker]::after{opacity:.55}

@property --joker-orbit-angle{syntax:"<angle>";inherits:false;initial-value:0deg}
@property --joker-diagonal-position{syntax:"<percentage>";inherits:false;initial-value:-35%}
@property --joker-mirror-angle{syntax:"<angle>";inherits:false;initial-value:0deg}

/* STANDARD：整圈缓慢换色，亮度保持稳定，避免呼吸式闪烁。 */
.tile[data-joker="STANDARD"]::before{animation:joker-standard-color 9s ease-in-out infinite}
.tile[data-joker="STANDARD"]::after{animation:joker-standard-ring 9s ease-in-out infinite}
@keyframes joker-standard-color{
  0%,100%{border-color:#b59aff;box-shadow:0 0 2px 1px #9c7bea,0 0 7px 3px rgba(139,92,246,.5),0 0 14px 4px rgba(109,92,246,.3),inset 0 0 4px 1px rgba(181,154,255,.46)}
  34%{border-color:#d295ef;box-shadow:0 0 2px 1px #bd74db,0 0 7px 3px rgba(190,92,218,.48),0 0 14px 4px rgba(163,76,203,.28),inset 0 0 4px 1px rgba(221,159,239,.44)}
  67%{border-color:#91a8ff;box-shadow:0 0 2px 1px #758ee4,0 0 7px 3px rgba(91,116,224,.48),0 0 14px 4px rgba(72,96,205,.28),inset 0 0 4px 1px rgba(145,168,255,.44)}
}
@keyframes joker-standard-ring{0%,100%{background:#b59aff}34%{background:#d295ef}67%{background:#91a8ff}}

/* DOUBLE：青、蓝、绿三段沿四边持续绕行。 */
.tile[data-joker="DOUBLE"]::after{background:conic-gradient(from var(--joker-orbit-angle),#36d5c5 0 22%,#7dd3fc 31% 47%,#6ee7a8 56% 72%,#36d5c5 82% 100%);animation:joker-double-orbit 11s linear infinite}
@keyframes joker-double-orbit{to{--joker-orbit-angle:1turn}}

/* COLOR CHANGE：一条多色亮带从左下向右上缓慢推过边缘。 */
.tile[data-joker="COLOR_CHANGE"]::after{background:linear-gradient(135deg,#f0a33a calc(var(--joker-diagonal-position) - 34%),#ffd66b calc(var(--joker-diagonal-position) - 13%),#ef6579 var(--joker-diagonal-position),#71a9ef calc(var(--joker-diagonal-position) + 13%),#f0a33a calc(var(--joker-diagonal-position) + 34%));animation:joker-color-diagonal 8.5s ease-in-out infinite}
@keyframes joker-color-diagonal{0%{--joker-diagonal-position:-35%}70%,100%{--joker-diagonal-position:135%}}

/* MIRROR：两束对称亮色沿边缘相向往返。 */
.tile[data-joker="MIRROR"]::after{background:conic-gradient(from var(--joker-mirror-angle),#6aacee 0 17%,#b9d9ff 24% 28%,#6aacee 35% 67%,#b9d9ff 74% 78%,#6aacee 85% 100%);animation:joker-mirror-shift 7.5s ease-in-out infinite alternate}
@keyframes joker-mirror-shift{to{--joker-mirror-angle:180deg}}

/* Local landscape backgrounds stay fixed beneath the interface; the matte veil keeps gameplay readable. */
.game.background-plain{background-color:#070b10;background-image:none}
.game.background-plain::before{opacity:0}
.game.background-alpine,.game.background-ocean,.game.background-forest,.game.background-desert{background-repeat:no-repeat;background-position:center;background-size:cover;background-attachment:fixed}
.game.background-alpine{background-image:linear-gradient(rgba(3,8,14,.57),rgba(3,7,12,.7)),url('/backgrounds/alpine-dawn.png')}
.game.background-ocean{background-image:linear-gradient(rgba(2,7,12,.48),rgba(2,6,10,.67)),url('/backgrounds/ocean-dusk.png')}
.game.background-forest{background-image:linear-gradient(rgba(3,8,9,.6),rgba(2,7,8,.72)),url('/backgrounds/rain-forest.png')}
.game.background-desert{background-image:linear-gradient(rgba(5,5,12,.48),rgba(4,4,9,.67)),url('/backgrounds/desert-night.png')}
.game.background-alpine::before,.game.background-ocean::before,.game.background-forest::before,.game.background-desert::before{opacity:.24}

.settings-modal{width:min(650px,100%);max-height:calc(100vh - 36px);overflow-y:auto;scrollbar-width:thin}
.background-setting{padding:12px 0;border-bottom:1px solid rgba(159,194,235,.12)}
.background-setting>span{display:flex;margin-bottom:10px;align-items:baseline;justify-content:space-between;gap:14px}.background-setting>span strong{color:#dce8f6;font-size:11px}.background-setting>span small{color:#7188a5;font-size:8px}
.background-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.background-picker button{display:flex;min-width:0;padding:5px;align-items:stretch;flex-direction:column;border:0;border-radius:3px;background:#13212b;color:#b9c9cf;font:inherit;cursor:pointer;box-shadow:inset 2px 2px #2d3b44,inset -2px -2px #070d12,0 2px 1px rgba(0,0,0,.5);transition:filter .15s ease,transform .15s ease,color .15s ease}
.background-picker button:hover{filter:brightness(1.12);transform:translateY(-1px)}.background-picker button.active{outline:2px solid rgba(226,238,241,.9);outline-offset:2px;border-radius:3px;color:#effcff;box-shadow:inset 3px 3px #334852,inset -3px -3px #061016,0 2px 1px rgba(0,0,0,.5)}
.background-picker i{display:block;width:100%;aspect-ratio:16/7;border-radius:2px;background-color:#080e13;background-repeat:no-repeat;background-position:center;background-size:cover;box-shadow:inset 1px 1px rgba(230,248,252,.1),inset -1px -1px rgba(0,0,0,.5)}
.background-picker b{overflow:hidden;margin:7px 3px 3px;font-size:8px;font-weight:850;letter-spacing:.055em;text-align:left;text-overflow:ellipsis;white-space:nowrap}
.background-preview-texture i{background-image:radial-gradient(rgba(176,200,204,.16) .7px,transparent .9px),repeating-linear-gradient(112deg,rgba(255,255,255,.035) 0 1px,transparent 1px 13px);background-size:9px 9px,auto}
.background-preview-plain i{background:#070b10}
.background-preview-alpine i{background-image:linear-gradient(rgba(3,8,14,.18),rgba(3,7,12,.32)),url('/backgrounds/alpine-dawn.png')}
.background-preview-ocean i{background-image:linear-gradient(rgba(2,7,12,.12),rgba(2,6,10,.28)),url('/backgrounds/ocean-dusk.png')}
.background-preview-forest i{background-image:linear-gradient(rgba(3,8,9,.16),rgba(2,7,8,.3)),url('/backgrounds/rain-forest.png')}
.background-preview-desert i{background-image:linear-gradient(rgba(5,5,12,.12),rgba(4,4,9,.26)),url('/backgrounds/desert-night.png')}
@media(max-width:560px){.background-picker{grid-template-columns:repeat(2,minmax(0,1fr))}.background-setting>span{align-items:flex-start;flex-direction:column;gap:3px}}

/* Room voice — a compact physical control panel; microphone access remains opt-in. */
.voice-button{display:flex;gap:6px;align-items:center}.voice-button>i{position:relative;width:7px;height:10px;border:1px solid currentColor;border-radius:4px 4px 3px 3px}.voice-button>i::after{position:absolute;right:-3px;bottom:-4px;left:-3px;height:5px;border:1px solid currentColor;border-top:0;border-radius:0 0 5px 5px;content:""}.voice-button.joined:not(.active){color:#83dcaa}.voice-button.joined>i::before{position:absolute;top:-3px;right:-4px;width:4px;height:4px;border-radius:50%;background:#60e49a;box-shadow:0 0 5px rgba(96,228,154,.45);content:""}
.voice-panel{position:fixed;z-index:72;top:70px;right:12px;display:flex;box-sizing:border-box;width:min(330px,calc(100vw - 24px));max-height:calc(100vh - 84px);padding:18px;flex-direction:column;border:1px solid rgba(145,193,238,.3);border-radius:3px;background:#101d2b;box-shadow:inset 2px 2px #263746,inset -3px -3px #07101a,3px 5px 2px rgba(0,0,0,.55);animation:dev-in .2s cubic-bezier(.2,.8,.2,1)}.voice-panel .developer-heading p{color:#6ec8e9}.voice-panel .developer-heading h2{font-size:23px}.voice-panel .developer-heading>button{border-radius:2px}
.voice-state{display:flex;margin-top:18px;padding:13px;gap:12px;align-items:center;background:#09141e;box-shadow:inset 2px 2px #172733,inset -2px -2px #03080d}.voice-state-icon{display:flex;width:43px;height:38px;gap:3px;align-items:center;justify-content:center;background:#111f2a;box-shadow:inset 1px 1px #2a3b47,inset -2px -2px #050b10}.voice-state-icon i{display:block;width:3px;height:9px;border-radius:1px;background:#607786}.voice-state-icon i:nth-child(2){height:17px}.voice-state.connected .voice-state-icon i{background:#62d79a;animation:voice-meter 1.1s steps(4,end) infinite}.voice-state.connected .voice-state-icon i:nth-child(2){animation-delay:-.28s}.voice-state.connected .voice-state-icon i:nth-child(3){animation-delay:-.56s}@keyframes voice-meter{50%{transform:scaleY(.55)}}.voice-state>div{display:flex;min-width:0;flex-direction:column}.voice-state strong{color:#e5f0f4;font-size:11px;letter-spacing:.06em}.voice-state small{margin-top:5px;color:#6d8491;font-size:8px;line-height:1.45}
.voice-error{margin:10px 0 0;padding:9px 10px;border-left:2px solid #e66f5c;background:#291519;color:#f1a99d;font-size:9px;line-height:1.5}.voice-roster{display:flex;margin:13px 0;gap:7px;flex-direction:column}.voice-peer{display:grid;min-height:47px;padding:7px 9px;grid-template-columns:34px minmax(0,1fr) 18px;gap:9px;align-items:center;background:#142431;box-shadow:inset 1px 1px #30414d,inset -2px -2px #080f15}.voice-peer.self{background:#17303a}.voice-avatar{display:grid;width:32px;height:32px;place-items:center;background:#256d83;box-shadow:inset 1px 1px #4b99ad,inset -2px -2px #0b3543;color:#effcff;font-size:11px;font-weight:900}.voice-peer>div{display:flex;min-width:0;flex-direction:column}.voice-peer strong{overflow:hidden;color:#e4edf1;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.voice-peer strong b{margin-left:5px;color:#66cee9;font-size:7px}.voice-peer small{margin-top:4px;color:#66d89c;font-size:7px;letter-spacing:.06em}.voice-mic{color:#59d690;font-size:8px;text-align:center}.voice-peer.muted{filter:saturate(.38);opacity:.68}.voice-peer.muted small,.voice-peer.muted .voice-mic{color:#d89679}.voice-empty{margin:5px 0 1px;color:#607681;font-size:8px;text-align:center}
.voice-actions{display:grid;margin-top:2px;grid-template-columns:1fr 1fr;gap:8px}.voice-panel button.voice-join-action,.voice-actions button{min-height:38px;border:0;border-radius:2px;background:#176b84;box-shadow:inset 2px 2px #3a91a6,inset -2px -2px #093847,2px 3px 1px rgba(0,0,0,.55);color:#effcff;font:inherit;font-size:9px;font-weight:900;letter-spacing:.07em;cursor:pointer;transition:filter .13s ease,transform .13s ease}.voice-panel button.voice-join-action{width:100%;margin-top:14px}.voice-actions .voice-leave-action{background:#542b28;box-shadow:inset 2px 2px #80504a,inset -2px -2px #28110f,2px 3px 1px rgba(0,0,0,.55)}.voice-actions .voice-mute-action.active{background:#5d4b27;box-shadow:inset 2px 2px #88754b,inset -2px -2px #2f260f,2px 3px 1px rgba(0,0,0,.55)}.voice-panel button.voice-join-action:hover:not(:disabled),.voice-actions button:hover{filter:brightness(1.1);transform:translateY(-1px)}.voice-panel button.voice-join-action:active:not(:disabled),.voice-actions button:active{box-shadow:inset 1px 1px rgba(255,255,255,.08),inset -1px -1px rgba(0,0,0,.35),1px 1px 1px rgba(0,0,0,.45);transform:translateY(2px)}.voice-panel button:disabled{opacity:.42;cursor:not-allowed}
.theme-arcade .voice-panel{border-radius:2px;background:#111b23;box-shadow:inset 2px 2px #2b3740,inset -3px -3px #03080c;filter:drop-shadow(3px 4px 2px rgba(0,0,0,.62));animation:arcade-panel-in .17s cubic-bezier(.2,.9,.2,1)}
@media(max-width:760px){.voice-panel{top:66px;right:8px;width:min(330px,calc(100vw - 16px));max-height:calc(100vh - 74px);overflow-y:auto}}
@media(prefers-reduced-motion:reduce){.voice-panel,.theme-arcade .voice-panel,.voice-state.connected .voice-state-icon i{animation:none}}

/* Replay tiles keep the live tile material while scaling typography with their smaller physical size. */
.replay-tile .number,.replay-tile .joker-icon{font-size:calc(var(--tile-width) * .56);line-height:1}
</style>

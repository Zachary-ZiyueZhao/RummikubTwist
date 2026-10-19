import { strict as assert } from 'node:assert'
import { JokerType, TileColor, type GameTile } from '../shared/protocol.ts'
import { checkGroup, checkRun, validateTileSet } from './validator.ts'
import { calculatePlayedScore } from './scoring.ts'

let nextId = 0
const normal = (color: GameTile['color'], value: number): GameTile => ({
  id: `normal-${nextId++}`,
  color,
  value,
  jokerType: JokerType.NONE,
})
const joker = (jokerType: GameTile['jokerType']): GameTile => ({
  id: `joker-${nextId++}`,
  color: TileColor.BLACK,
  value: 0,
  jokerType,
})

const R = TileColor.RED
const B = TileColor.BLUE

assert.equal(checkRun([joker(JokerType.COLOR_CHANGE), normal(B, 5), normal(B, 6)]).isValid, true)
assert.equal(checkRun([normal(R, 5), normal(R, 6), joker(JokerType.COLOR_CHANGE)]).isValid, true)
assert.equal(checkRun([normal(R, 5), joker(JokerType.COLOR_CHANGE), normal(B, 7), normal(B, 8)]).isValid, true)
assert.equal(checkRun([normal(R, 5), joker(JokerType.COLOR_CHANGE), normal(R, 7)]).isValid, false)

assert.equal(
  checkRun([normal(R, 5), joker(JokerType.COLOR_CHANGE), joker(JokerType.STANDARD), normal(B, 8)]).isValid,
  true,
)
assert.equal(
  checkRun([normal(R, 5), joker(JokerType.COLOR_CHANGE), joker(JokerType.DOUBLE), normal(B, 9)]).isValid,
  true,
)
assert.equal(checkGroup([normal(R, 5), normal(B, 5), joker(JokerType.COLOR_CHANGE)]).isValid, false)

const endingJoker = joker(JokerType.STANDARD)
const runWithEndingJoker = checkRun([normal(R, 4), normal(R, 5), normal(R, 6), endingJoker])
assert.equal(runWithEndingJoker.isValid, true)
assert.equal(runWithEndingJoker.tileScores?.[endingJoker.id], 7)

// 4-5-6-Joker 中 Joker 代表 7；首次出牌分值可以跨多个组合累计。
const playedFour = normal(R, 4)
const playedFive = normal(R, 5)
const playedSix = normal(R, 6)
const playedJoker = joker(JokerType.STANDARD)
const playedGroupRed = normal(R, 5)
const playedGroupBlue = normal(B, 5)
const playedGroupBlack = normal(TileColor.BLACK, 5)
const scoreBoard = Array.from({ length: 6 }, () => Array<GameTile | null>(16).fill(null))
scoreBoard[0].splice(0, 4, playedFour, playedFive, playedSix, playedJoker)
scoreBoard[2].splice(0, 3, playedGroupRed, playedGroupBlue, playedGroupBlack)
assert.equal(
  calculatePlayedScore(scoreBoard, [
    playedFour, playedFive, playedSix, playedJoker, playedGroupRed, playedGroupBlue, playedGroupBlack,
  ]),
  37,
)

// 移动并重组桌面旧牌是允许的，但旧牌本身不能被重复计入首次 30 分。
const oldTen = normal(R, 10)
const oldEleven = normal(R, 11)
const oldTwelve = normal(R, 12)
const newThirteen = normal(R, 13)
const changedBoard = Array.from({ length: 6 }, () => Array<GameTile | null>(16).fill(null))
changedBoard[3].splice(5, 4, oldTen, oldEleven, oldTwelve, newThirteen)
assert.equal(calculatePlayedScore(changedBoard, [newThirteen]), 13)

const groupJoker = joker(JokerType.STANDARD)
const groupWithJoker = checkGroup([normal(R, 11), normal(B, 11), groupJoker])
assert.equal(groupWithJoker.isValid, true)
assert.equal(groupWithJoker.tileScores?.[groupJoker.id], 11)

const doubleJoker = joker(JokerType.DOUBLE)
const runWithDouble = checkRun([normal(R, 4), normal(R, 5), doubleJoker, normal(R, 8)])
assert.equal(runWithDouble.isValid, true)
assert.equal(runWithDouble.tileScores?.[doubleJoker.id], 13)

assert.equal(validateTileSet([
  normal(R, 1), joker(JokerType.STANDARD), normal(R, 3), joker(JokerType.MIRROR),
  normal(R, 3), joker(JokerType.STANDARD), normal(R, 1),
]).isValid, true)
assert.equal(validateTileSet([
  normal(R, 1), joker(JokerType.DOUBLE), normal(R, 4), joker(JokerType.MIRROR),
  normal(R, 4), joker(JokerType.DOUBLE), normal(R, 1),
]).isValid, true)
assert.equal(validateTileSet([
  normal(R, 1), joker(JokerType.COLOR_CHANGE), normal(B, 3), joker(JokerType.MIRROR),
  normal(B, 3), joker(JokerType.COLOR_CHANGE), normal(R, 1),
]).isValid, true)
assert.equal(validateTileSet([
  normal(R, 5), normal(B, 5), joker(JokerType.COLOR_CHANGE), joker(JokerType.MIRROR),
  joker(JokerType.COLOR_CHANGE), normal(B, 5), normal(R, 5),
]).isValid, false)

const zeroPointMirror = joker(JokerType.MIRROR)
const mirrorBridge = validateTileSet([
  normal(R, 1), normal(R, 2), zeroPointMirror, normal(R, 2), normal(R, 1),
])
assert.equal(mirrorBridge.isValid, true)
assert.equal(mirrorBridge.tileScores?.[zeroPointMirror.id], 0)
assert.equal(mirrorBridge.score, 6)

console.log('Validator joker compatibility tests passed')

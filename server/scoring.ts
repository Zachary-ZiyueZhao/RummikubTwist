import type { BoardCells, GameTile } from '../shared/protocol.ts'
import { validateTileSet } from './validator.ts'

/**
 * 计算本回合真正从手牌打出的分值。
 * 旧桌面牌可以被移动和重新组合，但不会计入首次 30 分；Joker 使用它在最终合法组合中的代表值。
 */
export const calculatePlayedScore = (cells: BoardCells, startingHand: GameTile[]) => {
  const startingHandIds = new Set(startingHand.map((tile) => tile.id))
  let score = 0

  for (const row of cells) {
    let startColumn: number | null = null
    const finishGroup = (endColumn: number) => {
      if (startColumn === null) return
      const tiles = row.slice(startColumn, endColumn).filter((tile): tile is GameTile => tile !== null)
      const validation = validateTileSet(tiles)
      if (validation.isValid) {
        for (const tile of tiles) {
          if (startingHandIds.has(tile.id)) score += validation.tileScores?.[tile.id] ?? tile.value
        }
      }
      startColumn = null
    }

    row.forEach((tile, columnIndex) => {
      if (tile && startColumn === null) startColumn = columnIndex
      if (!tile) finishGroup(columnIndex)
    })
    finishGroup(row.length)
  }

  return score
}

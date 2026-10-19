// Server-authoritative Rummikub set validation
import { type GameTile as Tile, TileColor, JokerType } from '../shared/protocol.ts';

export interface ValidationResult {
    isValid: boolean;
    score: number;
    tileScores?: Record<string, number>;
}

const ALL_COLORS = [TileColor.RED, TileColor.BLUE, TileColor.BLACK, TileColor.ORANGE];

/**
 * 核心校验主入口
 */
export function validateTileSet(tiles: Tile[]): ValidationResult {
    // 强制规则：任何实际组合中，牌数必须大于等于 3
    if (!tiles || tiles.length < 3) {
        return { isValid: false, score: 0 };
    }

    // 含有 Mirror Joker 走专门的镜像校验逻辑
    if (tiles.some(t => t.jokerType === JokerType.MIRROR)) {
        return checkMirrorSet(tiles);
    }

    // 优先尝试群组校验 (Group)，再尝试顺子校验 (Run)
    const groupRes = checkGroup(tiles);
    if (groupRes.isValid) return groupRes;

    return checkRun(tiles);
}

/**
 * 校验：群组 (Group)
 */
export function checkGroup(tiles: Tile[]): ValidationResult {
    // 变色或镜像牌不能出现在 Group 中
    if (tiles.some(t => t.jokerType === JokerType.COLOR_CHANGE || t.jokerType === JokerType.MIRROR)) {
        return { isValid: false, score: 0 };
    }

    // 计算虚拟长度（Double Joker 算 2 张）
    const virtualLength = tiles.reduce((sum, t) => sum + (t.jokerType === JokerType.DOUBLE ? 2 : 1), 0);
    if (virtualLength < 3 || virtualLength > 4) return { isValid: false, score: 0 };

    const normalTile = tiles.find(t => t.jokerType === JokerType.NONE);
    if (!normalTile) return { isValid: false, score: 0 };
    const groupValue = normalTile.value;

    const usedColors = new Set<TileColor>();
    let totalScore = 0;
    const tileScores: Record<string, number> = {};

    for (const tile of tiles) {
        if (tile.jokerType === JokerType.NONE) {
            if (tile.value !== groupValue || usedColors.has(tile.color)) return { isValid: false, score: 0 };
            usedColors.add(tile.color);
            totalScore += groupValue;
            tileScores[tile.id] = groupValue;
        } else if (tile.jokerType === JokerType.STANDARD) {
            totalScore += groupValue;
            tileScores[tile.id] = groupValue;
        } else if (tile.jokerType === JokerType.DOUBLE) {
            totalScore += groupValue * 2;
            tileScores[tile.id] = groupValue * 2;
        }
    }

    // 校验颜色数量是否超标
    if (usedColors.size + (virtualLength - usedColors.size) > 4) {
        return { isValid: false, score: 0 };
    }

    return { isValid: true, score: totalScore, tileScores };
}

interface VirtualTile {
    color: TileColor;
    value: number;
}

/**
 * 校验：顺子 (Run) - 支持 Standard, Double 和 Color Change Joker (CJ)
 */
export function checkRun(tiles: Tile[]): ValidationResult {
    const virtualLength = tiles.reduce((sum, tile) => sum + (tile.jokerType === JokerType.DOUBLE ? 2 : 1), 0);
    if (virtualLength < 3 || virtualLength > 13) return { isValid: false, score: 0 };

    let maxScore = 0;
    let bestTileScores: Record<string, number> = {};
    const colorsAfter = (previous: VirtualTile | null, mustChange: boolean) => {
        if (!previous) return ALL_COLORS;
        return mustChange ? ALL_COLORS.filter(color => color !== previous.color) : [previous.color];
    };

    let anyValid = false;
    for (let startValue = 1; startValue + virtualLength - 1 <= 13; startValue++) {
        const dfs = (
            index: number,
            nextValue: number,
            previous: VirtualTile | null,
            mustChangeColor: boolean,
            score: number,
            tileScores: Record<string, number>,
        ): boolean => {
            if (index === tiles.length) {
                // Color Change 在末尾是合法的；只有确实存在下一张牌时才要求换色。
                maxScore = Math.max(maxScore, score);
                if (score >= maxScore) bestTileScores = { ...tileScores };
                return true;
            }

            const tile = tiles[index];
            const allowedColors = colorsAfter(previous, mustChangeColor);

            if (tile.jokerType === JokerType.NONE) {
                if (tile.value !== nextValue || !allowedColors.includes(tile.color)) return false;
                tileScores[tile.id] = nextValue;
                const valid = dfs(index + 1, nextValue + 1, { color: tile.color, value: nextValue }, false, score + nextValue, tileScores);
                delete tileScores[tile.id];
                return valid;
            }

            if (tile.jokerType === JokerType.STANDARD) {
                tileScores[tile.id] = nextValue;
                const valid = allowedColors.some(color =>
                    dfs(index + 1, nextValue + 1, { color, value: nextValue }, false, score + nextValue, tileScores));
                delete tileScores[tile.id];
                return valid;
            }

            if (tile.jokerType === JokerType.COLOR_CHANGE) {
                tileScores[tile.id] = nextValue;
                const valid = allowedColors.some(color =>
                    dfs(index + 1, nextValue + 1, { color, value: nextValue }, true, score + nextValue, tileScores));
                delete tileScores[tile.id];
                return valid;
            }

            if (tile.jokerType === JokerType.DOUBLE) {
                if (nextValue + 1 > 13) return false;
                tileScores[tile.id] = nextValue + nextValue + 1;
                const valid = allowedColors.some(color =>
                    dfs(
                        index + 1,
                        nextValue + 2,
                        { color, value: nextValue + 1 },
                        false,
                        score + nextValue + nextValue + 1,
                        tileScores,
                    ));
                delete tileScores[tile.id];
                return valid;
            }

            return false;
        };

        if (dfs(0, startValue, null, false, 0, {})) anyValid = true;
    }

    return { isValid: anyValid, score: anyValid ? maxScore : 0, tileScores: anyValid ? bestTileScores : undefined };
}

// ---------------------------------------------------------
// 阶段 3：镜像百搭牌校验算法 (Mirror Joker)
// ---------------------------------------------------------

interface MirrorMappedTile {
    color: TileColor;
    value: number;
    changesColorAfter?: boolean;
}

interface MirrorMapping {
    tiles: MirrorMappedTile[];
    score: number;
    validAsRun: boolean;
    validAsGroup: boolean;
    tileScores: Record<string, number>;
}

export function checkMirrorSet(tiles: Tile[]): ValidationResult {
    const mirrorIndex = tiles.findIndex(t => t.jokerType === JokerType.MIRROR);
    if (mirrorIndex === -1) return { isValid: false, score: 0 };

    const leftTiles = tiles.slice(0, mirrorIndex);
    const rightTiles = tiles.slice(mirrorIndex + 1);
    if (leftTiles.length === 0 || rightTiles.length === 0) return { isValid: false, score: 0 };

    const leftMappings = generateMirrorMappings(leftTiles, false);
    const rightMappings = generateMirrorMappings(rightTiles, true);
    let maxScore = 0;
    let bestTileScores: Record<string, number> = {};
    const mirrorTile = tiles[mirrorIndex];

    for (const left of leftMappings) {
        for (const right of rightMappings) {

            // 模式 1: 正常的镜像对称 (不需要 Mirror 补牌)
            if (left.tiles.length === right.tiles.length &&
                isValidMirrorMappedCombination(left.tiles) &&
                isValidMirrorMappedCombination(right.tiles.slice().reverse()) &&
                areMirrorValues(left.tiles, right.tiles)
            ) {
                const score = left.score + right.score;
                if (score >= maxScore) {
                    maxScore = score;
                    bestTileScores = { ...left.tileScores, ...right.tileScores, [mirrorTile.id]: 0 };
                }
            }

            // 模式 2: Mirror 补全模式 (左右长度都必须为 2 且呈镜像映射关系)
            if (left.tiles.length === 2 && right.tiles.length === 2 && areMirrorValues(left.tiles, right.tiles)) {
                for (const color of ALL_COLORS) {
                    for (let value = 1; value <= 13; value++) {
                        const mappedMirrorTile = { color, value };
                        const completedLeft = [...left.tiles, mappedMirrorTile];
                        const completedRight = [mappedMirrorTile, ...right.tiles];

                        // 阶段 3 与 阶段 4 的综合校验
                        const leftValid = isValidMirrorMappedCombination(completedLeft);
                        const rightValidNormal = isValidMirrorMappedCombination(completedRight);
                        const rightValidReversed = isValidMirrorMappedCombination(completedRight.slice().reverse());
                        const isMirror = areMirrorValues(completedLeft, completedRight);

                        if (isMirror && leftValid && (rightValidNormal || rightValidReversed)) {
                            // Mirror 只用于补全牌型，本身无论代表什么数字都不计分。
                            const score = left.score + right.score;
                            if (score >= maxScore) {
                                maxScore = score;
                                bestTileScores = { ...left.tileScores, ...right.tileScores, [mirrorTile.id]: 0 };
                            }
                        }
                    }
                }
            }
        }
    }

    return { isValid: maxScore > 0, score: maxScore, tileScores: maxScore > 0 ? bestTileScores : undefined };
}

/**
 * 生成一侧所有可能的纯 Tile 映射
 */
function generateMirrorMappings(tiles: Tile[], reversedRun = false): MirrorMapping[] {
    const results: MirrorMapping[] = [];

    function dfs(index: number, current: MirrorMappedTile[], score: number, tileScores: Record<string, number>) {
        if (index === tiles.length) {
            results.push({
                tiles: [...current],
                score,
                validAsRun: isValidMirrorRun(current),
                validAsGroup: isValidMirrorGroup(current),
                tileScores: { ...tileScores },
            });
            return;
        }

        const tile = tiles[index];

        // 统一提取状态管理辅助函数，消灭冗余的 current.push / current.pop
        const addAndDfs = (t: MirrorMappedTile | MirrorMappedTile[], addedScore: number) => {
            const arr = Array.isArray(t) ? t : [t];
            current.push(...arr);
            tileScores[tile.id] = addedScore;
            dfs(index + 1, current, score + addedScore, tileScores);
            delete tileScores[tile.id];
            current.length -= arr.length;
        };

        if (tile.jokerType === JokerType.NONE) {
            addAndDfs({ color: tile.color, value: tile.value }, tile.value);
        }
        else if (tile.jokerType === JokerType.STANDARD || tile.jokerType === JokerType.COLOR_CHANGE) {
            for (const color of ALL_COLORS) {
                for (let value = 1; value <= 13; value++) {
                    addAndDfs({
                        color,
                        value,
                        changesColorAfter: tile.jokerType === JokerType.COLOR_CHANGE,
                    }, value);
                }
            }
        }
        else if (tile.jokerType === JokerType.DOUBLE) {
            // Group 映射
            for (let value = 1; value <= 13; value++) {
                for (let i = 0; i < ALL_COLORS.length; i++) {
                    for (let j = i + 1; j < ALL_COLORS.length; j++) {
                        addAndDfs([{ color: ALL_COLORS[i], value }, { color: ALL_COLORS[j], value }], value * 2);
                    }
                }
            }
            // Run 映射
            for (const color of ALL_COLORS) {
                if (!reversedRun) {
                    for (let value = 1; value <= 12; value++) {
                        addAndDfs([{ color, value }, { color, value: value + 1 }], value * 2 + 1);
                    }
                } else {
                    for (let value = 2; value <= 13; value++) {
                        addAndDfs([{ color, value }, { color, value: value - 1 }], value * 2 - 1);
                    }
                }
            }
        }
    }

    dfs(0, [], 0, {});
    return results;
}

function isValidMirrorMappedCombination(tiles: MirrorMappedTile[]): boolean {
    return isValidMirrorRun(tiles) || isValidMirrorGroup(tiles);
}

function areMirrorValues(left: MirrorMappedTile[], right: MirrorMappedTile[]): boolean {
    return left.length === right.length && left.every((t, i) => t.value === right[right.length - 1 - i].value);
}

function isValidMirrorRun(tiles: MirrorMappedTile[]): boolean {
    if (tiles.length < 3) return false;
    for (let i = 1; i < tiles.length; i++) {
        const previous = tiles[i - 1];
        const colorIsValid = previous.changesColorAfter
            ? tiles[i].color !== previous.color
            : tiles[i].color === previous.color;
        if (tiles[i].value !== previous.value + 1 || !colorIsValid || tiles[i].value > 13) {
            return false;
        }
    }
    return true;
}

function isValidMirrorGroup(tiles: MirrorMappedTile[]): boolean {
    if (tiles.length < 3 || tiles.length > 4) return false;
    if (tiles.some(tile => tile.changesColorAfter)) return false;
    const value = tiles[0].value;
    if (value < 1 || value > 13) return false;

    const colors = new Set<TileColor>();
    for (const tile of tiles) {
        if (tile.value !== value || colors.has(tile.color)) return false;
        colors.add(tile.color);
    }
    return true;
}

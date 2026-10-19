// src/types.ts

// 1. 使用 const 对象替代 enum，性能更好，完全符合 erasableSyntaxOnly 规则
export const TileColor = {
    RED: 'RED',
    BLUE: 'BLUE',
    BLACK: 'BLACK',
    ORANGE: 'ORANGE'
} as const;
// 提取类型
export type TileColor = typeof TileColor[keyof typeof TileColor];

export const JokerType = {
    NONE: 'NONE',
    STANDARD: 'STANDARD',
    DOUBLE: 'DOUBLE',
    COLOR_CHANGE: 'COLOR_CHANGE',
    MIRROR: 'MIRROR'
} as const;
// 提取类型
export type JokerType = typeof JokerType[keyof typeof JokerType];

export interface UITile extends Tile {
    id: string;
}

/**
 * 3. 定义一张单牌 (Tile) 的数据结构
 */
export interface Tile {
    /**
     * 全局唯一标识符 (非常重要！)
     * 由于游戏中会有两张完全一样的牌（比如两张红3），在前端拖拽和后端同步时，
     * 必须通过全局唯一的 UUID 或递增 ID 来区分它们，否则状态同步会乱套。
     */
    id: string;

    /**
     * 牌的数字值 (1-13)
     * 如果是百搭牌，通常可以设为 0 或者留空，但在某些实现中，
     * 玩家打出百搭牌后它会暂时代替某个数字，这个值可以在运行时动态赋予。
     */
    value: number;

    /**
     * 牌的颜色
     */
    color: TileColor;

    /**
     * 是否是百搭牌，以及百搭牌的类型
     */
    jokerType: JokerType;
}

/**
 * 4. 定义一个牌组 (Group/Run/Set) 的数据结构
 * 桌面上是由多个这种牌组组成的集合
 */
export interface TileSet {
    /**
     * 牌组的唯一标识符
     * 用于在玩家拆分/合并牌组时追踪它
     */
    id: string;

    /**
     * 牌组中包含的具体牌，按顺序排列（顺序对于Run和包含Joker的牌组至关重要）
     */
    tiles: Tile[];

    /**
     * 运行时状态：该牌组当前是否合法
     * (在玩家拖拽过程中可能为 false，回合结束提交时必须全部为 true)
     */
    isValid: boolean;

    /**
     * 运行时状态：该牌组的基础分值总和
     * 用于校验“首次破冰出牌必须大于等于30分”的规则
     */
    score: number;
}

/**
 * 5. 补充：玩家的破冰状态
 * 这个状态通常依附在 Player 对象或游戏 State 中，这里先定义出来
 */



export interface PlayerState {
    id: string;          // 玩家唯一ID
    name: string;        // 玩家昵称
    hand: Tile[];        // 玩家当前的手牌
    hasMelted: boolean;  // 是否已经完成破冰（首次出牌总分>=30）
}

export interface GameState {
    roomId: string;             // 房间号
    status: 'WAITING' | 'PLAYING' | 'FINISHED'; // 游戏当前状态
    pool: Tile[];               // 牌堆中剩余的牌
    board: TileSet[];           // 当前桌面上的所有合法牌组
    players: PlayerState[];     // 房间内的玩家列表
    currentTurnIndex: number;   // 当前回合是哪个玩家的索引 (对应 players 数组)
}

export interface Tile {
    color: TileColor;
    value: number;
    jokerType: JokerType;
}

// 前端专用的 Tile 接口，增加 id 用于 React 渲染和拖拽追踪
export interface UITile extends Tile {
    id: string;
}

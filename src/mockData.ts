// src/mockData.ts
// 注意 UITile 前面加了 type 关键字
import { TileColor, JokerType, type UITile } from './types';

let idCounter = 0;
const createTile = (color: TileColor, value: number, jokerType: JokerType = JokerType.NONE): UITile => ({
    id: `tile-${idCounter++}`,
    color,
    value,
    jokerType
});

export const initialMockHand: UITile[] = [
    createTile(TileColor.RED, 7),
    createTile(TileColor.RED, 8),
    createTile(TileColor.RED, 9),
    createTile(TileColor.BLUE, 5),
    createTile(TileColor.BLACK, 5),
    createTile(TileColor.ORANGE, 5),
    createTile(TileColor.RED, 1, JokerType.MIRROR),
];

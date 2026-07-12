import { PALETTE } from './palette';

// A drag-and-drop sorting round: N items, each carrying a `category` that
// must match exactly one bin's `accepts` value. Bin `id` and `accepts` are
// kept separate (rather than items pointing at a bin id directly) so a round
// can freely reorder/reposition bins without needing to touch item data —
// SortScene doesn't currently randomize bin order, but this keeps that door
// open the same way MatchScene keeps 'either' initiateFrom as an unused but
// clean insertion point.
export interface SortBinDef {
  id: string;
  accepts: string;
  tint: number;
}

export interface SortItemDef {
  emoji: string;
  category: string; // matches exactly one bin's `accepts`
}

export interface SortGame {
  id: string;
  bins: SortBinDef[];
  itemPool: SortItemDef[];
  itemsPerRound: number;
  cardEmoji: string; // menu card glyph
  cardColor: number; // menu card panel-tint identity color
}

// First (and only, this slice) sort game: fruit color sorting. Pool is
// exactly 6 items (3 red, 3 yellow/orange) and itemsPerRound uses the whole
// pool each round for a balanced 3-vs-3 split — simplest option consistent
// with the spec's "4-6 items" range; partial sampling can come later if a
// bigger pool is added.
export const FRUIT_SORT: SortGame = {
  id: 'fruitsort',
  bins: [
    { id: 'red-bin', accepts: 'red', tint: PALETTE.red },
    { id: 'yellow-bin', accepts: 'yellow', tint: PALETTE.yellow },
  ],
  itemPool: [
    { emoji: '🍎', category: 'red' },
    { emoji: '🍓', category: 'red' },
    { emoji: '🍉', category: 'red' },
    { emoji: '🍌', category: 'yellow' },
    { emoji: '🍊', category: 'yellow' },
    { emoji: '🥭', category: 'yellow' },
  ],
  itemsPerRound: 6,
  cardEmoji: '🧺',
  cardColor: 0xc9975b,
};

export const SORT_GAMES: SortGame[] = [FRUIT_SORT];

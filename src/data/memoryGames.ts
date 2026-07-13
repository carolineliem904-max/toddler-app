import { ANIMAL_POOL, FRUIT_POOL } from './themes';

// Deliberately tiny (Slice 7 spec): 2-3yo memory is short, so there's exactly
// one memory game this slice — a 4-card (2-pair) round. Still modeled as an
// array (MEMORY_GAMES), matching the SORT_GAMES/QUIZ_GAMES shape, so
// menuEntries.ts's kind-level mapping stays uniform across all four mechanics
// rather than special-casing "there's only one."
export interface MemoryGame {
  id: string;
  emojiPool: string[];
  cardColor: number;
}

// Reuses the animals/fruits identical-match glyph pools (themes.ts) instead
// of a separate literal emoji list, so the memory game's pool can't drift out
// of sync with what those themes actually contain — per spec ("reuse
// animals/fruits pools").
const MEMORY_EMOJI_POOL: string[] = [...ANIMAL_POOL, ...FRUIT_POOL].map((p) => p.emoji!);

export const MEMORY_GAME: MemoryGame = {
  id: 'memory',
  emojiPool: MEMORY_EMOJI_POOL,
  cardColor: 0x8a7fd6,
};

export const MEMORY_GAMES: MemoryGame[] = [MEMORY_GAME];

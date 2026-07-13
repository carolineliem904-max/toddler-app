import { PALETTE } from './palette';
import type { IconKind } from '../rendering/icons';

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'diamond';
export type RendererKind = 'colorBlob' | 'shape' | 'shadow' | 'destination' | 'emoji';

export interface PairDef {
  id: string;
  color?: number; // colors theme: the pair's identity color; emoji themes: an identity color for the connecting line/confetti/card tint only (the glyph itself isn't recolored)
  shape?: ShapeKind; // shapes/shadows themes: the pair's identity shape
  // destinations theme: post-toddler-QA icon migration (see HANDOFF) moved
  // every pair to leftEmoji/rightEmoji, EXCEPT the one intentionally-kept
  // hybrid pair (fish-bowl) whose destination (right) side still uses this
  // drawn icon — the bowl was never the confusing part, and 🐟+🌊 would
  // collide with boat-water's water glyph. There's no left-side icon path
  // anymore (every pair's object/left side is emoji, no exceptions).
  rightIcon?: IconKind; // destinations theme (fish-bowl hybrid pair only): the destination-side icon
  emoji?: string; // objects/animals/vehicles/fruits themes: the pair's glyph, identical both sides
  leftEmoji?: string; // destinations theme: the object-side glyph
  rightEmoji?: string; // destinations theme: the destination-side glyph
}

export interface Theme {
  id: string;
  renderer: RendererKind;
  pairs: PairDef[];
  pairsPerRound: 3 | 4;
}

const COLOR_POOL: PairDef[] = [
  { id: 'red', color: PALETTE.red },
  { id: 'yellow', color: PALETTE.yellow },
  { id: 'green', color: PALETTE.green },
  { id: 'blue', color: PALETTE.blue },
  { id: 'orange', color: PALETTE.orange },
  { id: 'purple', color: PALETTE.purple },
];

const SHAPE_POOL: PairDef[] = [
  { id: 'circle', shape: 'circle' },
  { id: 'square', shape: 'square' },
  { id: 'triangle', shape: 'triangle' },
  { id: 'star', shape: 'star' },
  { id: 'heart', shape: 'heart' },
  { id: 'diamond', shape: 'diamond' },
];

// Post-toddler-QA icon migration (see HANDOFF): the Slice 3 hand-drawn
// Graphics icons weren't recognizable enough for a 2yo, so objects moved to
// the identical-match `emoji` renderer (Slice 5), same as animals/vehicles/
// fruits — a mixed-bag pool, so overlap with those other themes' pools is
// fine (this theme's identity IS "assorted things," not a curated category).
const OBJECT_POOL: PairDef[] = [
  { id: 'apple', emoji: '🍎', color: 0xe0483c },
  { id: 'ball', emoji: '⚽', color: 0x333333 },
  { id: 'flower', emoji: '🌸', color: 0xff6fa5 },
  { id: 'fish', emoji: '🐟', color: 0xff9f45 },
  { id: 'car', emoji: '🚗', color: 0x2b6fd4 },
  { id: 'chick', emoji: '🐤', color: 0xffd500 },
];

// Post-toddler-QA icon migration (see HANDOFF): QA showed confusion on this
// theme especially. Now emoji both sides wherever possible — `color` here is
// the object (left) side's traditional identity color (continuity with the
// pre-migration hand-drawn palette in icons.ts's ICON_COLORS), used only for
// the connecting-line/confetti/card tint, same convention as the plain
// `emoji` renderer's pools.
// `fish-bowl` is the one deliberately-kept hybrid pair: 🐟→🌊 would collide
// with `boat-water`'s water glyph (two different pairs both landing on the
// same destination emoji is a real ambiguity, not just a style nit), and the
// bowl was never the part QA found confusing — so it keeps the Slice 3 drawn
// icon (rightIcon: 'bowl') while its object side still moves to 🐟 for
// consistency with the objects theme's own fish. `bird-nest`'s 🪹 (nest,
// Unicode 14.0) was verified to render as a real glyph (not a tofu box) via
// a headless Chromium screenshot before committing to it — no drawn-icon
// fallback was needed. Kept as `fish-bowl` first in this array specifically
// so it stays MenuScene's default destinations card (CARD_ICON_OVERRIDE's
// `{ role: 'right' }` picks `pairs[0]` — see MenuScene decisions).
const DESTINATION_POOL: PairDef[] = [
  { id: 'fish-bowl', leftEmoji: '🐟', rightIcon: 'bowl', color: 0xff9f45 },
  { id: 'bird-nest', leftEmoji: '🐦', rightEmoji: '🪹', color: 0x4aa3ff },
  { id: 'bee-flower', leftEmoji: '🐝', rightEmoji: '🌸', color: 0xffd500 },
  { id: 'ball-basket', leftEmoji: '⚽', rightEmoji: '🧺', color: 0xff9500 },
  { id: 'car-home', leftEmoji: '🚗', rightEmoji: '🏠', color: 0xe0483c },
  { id: 'boat-water', leftEmoji: '⛵', rightEmoji: '🌊', color: 0xa9744f },
];

// Identical-match emoji themes (Slice 5 Part B): both sides show the same
// glyph, so `color` here is never shown directly — it's an approximate
// identity color used only for the connecting-line/confetti flair and menu
// card panel tint (see renderers.ts's `emoji` RendererDef; real emoji glyph
// coloring is platform-font-dependent and not something we control).
// Exported (unlike the other pools) so MemoryScene's memoryGames.ts can reuse
// these exact glyph sets rather than maintaining a separate duplicate list —
// per Slice 7 spec ("reuse animals/fruits pools"), keeping the memory game's
// emoji set in sync with whatever these pools contain.
export const ANIMAL_POOL: PairDef[] = [
  { id: 'dog', emoji: '🐶', color: 0xc68642 },
  { id: 'cat', emoji: '🐱', color: 0xf4a341 },
  { id: 'rabbit', emoji: '🐰', color: 0xf0c9c9 },
  { id: 'lion', emoji: '🦁', color: 0xe8a33d },
  { id: 'frog', emoji: '🐸', color: 0x5cb85c },
  { id: 'cow', emoji: '🐮', color: 0xf5e6d3 },
  { id: 'pig', emoji: '🐷', color: 0xffb6c1 },
  { id: 'monkey', emoji: '🐵', color: 0x8b5a2b },
];

const VEHICLE_POOL: PairDef[] = [
  { id: 'car', emoji: '🚗', color: 0xe0483c },
  { id: 'bus', emoji: '🚌', color: 0xffd500 },
  { id: 'fire-truck', emoji: '🚒', color: 0xd9362b },
  { id: 'police-car', emoji: '🚓', color: 0x2b6fd4 },
  { id: 'tractor', emoji: '🚜', color: 0x6b8e23 },
  { id: 'bicycle', emoji: '🚲', color: 0x333333 },
];

export const FRUIT_POOL: PairDef[] = [
  { id: 'apple', emoji: '🍎', color: 0xe0483c },
  { id: 'banana', emoji: '🍌', color: 0xffd500 },
  { id: 'grapes', emoji: '🍇', color: 0xaf52de },
  { id: 'orange', emoji: '🍊', color: 0xff9500 },
  { id: 'strawberry', emoji: '🍓', color: 0xff3b30 },
  { id: 'watermelon', emoji: '🍉', color: 0x34c759 },
  // Kept in the identical-match pool (color isn't the mechanic here) even
  // though it's excluded from FRUIT_SORT's yellow bin — its red-green-yellow
  // gradient is too ambiguous for the color-sorting teaching contract there.
  { id: 'mango', emoji: '🥭', color: 0xf2a93b },
];

export const THEMES: Theme[] = [
  { id: 'colors', renderer: 'colorBlob', pairs: COLOR_POOL, pairsPerRound: 4 },
  { id: 'shapes', renderer: 'shape', pairs: SHAPE_POOL, pairsPerRound: 4 },
  { id: 'shadows', renderer: 'shadow', pairs: SHAPE_POOL, pairsPerRound: 3 },
  { id: 'objects', renderer: 'emoji', pairs: OBJECT_POOL, pairsPerRound: 4 },
  { id: 'destinations', renderer: 'destination', pairs: DESTINATION_POOL, pairsPerRound: 3 },
  { id: 'animals', renderer: 'emoji', pairs: ANIMAL_POOL, pairsPerRound: 4 },
  { id: 'vehicles', renderer: 'emoji', pairs: VEHICLE_POOL, pairsPerRound: 4 },
  { id: 'fruits', renderer: 'emoji', pairs: FRUIT_POOL, pairsPerRound: 4 },
];

export function shuffled<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sameOrder(a: readonly { id: string }[], b: readonly { id: string }[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]?.id);
}

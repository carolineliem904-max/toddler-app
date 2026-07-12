import { PALETTE } from './palette';
import type { IconKind } from '../rendering/icons';

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'diamond';
export type RendererKind = 'colorBlob' | 'shape' | 'shadow' | 'object' | 'destination' | 'emoji';

export interface PairDef {
  id: string;
  color?: number; // colors theme: the pair's identity color; emoji themes: an identity color for the connecting line/confetti/card tint only (the glyph itself isn't recolored)
  shape?: ShapeKind; // shapes/shadows themes: the pair's identity shape
  icon?: IconKind; // objects theme: the pair's identity icon (same both sides)
  leftIcon?: IconKind; // destinations theme: the object-side icon
  rightIcon?: IconKind; // destinations theme: the destination-side icon
  emoji?: string; // animals/vehicles/fruits themes: the pair's glyph, identical both sides
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

const OBJECT_POOL: PairDef[] = [
  { id: 'apple', icon: 'apple' },
  { id: 'ball', icon: 'ball' },
  { id: 'cup', icon: 'cup' },
  { id: 'fish', icon: 'fish' },
  { id: 'flower', icon: 'flower' },
  { id: 'car', icon: 'car' },
];

const DESTINATION_POOL: PairDef[] = [
  { id: 'fish-bowl', leftIcon: 'fish', rightIcon: 'bowl' },
  { id: 'car-road', leftIcon: 'car', rightIcon: 'road' },
  { id: 'bird-nest', leftIcon: 'bird', rightIcon: 'nest' },
  { id: 'bee-flower', leftIcon: 'bee', rightIcon: 'flower' },
  { id: 'boat-water', leftIcon: 'boat', rightIcon: 'water' },
  { id: 'ball-basket', leftIcon: 'ball', rightIcon: 'basket' },
];

// Identical-match emoji themes (Slice 5 Part B): both sides show the same
// glyph, so `color` here is never shown directly — it's an approximate
// identity color used only for the connecting-line/confetti flair and menu
// card panel tint (see renderers.ts's `emoji` RendererDef; real emoji glyph
// coloring is platform-font-dependent and not something we control).
const ANIMAL_POOL: PairDef[] = [
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

const FRUIT_POOL: PairDef[] = [
  { id: 'apple', emoji: '🍎', color: 0xe0483c },
  { id: 'banana', emoji: '🍌', color: 0xffd500 },
  { id: 'grapes', emoji: '🍇', color: 0xaf52de },
  { id: 'orange', emoji: '🍊', color: 0xff9500 },
  { id: 'strawberry', emoji: '🍓', color: 0xff3b30 },
  { id: 'watermelon', emoji: '🍉', color: 0x34c759 },
];

export const THEMES: Theme[] = [
  { id: 'colors', renderer: 'colorBlob', pairs: COLOR_POOL, pairsPerRound: 4 },
  { id: 'shapes', renderer: 'shape', pairs: SHAPE_POOL, pairsPerRound: 4 },
  { id: 'shadows', renderer: 'shadow', pairs: SHAPE_POOL, pairsPerRound: 3 },
  { id: 'objects', renderer: 'object', pairs: OBJECT_POOL, pairsPerRound: 4 },
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

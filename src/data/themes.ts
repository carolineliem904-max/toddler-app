import { PALETTE } from './palette';
import type { IconKind } from '../rendering/icons';

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'diamond';
export type RendererKind = 'colorBlob' | 'shape' | 'shadow' | 'object' | 'destination';

export interface PairDef {
  id: string;
  color?: number; // colors theme: the pair's identity color
  shape?: ShapeKind; // shapes/shadows themes: the pair's identity shape
  icon?: IconKind; // objects theme: the pair's identity icon (same both sides)
  leftIcon?: IconKind; // destinations theme: the object-side icon
  rightIcon?: IconKind; // destinations theme: the destination-side icon
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

export const THEMES: Theme[] = [
  { id: 'colors', renderer: 'colorBlob', pairs: COLOR_POOL, pairsPerRound: 4 },
  { id: 'shapes', renderer: 'shape', pairs: SHAPE_POOL, pairsPerRound: 4 },
  { id: 'shadows', renderer: 'shadow', pairs: SHAPE_POOL, pairsPerRound: 3 },
  { id: 'objects', renderer: 'object', pairs: OBJECT_POOL, pairsPerRound: 4 },
  { id: 'destinations', renderer: 'destination', pairs: DESTINATION_POOL, pairsPerRound: 3 },
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

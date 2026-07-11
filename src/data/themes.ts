import { PALETTE } from './palette';

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'star';
export type RendererKind = 'colorBlob' | 'shape' | 'shadow';

export interface PairDef {
  id: string;
  color?: number; // colors theme: the pair's identity color
  shape?: ShapeKind; // shapes/shadows themes: the pair's identity shape
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
];

const SHAPE_POOL: PairDef[] = [
  { id: 'circle', shape: 'circle' },
  { id: 'square', shape: 'square' },
  { id: 'triangle', shape: 'triangle' },
  { id: 'star', shape: 'star' },
];

// Fixed rotation order: colors -> shapes -> shadows -> colors ...
export const THEMES: Theme[] = [
  { id: 'colors', renderer: 'colorBlob', pairs: COLOR_POOL, pairsPerRound: 4 },
  { id: 'shapes', renderer: 'shape', pairs: SHAPE_POOL, pairsPerRound: 4 },
  { id: 'shadows', renderer: 'shadow', pairs: SHAPE_POOL, pairsPerRound: 3 },
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

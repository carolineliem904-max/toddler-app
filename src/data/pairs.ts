export interface ColorPair {
  id: string;
  color: number;
}

export interface RoundData {
  pairs: ColorPair[];
}

// Slice 1 fixed palette. Slice 2 can swap this (or add alternate pools) for
// shapes/vehicles/shadows without touching MatchScene's matching logic.
export const ROUND_DATA: RoundData = {
  pairs: [
    { id: 'red', color: 0xff4d4d },
    { id: 'yellow', color: 0xffd23f },
    { id: 'green', color: 0x4caf50 },
    { id: 'blue', color: 0x4a90d9 },
  ],
};

export function shuffled<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sameOrder(a: readonly ColorPair[], b: readonly ColorPair[]): boolean {
  return a.length === b.length && a.every((pair, i) => pair.id === b[i]?.id);
}

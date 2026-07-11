// High-saturation, toddler-friendly primaries. All themes reference this pool
// rather than defining their own colors, so a future palette tweak is one edit.
export const PALETTE = {
  red: 0xff3b30,
  yellow: 0xffd500,
  green: 0x34c759,
  blue: 0x0a84ff,
} as const;

export const PALETTE_LIST: number[] = Object.values(PALETTE);

export const SHADOW_GREY = 0x4a4a4a;

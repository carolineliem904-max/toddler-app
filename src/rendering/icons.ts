import Phaser from 'phaser';
import type { ShapeHandle } from './shapeHandle';

// Post-toddler-QA icon migration (see HANDOFF): the objects theme and most of
// the destinations theme moved to real emoji glyphs (Slice 3's hand-drawn
// Graphics icons weren't recognizable enough for a 2yo). Only two icons are
// still referenced anywhere: 'bowl' (the one deliberately-kept destinations
// hybrid pair, fish-bowl — the bowl was never the confusing part) and
// 'basket' (SortScene's fruit-sort bins, unrelated to the destinations
// theme). Every other icon this module used to draw (apple/ball/cup/fish/
// flower/car/bird/bee/boat/road/nest/water) was removed as dead code along
// with the migration — see git history if the old art is ever needed again.
export type IconKind = 'bowl' | 'basket';

// Fixed per-icon identity color — unlike the shapes theme, an icon always
// reads as its own color so matching is purely about recognizing the object.
export const ICON_COLORS: Record<IconKind, number> = {
  bowl: 0x7fb6e0,
  basket: 0xb8865b,
};

// All placeholder art — simple primitive combinations, easy to swap for real
// assets later since every icon is reached only through drawIcon() below.
function paintIcon(g: Phaser.GameObjects.Graphics, kind: IconKind, radius: number, color: number, stroke: number): void {
  g.clear();
  g.fillStyle(color, 1);
  g.lineStyle(stroke, 0x000000, 0.15);

  switch (kind) {
    case 'bowl': {
      g.beginPath();
      g.slice(0, -radius * 0.1, radius * 0.85, 0, Math.PI, false);
      g.fillPath();
      g.strokePath();
      break;
    }
    case 'basket': {
      g.fillRect(-radius * 0.7, -radius * 0.1, radius * 1.4, radius * 0.75);
      g.strokeRect(-radius * 0.7, -radius * 0.1, radius * 1.4, radius * 0.75);
      g.lineStyle(Math.max(2, stroke), 0x5c3d20, 0.4);
      g.lineBetween(-radius * 0.7, radius * 0.15, radius * 0.7, radius * 0.15);
      g.lineBetween(-radius * 0.7, radius * 0.4, radius * 0.7, radius * 0.4);
      g.lineStyle(stroke, color, 1);
      g.beginPath();
      g.arc(0, -radius * 0.15, radius * 0.4, Math.PI, 2 * Math.PI, false);
      g.strokePath();
      break;
    }
  }
}

export function drawIcon(scene: Phaser.Scene, kind: IconKind, radius: number, color: number): ShapeHandle {
  const g = scene.add.graphics();
  const strokeWidth = Math.max(2, radius * 0.05);
  const paint = (c: number) => paintIcon(g, kind, radius, c, strokeWidth);
  paint(color);
  return { gameObject: g, setFillStyle: paint };
}

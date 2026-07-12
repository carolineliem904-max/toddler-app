import Phaser from 'phaser';
import type { ShapeHandle } from './shapeHandle';

export type IconKind =
  | 'apple'
  | 'ball'
  | 'cup'
  | 'fish'
  | 'flower'
  | 'car'
  | 'bird'
  | 'bee'
  | 'boat'
  | 'bowl'
  | 'road'
  | 'nest'
  | 'water'
  | 'basket';

// Fixed per-icon identity color — unlike the shapes theme, an apple always
// reads as "apple-red" so matching is purely about recognizing the object.
export const ICON_COLORS: Record<IconKind, number> = {
  apple: 0xe0483c,
  ball: 0xff9500,
  cup: 0x0a84ff,
  fish: 0xff9f45,
  flower: 0xff6fa5,
  car: 0xe0483c,
  bird: 0x4aa3ff,
  bee: 0xffd500,
  boat: 0xa9744f,
  bowl: 0x7fb6e0,
  road: 0x6b6b6b,
  nest: 0x8a5a34,
  water: 0x3aa0e8,
  basket: 0xb8865b,
};

const DARK = 0x2b2b2b;
const PALE = 0xffffff;

// All placeholder art — simple primitive combinations, easy to swap for real
// assets later since every icon is reached only through drawIcon() below.
function paintIcon(g: Phaser.GameObjects.Graphics, kind: IconKind, radius: number, color: number, stroke: number): void {
  g.clear();
  g.fillStyle(color, 1);
  g.lineStyle(stroke, 0x000000, 0.15);

  switch (kind) {
    case 'apple': {
      g.fillCircle(0, radius * 0.08, radius * 0.78);
      g.strokeCircle(0, radius * 0.08, radius * 0.78);
      g.fillStyle(0x6b4a2f, 1);
      g.fillRect(-radius * 0.05, -radius * 0.85, radius * 0.1, radius * 0.3);
      g.fillStyle(0x4caf50, 1);
      g.fillTriangle(radius * 0.05, -radius * 0.8, radius * 0.4, -radius * 0.6, radius * 0.1, -radius * 0.55);
      break;
    }
    case 'ball': {
      g.fillCircle(0, 0, radius * 0.85);
      g.strokeCircle(0, 0, radius * 0.85);
      g.lineStyle(Math.max(2, stroke), 0x000000, 0.2);
      g.lineBetween(-radius * 0.6, 0, radius * 0.6, 0);
      g.lineBetween(0, -radius * 0.6, 0, radius * 0.6);
      break;
    }
    case 'cup': {
      g.fillRect(-radius * 0.45, -radius * 0.35, radius * 0.9, radius * 0.85);
      g.strokeRect(-radius * 0.45, -radius * 0.35, radius * 0.9, radius * 0.85);
      g.lineStyle(stroke, color, 1);
      g.beginPath();
      g.arc(radius * 0.45, radius * 0.05, radius * 0.32, -Math.PI / 2, Math.PI / 2, false);
      g.strokePath();
      break;
    }
    case 'fish': {
      g.fillEllipse(0, 0, radius * 1.5, radius * 0.9);
      g.strokeEllipse(0, 0, radius * 1.5, radius * 0.9);
      g.fillTriangle(radius * 0.55, 0, radius, -radius * 0.35, radius, radius * 0.35);
      break;
    }
    case 'flower': {
      const petalR = radius * 0.38;
      const dist = radius * 0.55;
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6;
        const px = Math.cos(angle) * dist;
        const py = Math.sin(angle) * dist;
        g.fillCircle(px, py, petalR);
        g.strokeCircle(px, py, petalR);
      }
      g.fillStyle(0xffd500, 1);
      g.fillCircle(0, 0, radius * 0.32);
      g.strokeCircle(0, 0, radius * 0.32);
      break;
    }
    case 'car': {
      g.fillRoundedRect(-radius * 0.8, -radius * 0.15, radius * 1.6, radius * 0.55, radius * 0.15);
      g.strokeRoundedRect(-radius * 0.8, -radius * 0.15, radius * 1.6, radius * 0.55, radius * 0.15);
      g.fillRoundedRect(-radius * 0.4, -radius * 0.55, radius * 0.85, radius * 0.45, radius * 0.12);
      g.strokeRoundedRect(-radius * 0.4, -radius * 0.55, radius * 0.85, radius * 0.45, radius * 0.12);
      g.fillStyle(DARK, 1);
      g.fillCircle(-radius * 0.45, radius * 0.42, radius * 0.2);
      g.fillCircle(radius * 0.45, radius * 0.42, radius * 0.2);
      break;
    }
    case 'bird': {
      g.fillEllipse(0, 0, radius * 1.3, radius * 1.0);
      g.strokeEllipse(0, 0, radius * 1.3, radius * 1.0);
      g.fillStyle(0xff9500, 1);
      g.fillTriangle(radius * 0.55, -radius * 0.05, radius * 0.95, radius * 0.1, radius * 0.55, radius * 0.2);
      g.fillStyle(color, 1);
      g.fillTriangle(-radius * 0.2, -radius * 0.1, -radius * 0.55, -radius * 0.45, -radius * 0.05, -radius * 0.3);
      break;
    }
    case 'bee': {
      g.fillStyle(PALE, 0.85);
      g.fillEllipse(-radius * 0.3, -radius * 0.5, radius * 0.5, radius * 0.3);
      g.fillEllipse(radius * 0.3, -radius * 0.5, radius * 0.5, radius * 0.3);
      g.fillStyle(color, 1);
      g.fillEllipse(0, radius * 0.1, radius * 1.3, radius * 0.85);
      g.fillStyle(DARK, 1);
      g.fillRect(-radius * 0.2, -radius * 0.32, radius * 0.16, radius * 0.85);
      g.fillRect(radius * 0.1, -radius * 0.32, radius * 0.16, radius * 0.85);
      break;
    }
    case 'boat': {
      g.fillTriangle(-radius * 0.85, radius * 0.3, radius * 0.85, radius * 0.3, radius * 0.55, radius * 0.75);
      g.strokeTriangle(-radius * 0.85, radius * 0.3, radius * 0.85, radius * 0.3, radius * 0.55, radius * 0.75);
      g.fillStyle(PALE, 1);
      g.fillTriangle(0, radius * 0.3, 0, -radius * 0.85, radius * 0.5, radius * 0.3);
      break;
    }
    case 'bowl': {
      g.beginPath();
      g.slice(0, -radius * 0.1, radius * 0.85, 0, Math.PI, false);
      g.fillPath();
      g.strokePath();
      break;
    }
    case 'road': {
      g.fillRoundedRect(-radius * 0.9, -radius * 0.35, radius * 1.8, radius * 0.7, radius * 0.12);
      g.strokeRoundedRect(-radius * 0.9, -radius * 0.35, radius * 1.8, radius * 0.7, radius * 0.12);
      g.fillStyle(PALE, 0.9);
      for (let i = -1; i <= 1; i++) {
        g.fillRect(i * radius * 0.5 - radius * 0.08, -radius * 0.06, radius * 0.16, radius * 0.12);
      }
      break;
    }
    case 'nest': {
      // Wider + shallower than the bowl's semicircle (bowl: r=0.85, full
      // half-circle depth), plus twiggy strokes poking above the rim, so the
      // two "destination" silhouettes read as distinct at a glance rather
      // than as twin semicircles (Slice 4 HANDOFF Part A2 — a real
      // toddler-difficulty issue, not just a style tweak).
      const rx = radius * 0.95;
      const ry = radius * 0.5;
      const rimY = -radius * 0.05;
      const pts: number[] = [];
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const t = Math.PI * (i / steps);
        pts.push(Math.cos(t) * rx, rimY + Math.sin(t) * ry);
      }
      g.beginPath();
      g.moveTo(pts[0] ?? 0, pts[1] ?? 0);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
      g.closePath();
      g.fillPath();
      g.strokePath();

      // Rough/twiggy rim: short brown strokes poking up above the rim line.
      g.lineStyle(Math.max(2, stroke * 1.2), 0x5c3d20, 0.8);
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const bx = i * rx * 0.24;
        const tipX = bx + (i % 2 === 0 ? -radius * 0.06 : radius * 0.06);
        g.lineBetween(bx, rimY, tipX, rimY - radius * 0.22);
      }

      // Woven texture inside the bowl of the nest.
      g.lineStyle(Math.max(2, stroke), 0x5c3d20, 0.5);
      for (let i = -2; i <= 2; i++) {
        g.lineBetween(i * rx * 0.28, ry * 0.55, i * rx * 0.28 + rx * 0.14, rimY + ry * 0.1);
      }
      break;
    }
    case 'water': {
      g.fillRoundedRect(-radius * 0.9, -radius * 0.5, radius * 1.8, radius * 1.0, radius * 0.15);
      g.strokeRoundedRect(-radius * 0.9, -radius * 0.5, radius * 1.8, radius * 1.0, radius * 0.15);
      g.lineStyle(Math.max(2, stroke), PALE, 0.6);
      g.lineBetween(-radius * 0.65, -radius * 0.05, radius * 0.65, -radius * 0.05);
      g.lineBetween(-radius * 0.65, radius * 0.2, radius * 0.65, radius * 0.2);
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

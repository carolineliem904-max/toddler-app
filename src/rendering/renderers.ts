import Phaser from 'phaser';
import type { PairDef, RendererKind, ShapeKind } from '../data/themes';
import { PALETTE_LIST, SHADOW_GREY } from '../data/palette';
import { desaturate } from '../utils/color';
import { drawIcon, ICON_COLORS } from './icons';
import type { ShapeHandle } from './shapeHandle';

export interface ItemVisual {
  container: Phaser.GameObjects.Container;
  /** Dim + desaturate this item's colored parts. Called by the mechanic on a correct match. */
  applyMatchedStyle: () => void;
}

export interface RenderArgs {
  scene: Phaser.Scene;
  x: number;
  y: number;
  radius: number;
  role: 'left' | 'right';
  color: number;
  pair: PairDef;
}

interface RendererDef {
  /** Resolves the per-round left/right colors for one pair instance of this theme. */
  resolveInstance: (pair: PairDef) => { leftColor: number; rightColor: number };
  render: (args: RenderArgs) => ItemVisual;
}

// Shapes theme difficulty toggle (Part A, Slice 3). Same-color matching is the
// default for 2-3yo (color no longer misleads); flipping this to true restores
// the cross-color "match by shape only" mode as a future 3-4yo difficulty step.
// Deliberately not wired to any UI yet — no settings/parent-gate this slice.
const SHAPE_CROSS_COLOR_MODE = false;

function randomColor(): number {
  return Phaser.Utils.Array.GetRandom(PALETTE_LIST);
}

function randomColorExcluding(exclude: number): number {
  const options = PALETTE_LIST.filter((c) => c !== exclude);
  return Phaser.Utils.Array.GetRandom(options);
}

function addEyes(scene: Phaser.Scene, container: Phaser.GameObjects.Container, radius: number): void {
  const eyeOffsetX = radius * 0.35;
  const eyeOffsetY = -radius * 0.15;
  const eyeR = radius * 0.18;
  container.add([
    scene.add.circle(-eyeOffsetX, eyeOffsetY, eyeR, 0xffffff),
    scene.add.circle(eyeOffsetX, eyeOffsetY, eyeR, 0xffffff),
    scene.add.circle(-eyeOffsetX, eyeOffsetY, eyeR * 0.5, 0x111111),
    scene.add.circle(eyeOffsetX, eyeOffsetY, eyeR * 0.5, 0x111111),
  ]);
}

function triangleCorners(radius: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    pts.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return pts;
}

function diamondCorners(radius: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 2;
    pts.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return pts;
}

function starPoints(outerR: number, innerR: number, spikes = 5): number[] {
  const pts: number[] = [];
  const step = Math.PI / spikes;
  let angle = -Math.PI / 2;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(Math.cos(angle) * r, Math.sin(angle) * r);
    angle += step;
  }
  return pts;
}

// Phaser's Triangle/Polygon game objects don't reliably center on their
// (x, y) the way Arc/Rectangle do (their origin tracks the raw point bounds,
// not the centroid) — confirmed visually (shapes rendered off-position,
// overlapping neighboring rows). Drawing them by hand with Graphics sidesteps
// that entirely: the points are authored already centered on local (0,0).
function drawPolygonWithGraphics(scene: Phaser.Scene, points: number[], color: number, strokeWidth: number): ShapeHandle {
  const g = scene.add.graphics();
  const paint = (fillColor: number) => {
    g.clear();
    g.fillStyle(fillColor, 1);
    g.lineStyle(strokeWidth, 0x000000, 0.15);
    g.beginPath();
    g.moveTo(points[0] ?? 0, points[1] ?? 0);
    for (let i = 2; i < points.length; i += 2) {
      g.lineTo(points[i] ?? 0, points[i + 1] ?? 0);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();
  };
  paint(color);
  return { gameObject: g, setFillStyle: paint };
}

function drawHeartWithGraphics(scene: Phaser.Scene, radius: number, color: number, strokeWidth: number): ShapeHandle {
  const g = scene.add.graphics();
  const lobeR = radius * 0.42;
  const paint = (fillColor: number) => {
    g.clear();
    g.fillStyle(fillColor, 1);
    g.lineStyle(strokeWidth, 0x000000, 0.15);
    g.fillCircle(-lobeR * 0.9, -radius * 0.15, lobeR);
    g.fillCircle(lobeR * 0.9, -radius * 0.15, lobeR);
    g.fillTriangle(-radius * 0.95, -radius * 0.05, radius * 0.95, -radius * 0.05, 0, radius * 0.95);
    g.strokeCircle(-lobeR * 0.9, -radius * 0.15, lobeR);
    g.strokeCircle(lobeR * 0.9, -radius * 0.15, lobeR);
    g.strokeTriangle(-radius * 0.95, -radius * 0.05, radius * 0.95, -radius * 0.05, 0, radius * 0.95);
  };
  paint(color);
  return { gameObject: g, setFillStyle: paint };
}

// Arc/Rectangle center correctly on (x, y) out of the box and share the
// native setFillStyle(color) API.
function drawNativeShape(obj: Phaser.GameObjects.Shape, strokeWidth: number): ShapeHandle {
  obj.setStrokeStyle(strokeWidth, 0x000000, 0.15);
  return { gameObject: obj, setFillStyle: (color) => obj.setFillStyle(color) };
}

function drawShape(scene: Phaser.Scene, shape: ShapeKind, radius: number, color: number): ShapeHandle {
  const strokeWidth = Math.max(2, radius * 0.05);
  switch (shape) {
    case 'square':
      return drawNativeShape(scene.add.rectangle(0, 0, radius * 1.5, radius * 1.5, color), strokeWidth);
    case 'triangle':
      return drawPolygonWithGraphics(scene, triangleCorners(radius * 1.15), color, strokeWidth);
    case 'diamond':
      return drawPolygonWithGraphics(scene, diamondCorners(radius * 1.05), color, strokeWidth);
    case 'star':
      return drawPolygonWithGraphics(scene, starPoints(radius * 1.15, radius * 0.55), color, strokeWidth);
    case 'heart':
      return drawHeartWithGraphics(scene, radius, color, strokeWidth);
    case 'circle':
    default:
      return drawNativeShape(scene.add.circle(0, 0, radius, color), strokeWidth);
  }
}

function matchedStyleApplier(container: Phaser.GameObjects.Container, body: ShapeHandle, color: number): () => void {
  return () => {
    body.setFillStyle(desaturate(color));
    container.setAlpha(0.38);
  };
}

const colorBlob: RendererDef = {
  resolveInstance: (pair) => {
    const c = pair.color ?? randomColor();
    return { leftColor: c, rightColor: c };
  },
  render: ({ scene, x, y, radius, role, color }) => {
    const container = scene.add.container(x, y);
    const body = drawShape(scene, 'circle', radius, color);
    container.add(body.gameObject);
    if (role === 'left') addEyes(scene, container, radius);
    return { container, applyMatchedStyle: matchedStyleApplier(container, body, color) };
  },
};

const shape: RendererDef = {
  resolveInstance: () => {
    const leftColor = randomColor();
    const rightColor = SHAPE_CROSS_COLOR_MODE ? randomColorExcluding(leftColor) : leftColor;
    return { leftColor, rightColor };
  },
  render: ({ scene, x, y, radius, role, color, pair }) => {
    const container = scene.add.container(x, y);
    const body = drawShape(scene, pair.shape ?? 'circle', radius, color);
    container.add(body.gameObject);
    if (role === 'left') addEyes(scene, container, radius);
    return { container, applyMatchedStyle: matchedStyleApplier(container, body, color) };
  },
};

const shadow: RendererDef = {
  resolveInstance: () => ({ leftColor: randomColor(), rightColor: SHADOW_GREY }),
  render: ({ scene, x, y, radius, role, color, pair }) => {
    const container = scene.add.container(x, y);
    const body = drawShape(scene, pair.shape ?? 'circle', radius, color);
    container.add(body.gameObject);
    // Only the colored (left) item is a "character" — the shadow itself has no face.
    if (role === 'left') addEyes(scene, container, radius);
    return { container, applyMatchedStyle: matchedStyleApplier(container, body, color) };
  },
};

const object: RendererDef = {
  resolveInstance: (pair) => {
    const c = ICON_COLORS[pair.icon ?? 'apple'];
    return { leftColor: c, rightColor: c };
  },
  render: ({ scene, x, y, radius, role, color, pair }) => {
    const container = scene.add.container(x, y);
    const body = drawIcon(scene, pair.icon ?? 'apple', radius, color);
    container.add(body.gameObject);
    if (role === 'left') addEyes(scene, container, radius);
    return { container, applyMatchedStyle: matchedStyleApplier(container, body, color) };
  },
};

const destination: RendererDef = {
  resolveInstance: (pair) => ({
    leftColor: ICON_COLORS[pair.leftIcon ?? 'fish'],
    rightColor: ICON_COLORS[pair.rightIcon ?? 'bowl'],
  }),
  render: ({ scene, x, y, radius, role, color, pair }) => {
    const container = scene.add.container(x, y);
    const icon = role === 'left' ? (pair.leftIcon ?? 'fish') : (pair.rightIcon ?? 'bowl');
    const body = drawIcon(scene, icon, radius, color);
    container.add(body.gameObject);
    // Left = the object (a character, gets eyes). Right = the destination it belongs to (no face).
    if (role === 'left') addEyes(scene, container, radius);
    return { container, applyMatchedStyle: matchedStyleApplier(container, body, color) };
  },
};

export const RENDERERS: Record<RendererKind, RendererDef> = { colorBlob, shape, shadow, object, destination };

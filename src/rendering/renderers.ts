import Phaser from 'phaser';
import type { PairDef, RendererKind, ShapeKind } from '../data/themes';
import { PALETTE_LIST, SHADOW_GREY } from '../data/palette';
import { desaturate } from '../utils/color';
import { drawIcon, ICON_COLORS } from './icons';
import { createEmojiText } from './emojiText';
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

// Exported (unlike the other polygon-corner helpers) because MemoryScene's
// face-down star-sticker motif and MenuScene's memory menu-card preview both
// need the identical star geometry — a tiny, pure, stateless formula, unlike
// the full-scene duplication this codebase otherwise prefers (see HANDOFF:
// home button / confetti duplicated verbatim across scenes). Sharing a ~10
// line trig helper isn't the same category of choice as sharing scene logic.
export function starPoints(outerR: number, innerR: number, spikes = 5): number[] {
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

// Post-toddler-QA icon migration (see HANDOFF): destination pairs now render
// an emoji glyph per side — every pair's object (left) side is emoji, no
// exceptions, so the left side has no drawn-icon path at all anymore. The
// destination (right) side falls back to the Slice 3 drawn-icon path
// (`rightIcon`) only for the one deliberately-kept hybrid pair (fish-bowl —
// the bowl was never the confusing part). Unlike a drawn icon (whose `color`
// literally fills the shape), an emoji glyph's `color` is purely decorative
// (connecting-line/confetti/card-tint only, same convention as the plain
// `emoji` RendererDef) since real emoji glyphs render with their own
// inherent color and ignore fill/tint.
const destination: RendererDef = {
  resolveInstance: (pair) => ({
    leftColor: pair.color ?? randomColor(),
    rightColor: pair.rightEmoji ? (pair.color ?? randomColor()) : ICON_COLORS[pair.rightIcon ?? 'bowl'],
  }),
  render: ({ scene, x, y, radius, role, color, pair }) => {
    const container = scene.add.container(x, y);

    if (role === 'left') {
      // Always emoji — left already has its own face/identity (same
      // reasoning as the plain `emoji` renderer), so it gets the idle
      // breathing loop instead of drawn eyes.
      container.add(createEmojiText(scene, pair.leftEmoji ?? '❓', radius * 1.6));
      scene.tweens.add({
        targets: container,
        scale: { from: 1, to: 1.06 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      // Emoji glyphs can't be tinted/desaturated reliably (same reasoning as
      // the plain `emoji` renderer) — alpha-only matched style.
      return { container, applyMatchedStyle: () => container.setAlpha(0.35) };
    }

    if (pair.rightEmoji) {
      container.add(createEmojiText(scene, pair.rightEmoji, radius * 1.6));
      return { container, applyMatchedStyle: () => container.setAlpha(0.35) };
    }
    const body = drawIcon(scene, pair.rightIcon ?? 'bowl', radius, color);
    container.add(body.gameObject);
    return { container, applyMatchedStyle: matchedStyleApplier(container, body, color) };
  },
};

const emoji: RendererDef = {
  resolveInstance: (pair) => {
    const c = pair.color ?? randomColor();
    return { leftColor: c, rightColor: c };
  },
  render: ({ scene, x, y, radius, role, pair }) => {
    const container = scene.add.container(x, y);
    // fontSizePx * radius floor of 60 (MatchScene's clamp) => >=96 CSS px,
    // satisfying the spec's "fontSize >= 96px at phone scale" floor while
    // scaling proportionally everywhere else (menu cards, tablet, etc.)
    // the same way every other renderer's `radius` already does.
    const text = createEmojiText(scene, pair.emoji ?? '❓', radius * 1.6);
    container.add(text);
    // Left = the "friendly" side, gets a subtle idle breathing loop instead
    // of drawn eyes (emoji glyphs already have faces). Right stays static.
    if (role === 'left') {
      scene.tweens.add({
        targets: container,
        scale: { from: 1, to: 1.06 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    return {
      container,
      // Tinting/desaturating emoji glyph text is unreliable across
      // platforms (font-rendered color glyphs largely ignore fill/tint), so
      // the matched-style treatment is alpha-only rather than the
      // desaturate+dim combo the other renderers use.
      applyMatchedStyle: () => container.setAlpha(0.35),
    };
  },
};

export const RENDERERS: Record<RendererKind, RendererDef> = { colorBlob, shape, shadow, destination, emoji };

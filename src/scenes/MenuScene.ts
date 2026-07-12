import Phaser from 'phaser';
import { type PairDef, type Theme } from '../data/themes';
import { MENU_ENTRIES, type MenuEntry } from '../data/menuEntries';
import { RENDERERS } from '../rendering/renderers';
import { createEmojiText } from '../rendering/emojiText';
import { lighten, darken } from '../utils/color';
import { PALETTE } from '../data/palette';
import { AudioManager } from '../audio/AudioManager';

const BACKGROUND_COLOR = 0xfff8ee;
// Deliberately smaller than MatchScene's 60px gameplay edge margin: a menu of
// large, evenly-spaced choice cards is a calmer interaction than fast-paced
// tap-tap gameplay, and 60px doesn't leave room for 2 columns of 160px-min
// cards at 390px phone width. See HANDOFF decisions.
const MENU_EDGE_MARGIN_PX = 24;
const CARD_GAP_PX = 12;
// 160px was the original per-card target (still what computeGrid() reaches
// whenever geometry allows — confirmed at up to 8 cards on both tested
// viewports). CARD_SAFETY_FLOOR_PX is the true, never-violated floor:
// CLAUDE.md's 120px touch-target minimum. Slice 5's 9th card (8 themes + 1
// sort game) doesn't fit 160px cards in 2 columns on a 390x844 phone without
// either scrolling (unsupported) or shrinking below 160 — see computeGrid()'s
// adaptive column choice and HANDOFF Slice 5 decisions for the full math.
const CARD_SAFETY_FLOOR_PX = 120;
const CARD_MAX_PX = 240;
const GRID_COLUMN_CANDIDATES = [2, 3];
const MUTE_BUTTON_SIZE_PX = 80; // same size discipline as MatchScene's home button
// Reserves top clearance for the mute button, same fix as MatchScene's
// TOP_MARGIN_PX (HANDOFF Slice 3): a fixed-size corner button and a
// vertically-centered grid can overlap on short viewports if the grid isn't
// pushed clear of the button's footprint. Verified via headless testing at
// 390x667 before this fix was in place.
const TOP_CLEARANCE_PX = MENU_EDGE_MARGIN_PX + MUTE_BUTTON_SIZE_PX + 16;

// Which pair/role represents each theme on its menu card. Defaults to the
// pool's first pair, shown as the "left" (friendly, eyed) character. Themes
// whose most recognizable signature is the *other* side override it — e.g.
// shadows reads as "shadows" via its grey silhouette, not a colored blob that
// would look identical to the shapes card.
//
// `color` is only needed for renderers whose resolveInstance() picks a
// *random* color per call (shape) — without pinning it here, the card would
// reroll to a random color on every menu load/resize, defeating the
// no-shared-dominant-color requirement below. Renderers with a fixed
// per-pair/per-icon color (colorBlob, shadow, object, destination) don't
// need it.
//
// Slice 4 differentiation pass (HANDOFF Part A1): chosen so no two cards
// share a dominant color AND no two cards share a silhouette, EXCEPT shapes
// (star) vs shadows (grey star) which intentionally keep the same
// star silhouette — shadows' grey fill + grey-tinted panel reads as "shadow"
// specifically because it's colorless, an intentional contrast with shapes'
// solid-color star, not an oversight.
// Slice 5 Part A/B: shapes card recolored blue -> yellow (was colliding with
// destinations' blue bowl); animals/vehicles/fruits added. Fruits uses grapes
// (purple), not the spec's suggested banana, because banana-yellow collides
// with the now-yellow shapes star — the spec's own documented fallback.
// Remaining accepted collision: vehicles' car and colors' circle are both
// red (different exact shades: 0xe0483c vs 0xff3b30) — same category of
// exception as Slice 4's shapes/destinations blue overlap (non-adjacent grid
// cells, completely different silhouettes). Full matrix in HANDOFF.
const CARD_ICON_OVERRIDE: Partial<Record<string, { pairId?: string; role: 'left' | 'right'; color?: number }>> = {
  colors: { pairId: 'red', role: 'left' },
  shapes: { pairId: 'star', role: 'left', color: PALETTE.yellow },
  shadows: { pairId: 'star', role: 'right' },
  objects: { pairId: 'fish', role: 'left' },
  destinations: { role: 'right' },
  animals: { pairId: 'dog', role: 'left' },
  vehicles: { pairId: 'car', role: 'left' },
  fruits: { pairId: 'grapes', role: 'left' },
};

function pickCardPair(theme: Theme): { pair: PairDef; role: 'left' | 'right'; color?: number } {
  const override = CARD_ICON_OVERRIDE[theme.id];
  const role = override?.role ?? 'left';
  const byId = override?.pairId ? theme.pairs.find((p) => p.id === override.pairId) : undefined;
  return { pair: byId ?? theme.pairs[0]!, role, color: override?.color };
}

export class MenuScene extends Phaser.Scene {
  private lastSize = { w: 0, h: 0 };
  private muteButton: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.lastSize = { w: this.scale.width, h: this.scale.height };
    this.scale.on('resize', this.handleResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.handleResize, this));

    const dpr = window.devicePixelRatio || 1;
    const { positions, cardSize } = this.computeGrid(MENU_ENTRIES.length);

    MENU_ENTRIES.forEach((entry, i) => {
      const pos = positions[i];
      if (!pos) return;
      this.createCard(entry, pos.x, pos.y, cardSize, dpr, i);
    });

    this.createMuteButton();
  }

  private handleResize(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    // Same no-op-initial-resize guard as MatchScene (see its HANDOFF note).
    if (w === this.lastSize.w && h === this.lastSize.h) return;
    this.lastSize = { w, h };
    this.scene.restart();
  }

  // Tries each candidate column count and keeps whichever yields the larger
  // resulting card size for the current viewport + entry count (this is the
  // spec's "3-col on tablet if needed" — expressed as "pick whichever fits
  // best" rather than a hardcoded width breakpoint, so it keeps working as
  // entries are added later). See HANDOFF Slice 5 decisions for the concrete
  // numbers at both tested viewports.
  private computeGrid(count: number): { positions: { x: number; y: number }[]; cardSize: number } {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.scale.width / dpr;
    const cssH = this.scale.height / dpr;

    const usableW = cssW - MENU_EDGE_MARGIN_PX * 2;
    const usableH = cssH - TOP_CLEARANCE_PX - MENU_EDGE_MARGIN_PX;

    let cols = GRID_COLUMN_CANDIDATES[0]!;
    let bestSize = 0;
    for (const candidateCols of GRID_COLUMN_CANDIDATES) {
      const rows = Math.ceil(count / candidateCols);
      const cellW = (usableW - CARD_GAP_PX * (candidateCols - 1)) / candidateCols;
      const cellH = (usableH - CARD_GAP_PX * (rows - 1)) / rows;
      const size = Math.min(cellW, cellH, CARD_MAX_PX);
      if (size > bestSize) {
        bestSize = size;
        cols = candidateCols;
      }
    }
    // bestSize already reaches CARD_MIN_PX naturally whenever geometry allows
    // it (confirmed at up to 8 cards on both tested viewports); this only
    // clamps the rare case where even the best column choice falls short.
    const cardSize = Math.max(CARD_SAFETY_FLOOR_PX, bestSize);
    const rows = Math.ceil(count / cols);

    const gridH = rows * cardSize + (rows - 1) * CARD_GAP_PX;
    const gridTop = TOP_CLEARANCE_PX + Math.max(0, (usableH - gridH) / 2);

    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      const col = i - row * cols;
      const itemsInRow = Math.min(cols, count - row * cols);
      const rowWidth = itemsInRow * cardSize + (itemsInRow - 1) * CARD_GAP_PX;
      const rowLeft = (cssW - rowWidth) / 2;
      const x = rowLeft + col * (cardSize + CARD_GAP_PX) + cardSize / 2;
      const y = gridTop + row * (cardSize + CARD_GAP_PX) + cardSize / 2;
      positions.push({ x, y });
    }

    return { positions, cardSize };
  }

  // Card art is fully delegated to RENDERERS[theme.renderer] for 'match'
  // entries — no hardcoded per-theme art lives here. 'sort' entries are the
  // one necessary branch: they aren't theme/renderer-based at all, so their
  // card art is just their literal cardEmoji glyph. This is a single,
  // contained kind-level branch (match vs sort), not a per-theme branch —
  // it doesn't reintroduce the per-theme branching CLAUDE.md rules out.
  private createCard(entry: MenuEntry, x: number, y: number, sizeCss: number, dpr: number, index: number): void {
    const cx = x * dpr;
    const cy = y * dpr;
    const s = sizeCss * dpr;

    const container = this.add.container(cx, cy);
    const half = s / 2;

    const drawPanel = (color: number) => {
      const panel = this.add.graphics();
      panel.fillStyle(lighten(color, 0.82), 1);
      panel.fillRoundedRect(-half, -half, s, s, s * 0.16);
      panel.lineStyle(Math.max(2, s * 0.02), darken(color, 0.1), 0.25);
      panel.strokeRoundedRect(-half, -half, s, s, s * 0.16);
      container.add(panel);
    };

    if (entry.kind === 'match') {
      const { pair, role, color: pinnedColor } = pickCardPair(entry.theme);
      const renderer = RENDERERS[entry.theme.renderer];
      const { leftColor, rightColor } = renderer.resolveInstance(pair);
      // A pinned override color (needed for renderers like `shape` whose
      // resolveInstance() is randomized) takes priority over the resolved
      // one, so the card's color is stable across reloads/resizes.
      const color = pinnedColor ?? (role === 'left' ? leftColor : rightColor);
      drawPanel(color);
      const visual = renderer.render({ scene: this, x: 0, y: 0, radius: s * 0.32, role, color, pair });
      container.add(visual.container);
    } else {
      drawPanel(entry.game.cardColor);
      container.add(createEmojiText(this, entry.game.cardEmoji, s * 0.5));
    }

    container.setSize(s, s);
    container.setInteractive();
    container.on('pointerdown', () => {
      AudioManager.sfx('click');
      this.tweens.add({
        targets: container,
        scale: 0.92,
        duration: 90,
        yoyo: true,
        onComplete: () => {
          if (entry.kind === 'match') this.scene.start('MatchScene', { theme: entry.theme });
          else this.scene.start('SortScene', { game: entry.game });
        },
      });
    });

    // One-time entry bounce, staggered — no looping animation to compete
    // with the toddler's choice-making.
    container.setScale(0.8);
    this.tweens.add({
      targets: container,
      scale: 1,
      duration: 350,
      delay: index * 60,
      ease: 'Back.easeOut',
    });
  }

  // The only chrome MenuScene adds beyond the cards. Gameplay (MatchScene)
  // stays chrome-free except its home button, per HANDOFF — mute lives here
  // only. Same size/placement discipline as the home button: a fixed
  // MUTE_BUTTON_SIZE_PX square whose nearest edge sits on the margin line,
  // just inside it, top-right corner (mirrors the home button's top-left).
  private createMuteButton(): void {
    // create() re-runs on every resize-restart, same Scene-instance-reuse
    // gotcha as MatchScene's home button (HANDOFF Slice 3) — destroy the
    // previous instance so re-entries don't leak stacked, still-interactive buttons.
    this.muteButton?.destroy();

    const dpr = window.devicePixelRatio || 1;
    const size = MUTE_BUTTON_SIZE_PX * dpr;
    const cssW = this.scale.width / dpr;
    const cx = (cssW - MENU_EDGE_MARGIN_PX) * dpr - size / 2;
    const cy = MENU_EDGE_MARGIN_PX * dpr + size / 2;

    const container = this.add.container(cx, cy);
    const half = size / 2;
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.92);
    bg.fillRoundedRect(-half, -half, size, size, size * 0.22);
    bg.lineStyle(Math.max(2, size * 0.04), 0x2b2b2b, 0.2);
    bg.strokeRoundedRect(-half, -half, size, size, size * 0.22);
    container.add(bg);

    const icon = this.add.graphics();
    container.add(icon);
    this.drawSpeakerIcon(icon, size, AudioManager.isMuted());

    container.setSize(size, size);
    container.setInteractive();
    container.on('pointerdown', () => {
      const muted = AudioManager.toggleMuted();
      this.drawSpeakerIcon(icon, size, muted);
      if (!muted) AudioManager.sfx('click');
    });
    this.muteButton = container;
  }

  // Simple speaker glyph (body + sound-wave arcs), with a diagonal
  // strike-through when muted. Hand-drawn Graphics, same reasoning as the
  // shape/icon renderers (native Phaser shapes don't center reliably).
  private drawSpeakerIcon(g: Phaser.GameObjects.Graphics, size: number, muted: boolean): void {
    g.clear();
    const bodyColor = 0x2b2b2b;
    g.fillStyle(bodyColor, 0.85);
    g.fillRect(-size * 0.28, -size * 0.1, size * 0.14, size * 0.2);
    g.fillTriangle(
      -size * 0.14, -size * 0.1,
      -size * 0.14, size * 0.1,
      size * 0.08, size * 0.22,
    );
    g.fillTriangle(
      -size * 0.14, -size * 0.1,
      size * 0.08, -size * 0.22,
      size * 0.08, size * 0.22,
    );

    g.lineStyle(Math.max(2, size * 0.035), bodyColor, 0.85);
    if (!muted) {
      g.beginPath();
      g.arc(-size * 0.05, 0, size * 0.2, -Math.PI / 3.2, Math.PI / 3.2, false);
      g.strokePath();
      g.beginPath();
      g.arc(-size * 0.05, 0, size * 0.3, -Math.PI / 3.2, Math.PI / 3.2, false);
      g.strokePath();
    } else {
      g.lineBetween(size * 0.05, -size * 0.24, size * 0.32, size * 0.24);
    }
  }
}

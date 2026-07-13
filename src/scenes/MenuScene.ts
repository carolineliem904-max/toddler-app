import Phaser from 'phaser';
import { type PairDef, type Theme } from '../data/themes';
import { MENU_ENTRIES, type MenuEntry } from '../data/menuEntries';
import { RENDERERS, starPoints } from '../rendering/renderers';
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
// 160px was the original per-card target (still what computeLayout() reaches
// whenever geometry allows). CARD_SAFETY_FLOOR_PX is the true, never-violated
// floor: CLAUDE.md's 120px touch-target minimum.
const CARD_SAFETY_FLOOR_PX = 120;
const CARD_MAX_PX = 240;
// Fixed at 2 (see computeLayout's comment) — Slice 7 replaces the old
// candidate-column search now that the grid scrolls vertically.
const GRID_COLS = 2;
const MUTE_BUTTON_SIZE_PX = 80; // same size discipline as MatchScene's home button
// Reserves top clearance for the mute button, same fix as MatchScene's
// TOP_MARGIN_PX (HANDOFF Slice 3): a fixed-size corner button and a
// vertically-centered grid can overlap on short viewports if the grid isn't
// pushed clear of the button's footprint. Verified via headless testing at
// 390x667 before this fix was in place.
const TOP_CLEARANCE_PX = MENU_EDGE_MARGIN_PX + MUTE_BUTTON_SIZE_PX + 16;

// --- Slice 7: scroll / tap-vs-scroll disambiguation ---
// "movement under ~12css px = tap, over = scroll" (spec, verbatim threshold).
const TAP_MOVEMENT_THRESHOLD_CSS = 12;
// "Cards partially visible at the fold should be tappable only when >=60%
// visible" (spec, verbatim).
const CARD_VISIBILITY_TAP_THRESHOLD = 0.6;

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
// per-pair/per-icon color (colorBlob, shadow, destination, and now objects
// via the emoji renderer) don't need it.
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
//
// Post-toddler-QA icon migration (objects/destinations -> emoji, see
// HANDOFF): re-checked both entries against every other card rather than
// changing them blindly.
// - `objects: { pairId: 'fish', role: 'left' }` kept as-is — 'fish' still
//   exists in the migrated OBJECT_POOL (now an 🐟 emoji instead of a drawn
//   icon, same ~0xff9f45 orange identity color). No other card is
//   orange/fish-shaped; the closest warm-tone neighbors (fruitsort's brown
//   basket, bigsmall's tan elephant) have completely different silhouettes,
//   same "different glyph, don't sweat close hues" precedent as the
//   vehicles/colors red overlap above.
// - `destinations: { role: 'right' }` (no pairId, defaults to `pairs[0]`)
//   kept as-is too, BUT only because `fish-bowl` was deliberately placed
//   first in the new `DESTINATION_POOL` array specifically to preserve
//   this — the destinations card still renders the exact same drawn blue
//   bowl icon (0x7fb6e0) it always has, zero visual change. This does
//   collide with the counting quiz card's blue dots (0x5c8fd6) — accepted,
//   same "different silhouette" category as every other logged exception
//   here (a bowl icon vs. a row of dots share nothing but a hue family).
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

interface CardMeta {
  entry: MenuEntry;
  container: Phaser.GameObjects.Container;
  x: number; // CSS px, does not scroll
  baseY: number; // CSS px, pre-scroll-offset position
  size: number; // CSS px
}

export class MenuScene extends Phaser.Scene {
  private lastSize = { w: 0, h: 0 };
  private muteButton: Phaser.GameObjects.Container | null = null;
  private cardsMeta: CardMeta[] = [];
  private scrollY = 0; // CSS px, 0 = scrolled to top
  private maxScroll = 0;
  private isDragging = false;
  private dragStartPointer = { x: 0, y: 0 }; // device px
  private dragStartScrollY = 0;
  private dragMaxMovementCss = 0;
  private tapCandidate: CardMeta | null = null;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.lastSize = { w: this.scale.width, h: this.scale.height };
    this.scale.on('resize', this.handleResize, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.handleResize, this);
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.input.off('pointermove', this.handlePointerMove, this);
      this.input.off('pointerup', this.handlePointerUp, this);
    });

    // Explicit reset: Phaser reuses this Scene instance across
    // scene.start()/restart() calls (same gotcha as every other scene's
    // instance-reuse notes), so scroll/drag state must not carry over from a
    // prior visit or a mid-drag resize-restart.
    this.scrollY = 0;
    this.isDragging = false;
    this.tapCandidate = null;
    this.cardsMeta = [];

    const dpr = window.devicePixelRatio || 1;
    const { positions, cardSize, maxScroll } = this.computeLayout(MENU_ENTRIES.length);
    this.maxScroll = maxScroll;

    MENU_ENTRIES.forEach((entry, i) => {
      const pos = positions[i];
      if (!pos) return;
      const container = this.createCard(entry, pos.x, pos.y, cardSize, dpr, i);
      this.cardsMeta.push({ entry, container, x: pos.x, baseY: pos.y, size: cardSize });
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

  // Fixed at 2 columns. Slice 6's candidate-column search (trying [2, 3] and
  // picking whichever fit best) existed *only* to trade columns for vertical
  // fit when the grid couldn't scroll — cellH was a hard constraint, and 3
  // narrower columns sometimes cleared it when 2 wider ones didn't (that's
  // literally why 11 cards landed on 3 columns at Slice 6). Now that the
  // grid scrolls, height is no longer a constraint at all: cellW alone
  // decides card size, and cellW is provably always larger with fewer
  // columns (cellW(2) - cellW(3) = (usableW + gap) / 6 > 0 for any positive
  // width/gap) — so 3 columns could never win the old comparison once cellH
  // drops out of it. Rather than keep dead candidate-search logic that can
  // only ever pick one answer, this is just a fixed 2-column grid.
  private computeLayout(count: number): { positions: { x: number; y: number }[]; cardSize: number; maxScroll: number } {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.scale.width / dpr;
    const cssH = this.scale.height / dpr;

    const usableW = cssW - MENU_EDGE_MARGIN_PX * 2;
    const usableH = cssH - TOP_CLEARANCE_PX - MENU_EDGE_MARGIN_PX;

    const cellW = (usableW - CARD_GAP_PX * (GRID_COLS - 1)) / GRID_COLS;
    const cardSize = Math.min(cellW, CARD_MAX_PX);
    if (cardSize < CARD_SAFETY_FLOOR_PX) {
      console.info(
        `[MenuScene] ${count}-card grid at ${Math.round(cssW)}x${Math.round(cssH)} can't reach the ${CARD_SAFETY_FLOOR_PX}px floor (best: ${Math.round(cardSize)}px).`,
      );
    }

    const rows = Math.ceil(count / GRID_COLS);
    const gridH = rows * cardSize + (rows - 1) * CARD_GAP_PX;
    // Scrollable content starts flush at the top; a board that fits without
    // scrolling stays vertically centered (Slice 6 behavior, preserved) —
    // this is the "degrade gracefully to static" case from the spec.
    const maxScroll = Math.max(0, gridH - usableH);
    const gridTop = maxScroll > 0 ? TOP_CLEARANCE_PX : TOP_CLEARANCE_PX + Math.max(0, (usableH - gridH) / 2);

    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / GRID_COLS);
      const col = i - row * GRID_COLS;
      const itemsInRow = Math.min(GRID_COLS, count - row * GRID_COLS);
      const rowWidth = itemsInRow * cardSize + (itemsInRow - 1) * CARD_GAP_PX;
      const rowLeft = (cssW - rowWidth) / 2;
      const x = rowLeft + col * (cardSize + CARD_GAP_PX) + cardSize / 2;
      const y = gridTop + row * (cardSize + CARD_GAP_PX) + cardSize / 2;
      positions.push({ x, y });
    }

    return { positions, cardSize, maxScroll };
  }

  // --- Scroll / tap-vs-scroll disambiguation ---
  //
  // Builder's choice (spec): simple direct drag (no momentum), hard-stop
  // clamping (no rubber-band overshoot-then-settle) — the clamp is applied
  // on every pointermove, so the grid can never be dragged past its bounds
  // in the first place, which also means no scissor mask is needed (a card
  // can never render above the top clearance or below the bottom margin).
  //
  // Tap-vs-scroll is resolved by tracking a gesture's *maximum* displacement
  // from its start point (Euclidean, not just vertical — a toddler's finger
  // can wobble sideways too) across the whole pointer-down-to-up lifetime,
  // and only firing a card's tap action on release if that never exceeded
  // TAP_MOVEMENT_THRESHOLD_CSS. This is why cards no longer wire their own
  // 'pointerdown' -> instant-navigate handler (Slice 6 and earlier): a tap
  // can't be told apart from the start of a scroll until either the gesture
  // ends or the threshold is crossed, so the actual navigate action has to
  // wait for pointerup. Cards still call setInteractive() (see createCard)
  // purely so they remain visible to introspection tooling
  // (scripts/verify-audio-paths.ts reads `.input`-bearing Containers) — no
  // listener is attached to it.
  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.isDragging = true;
    this.dragStartPointer = { x: pointer.x, y: pointer.y };
    this.dragStartScrollY = this.scrollY;
    this.dragMaxMovementCss = 0;
    this.tapCandidate = this.hitTestCard(pointer.x, pointer.y);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isDragging || !pointer.isDown) return;
    const dpr = window.devicePixelRatio || 1;
    const dxCss = (pointer.x - this.dragStartPointer.x) / dpr;
    const dyCss = (pointer.y - this.dragStartPointer.y) / dpr;
    this.dragMaxMovementCss = Math.max(this.dragMaxMovementCss, Math.hypot(dxCss, dyCss));

    if (this.maxScroll > 0) {
      // Finger moves up (dyCss < 0) -> content scrolls down (scrollY grows).
      this.scrollY = Phaser.Math.Clamp(this.dragStartScrollY - dyCss, 0, this.maxScroll);
      this.applyScroll();
    }
  }

  private handlePointerUp(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    const candidate = this.tapCandidate;
    this.tapCandidate = null;
    if (this.dragMaxMovementCss >= TAP_MOVEMENT_THRESHOLD_CSS || !candidate) return;
    if (!this.isCardVisibleEnough(candidate)) return;
    this.handleCardTap(candidate.entry, candidate.container);
  }

  private applyScroll(): void {
    const dpr = window.devicePixelRatio || 1;
    this.cardsMeta.forEach((meta) => {
      meta.container.y = (meta.baseY - this.scrollY) * dpr;
    });
  }

  private hitTestCard(px: number, py: number): CardMeta | null {
    const dpr = window.devicePixelRatio || 1;
    for (const meta of this.cardsMeta) {
      const cx = meta.x * dpr;
      const cy = (meta.baseY - this.scrollY) * dpr;
      const half = (meta.size * dpr) / 2;
      if (Math.abs(px - cx) <= half && Math.abs(py - cy) <= half) return meta;
    }
    return null;
  }

  private isCardVisibleEnough(meta: CardMeta): boolean {
    const dpr = window.devicePixelRatio || 1;
    const cssH = this.scale.height / dpr;
    const viewTop = TOP_CLEARANCE_PX;
    const viewBottom = cssH - MENU_EDGE_MARGIN_PX;
    const cardTop = meta.baseY - this.scrollY - meta.size / 2;
    const cardBottom = meta.baseY - this.scrollY + meta.size / 2;
    const overlap = Math.max(0, Math.min(cardBottom, viewBottom) - Math.max(cardTop, viewTop));
    return overlap / meta.size >= CARD_VISIBILITY_TAP_THRESHOLD;
  }

  private handleCardTap(entry: MenuEntry, container: Phaser.GameObjects.Container): void {
    AudioManager.sfx('click');
    this.tweens.add({
      targets: container,
      scale: 0.92,
      duration: 90,
      yoyo: true,
      onComplete: () => {
        if (entry.kind === 'match') this.scene.start('MatchScene', { theme: entry.theme });
        else if (entry.kind === 'sort') this.scene.start('SortScene', { game: entry.game });
        else if (entry.kind === 'quiz') this.scene.start('QuizScene', { game: entry.game });
        else this.scene.start('MemoryScene', { game: entry.game });
      },
    });
  }

  // Card art is fully delegated to RENDERERS[theme.renderer] for 'match'
  // entries — no hardcoded per-theme art lives here. 'sort'/'quiz'/'memory'
  // entries aren't theme/renderer-based at all, so their card art is drawn
  // directly from their own literal data (cardEmoji glyph / menuCard spec /
  // hardcoded fanned-card-backs icon). This is a single, contained kind-level
  // branch, not a per-theme branch — it doesn't reintroduce the per-theme
  // branching CLAUDE.md rules out.
  private createCard(entry: MenuEntry, x: number, y: number, sizeCss: number, dpr: number, index: number): Phaser.GameObjects.Container {
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
    } else if (entry.kind === 'sort') {
      drawPanel(entry.game.cardColor);
      container.add(createEmojiText(this, entry.game.cardEmoji, s * 0.5));
    } else if (entry.kind === 'quiz') {
      drawPanel(entry.game.cardColor);
      const card = entry.game.menuCard;
      if (card.kind === 'dots') {
        const g = this.add.graphics();
        this.drawMenuDotsRow(g, card.count, s);
        container.add(g);
      } else {
        const big = createEmojiText(this, card.emoji, s * 0.42);
        big.setPosition(-s * 0.16, -s * 0.05);
        const small = createEmojiText(this, card.emoji, s * 0.42 * card.smallScale);
        small.setPosition(s * 0.26, s * 0.18);
        container.add([big, small]);
      }
    } else {
      drawPanel(entry.game.cardColor);
      this.drawMemoryCardBacksIcon(container, entry.game.cardColor, s);
    }

    // Hit-area kept purely for introspection tooling (see the scroll-handler
    // comment above) — no listener attached; MenuScene's own scene-level
    // pointer handlers drive the actual tap/scroll behavior.
    container.setSize(s, s);
    container.setInteractive();

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

    return container;
  }

  // Memory game's menu card: two fanned face-down "card backs" (same rounded
  // rect + star-sticker motif MemoryScene itself draws for a face-down
  // card, at a smaller preview scale) — the card previews the mechanic
  // itself (a stack of memory cards) rather than a single glyph.
  private drawMemoryCardBacksIcon(container: Phaser.GameObjects.Container, color: number, size: number): void {
    const cardW = size * 0.34;
    const cardH = size * 0.46;

    const drawBack = (rotation: number, offsetX: number, offsetY: number, fillColor: number) => {
      const g = this.add.graphics();
      g.fillStyle(fillColor, 1);
      g.lineStyle(Math.max(2, size * 0.015), 0x2b2b2b, 0.15);
      g.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, cardW * 0.18);
      g.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, cardW * 0.18);

      const pts = starPoints(cardW * 0.22, cardW * 0.1);
      g.fillStyle(0xfff8ee, 0.9);
      g.beginPath();
      g.moveTo(pts[0] ?? 0, pts[1] ?? 0);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
      g.closePath();
      g.fillPath();

      const wrapper = this.add.container(offsetX, offsetY);
      wrapper.setRotation(rotation);
      wrapper.add(g);
      container.add(wrapper);
    };

    drawBack(-0.14, -size * 0.08, size * 0.03, darken(color, 0.08));
    drawBack(0.14, size * 0.1, -size * 0.02, color);
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

  // Counting quiz card icon: three plain dots in a row (spec, literally:
  // "three dots (⚫⚫⚫ drawn as Graphics)") — deliberately simpler than
  // QuizScene's in-game dice/domino pip arrangements, since this is just a
  // menu identity glyph, not a quantity to be read.
  private drawMenuDotsRow(g: Phaser.GameObjects.Graphics, count: number, size: number): void {
    const dotR = size * 0.09;
    const spacing = size * 0.24;
    const totalW = spacing * (count - 1);
    g.fillStyle(0x2b2b2b, 0.85);
    for (let i = 0; i < count; i++) {
      g.fillCircle(-totalW / 2 + i * spacing, 0, dotR);
    }
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

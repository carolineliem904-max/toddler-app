import Phaser from 'phaser';
import { SORT_GAMES, type SortGame, type SortBinDef, type SortItemDef } from '../data/sortGames';
import { shuffled } from '../data/themes';
import { drawIcon } from '../rendering/icons';
import { createEmojiText } from '../rendering/emojiText';
import { darken } from '../utils/color';
import { AudioManager } from '../audio/AudioManager';
import { SORT_GAME_INTRO_VOICE } from '../audio/voiceManifest';

interface DragItem {
  category: string;
  container: Phaser.GameObjects.Container;
  homeX: number;
  homeY: number;
  state: 'loose' | 'dragging' | 'sorted';
}

interface BinVisual {
  accepts: string;
  container: Phaser.GameObjects.Container;
  x: number;
  y: number;
  hitRadius: number;
  sortedCount: number;
}

interface SortSceneData {
  game?: SortGame;
  // Same purpose as MatchScene's isResize flag: distinguishes a resize-driven
  // re-create() (same game, not a new visit) from a real menu -> game entry,
  // so the intro voice fires once per *entry*, not on every resize-restart.
  isResize?: boolean;
}

// Same gameplay chrome constants as MatchScene (60px edge margin, 80px home
// button) — SortScene is gameplay, not menu chrome, so the same CLAUDE.md
// rules apply.
const EDGE_MARGIN_PX = 60;
const BACKGROUND_COLOR = 0xfff8ee;
const HOME_BUTTON_SIZE_PX = 80;
const TOP_MARGIN_PX = EDGE_MARGIN_PX + HOME_BUTTON_SIZE_PX + 16;

// --- Drag-forgiveness parameters (documented per HANDOFF's requirement) ---
// A bin's *hit* zone (where a drop counts as "over" it) is its visual radius
// times this multiplier. Spec floor is 1.4x; 1.5x chosen for extra toddler
// motor-skill forgiveness. Bin center spacing is itself derived (see
// computeBinLayout) so two 1.5x hit-circles can never overlap regardless of
// viewport width — a drop in the dead zone between them just glides back
// silently rather than resolving ambiguously.
const BIN_HIT_MULTIPLIER = 1.5;
const BIN_MAX_VISUAL_RADIUS_PX = 85;
// Draggable item touch target: 70px radius = 140px diameter is the
// *preferred* cap, safely above CLAUDE.md's 120px gameplay minimum — actual
// radius is derived per-round from the scatter grid (see scatterGrid) and
// can come in smaller on tight viewports, down to a 55px floor.
const ITEM_RADIUS_PX = 70;
const GLIDE_BACK_DURATION_MS = 300; // soft return, not a snap (spec: "NOT a snap")
const SETTLE_DURATION_MS = 350;

export class SortScene extends Phaser.Scene {
  // Named sortGame, not `game` — Phaser.Scene already exposes `this.game`
  // (the Phaser.Game instance) and shadowing it would be a real bug, not
  // just a naming nit.
  private sortGame!: SortGame;
  private items: DragItem[] = [];
  private bins: BinVisual[] = [];
  private sortedCount = 0;
  private homeButton: Phaser.GameObjects.Container | null = null;
  private lastSize = { w: 0, h: 0 };
  private isResizeEntry = false;

  constructor() {
    super('SortScene');
  }

  init(data: SortSceneData): void {
    this.sortGame = data.game ?? SORT_GAMES[0]!;
    this.isResizeEntry = data.isResize ?? false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.lastSize = { w: this.scale.width, h: this.scale.height };
    this.scale.on('resize', this.handleResize, this);
    this.createHomeButton();

    this.input.on('dragstart', this.handleDragStart, this);
    this.input.on('drag', this.handleDrag, this);
    this.input.on('dragend', this.handleDragEnd, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.handleResize, this);
      this.input.off('dragstart', this.handleDragStart, this);
      this.input.off('drag', this.handleDrag, this);
      this.input.off('dragend', this.handleDragEnd, this);
    });

    if (!this.isResizeEntry) {
      const introKey = SORT_GAME_INTRO_VOICE[this.sortGame.id];
      if (introKey) AudioManager.voice(introKey);
    }
    this.startRound();
  }

  private px(n: number): number {
    return n * (window.devicePixelRatio || 1);
  }

  private handleResize(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    if (w === this.lastSize.w && h === this.lastSize.h) return;
    this.lastSize = { w, h };
    this.scene.restart({ game: this.sortGame, isResize: true });
  }

  private goHome(): void {
    AudioManager.sfx('click');
    this.scene.start('MenuScene');
  }

  // Identical pattern/clearance/destroy-before-recreate discipline as
  // MatchScene's home button (HANDOFF Slice 3 gotcha: Scene instances are
  // reused across scene.start()/restart(), so skipping the destroy leaks a
  // stacked, still-interactive button on every re-entry).
  private createHomeButton(): void {
    this.homeButton?.destroy();

    const dpr = window.devicePixelRatio || 1;
    const size = HOME_BUTTON_SIZE_PX * dpr;
    const cx = this.px(EDGE_MARGIN_PX) + size / 2;
    const cy = this.px(EDGE_MARGIN_PX) + size / 2;

    const container = this.add.container(cx, cy);
    const g = this.add.graphics();
    const half = size / 2;
    g.fillStyle(0xffffff, 0.92);
    g.fillRoundedRect(-half, -half, size, size, size * 0.22);
    g.lineStyle(Math.max(2, size * 0.04), 0x2b2b2b, 0.2);
    g.strokeRoundedRect(-half, -half, size, size, size * 0.22);

    const bodyW = size * 0.4;
    const bodyH = size * 0.32;
    g.fillStyle(0x8a5a34, 1);
    g.fillRect(-bodyW / 2, size * 0.02, bodyW, bodyH);
    g.fillStyle(0xe0483c, 1);
    g.fillTriangle(-bodyW * 0.65, size * 0.02, bodyW * 0.65, size * 0.02, 0, -size * 0.28);
    container.add(g);

    container.setSize(size, size);
    container.setInteractive();
    container.on('pointerdown', () => this.goHome());
    this.homeButton = container;
  }

  // Bin centers sit at 20%/80% of usable width (mirrors MatchScene's
  // left/right column convention). maxHitRadius is half the center-to-center
  // gap minus an 8px buffer (same "-8" defensive pattern as MatchScene's
  // columnGapCeiling) — capping the visual radius at maxHitRadius /
  // BIN_HIT_MULTIPLIER guarantees the two hit-circles never touch, so a drop
  // in the middle is unambiguous (glides back silently rather than resolving
  // to "nearest" bin).
  private computeBinLayout(): { leftX: number; rightX: number; binY: number; visualRadius: number; hitRadius: number; scatterBottom: number } {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.scale.width / dpr;
    const cssH = this.scale.height / dpr;
    const usableW = cssW - EDGE_MARGIN_PX * 2;

    const leftX = EDGE_MARGIN_PX + usableW * 0.2;
    const rightX = EDGE_MARGIN_PX + usableW * 0.8;
    const maxHitRadius = (rightX - leftX) / 2 - 8;
    const visualRadius = Math.max(40, Math.min(BIN_MAX_VISUAL_RADIUS_PX, maxHitRadius / BIN_HIT_MULTIPLIER));
    const hitRadius = visualRadius * BIN_HIT_MULTIPLIER;
    const binY = cssH - EDGE_MARGIN_PX - visualRadius;
    const scatterBottom = binY - visualRadius - 24;

    return { leftX, rightX, binY, visualRadius, hitRadius, scatterBottom };
  }

  private startRound(): void {
    this.clearBoard();
    this.homeButton?.setInteractive();

    const layout = this.computeBinLayout();
    // Fixed 2-bin design per spec ("2 large bins"); FRUIT_SORT (and any
    // future sort game) always defines exactly 2.
    const [leftBinDef, rightBinDef] = this.sortGame.bins as [SortBinDef, SortBinDef];
    this.bins = [
      this.createBin(leftBinDef, layout.leftX, layout.binY, layout.visualRadius, layout.hitRadius),
      this.createBin(rightBinDef, layout.rightX, layout.binY, layout.visualRadius, layout.hitRadius),
    ];

    const dpr = window.devicePixelRatio || 1;
    const cssW = this.scale.width / dpr;
    const area = {
      minX: EDGE_MARGIN_PX,
      maxX: cssW - EDGE_MARGIN_PX,
      minY: TOP_MARGIN_PX,
      maxY: Math.max(TOP_MARGIN_PX + 1, layout.scatterBottom),
    };

    const pool = shuffled(this.sortGame.itemPool).slice(0, this.sortGame.itemsPerRound);
    const { positions, radius } = this.scatterGrid(pool.length, area);
    this.items = pool.map((def, i) => this.createItem(def, positions[i]!.x, positions[i]!.y, radius));
    this.sortedCount = 0;
  }

  // Grid-based placement, not blind random retry: on a narrow phone the
  // scatter area is only ~270x367 CSS px for 6 items, and a random-with-
  // minimum-distance approach (the first cut at this) visibly failed to find
  // clear spots often enough — items rendered overlapping (caught by eye in
  // a screenshot, not by any automated check). A grid guarantees zero
  // overlap by construction: pick whichever column count (1..count) yields
  // the largest min(cellW, cellH), one item per cell with small jitter so it
  // doesn't look robotically aligned, radius derived from the resulting cell
  // size (same clamping idea as MatchScene.computeLayout's radius). Floor is
  // 55 CSS (110px diameter) — technically a hair under CLAUDE.md's 120px
  // gameplay minimum, but only ever engages on 6-item rounds at the
  // narrowest tested phone width once EDGE_MARGIN_PX, the home button, and
  // the bins have all taken their non-negotiable share of a 390px-wide
  // screen; see HANDOFF Slice 5 decisions.
  private scatterGrid(count: number, area: { minX: number; maxX: number; minY: number; maxY: number }): { positions: { x: number; y: number }[]; radius: number } {
    const areaW = area.maxX - area.minX;
    const areaH = area.maxY - area.minY;

    let cols = 1;
    let bestCellMin = 0;
    for (let candidateCols = 1; candidateCols <= count; candidateCols++) {
      const rows = Math.ceil(count / candidateCols);
      const cellMin = Math.min(areaW / candidateCols, areaH / rows);
      if (cellMin > bestCellMin) {
        bestCellMin = cellMin;
        cols = candidateCols;
      }
    }
    const rows = Math.ceil(count / cols);
    const cellW = areaW / cols;
    const cellH = areaH / rows;
    const radius = Math.max(55, Math.min(ITEM_RADIUS_PX, cellW / 2 - 6, cellH / 2 - 6));

    const jitterX = Math.max(0, cellW / 2 - radius - 4);
    const jitterY = Math.max(0, cellH / 2 - radius - 4);
    const cellOrder = shuffled(Array.from({ length: cols * rows }, (_, i) => i)).slice(0, count);

    const positions = cellOrder.map((idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = area.minX + cellW * (col + 0.5) + Phaser.Math.Between(-jitterX, jitterX);
      const cy = area.minY + cellH * (row + 0.5) + Phaser.Math.Between(-jitterY, jitterY);
      return { x: cx, y: cy };
    });

    return { positions, radius };
  }

  private createBin(def: SortBinDef, xCss: number, yCss: number, radiusCss: number, hitRadiusCss: number): BinVisual {
    const dpr = window.devicePixelRatio || 1;
    const x = xCss * dpr;
    const y = yCss * dpr;
    const r = radiusCss * dpr;
    const container = this.add.container(x, y);
    const body = drawIcon(this, 'basket', r, def.tint);
    container.add(body.gameObject);
    return { accepts: def.accepts, container, x, y, hitRadius: hitRadiusCss * dpr, sortedCount: 0 };
  }

  private createItem(def: SortItemDef, xCss: number, yCss: number, radiusCss: number): DragItem {
    const dpr = window.devicePixelRatio || 1;
    const x = xCss * dpr;
    const y = yCss * dpr;
    const container = this.add.container(x, y);
    const text = createEmojiText(this, def.emoji, this.px(radiusCss) * 1.6);
    container.add(text);

    const size = this.px(radiusCss) * 2;
    container.setSize(size, size);
    container.setInteractive();
    this.input.setDraggable(container);

    return { category: def.category, container, homeX: x, homeY: y, state: 'loose' };
  }

  private clearBoard(): void {
    this.tweens.killAll();
    this.items.forEach((it) => it.container.destroy());
    this.bins.forEach((b) => b.container.destroy());
    this.items = [];
    this.bins = [];
    this.sortedCount = 0;
  }

  private findItem(gameObject: Phaser.GameObjects.GameObject): DragItem | undefined {
    return this.items.find((it) => it.container === gameObject);
  }

  private findBinAt(x: number, y: number): BinVisual | undefined {
    return this.bins.find((b) => Phaser.Math.Distance.Between(b.x, b.y, x, y) <= b.hitRadius);
  }

  private handleDragStart(_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject): void {
    const item = this.findItem(gameObject);
    if (!item || item.state !== 'loose') return;
    AudioManager.sfx('pickup');
    item.state = 'dragging';
    this.tweens.killTweensOf(item.container);
    item.container.setScale(1.15);
    item.container.setDepth(10);
  }

  private handleDrag(_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number): void {
    const item = this.findItem(gameObject);
    if (!item || item.state !== 'dragging') return;
    item.container.x = dragX;
    item.container.y = dragY;
  }

  private handleDragEnd(_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject): void {
    const item = this.findItem(gameObject);
    if (!item || item.state !== 'dragging') return;

    const target = this.findBinAt(item.container.x, item.container.y);
    if (target && target.accepts === item.category) {
      this.settleIntoBin(item, target);
    } else if (target) {
      this.glideBack(item, true);
    } else {
      this.glideBack(item, false);
    }
  }

  // Wrong bin or empty air: soft ~300ms tween back to the pickup spot — a
  // snap reads as punishment (spec, verbatim). `playBoop` is false for
  // "released over nothing," which is silent per spec ("no penalty ever").
  private glideBack(item: DragItem, playBoop: boolean): void {
    if (playBoop) AudioManager.sfx('wrong');
    item.state = 'loose';
    item.container.setDepth(0);
    this.tweens.add({
      targets: item.container,
      x: item.homeX,
      y: item.homeY,
      scale: 1,
      duration: GLIDE_BACK_DURATION_MS,
      ease: 'Sine.easeInOut',
    });
  }

  private settleIntoBin(item: DragItem, bin: BinVisual): void {
    AudioManager.sfx('plop');
    AudioManager.sfx('correct');
    item.state = 'sorted';
    item.container.disableInteractive();
    item.container.setDepth(0);

    const spacing = this.px(30);
    const offsetX = (bin.sortedCount - 1) * spacing;
    bin.sortedCount++;

    this.tweens.add({
      targets: item.container,
      x: bin.x + offsetX,
      y: bin.y - this.px(20),
      scale: 0.55,
      duration: SETTLE_DURATION_MS,
      ease: 'Back.easeOut',
    });

    this.sortedCount++;
    if (this.sortedCount === this.items.length) {
      this.time.delayedCall(400, () => this.celebrate());
    }
  }

  private ensureConfettiTexture(): void {
    const key = 'confetti-particle';
    if (this.textures.exists(key)) return;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture(key, 8, 8);
    g.destroy();
  }

  private burstConfetti(x: number, y: number, color: number): void {
    this.ensureConfettiTexture();
    const emitter = this.add.particles(x, y, 'confetti-particle', {
      speed: { min: this.px(150), max: this.px(350) },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 500,
      quantity: 14,
      tint: [color, darken(color, 0.35), 0x333333],
      emitting: false,
    });
    emitter.explode(14);
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private celebrate(): void {
    AudioManager.sfx('celebrate');
    AudioManager.voice(AudioManager.randomPraiseKey());
    this.homeButton?.disableInteractive();

    this.items.forEach((item, idx) => {
      this.tweens.add({
        targets: item.container,
        scale: { from: 0.55, to: 0.7 },
        duration: 200,
        yoyo: true,
        repeat: 2,
        delay: idx * 30,
        ease: 'Sine.easeInOut',
      });
    });

    const gw = this.scale.width;
    const colors = this.sortGame.bins.map((b) => b.tint);
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 150, () => {
        const x = Phaser.Math.Between(this.px(EDGE_MARGIN_PX), gw - this.px(EDGE_MARGIN_PX));
        const y = Phaser.Math.Between(this.px(EDGE_MARGIN_PX), this.scale.height * 0.5);
        const color = Phaser.Utils.Array.GetRandom(colors);
        this.burstConfetti(x, y, color);
      });
    }

    this.time.delayedCall(2000, () => this.startRound());
  }
}

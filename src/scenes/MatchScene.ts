import Phaser from 'phaser';
import { THEMES, shuffled, sameOrder, type PairDef, type ShapeKind, type Theme } from '../data/themes';
import { RENDERERS } from '../rendering/renderers';
import { darken } from '../utils/color';

interface RoundItem {
  pairId: string;
  lineColor: number;
  container: Phaser.GameObjects.Container;
  applyMatchedStyle: () => void;
  matched: boolean;
}

interface ResolvedItem {
  id: string;
  shape?: ShapeKind;
  leftColor: number;
  rightColor: number;
}

interface LockedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
  progress: number;
}

interface LayoutMetrics {
  dpr: number;
  leftX: number;
  rightX: number;
  rowYs: number[];
  radius: number;
}

interface Selection {
  item: RoundItem;
  side: 'left' | 'right';
}

const EDGE_MARGIN_PX = 60; // CSS px — nothing tappable closer to the screen edge than this
const BACKGROUND_COLOR = 0xfff8ee;

export class MatchScene extends Phaser.Scene {
  private leftItems: RoundItem[] = [];
  private rightItems: RoundItem[] = [];
  private selected: Selection | null = null;
  private matchedCount = 0;
  private roundSize = 0;
  private lineGraphics: Phaser.GameObjects.Graphics | null = null;
  private lines: LockedLine[] = [];
  private confettiTextureKey = 'confetti-particle';
  private lastSize = { w: 0, h: 0 };
  private themeIndex = 0;

  // Which side may start (or switch) a selection. Only 'left' is implemented
  // behaviorally — 'either' is a clean insertion point for when real-toddler
  // QA on the left-first tap model comes back, not a supported mode yet.
  private readonly initiateFrom: 'left' | 'either' = 'left';

  constructor() {
    super('MatchScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.ensureConfettiTexture();
    this.lastSize = { w: this.scale.width, h: this.scale.height };
    this.scale.on('resize', this.handleResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.handleResize, this));
    this.startRound();
  }

  // Design values throughout this scene are authored in CSS px and converted
  // to device px via this helper, matching the Scale.NONE + zoom setup in
  // main.ts (see comment there for why game units == device px).
  private px(n: number): number {
    return n * (window.devicePixelRatio || 1);
  }

  private handleResize(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    // The ScaleManager fires an initial 'resize' during boot with no actual
    // size change; only restart (and reshuffle) when the size truly changed.
    if (w === this.lastSize.w && h === this.lastSize.h) return;
    this.lastSize = { w, h };
    this.scene.restart();
  }

  private computeLayout(rowCount: number): LayoutMetrics {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.scale.width / dpr;
    const cssH = this.scale.height / dpr;

    const usableW = cssW - EDGE_MARGIN_PX * 2;
    const usableH = cssH - EDGE_MARGIN_PX * 2;

    const cellH = usableH / rowCount;
    let radius = Math.max(60, Math.min(90, cellH * 0.35));

    const leftX = EDGE_MARGIN_PX + usableW * 0.2;
    const rightX = EDGE_MARGIN_PX + usableW * 0.8;
    const columnGapCeiling = (rightX - leftX) / 2 - 8;
    radius = Math.min(radius, columnGapCeiling);

    const rowYs: number[] = [];
    for (let i = 0; i < rowCount; i++) {
      rowYs.push(EDGE_MARGIN_PX + cellH * i + cellH / 2);
    }

    return { dpr, leftX, rightX, rowYs, radius };
  }

  private startRound(): void {
    this.clearBoard();

    const theme = THEMES[this.themeIndex] ?? THEMES[0];
    if (!theme) return;
    const renderer = RENDERERS[theme.renderer];
    const layout = this.computeLayout(theme.pairsPerRound);

    const sample: PairDef[] = shuffled(theme.pairs).slice(0, theme.pairsPerRound);
    const resolved: ResolvedItem[] = sample.map((pair) => ({
      id: pair.id,
      shape: pair.shape,
      ...renderer.resolveInstance(pair),
    }));

    const leftOrder = shuffled(resolved);
    let rightOrder = shuffled(resolved);
    while (sameOrder(leftOrder, rightOrder)) {
      rightOrder = shuffled(resolved);
    }

    this.roundSize = resolved.length;
    this.lineGraphics = this.add.graphics();

    leftOrder.forEach((item, i) => {
      const x = layout.leftX * layout.dpr;
      const y = (layout.rowYs[i] ?? 0) * layout.dpr;
      const r = layout.radius * layout.dpr;
      this.leftItems.push(this.createItem(theme, item, x, y, r, 'left'));
    });

    rightOrder.forEach((item, i) => {
      const x = layout.rightX * layout.dpr;
      const y = (layout.rowYs[i] ?? 0) * layout.dpr;
      const r = layout.radius * layout.dpr;
      this.rightItems.push(this.createItem(theme, item, x, y, r, 'right'));
    });
  }

  private clearBoard(): void {
    this.tweens.killAll();
    this.leftItems.forEach((item) => item.container.destroy());
    this.rightItems.forEach((item) => item.container.destroy());
    this.leftItems = [];
    this.rightItems = [];
    this.selected = null;
    this.matchedCount = 0;
    this.lines = [];
    this.lineGraphics?.destroy();
    this.lineGraphics = null;
  }

  // Theme-agnostic: drawing is fully delegated to RENDERERS[theme.renderer].
  // This method only wires up sizing, the (proven-working) rectangular hit
  // area, and the tap handler — it never branches on theme/renderer kind.
  private createItem(theme: Theme, resolved: ResolvedItem, x: number, y: number, radius: number, role: 'left' | 'right'): RoundItem {
    const color = role === 'left' ? resolved.leftColor : resolved.rightColor;
    const visual = RENDERERS[theme.renderer].render({ scene: this, x, y, radius, role, color, shape: resolved.shape });

    // setInteractive() with no args uses the size from setSize() as a
    // rectangular hit area. A custom Phaser.Geom.Circle hitArea silently
    // fails to register hits on Containers in Phaser 3.90 — the rectangle
    // is a slightly generous but reliable stand-in for the round touch target.
    visual.container.setSize(radius * 2, radius * 2);
    visual.container.setInteractive();

    const item: RoundItem = {
      pairId: resolved.id,
      lineColor: resolved.leftColor,
      container: visual.container,
      applyMatchedStyle: visual.applyMatchedStyle,
      matched: false,
    };
    visual.container.on('pointerdown', () => this.handleTap(item, role));
    return item;
  }

  private canInitiate(side: 'left' | 'right'): boolean {
    return this.initiateFrom === 'either' || this.initiateFrom === side;
  }

  private handleTap(item: RoundItem, side: 'left' | 'right'): void {
    if (item.matched) return;

    if (this.selected && this.selected.side !== side) {
      const selectedItem = this.selected.item;
      if (selectedItem.pairId === item.pairId) {
        const leftItem = this.selected.side === 'left' ? selectedItem : item;
        const rightItem = this.selected.side === 'left' ? item : selectedItem;
        this.handleCorrectMatch(leftItem, rightItem);
      } else {
        this.handleWrongMatch(item);
      }
      return;
    }

    if (this.selected && this.selected.item === item) return;
    if (!this.canInitiate(side)) return;

    if (this.selected) this.deselect(this.selected.item);
    this.selected = { item, side };
    this.select(item);
  }

  private select(item: RoundItem): void {
    item.container.setScale(1.12);
    this.tweens.add({
      targets: item.container,
      scale: 1.2,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private deselect(item: RoundItem): void {
    this.tweens.killTweensOf(item.container);
    this.tweens.add({ targets: item.container, scale: 1, duration: 150 });
  }

  private handleWrongMatch(item: RoundItem): void {
    const baseX = item.container.x;
    this.tweens.add({
      targets: item.container,
      x: { from: baseX - this.px(12), to: baseX + this.px(12) },
      duration: 50,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        item.container.x = baseX;
      },
    });
  }

  private handleCorrectMatch(left: RoundItem, right: RoundItem): void {
    left.matched = true;
    right.matched = true;
    left.container.disableInteractive();
    right.container.disableInteractive();
    this.tweens.killTweensOf(left.container);
    this.tweens.killTweensOf(right.container);
    left.container.setScale(1);
    right.container.setScale(1);
    this.selected = null;

    this.animateConnectingLine(left.container.x, left.container.y, right.container.x, right.container.y, left.lineColor);
    this.burstConfetti(right.container.x, right.container.y, left.lineColor);

    [left, right].forEach((it) => {
      this.tweens.add({
        targets: it.container,
        scale: { from: 1, to: 1.25 },
        duration: 150,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeOut',
        onComplete: () => {
          it.container.setScale(1);
          it.applyMatchedStyle();
        },
      });
    });

    this.matchedCount++;
    if (this.matchedCount === this.roundSize) {
      this.time.delayedCall(500, () => this.celebrate());
    }
  }

  private animateConnectingLine(x1: number, y1: number, x2: number, y2: number, color: number): void {
    const seg: LockedLine = { x1, y1, x2, y2, color, progress: 0 };
    this.lines.push(seg);
    this.tweens.add({
      targets: seg,
      progress: 1,
      duration: 400,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.redrawLines(),
    });
  }

  private redrawLines(): void {
    const g = this.lineGraphics;
    if (!g) return;
    g.clear();
    this.lines.forEach((seg) => {
      const ex = seg.x1 + (seg.x2 - seg.x1) * seg.progress;
      const ey = seg.y1 + (seg.y2 - seg.y1) * seg.progress;
      // Darkened for legibility against the light background.
      g.lineStyle(this.px(6), darken(seg.color, 0.2), 0.85);
      g.beginPath();
      g.moveTo(seg.x1, seg.y1);
      g.lineTo(ex, ey);
      g.strokePath();
    });
  }

  private ensureConfettiTexture(): void {
    if (this.textures.exists(this.confettiTextureKey)) return;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture(this.confettiTextureKey, 8, 8);
    g.destroy();
  }

  private burstConfetti(x: number, y: number, color: number): void {
    const emitter = this.add.particles(x, y, this.confettiTextureKey, {
      speed: { min: this.px(150), max: this.px(350) },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 500,
      quantity: 14,
      // Dark accent instead of white — white confetti reads as invisible on
      // the light background.
      tint: [color, darken(color, 0.35), 0x333333],
      emitting: false,
    });
    emitter.explode(14);
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private celebrate(): void {
    [...this.leftItems, ...this.rightItems].forEach((item, idx) => {
      this.tweens.add({
        targets: item.container,
        scale: { from: 1, to: 1.3 },
        duration: 200,
        yoyo: true,
        repeat: 2,
        delay: idx * 30,
        ease: 'Sine.easeInOut',
      });
    });

    const gw = this.scale.width;
    const roundColors = this.leftItems.map((item) => item.lineColor);
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 150, () => {
        const x = Phaser.Math.Between(this.px(EDGE_MARGIN_PX), gw - this.px(EDGE_MARGIN_PX));
        const y = Phaser.Math.Between(this.px(EDGE_MARGIN_PX), this.scale.height * 0.5);
        const color = Phaser.Utils.Array.GetRandom(roundColors);
        this.burstConfetti(x, y, color);
      });
    }

    this.time.delayedCall(2000, () => {
      this.themeIndex = (this.themeIndex + 1) % THEMES.length;
      this.startRound();
    });
  }
}

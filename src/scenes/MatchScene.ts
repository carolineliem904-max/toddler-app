import Phaser from 'phaser';
import { ROUND_DATA, shuffled, sameOrder, type ColorPair } from '../data/pairs';

interface RoundItem {
  pairId: string;
  color: number;
  container: Phaser.GameObjects.Container;
  matched: boolean;
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

const EDGE_MARGIN_PX = 60; // CSS px — nothing tappable closer to the screen edge than this
const ROW_COUNT = 4;

export class MatchScene extends Phaser.Scene {
  private leftItems: RoundItem[] = [];
  private rightItems: RoundItem[] = [];
  private selectedLeft: RoundItem | null = null;
  private matchedCount = 0;
  private lineGraphics: Phaser.GameObjects.Graphics | null = null;
  private lines: LockedLine[] = [];
  private confettiTextureKey = 'confetti-particle';
  private lastSize = { w: 0, h: 0 };

  constructor() {
    super('MatchScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2b2540');
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

  private computeLayout(): LayoutMetrics {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.scale.width / dpr;
    const cssH = this.scale.height / dpr;

    const usableW = cssW - EDGE_MARGIN_PX * 2;
    const usableH = cssH - EDGE_MARGIN_PX * 2;

    const cellH = usableH / ROW_COUNT;
    let radius = Math.max(60, Math.min(90, cellH * 0.35));

    const leftX = EDGE_MARGIN_PX + usableW * 0.2;
    const rightX = EDGE_MARGIN_PX + usableW * 0.8;
    const columnGapCeiling = (rightX - leftX) / 2 - 8;
    radius = Math.min(radius, columnGapCeiling);

    const rowYs: number[] = [];
    for (let i = 0; i < ROW_COUNT; i++) {
      rowYs.push(EDGE_MARGIN_PX + cellH * i + cellH / 2);
    }

    return { dpr, leftX, rightX, rowYs, radius };
  }

  private startRound(): void {
    this.clearBoard();

    const layout = this.computeLayout();
    const leftOrder = shuffled(ROUND_DATA.pairs);
    let rightOrder = shuffled(ROUND_DATA.pairs);
    while (sameOrder(leftOrder, rightOrder)) {
      rightOrder = shuffled(ROUND_DATA.pairs);
    }

    this.lineGraphics = this.add.graphics();

    leftOrder.forEach((pair, i) => {
      const x = layout.leftX * layout.dpr;
      const y = (layout.rowYs[i] ?? 0) * layout.dpr;
      const r = layout.radius * layout.dpr;
      this.leftItems.push(this.createLeftItem(x, y, r, pair));
    });

    rightOrder.forEach((pair, i) => {
      const x = layout.rightX * layout.dpr;
      const y = (layout.rowYs[i] ?? 0) * layout.dpr;
      const r = layout.radius * layout.dpr;
      this.rightItems.push(this.createRightItem(x, y, r, pair));
    });
  }

  private clearBoard(): void {
    this.tweens.killAll();
    this.leftItems.forEach((item) => item.container.destroy());
    this.rightItems.forEach((item) => item.container.destroy());
    this.leftItems = [];
    this.rightItems = [];
    this.selectedLeft = null;
    this.matchedCount = 0;
    this.lines = [];
    this.lineGraphics?.destroy();
    this.lineGraphics = null;
  }

  private createLeftItem(x: number, y: number, radius: number, pair: ColorPair): RoundItem {
    const container = this.add.container(x, y);

    const body = this.add.circle(0, 0, radius, pair.color);
    body.setStrokeStyle(Math.max(2, radius * 0.05), 0x000000, 0.15);

    const eyeOffsetX = radius * 0.35;
    const eyeOffsetY = -radius * 0.15;
    const eyeR = radius * 0.18;
    const leftEye = this.add.circle(-eyeOffsetX, eyeOffsetY, eyeR, 0xffffff);
    const rightEye = this.add.circle(eyeOffsetX, eyeOffsetY, eyeR, 0xffffff);
    const leftPupil = this.add.circle(-eyeOffsetX, eyeOffsetY, eyeR * 0.5, 0x111111);
    const rightPupil = this.add.circle(eyeOffsetX, eyeOffsetY, eyeR * 0.5, 0x111111);

    container.add([body, leftEye, rightEye, leftPupil, rightPupil]);
    // setInteractive() with no args uses the size from setSize() as a
    // rectangular hit area. A custom Phaser.Geom.Circle hitArea silently
    // fails to register hits on Containers in Phaser 3.90 — the rectangle
    // is a slightly generous but reliable stand-in for the round touch target.
    container.setSize(radius * 2, radius * 2);
    container.setInteractive();

    const item: RoundItem = { pairId: pair.id, color: pair.color, container, matched: false };
    container.on('pointerdown', () => this.handleLeftTap(item));
    return item;
  }

  private createRightItem(x: number, y: number, radius: number, pair: ColorPair): RoundItem {
    const container = this.add.container(x, y);

    const body = this.add.circle(0, 0, radius, pair.color);
    body.setStrokeStyle(Math.max(2, radius * 0.05), 0x000000, 0.15);
    container.add(body);
    container.setSize(radius * 2, radius * 2);
    container.setInteractive();

    const item: RoundItem = { pairId: pair.id, color: pair.color, container, matched: false };
    container.on('pointerdown', () => this.handleRightTap(item));
    return item;
  }

  private handleLeftTap(item: RoundItem): void {
    if (item.matched) return;
    if (this.selectedLeft === item) return;
    if (this.selectedLeft) this.deselect(this.selectedLeft);
    this.selectedLeft = item;
    this.select(item);
  }

  private handleRightTap(item: RoundItem): void {
    if (item.matched) return;
    const left = this.selectedLeft;
    if (!left) return;

    if (left.pairId === item.pairId) {
      this.handleCorrectMatch(left, item);
    } else {
      this.handleWrongMatch(item);
    }
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
    left.container.setScale(1);
    this.selectedLeft = null;

    this.animateConnectingLine(left.container.x, left.container.y, right.container.x, right.container.y, left.color);
    this.burstConfetti(right.container.x, right.container.y, left.color);

    [left.container, right.container].forEach((c) => {
      this.tweens.add({
        targets: c,
        scale: { from: 1, to: 1.25 },
        duration: 150,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeOut',
        onComplete: () => {
          c.setScale(1);
          c.setAlpha(0.5);
        },
      });
    });

    this.matchedCount++;
    if (this.matchedCount === ROUND_DATA.pairs.length) {
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
      g.lineStyle(this.px(6), seg.color, 0.8);
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
      tint: [color, 0xffffff, 0xffd23f],
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
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 150, () => {
        const x = Phaser.Math.Between(this.px(EDGE_MARGIN_PX), gw - this.px(EDGE_MARGIN_PX));
        const y = Phaser.Math.Between(this.px(EDGE_MARGIN_PX), this.scale.height * 0.5);
        const pair = Phaser.Utils.Array.GetRandom(ROUND_DATA.pairs);
        this.burstConfetti(x, y, pair.color);
      });
    }

    this.time.delayedCall(2000, () => this.startRound());
  }
}

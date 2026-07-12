import Phaser from 'phaser';
import { THEMES, type PairDef, type Theme } from '../data/themes';
import { RENDERERS } from '../rendering/renderers';
import { lighten, darken } from '../utils/color';

const BACKGROUND_COLOR = 0xfff8ee;
// Deliberately smaller than MatchScene's 60px gameplay edge margin: a menu of
// large, evenly-spaced choice cards is a calmer interaction than fast-paced
// tap-tap gameplay, and 60px doesn't leave room for 2 columns of 160px-min
// cards at 390px phone width. See HANDOFF decisions.
const MENU_EDGE_MARGIN_PX = 24;
const CARD_GAP_PX = 12;
const CARD_MIN_PX = 160;
const CARD_MAX_PX = 240;
const COLS = 2;

// Which pair/role represents each theme on its menu card. Defaults to the
// pool's first pair, shown as the "left" (friendly, eyed) character. Themes
// whose most recognizable signature is the *other* side override it — e.g.
// shadows reads as "shadows" via its grey silhouette, not a colored blob that
// would look identical to the shapes card.
const CARD_ICON_OVERRIDE: Partial<Record<string, { pairId?: string; role: 'left' | 'right' }>> = {
  // Pool's first pair is 'circle' — indistinguishable from the colors card's
  // circle blob at a glance. Square reads unambiguously as "shapes."
  shapes: { pairId: 'square', role: 'left' },
  shadows: { pairId: 'star', role: 'right' },
  destinations: { role: 'right' },
};

function pickCardPair(theme: Theme): { pair: PairDef; role: 'left' | 'right' } {
  const override = CARD_ICON_OVERRIDE[theme.id];
  const role = override?.role ?? 'left';
  const byId = override?.pairId ? theme.pairs.find((p) => p.id === override.pairId) : undefined;
  return { pair: byId ?? theme.pairs[0]!, role };
}

export class MenuScene extends Phaser.Scene {
  private lastSize = { w: 0, h: 0 };

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.lastSize = { w: this.scale.width, h: this.scale.height };
    this.scale.on('resize', this.handleResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.handleResize, this));

    const dpr = window.devicePixelRatio || 1;
    const { positions, cardSize } = this.computeGrid(THEMES.length);

    THEMES.forEach((theme, i) => {
      const pos = positions[i];
      if (!pos) return;
      this.createCard(theme, pos.x, pos.y, cardSize, dpr, i);
    });
  }

  private handleResize(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    // Same no-op-initial-resize guard as MatchScene (see its HANDOFF note).
    if (w === this.lastSize.w && h === this.lastSize.h) return;
    this.lastSize = { w, h };
    this.scene.restart();
  }

  private computeGrid(count: number): { positions: { x: number; y: number }[]; cardSize: number } {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.scale.width / dpr;
    const cssH = this.scale.height / dpr;
    const rows = Math.ceil(count / COLS);

    const usableW = cssW - MENU_EDGE_MARGIN_PX * 2;
    const usableH = cssH - MENU_EDGE_MARGIN_PX * 2;
    const cellW = (usableW - CARD_GAP_PX * (COLS - 1)) / COLS;
    const cellH = (usableH - CARD_GAP_PX * (rows - 1)) / rows;
    const cardSize = Math.max(CARD_MIN_PX, Math.min(cellW, cellH, CARD_MAX_PX));

    const gridH = rows * cardSize + (rows - 1) * CARD_GAP_PX;
    const gridTop = MENU_EDGE_MARGIN_PX + Math.max(0, (usableH - gridH) / 2);

    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / COLS);
      const col = i - row * COLS;
      const itemsInRow = Math.min(COLS, count - row * COLS);
      const rowWidth = itemsInRow * cardSize + (itemsInRow - 1) * CARD_GAP_PX;
      const rowLeft = (cssW - rowWidth) / 2;
      const x = rowLeft + col * (cardSize + CARD_GAP_PX) + cardSize / 2;
      const y = gridTop + row * (cardSize + CARD_GAP_PX) + cardSize / 2;
      positions.push({ x, y });
    }

    return { positions, cardSize };
  }

  // Card art is fully delegated to RENDERERS[theme.renderer] — no hardcoded
  // per-theme art lives here, only the panel chrome and grid/tap plumbing.
  private createCard(theme: Theme, x: number, y: number, sizeCss: number, dpr: number, index: number): void {
    const cx = x * dpr;
    const cy = y * dpr;
    const s = sizeCss * dpr;

    const container = this.add.container(cx, cy);

    const { pair, role } = pickCardPair(theme);
    const renderer = RENDERERS[theme.renderer];
    const { leftColor, rightColor } = renderer.resolveInstance(pair);
    const color = role === 'left' ? leftColor : rightColor;

    const half = s / 2;
    const panel = this.add.graphics();
    panel.fillStyle(lighten(color, 0.82), 1);
    panel.fillRoundedRect(-half, -half, s, s, s * 0.16);
    panel.lineStyle(Math.max(2, s * 0.02), darken(color, 0.1), 0.25);
    panel.strokeRoundedRect(-half, -half, s, s, s * 0.16);
    container.add(panel);

    const visual = renderer.render({ scene: this, x: 0, y: 0, radius: s * 0.32, role, color, pair });
    container.add(visual.container);

    container.setSize(s, s);
    container.setInteractive();
    container.on('pointerdown', () => {
      this.tweens.add({
        targets: container,
        scale: 0.92,
        duration: 90,
        yoyo: true,
        onComplete: () => this.scene.start('MatchScene', { theme }),
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
}

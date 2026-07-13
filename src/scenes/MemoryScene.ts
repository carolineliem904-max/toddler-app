import Phaser from 'phaser';
import { MEMORY_GAMES, type MemoryGame } from '../data/memoryGames';
import { shuffled } from '../data/themes';
import { starPoints } from '../rendering/renderers';
import { createEmojiText } from '../rendering/emojiText';
import { darken, lighten } from '../utils/color';
import { AudioManager } from '../audio/AudioManager';
import { MEMORY_GAME_INTRO_VOICE } from '../audio/voiceManifest';

interface MemorySceneData {
  game?: MemoryGame;
  // Same purpose as SortScene/QuizScene's isResize flag: distinguishes a
  // resize-driven re-create() (same game, not a new visit) from a real
  // menu -> game entry, so the intro voice fires once per *entry*.
  isResize?: boolean;
}

type CardState = 'down' | 'up' | 'matched';

interface MemoryCard {
  emoji: string;
  container: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Container;
  front: Phaser.GameObjects.Container;
  state: CardState;
}

// Same gameplay chrome constants as every other mechanic scene (60px edge
// margin, 80px home button) — MemoryScene is gameplay, not menu chrome.
const EDGE_MARGIN_PX = 60;
const BACKGROUND_COLOR = 0xfff8ee;
const HOME_BUTTON_SIZE_PX = 80;
const TOP_MARGIN_PX = EDGE_MARGIN_PX + HOME_BUTTON_SIZE_PX + 16;

// Post-toddler-QA difficulty progression (see HANDOFF): 2 pairs is now
// mastered, so a round-by-round sequence within the session: start at
// MIN_PAIRS, +1 pair per completed round, capped at MAX_PAIRS. Columns stay
// fixed at 2 (same "no candidate-column search needed" reasoning as before —
// only the row count varies, rows = current pair count since cards =
// pairCount * 2 and cols is always 2).
const GRID_COLS = 2;
const MIN_PAIRS = 2;
const MAX_PAIRS = 4;
const CARD_GAP_PX = 20;
const CARD_MAX_PX = 220;
// CLAUDE.md's true, never-violated touch-target minimum — logged (not
// enforced) if the geometric maximum ever dips under it, same pattern as
// every other scene's grid math. Verified empirically (headless measurement)
// that even the largest board (2x4, MAX_PAIRS) clears this at both tested
// viewports — see HANDOFF decisions for the actual numbers and why: cellW
// (not cellH) is the bottleneck here, and cellW only depends on GRID_COLS
// (always 2), never on row count, so card size is pair-count-invariant.
const CARD_SAFETY_FLOOR_PX = 120;

// "250ms flip tween — scaleX trick is fine" (spec) — split into two 125ms
// halves either side of the visible-face swap.
const FLIP_HALF_MS = 125;
// "keep 900ms at 2 pairs, use 1100ms at 3-4 pairs — more cards = more to
// remember = longer look needed" (spec, verbatim).
function mismatchLookMs(pairCount: number): number {
  return pairCount <= 2 ? 900 : 1100;
}

export class MemoryScene extends Phaser.Scene {
  private memoryGame!: MemoryGame;
  private cards: MemoryCard[] = [];
  // faceUp/resolving are mutated synchronously at tap-accept time, never
  // inside a tween's onComplete — see handleCardTap for why this is the
  // actual fix for the classic memory-game input-lock race (two rapid taps
  // both slipping through before either flip animation finishes).
  private faceUp: MemoryCard[] = [];
  private resolving = false;
  private matchedPairs = 0;
  // How many pairs the CURRENT/next round uses. Resets to MIN_PAIRS on every
  // init() — including a resize-restart, same accepted simplification as
  // QuizScene's correctStreak ("a resize mid-streak losing progress ... rare,
  // harmless edge case, not worth extra plumbing to preserve across
  // scene.restart()"). "Fresh session each visit" (spec) is satisfied by
  // resetting on a real menu -> entry too, which this also covers.
  private pairCount = MIN_PAIRS;
  private homeButton: Phaser.GameObjects.Container | null = null;
  private confettiTextureKey = 'confetti-particle';
  private lastSize = { w: 0, h: 0 };
  private isResizeEntry = false;

  constructor() {
    super('MemoryScene');
  }

  init(data: MemorySceneData): void {
    this.memoryGame = data.game ?? MEMORY_GAMES[0]!;
    this.isResizeEntry = data.isResize ?? false;
    this.faceUp = [];
    this.resolving = false;
    this.pairCount = MIN_PAIRS;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.ensureConfettiTexture();
    this.lastSize = { w: this.scale.width, h: this.scale.height };
    this.scale.on('resize', this.handleResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.handleResize, this));
    this.createHomeButton();
    if (!this.isResizeEntry) {
      const introKey = MEMORY_GAME_INTRO_VOICE[this.memoryGame.id];
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
    this.scene.restart({ game: this.memoryGame, isResize: true });
  }

  private goHome(): void {
    AudioManager.sfx('click');
    this.scene.start('MenuScene');
  }

  // Verbatim copy of every other scene's home button (same destroy-before-
  // recreate discipline, HANDOFF Slice 3 gotcha) — no shared base class,
  // same established duplication-over-abstraction precedent.
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

  // rows = pairCount (cards = pairCount * 2, cols fixed at 2) — 2 pairs =
  // 2x2, 3 pairs = 2x3, 4 pairs = 2x4.
  private computeLayout(pairCount: number): { positions: { x: number; y: number }[]; cardSize: number } {
    const rows = pairCount;
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.scale.width / dpr;
    const cssH = this.scale.height / dpr;
    const usableW = cssW - EDGE_MARGIN_PX * 2;
    const usableH = cssH - TOP_MARGIN_PX - EDGE_MARGIN_PX;

    const cellW = (usableW - CARD_GAP_PX * (GRID_COLS - 1)) / GRID_COLS;
    const cellH = (usableH - CARD_GAP_PX * (rows - 1)) / rows;
    const cardSize = Math.min(cellW, cellH, CARD_MAX_PX);
    if (cardSize < CARD_SAFETY_FLOOR_PX) {
      console.info(
        `[MemoryScene] 2x${rows} grid at ${Math.round(cssW)}x${Math.round(cssH)} can't reach the ${CARD_SAFETY_FLOOR_PX}px floor (best: ${Math.round(cardSize)}px).`,
      );
    }

    const gridW = GRID_COLS * cardSize + (GRID_COLS - 1) * CARD_GAP_PX;
    const gridH = rows * cardSize + (rows - 1) * CARD_GAP_PX;
    const left = (cssW - gridW) / 2;
    const top = TOP_MARGIN_PX + Math.max(0, (usableH - gridH) / 2);

    const positions: { x: number; y: number }[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        positions.push({
          x: left + col * (cardSize + CARD_GAP_PX) + cardSize / 2,
          y: top + row * (cardSize + CARD_GAP_PX) + cardSize / 2,
        });
      }
    }
    return { positions, cardSize };
  }

  private startRound(): void {
    this.clearBoard();
    this.homeButton?.setInteractive();

    const pair = shuffled(this.memoryGame.emojiPool).slice(0, this.pairCount);
    const deck = shuffled([...pair, ...pair]);

    const dpr = window.devicePixelRatio || 1;
    const { positions, cardSize } = this.computeLayout(this.pairCount);

    this.cards = deck.map((emoji, i) => {
      const pos = positions[i]!;
      return this.createCard(emoji, pos.x, pos.y, cardSize, dpr, i);
    });
  }

  private clearBoard(): void {
    this.tweens.killAll();
    this.cards.forEach((c) => c.container.destroy());
    this.cards = [];
    this.faceUp = [];
    this.resolving = false;
    this.matchedPairs = 0;
  }

  private createCard(emoji: string, xCss: number, yCss: number, sizeCss: number, dpr: number, index: number): MemoryCard {
    const s = sizeCss * dpr;
    const half = s / 2;
    const color = this.memoryGame.cardColor;

    const container = this.add.container(xCss * dpr, yCss * dpr);

    // Face-down: a neutral rounded-rect "sticker" — deliberately identity-
    // less (no glyph hints) since this is memory, not a matching mechanic.
    const back = this.add.container(0, 0);
    const backPanel = this.add.graphics();
    backPanel.fillStyle(color, 1);
    backPanel.fillRoundedRect(-half, -half, s, s, s * 0.14);
    backPanel.lineStyle(Math.max(2, s * 0.02), darken(color, 0.15), 0.3);
    backPanel.strokeRoundedRect(-half, -half, s, s, s * 0.14);
    back.add(backPanel);

    const star = this.add.graphics();
    const starPts = starPoints(s * 0.22, s * 0.1);
    star.fillStyle(0xfff8ee, 0.9);
    star.beginPath();
    star.moveTo(starPts[0] ?? 0, starPts[1] ?? 0);
    for (let i = 2; i < starPts.length; i += 2) star.lineTo(starPts[i] ?? 0, starPts[i + 1] ?? 0);
    star.closePath();
    star.fillPath();
    back.add(star);

    // Face-up: lighter panel + the emoji glyph.
    const front = this.add.container(0, 0);
    const frontPanel = this.add.graphics();
    frontPanel.fillStyle(lighten(color, 0.85), 1);
    frontPanel.fillRoundedRect(-half, -half, s, s, s * 0.14);
    frontPanel.lineStyle(Math.max(2, s * 0.02), darken(color, 0.15), 0.25);
    frontPanel.strokeRoundedRect(-half, -half, s, s, s * 0.14);
    front.add(frontPanel);
    front.add(createEmojiText(this, emoji, s * 0.55));
    front.setVisible(false);

    container.add([back, front]);
    // setInteractive() is kept (not the special global-pointer scheme
    // MenuScene needs) since MemoryScene has no scroll to disambiguate
    // against — an ordinary per-object tap is unambiguous here.
    container.setSize(s, s);
    container.setInteractive();

    const card: MemoryCard = { emoji, container, back, front, state: 'down' };
    container.on('pointerdown', () => this.handleCardTap(card));

    container.setScale(0.85);
    this.tweens.add({ targets: container, scale: 1, duration: 300, delay: index * 60, ease: 'Back.easeOut' });

    return card;
  }

  // The classic memory-game race: two (or more) rapid taps landing before
  // either flip animation completes. The fix is that `card.state` and
  // `this.faceUp` are both mutated synchronously, in the same call stack as
  // the tap, *before* any tween starts — so a second tap arriving a frame
  // later already sees the updated state/count and is rejected, regardless
  // of how far the first card's 250ms flip animation has actually progressed.
  // (The animation itself is fire-and-forget visual polish; none of the
  // gating logic waits on it.)
  private handleCardTap(card: MemoryCard): void {
    if (this.resolving) return;
    if (card.state !== 'down') return;
    if (this.faceUp.length >= 2) return; // defensive; resolving should already cover this

    card.state = 'up';
    this.faceUp.push(card);
    this.flipUp(card);

    if (this.faceUp.length === 2) {
      this.resolving = true;
      this.time.delayedCall(FLIP_HALF_MS * 2, () => this.resolvePair());
    }
  }

  private flipUp(card: MemoryCard): void {
    AudioManager.sfx('select');
    this.tweens.add({
      targets: card.container,
      scaleX: 0,
      duration: FLIP_HALF_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        card.back.setVisible(false);
        card.front.setVisible(true);
        this.tweens.add({ targets: card.container, scaleX: 1, duration: FLIP_HALF_MS, ease: 'Sine.easeOut' });
      },
    });
  }

  private flipDown(card: MemoryCard): void {
    this.tweens.add({
      targets: card.container,
      scaleX: 0,
      duration: FLIP_HALF_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        card.front.setVisible(false);
        card.back.setVisible(true);
        this.tweens.add({ targets: card.container, scaleX: 1, duration: FLIP_HALF_MS, ease: 'Sine.easeOut' });
      },
    });
  }

  private resolvePair(): void {
    const [a, b] = this.faceUp;
    if (!a || !b) return;

    if (a.emoji === b.emoji) {
      AudioManager.sfx('correct');
      a.state = 'matched';
      b.state = 'matched';
      [a, b].forEach((c) => {
        this.tweens.add({
          targets: c.container,
          scale: { from: 1, to: 1.2 },
          duration: 150,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeOut',
        });
      });
      this.faceUp = [];
      this.resolving = false;
      this.matchedPairs++;
      if (this.matchedPairs === this.pairCount) {
        this.time.delayedCall(500, () => this.celebrate());
      }
      return;
    }

    // No match: spec's look-time (900ms at 2 pairs, 1100ms at 3-4 — more
    // cards to remember needs a longer look), THEN the neutral boop as they
    // flip back down (not on reveal — the boop marks "flipping away", per
    // spec).
    this.time.delayedCall(mismatchLookMs(this.pairCount), () => {
      AudioManager.sfx('wrong');
      this.flipDown(a);
      this.flipDown(b);
      a.state = 'down';
      b.state = 'down';
      this.faceUp = [];
      this.resolving = false;
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
      tint: [color, darken(color, 0.35), 0x333333],
      emitting: false,
    });
    emitter.explode(14);
    this.time.delayedCall(600, () => emitter.destroy());
  }

  // Every round is its own complete board, same granularity as
  // MatchScene/SortScene's "full board -> celebrate" (unlike QuizScene's
  // every-5th-round rhythm, which exists because a single quiz question is a
  // much smaller unit than a full board).
  private celebrate(): void {
    AudioManager.sfx('celebrate');
    AudioManager.voice(AudioManager.randomPraiseKey());
    this.homeButton?.disableInteractive();

    // Post-toddler-QA difficulty progression: bump the pair count for the
    // NEXT round now, so startRound() (fired at the end of this method)
    // already picks up the new size. Capped at MAX_PAIRS — once there, every
    // further round just stays at MAX_PAIRS.
    this.pairCount = Math.min(this.pairCount + 1, MAX_PAIRS);

    this.cards.forEach((card, idx) => {
      this.tweens.add({
        targets: card.container,
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
        this.burstConfetti(x, y, this.memoryGame.cardColor);
      });
    }

    this.time.delayedCall(2000, () => this.startRound());
  }
}

import Phaser from 'phaser';
import { QUIZ_GAMES, BIG_SCALE, SMALL_SCALE, type QuizGame, type QuizRound, type PromptSpec, type AnswerSpec } from '../data/quizGames';
import { createEmojiText } from '../rendering/emojiText';
import { lighten, darken } from '../utils/color';
import { AudioManager } from '../audio/AudioManager';

interface QuizSceneData {
  game?: QuizGame;
}

interface AnswerCardState {
  answer: AnswerSpec;
  container: Phaser.GameObjects.Container;
  active: boolean;
}

// Same gameplay chrome constants as MatchScene/SortScene (60px edge margin,
// 80px home button) — QuizScene is gameplay, not menu chrome.
const EDGE_MARGIN_PX = 60;
const BACKGROUND_COLOR = 0xfff8ee;
const HOME_BUTTON_SIZE_PX = 80;
const TOP_MARGIN_PX = EDGE_MARGIN_PX + HOME_BUTTON_SIZE_PX + 16;

const PROMPT_ZONE_FRACTION = 0.4; // top ~40% of usable height, per spec

const ANSWER_CARD_GAP_PX = 16;
const ANSWER_CARD_MAX_PX = 220;
// 160px is the preferred target (spec: "Cards >= 160px"); 120px
// (ANSWER_CARD_SAFETY_FLOOR_PX) is CLAUDE.md's true, never-violated
// touch-target minimum. computeAnswerLayout never forces a card size beyond
// what the viewport geometry can actually fit (see its comment) — logged
// when the best achievable size dips below the floor, same pattern as
// MenuScene's grid.
const ANSWER_CARD_SAFETY_FLOOR_PX = 120;

const WRONG_DIM_ALPHA = 0.5;
const CORRECT_ADVANCE_DELAY_MS = 1200;
// "A quiz round is shorter than a matching board, so celebrating every round
// would wear out fast" — small win (chime+bounce+confetti) every round, big
// win (fanfare+praise) every 5th *correct* round. Wrong taps never affect
// this counter (see handleWrong).
const CELEBRATE_EVERY_N = 5;

// Big/small no-audio fallback cue: a dashed circle sized like the target.
// Reuses quizGames' BIG_SCALE/SMALL_SCALE (2.4:1) so the cue agrees with the
// actual answer-card size ratio rather than an independently-chosen number.
const SIZE_CUE_BASE_RADIUS_PX = 100;

export class QuizScene extends Phaser.Scene {
  private quizGame!: QuizGame;
  private correctStreak = 0;
  private answerCards: AnswerCardState[] = [];
  private promptContainer: Phaser.GameObjects.Container | null = null;
  private homeButton: Phaser.GameObjects.Container | null = null;
  private confettiTextureKey = 'confetti-particle';
  private lastSize = { w: 0, h: 0 };

  constructor() {
    super('QuizScene');
  }

  init(data: QuizSceneData): void {
    this.quizGame = data.game ?? QUIZ_GAMES[0]!;
    // Resets on every entry AND every resize-restart. A resize mid-streak
    // losing progress toward the next big celebration is a harmless, rare
    // edge case (device rotation) — simplest option consistent with the
    // rest of this scene's state handling, not worth extra plumbing to
    // preserve across scene.restart().
    this.correctStreak = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.ensureConfettiTexture();
    this.lastSize = { w: this.scale.width, h: this.scale.height };
    this.scale.on('resize', this.handleResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.handleResize, this));
    this.createHomeButton();
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
    this.scene.restart({ game: this.quizGame });
  }

  private goHome(): void {
    AudioManager.sfx('click');
    this.scene.start('MenuScene');
  }

  // Verbatim copy of MatchScene/SortScene's home button (same destroy-
  // before-recreate discipline, HANDOFF Slice 3 gotcha).
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

  private startRound(): void {
    this.clearBoard();
    this.homeButton?.setInteractive();

    const round = this.quizGame.generateRound();

    const dpr = window.devicePixelRatio || 1;
    const cssW = this.scale.width / dpr;
    const cssH = this.scale.height / dpr;
    const usableH = cssH - TOP_MARGIN_PX - EDGE_MARGIN_PX;
    const promptH = usableH * PROMPT_ZONE_FRACTION;
    const promptZone = { cx: cssW / 2, cy: TOP_MARGIN_PX + promptH / 2, w: cssW - EDGE_MARGIN_PX * 2, h: promptH };
    const answerZone = { top: TOP_MARGIN_PX + promptH, height: usableH - promptH };

    this.createPromptVisual(round, promptZone);

    const { positions, cardSize } = this.computeAnswerLayout(round.answers.length, answerZone, cssW);
    if (cardSize < ANSWER_CARD_SAFETY_FLOOR_PX) {
      console.info(
        `[QuizScene] ${round.answers.length}-answer layout at ${Math.round(cssW)}x${Math.round(cssH)} can't reach the ${ANSWER_CARD_SAFETY_FLOOR_PX}px floor (best: ${Math.round(cardSize)}px).`,
      );
    }
    round.answers.forEach((answer, i) => {
      const pos = positions[i];
      if (!pos) return;
      this.createAnswerCard(answer, pos.x, pos.y, cardSize, i);
    });

    if (round.introVoice) AudioManager.voice(round.introVoice);
  }

  private clearBoard(): void {
    this.tweens.killAll();
    this.answerCards.forEach((c) => c.container.destroy());
    this.answerCards = [];
    this.promptContainer?.destroy();
    this.promptContainer = null;
  }

  // --- Prompt zone ---

  private createPromptVisual(round: QuizRound, zone: { cx: number; cy: number; w: number; h: number }): void {
    const container = this.add.container(this.px(zone.cx), this.px(zone.cy));
    this.promptContainer = container;
    const prompt = round.prompt;

    if (prompt.kind === 'emojiCluster') {
      this.renderEmojiClusterPrompt(container, prompt, zone);
    } else {
      this.renderSizeCuePrompt(container, prompt, round.introVoice);
    }
  }

  // N of the same emoji in a tidy, compact loose grid — countable at a
  // glance (toddler QA feedback: the original wide organic scatter read as
  // too spread out to count reliably; "loose grid is fine, no wide
  // scatter"). See clusterGridPositions for the layout itself.
  private renderEmojiClusterPrompt(
    container: Phaser.GameObjects.Container,
    prompt: Extract<PromptSpec, { kind: 'emojiCluster' }>,
    zone: { w: number; h: number },
  ): void {
    const minDim = Math.min(zone.w, zone.h);
    const itemRadius = Phaser.Math.Clamp(minDim * 0.16, 40, 70);
    const positions = this.clusterGridPositions(prompt.count, itemRadius);
    positions.forEach((p) => {
      const text = createEmojiText(this, prompt.emoji, this.px(itemRadius) * 1.7);
      text.setPosition(this.px(p.x), this.px(p.y));
      container.add(text);
    });
  }

  // Roughly square grid sized to the item count (1->1x1, 2->2x1, 3-4->2x2,
  // 5->3x2), each row individually centered (same row-centering idea as
  // MenuScene/SortScene's grids). Small per-item jitter (12% of cell) keeps
  // it from looking robotically aligned while staying compact — a "loose
  // grid," not a wide scatter. Cell spacing is fixed (2.3x item radius), so
  // non-overlap is guaranteed by construction — this also sidesteps the
  // packing-feasibility bug the earlier organic disk-scatter had (HANDOFF:
  // a fixed min-spacing could exceed the available disk radius for 4-5
  // items; a grid with fixed cell spacing has no such failure mode).
  private clusterGridPositions(count: number, itemRadius: number): { x: number; y: number }[] {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.ceil(count / cols);
    const cellSize = itemRadius * 2.3;
    const jitter = cellSize * 0.12;
    const gridH = rows * cellSize;

    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      const col = i - row * cols;
      const itemsInRow = Math.min(cols, count - row * cols);
      const rowW = itemsInRow * cellSize;
      const x = -rowW / 2 + cellSize * (col + 0.5) + Phaser.Math.Between(-jitter, jitter);
      const y = -gridH / 2 + cellSize * (row + 0.5) + Phaser.Math.Between(-jitter, jitter);
      positions.push({ x, y });
    }
    return positions;
  }

  // Big/small's prompt zone is EMPTY except a soft ambient glow (spec: "this
  // game's prompt IS the voice line"). The dashed outline sized like the
  // target is the CRITICAL no-audio fallback — added only when the round's
  // voice line isn't confirmed loaded (AudioManager.hasVoice()), so the game
  // stays self-explanatory whether or not narration plays. Treating "not
  // confirmed loaded" (covers muted, still-preloading, and truly-missing
  // files alike) as "show the cue" is the conservative, always-correct
  // choice for a game that's otherwise unplayable by guessing.
  private renderSizeCuePrompt(
    container: Phaser.GameObjects.Container,
    prompt: Extract<PromptSpec, { kind: 'sizeCue' }>,
    introVoice: QuizRound['introVoice'],
  ): void {
    const glow = this.add.graphics();
    const glowR = this.px(SIZE_CUE_BASE_RADIUS_PX * 1.3);
    glow.fillStyle(0xffe6b3, 0.35);
    glow.fillCircle(0, 0, glowR);
    container.add(glow);
    this.tweens.add({
      targets: glow,
      scale: { from: 1, to: 1.15 },
      alpha: { from: 0.35, to: 0.55 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const voiceWillPlay = !!introVoice && AudioManager.hasVoice(introVoice);
    if (!voiceWillPlay) {
      const cueRadius = SIZE_CUE_BASE_RADIUS_PX * (prompt.target === 'big' ? BIG_SCALE : SMALL_SCALE);
      const outline = this.add.graphics();
      this.drawDashedCircle(outline, this.px(cueRadius), 0xd9822b, this.px(5));
      container.add(outline);
      this.tweens.add({
        targets: outline,
        scale: { from: 0.94, to: 1.06 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private drawDashedCircle(g: Phaser.GameObjects.Graphics, radius: number, color: number, lineWidth: number): void {
    const dashCount = 16;
    const dashFraction = 0.6;
    g.lineStyle(lineWidth, color, 0.9);
    for (let i = 0; i < dashCount; i++) {
      const start = (i / dashCount) * Math.PI * 2;
      const end = start + ((Math.PI * 2) / dashCount) * dashFraction;
      g.beginPath();
      g.arc(0, 0, radius, start, end, false);
      g.strokePath();
    }
  }

  // --- Answer cards ---

  // Tries each candidate column count (bounded by answer count — never more
  // than 3 columns since rounds never have more than 3 answers) and keeps
  // whichever fits the most cards per row while staying inside the answer
  // zone — same adaptive-grid idea as MenuScene.computeGrid, but critically
  // NEVER forces cardSize past what actually fits (see MenuScene's own fix
  // this slice): a 3-answer counting round doesn't clear 160px, or even the
  // 120px floor, in a single row at 390px phone width, so this wraps to 2
  // columns instead rather than overflowing off the safe area.
  private computeAnswerLayout(
    count: number,
    zone: { top: number; height: number },
    cssW: number,
  ): { positions: { x: number; y: number }[]; cardSize: number } {
    const usableW = cssW - EDGE_MARGIN_PX * 2;
    const colCandidates = Array.from({ length: count }, (_, i) => count - i); // e.g. count=3 -> [3,2,1]

    let cols = colCandidates[0]!;
    let bestSize = 0;
    for (const candidateCols of colCandidates) {
      const rows = Math.ceil(count / candidateCols);
      const cellW = (usableW - ANSWER_CARD_GAP_PX * (candidateCols - 1)) / candidateCols;
      const cellH = (zone.height - ANSWER_CARD_GAP_PX * (rows - 1)) / rows;
      const size = Math.min(cellW, cellH, ANSWER_CARD_MAX_PX);
      if (size > bestSize) {
        bestSize = size;
        cols = candidateCols;
      }
    }
    const cardSize = bestSize;
    const rows = Math.ceil(count / cols);
    const gridH = rows * cardSize + (rows - 1) * ANSWER_CARD_GAP_PX;
    const gridTop = zone.top + Math.max(0, (zone.height - gridH) / 2);

    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      const col = i - row * cols;
      const itemsInRow = Math.min(cols, count - row * cols);
      const rowWidth = itemsInRow * cardSize + (itemsInRow - 1) * ANSWER_CARD_GAP_PX;
      const rowLeft = (cssW - rowWidth) / 2;
      const x = rowLeft + col * (cardSize + ANSWER_CARD_GAP_PX) + cardSize / 2;
      const y = gridTop + row * (cardSize + ANSWER_CARD_GAP_PX) + cardSize / 2;
      positions.push({ x, y });
    }
    return { positions, cardSize };
  }

  private createAnswerCard(answer: AnswerSpec, x: number, y: number, size: number, index: number): void {
    const dpr = window.devicePixelRatio || 1;
    const cx = x * dpr;
    const cy = y * dpr;
    const s = size * dpr;
    const half = s / 2;

    const container = this.add.container(cx, cy);
    const panel = this.add.graphics();
    // Every answer card in a round shares the exact same panel color
    // (derived from the game's identity color, not per-answer) — correctness
    // must never be hinted at visually.
    const panelColor = lighten(this.quizGame.cardColor, 0.85);
    panel.fillStyle(panelColor, 1);
    panel.fillRoundedRect(-half, -half, s, s, s * 0.16);
    panel.lineStyle(Math.max(2, s * 0.02), darken(this.quizGame.cardColor, 0.15), 0.25);
    panel.strokeRoundedRect(-half, -half, s, s, s * 0.16);
    container.add(panel);

    if (answer.kind === 'dots') {
      const digit = this.createDigitText(answer.count, s * 0.46);
      digit.setPosition(0, -s * 0.15);
      container.add(digit);
      this.drawDotRow(container, answer.count, s);
    } else {
      const text = createEmojiText(this, answer.emoji, s * 0.62 * answer.scaleFactor);
      container.add(text);
    }

    container.setSize(s, s);
    container.setInteractive();
    container.on('pointerdown', () => this.handleAnswerTap(answer, container));

    this.answerCards.push({ answer, container, active: true });

    container.setScale(0.85);
    this.tweens.add({ targets: container, scale: 1, duration: 300, delay: index * 60, ease: 'Back.easeOut' });
  }

  // Toddler QA feedback (post-Slice-6): dot-only answers were harder to read
  // at a glance than expected, and testers responded well once a numeral was
  // added alongside the dots. Combined digit+dots is now the 2-3yo answer
  // display; a digit-only mode remains the (still unbuilt) future 3-4yo
  // difficulty step, same unimplemented-seed pattern as
  // SHAPE_CROSS_COLOR_MODE. No custom font file — just the browser's default
  // system sans-serif stack, kept huge and high-contrast.
  private createDigitText(n: number, fontSizePx: number): Phaser.GameObjects.Text {
    const dpr = window.devicePixelRatio || 1;
    const text = this.add.text(0, 0, String(n), {
      fontSize: `${Math.round(fontSizePx)}px`,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontStyle: 'bold',
      color: '#2b2b2b',
    });
    text.setOrigin(0.5);
    text.setResolution(dpr);
    return text;
  }

  // A single neat, evenly-spaced row of dots beneath the digit — deliberately
  // tidy/regular (no jitter, no 2D dice-pip layout), per toddler QA: the dots
  // now reinforce the digit rather than needing to stand alone as a
  // recognizable pip pattern.
  private drawDotRow(container: Phaser.GameObjects.Container, count: number, cardSize: number): void {
    const dotR = cardSize * 0.055;
    const spacing = cardSize * 0.16;
    const totalW = spacing * (count - 1);
    const y = cardSize * 0.3;
    const g = this.add.graphics();
    g.fillStyle(0x2b2b2b, 0.85);
    for (let i = 0; i < count; i++) {
      g.fillCircle(-totalW / 2 + i * spacing, y, dotR);
    }
    container.add(g);
  }

  // --- Interaction ---

  private handleAnswerTap(answer: AnswerSpec, container: Phaser.GameObjects.Container): void {
    const card = this.answerCards.find((c) => c.container === container);
    if (!card || !card.active) return;

    if (answer.correct) this.handleCorrect(card);
    else this.handleWrong(card);
  }

  // Neutral boop + wiggle, then the card dims and goes untappable — this is
  // scaffolding (narrowing the choice), not punishment: no streak reset, no
  // fail state, and the correct card always stays available, so the round
  // remains completable no matter how many wrong taps precede it.
  private handleWrong(card: AnswerCardState): void {
    AudioManager.sfx('wrong');
    card.active = false;
    card.container.disableInteractive();
    const baseX = card.container.x;
    this.tweens.add({
      targets: card.container,
      x: { from: baseX - this.px(12), to: baseX + this.px(12) },
      duration: 50,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        card.container.x = baseX;
        this.tweens.add({ targets: card.container, alpha: WRONG_DIM_ALPHA, duration: 200 });
      },
    });
  }

  private handleCorrect(card: AnswerCardState): void {
    AudioManager.sfx('correct');
    // Bilingual reward pattern (bigsmall only, per its answers' own `voice`
    // field — see quizGames.ts): the English word layers in ~150ms after
    // the chime starts rather than queuing right behind it, so the two read
    // as one overlapping "ta-da, Big!" moment instead of two separate
    // sounds back to back. Missing word mp3s fall through AudioManager.voice's
    // own buffer-presence guard — chime-only is exactly today's behavior.
    if (card.answer.kind === 'emojiScale') {
      const wordVoice = card.answer.voice;
      this.time.delayedCall(150, () => AudioManager.voice(wordVoice));
    }
    this.answerCards.forEach((c) => c.container.disableInteractive());

    this.tweens.add({
      targets: card.container,
      scale: { from: 1, to: 1.25 },
      duration: 150,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeOut',
    });

    if (this.promptContainer) {
      this.tweens.add({
        targets: this.promptContainer,
        scale: { from: 1, to: 1.12 },
        duration: 200,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeOut',
      });
    }

    this.burstConfetti(card.container.x, card.container.y, this.quizGame.cardColor);

    this.correctStreak++;
    const bigCelebration = this.correctStreak % CELEBRATE_EVERY_N === 0;

    this.time.delayedCall(CORRECT_ADVANCE_DELAY_MS, () => {
      if (bigCelebration) this.celebrate();
      else this.startRound();
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

  // Every 5th correct round: full celebration (fanfare + praise voice), same
  // pattern as MatchScene/SortScene's full-board celebration, duplicated
  // rather than shared (no shared base class between mechanics — established
  // precedent, see HANDOFF Slice 5).
  private celebrate(): void {
    AudioManager.sfx('celebrate');
    AudioManager.voice(AudioManager.randomPraiseKey());
    this.homeButton?.disableInteractive();

    const gw = this.scale.width;
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 150, () => {
        const x = Phaser.Math.Between(this.px(EDGE_MARGIN_PX), gw - this.px(EDGE_MARGIN_PX));
        const y = Phaser.Math.Between(this.px(EDGE_MARGIN_PX), this.scale.height * 0.5);
        this.burstConfetti(x, y, this.quizGame.cardColor);
      });
    }

    this.time.delayedCall(1600, () => this.startRound());
  }
}

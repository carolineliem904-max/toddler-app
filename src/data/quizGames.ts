import { shuffled } from './themes';
import type { VoiceKey } from '../audio/voiceManifest';

// One prompt "kind" per quiz game this slice: counting shows N of the same
// emoji in a loose cluster; big/small shows nothing but a soft ambient glow
// (the voice line IS the prompt) — 'target' is still carried on the prompt so
// QuizScene can render the no-audio-fallback size cue when needed.
export type PromptSpec =
  | { kind: 'emojiCluster'; emoji: string; count: number }
  | { kind: 'sizeCue'; target: 'big' | 'small' };

export type AnswerSpec =
  | { kind: 'dots'; count: number; correct: boolean }
  | { kind: 'emojiScale'; emoji: string; scaleFactor: number; correct: boolean };

export interface QuizRound {
  prompt: PromptSpec;
  answers: AnswerSpec[];
  // Manifest key, fires once at round start. Unlike THEME_INTRO_VOICE /
  // SORT_GAME_INTRO_VOICE (static id -> voice-key maps), this lives on the
  // round itself: big/small's line depends on the round's random target, so
  // there's no single static key per game id.
  introVoice?: VoiceKey;
}

// Menu card art spec. Same "single contained kind-level branch" pattern
// MenuScene already uses for match vs sort entries.
export type QuizMenuCard =
  | { kind: 'dots'; count: number }
  | { kind: 'emojiPair'; emoji: string; bigScale: number; smallScale: number };

export interface QuizGame {
  id: string;
  generateRound: () => QuizRound;
  menuCard: QuizMenuCard;
  cardColor: number;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Game 1: Counting 1-5 ---

// Subitizing (instant small-quantity recognition) precedes numeral literacy
// for 2-3yo — answers are dot clusters, never digits, per spec. A digits mode
// is explicitly out of scope this slice; same unimplemented-seed pattern as
// SHAPE_CROSS_COLOR_MODE (renderers.ts) for a future difficulty step.
const COUNTING_EMOJI = ['🍎', '🐤', '🐟', '🌸', '⚽'];
const COUNT_MIN = 1;
const COUNT_MAX = 5;

// Distractors: the two numerically closest counts to n, excluding n itself,
// always in-range (1-5). For an interior n this is exactly n-1/n+1 (the
// spec's literal wording); at the n=1/n=5 edges one neighbor doesn't exist,
// so the picker falls back outward on the in-range side (e.g. n=1 -> 2,3)
// rather than leaving only one distractor. Always solvable: the pool has 4
// in-range candidates for any n in 1-5. Exported so it can be property-tested
// headlessly (see verification scripts referenced in HANDOFF) without
// spinning up a Phaser scene.
export function countDistractors(n: number): number[] {
  const pool = [1, 2, 3, 4, 5].filter((v) => v !== n);
  pool.sort((a, b) => Math.abs(a - n) - Math.abs(b - n));
  return pool.slice(0, 2);
}

function generateCountingRound(): QuizRound {
  const count = randInt(COUNT_MIN, COUNT_MAX);
  const emoji = COUNTING_EMOJI[randInt(0, COUNTING_EMOJI.length - 1)]!;
  const distractors = countDistractors(count);
  const answers = shuffled<AnswerSpec>([
    { kind: 'dots', count, correct: true },
    ...distractors.map((d): AnswerSpec => ({ kind: 'dots', count: d, correct: false })),
  ]);
  return {
    prompt: { kind: 'emojiCluster', emoji, count },
    answers,
    introVoice: 'quiz_counting_intro',
  };
}

export const COUNTING_GAME: QuizGame = {
  id: 'counting',
  generateRound: generateCountingRound,
  menuCard: { kind: 'dots', count: 3 },
  cardColor: 0x5c8fd6,
};

// --- Game 2: Big vs Small ---

const BIGSMALL_EMOJI = ['🐘', '🐶', '🚗', '⚽', '🐟', '🌸'];
// Spec floor is a 2.2:1 scale ratio ("unmistakable"); 2.4:1 chosen for extra
// margin. Exported and reused as-is for the menu card preview and the
// no-audio-fallback prompt-zone size cue (QuizScene) so every visual in this
// game agrees on the same ratio.
export const BIG_SCALE = 1;
export const SMALL_SCALE = 1 / 2.4;

function generateBigSmallRound(): QuizRound {
  const emoji = BIGSMALL_EMOJI[randInt(0, BIGSMALL_EMOJI.length - 1)]!;
  const target: 'big' | 'small' = Math.random() < 0.5 ? 'big' : 'small';
  const answers = shuffled<AnswerSpec>([
    { kind: 'emojiScale', emoji, scaleFactor: BIG_SCALE, correct: target === 'big' },
    { kind: 'emojiScale', emoji, scaleFactor: SMALL_SCALE, correct: target === 'small' },
  ]);
  return {
    prompt: { kind: 'sizeCue', target },
    answers,
    introVoice: target === 'big' ? 'quiz_big_intro' : 'quiz_small_intro',
  };
}

export const BIGSMALL_GAME: QuizGame = {
  id: 'bigsmall',
  generateRound: generateBigSmallRound,
  menuCard: { kind: 'emojiPair', emoji: '🐘', bigScale: BIG_SCALE, smallScale: SMALL_SCALE },
  cardColor: 0xe0a95c,
};

export const QUIZ_GAMES: QuizGame[] = [COUNTING_GAME, BIGSMALL_GAME];

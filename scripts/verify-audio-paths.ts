// Regression guard for the audio-call-path investigation (see HANDOFF.md).
//
// We can't assert audibility headlessly, but we CAN assert that every
// gameplay event that's supposed to trigger a sound actually reaches
// AudioManager's WebAudio calls (oscillator.start() for synth SFX,
// AudioBufferSourceNode.start() for recorded voice lines). This wraps the
// real AudioContext via a Playwright init script (injected before any app
// code runs, zero changes to app source needed for the wrapping itself) and
// counts how many nodes get started per interaction, comparing against the
// exact counts the current AudioManager/scene code should produce — derived
// directly from reading playChime()/playFanfare()/etc. (see AudioManager.ts):
//   click=1, select=1, correct=3 (chime triad), wrong=1 (boop),
//   celebrate=12 (6-note fanfare x2 layers), sort pickup=1,
//   sort correct-drop=4 (1 plop + 3-note chime, played together),
//   quiz correct=3, quiz wrong=1.
// If any of these silently stop firing (wrong mute-guard, a swallowed
// exception, an event handler that stops being wired up, etc.) the observed
// count will diverge from the expected one and this script exits non-zero.
//
// Self-contained: spawns its own `vite` dev server on an ephemeral port and
// tears it down afterward, so `npm run verify:audio` needs no manual setup.
// Requires Playwright's Chromium to be installed once via `npx playwright
// install chromium` (not run automatically here — CI/dev environments should
// already have it, or run that command if this script errors saying so).

import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Page } from 'playwright';

const PORT = 5199;
const BASE_URL = `http://localhost:${PORT}`;

const INIT_SCRIPT = `
(() => {
  window.__audioLog = [];
  const log = (kind) => window.__audioLog.push(kind);
  const RealCtx = window.AudioContext || window.webkitAudioContext;
  if (!RealCtx) { log('NO_AUDIOCONTEXT_SUPPORT'); return; }
  class WrappedCtx extends RealCtx {
    createOscillator() {
      const osc = super.createOscillator();
      const origStart = osc.start.bind(osc);
      osc.start = (...a) => { log('osc'); return origStart(...a); };
      return osc;
    }
    createBufferSource() {
      const src = super.createBufferSource();
      const origStart = src.start.bind(src);
      src.start = (...a) => { log('voice'); return origStart(...a); };
      return src;
    }
  }
  window.AudioContext = WrappedCtx;
  window.webkitAudioContext = WrappedCtx;
})();
`;

let failures = 0;
function assertCount(label: string, expectedOsc: number, log: string[]): void {
  const osc = log.filter((l) => l === 'osc').length;
  if (osc === expectedOsc) {
    console.log(`  ok: ${label} (${osc} oscillator start(s))`);
  } else {
    failures++;
    console.error(`  FAIL: ${label} — expected ${expectedOsc} oscillator start(s), got ${osc}`);
  }
}

async function deviceToPage(page: Page, dx: number, dy: number) {
  return page.evaluate(
    ([x, y]) => {
      const canvas = document.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      const g = (window as any).__game;
      return { x: rect.left + (x / g.scale.width) * rect.width, y: rect.top + (y / g.scale.height) * rect.height };
    },
    [dx, dy] as [number, number],
  );
}
async function click(page: Page, dx: number, dy: number): Promise<void> {
  const p = await deviceToPage(page, dx, dy);
  await page.mouse.click(p.x, p.y);
}
async function waitForScene(page: Page, key: string): Promise<void> {
  await page.waitForFunction((k) => {
    const g = (window as any).__game;
    return !!g && g.scene.getScenes(true).some((s: any) => s.scene.key === k);
  }, key);
}
async function readAndClearLog(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const l = (window as any).__audioLog ?? [];
    (window as any).__audioLog = [];
    return l;
  });
}
// AudioManager.voice()'s own `if (!buffer) return` guard means it never
// reaches a real WebAudio node when no mp3 is shipped (true for every voice
// key in this repo, always) — so the __audioLog wrapping above can never see
// a 'voice' entry. `window.__audioManager.debugVoiceLog` (dev-only, see
// AudioManager.ts) records the call itself regardless of buffer presence,
// which is what lets this script assert a voice call PATH fires.
async function readAndClearVoiceLog(page: Page): Promise<{ key: string; t: number }[]> {
  return page.evaluate(() => {
    const am = (window as any).__audioManager;
    if (!am) return [];
    const l = [...am.debugVoiceLog];
    am.debugVoiceLog.length = 0;
    return l;
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Dev server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  console.log(`Starting dev server on port ${PORT}...`);
  const server: ChildProcess = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'pipe',
  });
  server.stderr?.on('data', (d) => process.stderr.write(`[vite] ${d}`));

  try {
    await waitForServer(BASE_URL, 15000);
    console.log('Dev server ready.\n');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.addInitScript(INIT_SCRIPT);

    await page.goto(BASE_URL);
    await page.waitForSelector('canvas');
    await waitForScene(page, 'MenuScene');
    await page.waitForTimeout(500);

    // Slice 7: the menu now scrolls (12 cards), so a card at a given
    // MENU_ENTRIES index may render below the fold at scrollY=0 — center it
    // in the viewport first (clamped to the valid scroll range; a no-op when
    // the whole grid already fits) before reading its on-screen position.
    const menuCardPos = async (index: number) =>
      page.evaluate((idx) => {
        const g = (window as any).__game;
        const scene = g.scene.getScene('MenuScene');
        const meta = scene.cardsMeta[idx];
        const dpr = window.devicePixelRatio || 1;
        const cssH = scene.scale.height / dpr;
        const desired = meta.baseY - cssH / 2;
        scene.scrollY = Math.max(0, Math.min(scene.maxScroll, desired));
        scene.applyScroll();
        return { x: meta.container.x, y: meta.container.y };
      }, index);

    console.log('=== Menu: click ===');
    let pos = await menuCardPos(0);
    await readAndClearLog(page);
    await click(page, pos.x, pos.y); // first match theme
    await waitForScene(page, 'MatchScene');
    await page.waitForTimeout(300);
    assertCount('menu card tap -> click sfx', 1, await readAndClearLog(page));

    console.log('\n=== MatchScene: select, correct, wrong, celebrate ===');
    const left0 = await page.evaluate(() => {
      const g = (window as any).__game;
      const scene = g.scene.getScene('MatchScene');
      return { x: scene.leftItems[0].container.x, y: scene.leftItems[0].container.y };
    });
    await click(page, left0.x, left0.y);
    await page.waitForTimeout(250);
    assertCount('select a left item -> select sfx', 1, await readAndClearLog(page));

    // Wrong match: tap the already-selected left item's non-matching right item.
    const wrongTarget = await page.evaluate(() => {
      const g = (window as any).__game;
      const scene = g.scene.getScene('MatchScene');
      const selectedPairId = scene.selected.item.pairId;
      const wrongRight = scene.rightItems.find((it: any) => it.pairId !== selectedPairId);
      return { x: wrongRight.container.x, y: wrongRight.container.y };
    });
    await click(page, wrongTarget.x, wrongTarget.y);
    await page.waitForTimeout(250);
    assertCount('wrong match -> wrong sfx', 1, await readAndClearLog(page));

    // Re-select (wrong tap deselects nothing on the left; left item is still
    // selected per MatchScene's handleWrongMatch, which doesn't clear selection)
    // then complete every pair to trigger celebration.
    for (let i = 0; i < 10; i++) {
      const state = await page.evaluate(() => {
        const g = (window as any).__game;
        const scene = g.scene.getScene('MatchScene');
        const leftItem = scene.leftItems.find((it: any) => !it.matched);
        if (!leftItem) return null;
        const rightItem = scene.rightItems.find((it: any) => it.pairId === leftItem.pairId);
        return { lx: leftItem.container.x, ly: leftItem.container.y, rx: rightItem.container.x, ry: rightItem.container.y };
      });
      if (!state) break;
      await click(page, state.lx, state.ly);
      await page.waitForTimeout(150);
      await readAndClearLog(page);
      await click(page, state.rx, state.ry);
      await page.waitForTimeout(150);
      const log = await readAndClearLog(page);
      if (i === 0) assertCount('correct match -> correct sfx (chime)', 3, log);
    }
    await page.waitForTimeout(600); // celebrate() fires ~500ms after last match
    assertCount('full round -> celebrate sfx (fanfare)', 12, await readAndClearLog(page));
    await page.waitForTimeout(2200); // let celebration settle before navigating away

    console.log('\n=== Home -> SortScene: pickup, correct-drop (plop+chime) ===');
    const homeBtn1 = await page.evaluate(() => {
      const g = (window as any).__game;
      const scene = g.scene.getScene('MatchScene');
      return { x: scene.homeButton.x, y: scene.homeButton.y };
    });
    await click(page, homeBtn1.x, homeBtn1.y);
    await waitForScene(page, 'MenuScene');
    await page.waitForTimeout(300);
    pos = await menuCardPos(8);
    await click(page, pos.x, pos.y); // fruit sort entry
    await waitForScene(page, 'SortScene');
    await page.waitForTimeout(400);

    const dragInfo = await page.evaluate(() => {
      const g = (window as any).__game;
      const scene = g.scene.getScene('SortScene');
      const item = scene.items[0];
      const bin = scene.bins.find((b: any) => b.accepts === item.category);
      return { ix: item.container.x, iy: item.container.y, bx: bin.x, by: bin.y };
    });
    const from = await deviceToPage(page, dragInfo.ix, dragInfo.iy);
    const to = await deviceToPage(page, dragInfo.bx, dragInfo.by);
    await readAndClearLog(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(50);
    assertCount('drag start -> pickup sfx', 1, await readAndClearLog(page));
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(500);
    assertCount('correct-bin drop -> plop + correct sfx', 4, await readAndClearLog(page));

    console.log('\n=== Home -> Counting quiz: correct, wrong ===');
    const homeBtn2 = await page.evaluate(() => {
      const g = (window as any).__game;
      const scene = g.scene.getScene('SortScene');
      return { x: scene.homeButton.x, y: scene.homeButton.y };
    });
    await click(page, homeBtn2.x, homeBtn2.y);
    await waitForScene(page, 'MenuScene');
    await page.waitForTimeout(300);
    pos = await menuCardPos(9);
    await click(page, pos.x, pos.y); // counting quiz entry
    await waitForScene(page, 'QuizScene');
    await page.waitForTimeout(400);

    const getQuizCards = async () =>
      page.evaluate(() => {
        const g = (window as any).__game;
        const scene = g.scene.getScene('QuizScene');
        return scene.answerCards.map((c: any) => ({ x: c.container.x, y: c.container.y, correct: c.answer.correct }));
      });
    let cards = await getQuizCards();
    const wrongCard = cards.find((c: any) => !c.correct)!;
    await readAndClearLog(page);
    await click(page, wrongCard.x, wrongCard.y);
    await page.waitForTimeout(300);
    assertCount('quiz wrong answer -> wrong sfx', 1, await readAndClearLog(page));

    cards = await getQuizCards();
    const correctCard = cards.find((c: any) => c.correct)!;
    await click(page, correctCard.x, correctCard.y);
    await page.waitForTimeout(300);
    assertCount('quiz correct answer -> correct sfx (chime)', 3, await readAndClearLog(page));

    console.log('\n=== Home -> Big/small quiz: correct chime + delayed word voice, wrong stays silent ===');
    const homeBtn2b = await page.evaluate(() => {
      const g = (window as any).__game;
      const scene = g.scene.getScene('QuizScene');
      return { x: scene.homeButton.x, y: scene.homeButton.y };
    });
    await click(page, homeBtn2b.x, homeBtn2b.y);
    await waitForScene(page, 'MenuScene');
    await page.waitForTimeout(300);
    pos = await menuCardPos(10);
    await click(page, pos.x, pos.y); // big/small quiz entry
    await waitForScene(page, 'QuizScene');
    await page.waitForTimeout(400);

    const getBigSmallCards = async () =>
      page.evaluate(() => {
        const g = (window as any).__game;
        const scene = g.scene.getScene('QuizScene');
        return scene.answerCards.map((c: any) => ({ x: c.container.x, y: c.container.y, correct: c.answer.correct, voice: c.answer.voice }));
      });

    // Wrong tap first (spec: "wrong answers unchanged — neutral boop only,
    // no voice"): confirm the boop fires and debugVoiceLog stays empty.
    let bsCards = await getBigSmallCards();
    const wrongBS = bsCards.find((c: any) => !c.correct)!;
    await readAndClearLog(page);
    await readAndClearVoiceLog(page);
    await click(page, wrongBS.x, wrongBS.y);
    await page.waitForTimeout(300);
    assertCount('bigsmall wrong answer -> wrong sfx (boop)', 1, await readAndClearLog(page));
    const wrongVoiceLog = await readAndClearVoiceLog(page);
    if (wrongVoiceLog.length === 0) {
      console.log('  ok: bigsmall wrong answer -> no voice() call');
    } else {
      failures++;
      console.error(`  FAIL: bigsmall wrong answer -> expected no voice() call, got [${wrongVoiceLog.map((v) => v.key).join(', ')}]`);
    }

    // New round (the round above is now dead — the wrong tap only dims one
    // card, it doesn't advance): correct tap should fire the chime, then the
    // matching word voice call ~150ms later (layered, not queued, per spec).
    bsCards = await getBigSmallCards();
    const correctBS = bsCards.find((c: any) => c.correct)!;
    await readAndClearLog(page);
    await readAndClearVoiceLog(page);
    const tapT0 = await page.evaluate(() => performance.now());
    await click(page, correctBS.x, correctBS.y);
    await page.waitForTimeout(400);
    assertCount('bigsmall correct answer -> correct sfx (chime)', 3, await readAndClearLog(page));
    const correctVoiceLog = await readAndClearVoiceLog(page);
    const wordEntry = correctVoiceLog.find((v) => v.key === correctBS.voice);
    if (!wordEntry) {
      failures++;
      console.error(
        `  FAIL: bigsmall correct answer -> expected a voice() call for '${correctBS.voice}', got [${correctVoiceLog.map((v) => v.key).join(', ')}]`,
      );
    } else {
      const delayMs = wordEntry.t - tapT0;
      // Generous window around the spec's ~150ms (allows for click-dispatch
      // and Phaser's own timer-tick overhead) — tight enough to catch a
      // regression to "synchronous" (0ms, the pattern every other sfx+voice
      // pairing in this app uses) or "not scheduled at all".
      if (delayMs >= 100 && delayMs <= 400) {
        console.log(`  ok: bigsmall correct answer -> word voice ('${wordEntry.key}') fires ~${Math.round(delayMs)}ms after the chime`);
      } else {
        failures++;
        console.error(`  FAIL: bigsmall word voice fired ${Math.round(delayMs)}ms after the tap — expected roughly 150ms (100-400ms window)`);
      }
    }

    console.log('\n=== Home -> Memory: flip, correct (match), wrong (mismatch), celebrate ===');
    const homeBtn3 = await page.evaluate(() => {
      const g = (window as any).__game;
      const scene = g.scene.getScene('QuizScene');
      return { x: scene.homeButton.x, y: scene.homeButton.y };
    });
    await click(page, homeBtn3.x, homeBtn3.y);
    await waitForScene(page, 'MenuScene');
    await page.waitForTimeout(300);
    pos = await menuCardPos(11);
    await click(page, pos.x, pos.y); // memory entry (12th card)
    await waitForScene(page, 'MemoryScene');
    await page.waitForTimeout(400);

    const getMemoryCards = async () =>
      page.evaluate(() => {
        const g = (window as any).__game;
        const scene = g.scene.getScene('MemoryScene');
        return scene.cards.map((c: any, i: number) => ({ i, emoji: c.emoji, x: c.container.x, y: c.container.y }));
      });

    // Round layout is randomized (shuffled deck of 2 pairs), so partners are
    // looked up from live scene state rather than assumed by index — same
    // dynamic-lookup approach this script already uses for QuizScene's
    // wrong/correct answer cards above.
    let memCards = await getMemoryCards();
    const mismatchIdx = memCards.findIndex((c: any) => c.i !== 0 && c.emoji !== memCards[0]!.emoji);

    await readAndClearLog(page);
    await click(page, memCards[0]!.x, memCards[0]!.y);
    await page.waitForTimeout(80);
    assertCount('memory: flip 1st card -> select sfx (pop)', 1, await readAndClearLog(page));

    await click(page, memCards[mismatchIdx]!.x, memCards[mismatchIdx]!.y);
    await page.waitForTimeout(80);
    assertCount('memory: flip 2nd (mismatching) card -> select sfx (pop)', 1, await readAndClearLog(page));
    // Resolution fires FLIP_HALF_MS*2 (250ms) after the 2nd tap, then a
    // mismatch waits MISMATCH_LOOK_MS (900ms) before the boop + flip-back —
    // see MemoryScene.resolvePair. Total ~1150ms.
    await page.waitForTimeout(1300);
    assertCount('memory: mismatch reveal -> wrong sfx (boop) on flip-back', 1, await readAndClearLog(page));

    // Both mismatched cards are face-down again; re-derive the real pair
    // partner for card 0 to drive a genuine match.
    memCards = await getMemoryCards();
    const matchIdx = memCards.findIndex((c: any) => c.i !== 0 && c.emoji === memCards[0]!.emoji);

    await readAndClearLog(page);
    await click(page, memCards[0]!.x, memCards[0]!.y);
    await page.waitForTimeout(80);
    assertCount('memory: flip 1st card (retry) -> select sfx (pop)', 1, await readAndClearLog(page));

    await click(page, memCards[matchIdx]!.x, memCards[matchIdx]!.y);
    await page.waitForTimeout(80);
    assertCount('memory: flip 2nd (matching) card -> select sfx (pop)', 1, await readAndClearLog(page));
    await page.waitForTimeout(300);
    assertCount('memory: match resolved -> correct sfx (chime)', 3, await readAndClearLog(page));

    // Match the remaining (guaranteed, by construction — exactly 2 pairs
    // exist in a 4-card round) pair to complete the board and trigger the
    // full celebration.
    const remaining = memCards.filter((c: any) => c.i !== 0 && c.i !== matchIdx);
    await readAndClearLog(page);
    await click(page, remaining[0]!.x, remaining[0]!.y);
    await page.waitForTimeout(80);
    assertCount('memory: flip 1st card of 2nd pair -> select sfx (pop)', 1, await readAndClearLog(page));

    await click(page, remaining[1]!.x, remaining[1]!.y);
    await page.waitForTimeout(80);
    assertCount('memory: flip 2nd card of 2nd pair -> select sfx (pop)', 1, await readAndClearLog(page));
    await page.waitForTimeout(300);
    assertCount('memory: 2nd pair resolved -> correct sfx (chime)', 3, await readAndClearLog(page));

    // celebrate() fires 500ms after resolvePair's match handling (matchedPairs
    // reaches TOTAL_PAIRS) — see MemoryScene.resolvePair/celebrate.
    await page.waitForTimeout(400);
    assertCount('memory: full board -> celebrate sfx (fanfare)', 12, await readAndClearLog(page));
    await page.waitForTimeout(2200); // let celebration/round-restart settle before navigating away

    if (pageErrors.length > 0) {
      failures += pageErrors.length;
      console.error('\nPage errors encountered:');
      pageErrors.forEach((e) => console.error(' ', e));
    }

    await browser.close();
  } finally {
    server.kill();
  }

  console.log(`\n${'='.repeat(40)}`);
  if (failures > 0) {
    console.error(`${failures} FAILURE(S) — an audio call path silently stopped firing.`);
    process.exit(1);
  }
  console.log('All audio call paths fire as expected.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

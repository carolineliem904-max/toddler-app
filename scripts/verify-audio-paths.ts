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

    const getMenuBoxes = async () =>
      page.evaluate(() => {
        const g = (window as any).__game;
        const scene = g.scene.getScene('MenuScene');
        return scene.children.list.filter((c: any) => c.type === 'Container' && c.input).map((c: any) => ({ x: c.x, y: c.y }));
      });

    console.log('=== Menu: click ===');
    let boxes = await getMenuBoxes();
    await readAndClearLog(page);
    await click(page, boxes[0]!.x, boxes[0]!.y); // first match theme
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
    boxes = await getMenuBoxes();
    await click(page, boxes[8]!.x, boxes[8]!.y); // fruit sort entry
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
    boxes = await getMenuBoxes();
    await click(page, boxes[9]!.x, boxes[9]!.y); // counting quiz entry
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

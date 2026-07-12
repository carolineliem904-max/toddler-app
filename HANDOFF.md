# HANDOFF — Toddler Matching Game, Slice 6

## Context
Slice 5 complete: emoji renderer, 8 matching themes + fruit sort (SortScene), unified MenuEntry
model, AudioManager with synth SFX + graceful voice loading.
Read HANDOFF.md decisions first (scene reuse gotcha, MenuEntry model, drag forgiveness notes,
emoji retina handling via createEmojiText).
This slice: the tap-the-answer engine (QuizScene) + two games: counting 1–5 and big-vs-small.

## Part A — QuizScene (new mechanic: prompt + answer cards)

### Structure
- New `src/scenes/QuizScene.ts`, data-driven like SortScene:
```ts
  interface QuizGame {
    id: string;
    generateRound(): QuizRound;   // fresh random round each time
  }
  interface QuizRound {
    prompt: PromptSpec;           // what's displayed in the prompt zone (top ~40% of screen)
    answers: AnswerSpec[];        // 2–3 cards, exactly one correct
    introVoice?: string;          // manifest key, fires at round start
  }
```
- Layout: prompt zone top ~40%, answer cards in a row below. Cards ≥160px, same edge/clearance
  discipline as everywhere. Home button: same pattern (destroy-on-recreate!).
- Interaction: tap an answer card.
  - Correct → card pops + chime, prompt zone does a happy bounce, confetti, then next round
    after ~1.2s. Every N=5 correct rounds → full celebration (fanfare + praise voice), then
    continue. (A quiz round is shorter than a matching board, so celebrating every round
    would wear out fast — rhythm: small win every round, big win every 5.)
  - Wrong → neutral boop + wiggle on the tapped card, card dims to 50% and becomes untappable
    (narrowing the choice — this is scaffolding, not punishment), correct answer stays available.
    No streak reset, no fail state.

### Game 1: Counting 1–5 (`counting`)
- Prompt: N of the same emoji (N random 1–5), arranged in a loose cluster (not a straight
  line — counting scattered objects is the actual skill). Emoji drawn from a small pool
  (🍎🐤🐟🌸⚽) — one kind per round. **Amended post-launch after real-toddler QA:** the
  original wide organic disk-scatter read as too spread out to count reliably; tightened to a
  compact "loose grid" — still not a rigid straight line, but a tidy, countable-at-a-glance
  group (see decisions below).
- Answers: 3 cards. Correct card = N; distractors = N±1 (clamped to 1–5, never duplicate
  counts). **Amended post-launch after real-toddler QA:** the original design was dot-only
  (no digits); testers found dot-only harder to read at a glance than expected, so answer
  cards now show a large digit PLUS a tidy single-row dot count beneath it (see Slice 6
  status/decisions below for the combined design and the updated dots-vs-digits rationale).
- Rationale (document in HANDOFF): subitizing (instant quantity recognition) precedes numeral
  literacy, which is why dots stay part of the display — but real toddler QA showed a bare
  digit alongside the dots reads faster than dots alone for this age band, so **combined
  digit+dots is now the 2–3yo mode**; a digit-ONLY mode (no dots at all) remains the future
  3–4yo difficulty step, same pattern as SHAPE_CROSS_COLOR_MODE.
- Voice: `quiz_counting_intro` ("Ayo hitung! Ada berapa?") at round start.
- Menu card: 🔢? No — no digits on the toddler surface. Use three dots (⚫⚫⚫ drawn as
  Graphics) on the card. Document in CARD assignments.

### Game 2: Big vs Small (`bigsmall`)
- Prompt zone: EMPTY except a soft prompt glow — this game's prompt IS the voice line.
- Answers: 2 cards, same emoji at two clearly different scales (ratio ≥ 2.2:1 so the
  difference is unmistakable; document chosen sizes). Emoji pool: 🐘🐶🚗⚽🐟🌸.
- Each round randomly asks for BIG or SMALL: voice `quiz_big_intro` ("Mana yang besar?") or
  `quiz_small_intro` ("Mana yang kecil?").
- CRITICAL fallback: if the required voice file is missing (voice system's graceful-absence
  mode), this game is unplayable-by-guessing. In that case QuizScene must show a visual cue
  instead: a pulsing outline sized LIKE the target (a big dashed circle for "big", small for
  "small") in the prompt zone. Game must be self-explanatory in both audio and no-audio states.
  Document the cue design.
- Menu card: 🐘 next to a tiny 🐘 (two text objects) — the card itself previews the concept.

## Part B — Menu integration
- Two new MenuEntry items (QuizScene + per-game config), menu now 11 cards. Verify grid at
  both viewports (3-col likely needed on phone now — cards may not fit at 2-col × 6 rows;
  keep cards ≥160px and re-run the differentiation matrix including the two new cards).

## Part C — Voice manifest additions
- `quiz_counting_intro` — "Ayo hitung! Ada berapa?"
- `quiz_big_intro` — "Mana yang besar?"
- `quiz_small_intro` — "Mana yang kecil?"
- Extend the HANDOFF recording checklist table (now 12 lines total). Same graceful absence.

## Definition of done
- Both quiz games playable from menu; correct/wrong/5-round-celebration rhythm works.
- Counting: dot arrangements verified legible at phone size; distractor logic verified over
  many generated rounds (headless: assert never-duplicate answer counts, correct always present).
- Big/small: BOTH modes verified — with a dummy voice file present AND with zero files
  (visual cue mode). Scale ratio documented.
- Wrong-answer dimming verified: after a wrong tap, that card is untappable and the round
  remains completable.
- Full regression: all Slice 5 flows still pass, both viewports, zero console errors.
- HANDOFF.md: file map, decisions, updated voice checklist, notes for Slice 7 (likely memory
  flip + deployment prep — flag anything that would complicate a Vercel static deploy now).

## Out of scope
Digits mode, memory, patterns, puzzles, tracing, persistence, parent gate, settings beyond
mute, deployment itself, age-mode selector, Twemoji.

---

## Slice 6 status: DONE

`npx tsc --noEmit` clean. Verified with headless-browser tests (Playwright, installed
temporarily via `npm install --no-save`, fully uninstalled afterward — `package.json`/
`package-lock.json` untouched) at both 390×844 and 768×1024: menu (now 11 cards) → counting
quiz (7 rounds, mixing a wrong tap before the correct one every round, confirming dimming +
completability + the every-5th-round big celebration) → home → big/small quiz in BOTH the
zero-voice-files state (the real current repo state — confirmed the dashed-outline cue renders)
and a temporary dummy-audio-file state (confirmed the cue does NOT render when voice is
confirmed loaded) → home → each of the 8 match themes + fruit sort, one entry each, zero
console errors throughout. Same brute-force/temporary-`console.debug('[TEST] ...')` +
temporary `window.__game` methodology as Slices 4–5 for precise scene-state-driven tap
targeting; all removed before this HANDOFF was written (confirmed absent via
`grep -rn "\[TEST\]\|__game" src/` and a clean `tsc` re-run). Additionally ran 40,000
generated rounds (20k counting + 20k bigsmall) plus an exhaustive `countDistractors(1..5)`
sweep through a standalone `tsx` script — pure data-layer property checks with zero Phaser/DOM
involved, per the DoD's "headless round-generation property checks" requirement.

**A real bug the headless pass caught by eye, not by assertion — again a scatter/overlap bug,
same class as Slice 5's SortScene item-placement bug.** The counting prompt's first cut used a
single-pass random-disk-sample-with-retry for its "loose cluster, not a line" placement, with a
fixed `minSpacing = itemRadius * 2.2` and a "give up and place anyway" fallback after 300
failed attempts. At phone width, the disk available to the cluster (~85px radius) turned out
smaller than the required spacing (~88px) for 4–5 items — a packing impossibility, not a rare
edge case — so the fallback triggered essentially every count-4/5 round, producing two emoji
rendered on top of each other (looked like one blob with an extra beak/fin poking out).
Nothing in the property checks caught this (they only assert on round *data* — counts,
distractor validity — never on pixel layout), and it wasn't obvious from the code review either
until an actual phone-width screenshot was read. Fixed with adaptive spacing relaxation
(`clusterPositions`, QuizScene.ts): each point gets bounded-attempt passes, and a failed pass
shrinks the required spacing by 15% and retries rather than dropping straight to an unspaced
placement — items stay maximally spread for whatever area is actually available and only pack
tighter when genuinely necessary. Re-verified via a targeted script that forced and
screenshotted several count=5 phone-width rounds specifically (the worst case): zero overlap,
comfortably legible.

**A second real bug, caught proactively this time (before shipping) rather than reactively,
directly because of the lesson from the bug above and from Slice 5's SortScene precedent:**
MenuScene's grid math had a latent overflow bug that Slice 5's 9-card menu never triggered.
`computeGrid()` forced `cardSize = Math.max(CARD_SAFETY_FLOOR_PX, bestSize)` — i.e. it clamped
the card size *up* to the 120px floor even when the viewport geometry couldn't actually fit
120px cards at the required column/row count. At 9 cards this coincidentally still fit; at this
slice's 11 cards (390×844 phone) it does not — a 2-column, 6-row grid forced up to 120px cards
overflows ~80px past the bottom safe margin, which would have meant real card clipping/overflow
off-screen. Fixed by using `bestSize` directly (the true geometric maximum across the candidate
column counts) with no forced-up clamp, so the grid can never overflow by construction; added a
`console.info` when the achievable size dips below `CARD_SAFETY_FLOOR_PX` so the gap stays
visible without being an enforced (and overflow-risking) constraint. See decisions below for the
concrete resulting numbers.

**Post-launch update: real-toddler QA on the shipped counting game drove two further
adjustments**, both landed together, `tsc` clean, re-verified with a fresh headless-Playwright
pass at both viewports (menu → 7 counting rounds with pre-existing wrong-tap/dimming/
celebration checks all still passing → home → both big/small audio states unchanged/re-confirmed
→ full 8-theme + fruit-sort regression), zero console errors, plus a targeted screenshot script
forcing and capturing count=1 and count=5 rounds at both viewports specifically (the range
extremes) to confirm the new visuals by eye. Same temporary-instrumentation-then-remove
discipline as before (`window.__game` only this round — no `console.debug('[TEST] ...')` calls
were needed since the existing scripts already read scene state directly); confirmed absent via
`grep -rn "\[TEST\]\|__game" src/` and a clean `tsc` re-run.
1. **Answer cards: digit + dots, not dots-only.** Testers found dot-only harder to read at a
   glance than expected. Cards now show a large bold numeral (`createDigitText`, system
   sans-serif font stack, no font file) with a tidy single-row of dots beneath it
   (`drawDotRow`) — replacing the old 2D dice/domino pip layout (`DICE_DOT_LAYOUTS`,
   `drawDotCluster`) entirely, since the dots no longer need to stand alone as a recognizable
   pip pattern once a digit is doing the primary identification work.
2. **Prompt cluster: tidy loose grid, not wide organic scatter.** Testers found the prompt's
   disk-scattered emoji read as too spread out to reliably count. Replaced
   `clusterPositions`/`sampleDiskPoint` (organic disk-sampling with adaptive spacing
   relaxation — the fix for last round's overlap bug) with `clusterGridPositions`: a compact,
   roughly-square grid sized to the item count, small per-item jitter so it doesn't look
   robotically aligned. This is a strictly simpler and more robust replacement, not a
   patch on top of the old approach — grid cell spacing is fixed by construction, so the
   entire packing-feasibility bug class from last round (fixed spacing exceeding the
   available placement area) cannot recur here the way it could with disk-sampling.

### File map
- `src/data/quizGames.ts` — new. `PromptSpec` (`emojiCluster` | `sizeCue`), `AnswerSpec`
  (`dots` | `emojiScale`), `QuizRound`, `QuizMenuCard` (`dots` | `emojiPair`), `QuizGame`.
  `COUNTING_GAME`: `generateCountingRound()` picks N∈[1,5] and one of 5 emoji, builds 3 shuffled
  `dots` answers via `countDistractors(n)` (exported for the headless property-check script).
  `BIGSMALL_GAME`: `generateBigSmallRound()` picks one of 6 emoji and a random big/small target,
  builds 2 shuffled `emojiScale` answers using exported `BIG_SCALE`/`SMALL_SCALE` (1 / 1÷2.4).
  Zero Phaser/DOM dependency, matching every other file under `src/data/`.
- `src/scenes/QuizScene.ts` — new. `startRound()` (clear board, generate round, layout prompt
  zone + answer zone, play `introVoice`), `createPromptVisual()` branching on `prompt.kind`
  (`renderEmojiClusterPrompt` / `renderSizeCuePrompt`), `clusterGridPositions()` (tidy compact
  grid for the prompt's N-emoji cluster — post-launch replacement for the original organic
  disk-scatter, see the QA-adjustments note above), `computeAnswerLayout()` (adaptive
  column-count grid for 2–3 answer cards, never forcing beyond what fits — see decisions),
  `createDigitText()` + `drawDotRow()` (the combined digit+dots answer display — post-launch
  replacement for the original dots-only `drawDotCluster()`/`DICE_DOT_LAYOUTS`),
  `handleCorrect()`/`handleWrong()`/`celebrate()`. Home button and confetti helpers are verbatim
  copies of MatchScene/SortScene's (same destroy-before-recreate discipline; no shared base
  class, same duplication-over-abstraction precedent as Slice 5).
- `src/data/menuEntries.ts` — `MenuEntry` gained a third variant, `{ kind: 'quiz'; id; game:
  QuizGame }`; `MENU_ENTRIES` now appends `QUIZ_GAMES` after `SORT_GAMES` (11 entries total: 8
  match + 1 sort + 2 quiz).
- `src/scenes/MenuScene.ts` — `createCard()` gained a third branch for `entry.kind === 'quiz'`,
  rendering `game.menuCard` (`dots` → new `drawMenuDotsRow()` helper, a plain horizontal row of
  3 dots, deliberately simpler than QuizScene's in-game dice-pip positions since it's just an
  identity glyph; `emojiPair` → two `createEmojiText` calls at big/small scale). Tap handler
  extended to `scene.start('QuizScene', { game: entry.game })`. **`computeGrid()`'s
  overflow-bug fix** (see above): `cardSize` is now `bestSize` directly, never force-clamped
  above what the candidate column search actually found fits; `CARD_SAFETY_FLOOR_PX` is now a
  pure logging/documentation reference via a `console.info` rather than an enforced floor.
- `src/audio/voiceManifest.ts` — 3 new voice keys (`quiz_counting_intro`, `quiz_big_intro`,
  `quiz_small_intro`) + manifest entries. No `QUIZ_GAME_INTRO_VOICE` map (unlike
  `THEME_INTRO_VOICE`/`SORT_GAME_INTRO_VOICE`) — see decisions for why.
- `src/audio/AudioManager.ts` — new `hasVoice(key)` method: `true` only once a line's buffer
  has actually finished loading. Purely a query, no new playback path.
- `src/main.ts` — registers `QuizScene` in the scene list.
- `HANDOFF.md` — this update; `slice6.md` (the staged spec) removed, its content now lives
  here, same consolidation pattern as prior slices.

### Decisions / deviations
- **Menu grid overflow fix — concrete numbers.** At 390×844 (phone), 11 cards: the adaptive
  column search now correctly lands on 3 columns × 4 rows, `cardSize` ≈ **106.7px CSS**
  (confirmed by direct scene-state measurement, not estimated) — under the 160px target *and*
  under the 120px `CARD_SAFETY_FLOOR_PX` reference by ~13px, logged via `console.info` rather
  than silently swallowed. This is a genuine geometric wall at this exact card count/margin/gap
  combination, not a tuning oversight: fitting 120px cards at 3 columns on a 390px phone would
  need ~360px of usable width (before gaps) against the ~342px actually available after
  `MENU_EDGE_MARGIN_PX`'s 24px-per-side safety margin — the two knobs available to close that
  gap (shrinking the edge-safety margin further, or scrolling) were both rejected: the margin
  exists specifically to prevent accidental palm touches (shrinking it to chase card count feels
  backwards), and scrolling is a bigger, out-of-scope UX change for a single slice's menu-count
  bump. Accepted as a narrow, count-triggered exception — same category as SortScene's 110px
  item-diameter floor (Slice 5) — and flagged for Slice 7 in case a 12th entry ever gets added.
  At 768×1024 (tablet), 11 cards: 3 columns × 4 rows, `cardSize` ≈ **211px CSS**, comfortably
  clearing the 160px target.
- **`PromptSpec`/`AnswerSpec`/`QuizMenuCard` are small discriminated unions, not a
  per-game-hardcoded pair of render functions.** With exactly 2 games this slice either shape
  would work; the union was chosen because QuizScene's rendering code (`createPromptVisual`,
  `createAnswerCard`) needs to branch on *shape of content* either way, and a typed union keeps
  that branch exhaustive-checkable by `tsc` rather than stringly-typed. Not a bid for
  extensibility beyond what's needed — no third variant exists, no plugin registry was built.
- **Counting distractors: nearest-numeric-neighbor, not literally hardcoded N±1.**
  `countDistractors(n)` sorts `[1..5]\{n}` by distance from `n` and takes the closest two. For
  interior `n` (2,3,4) this is exactly the spec's literal "N±1" wording; at the `n=1`/`n=5`
  edges (where one neighbor doesn't exist) it falls back outward on the in-range side (e.g.
  `n=1` → `{2,3}`) rather than shipping with only one valid distractor. Exhaustively verified
  for all of 1–5 in the headless property-check script, plus spot-checks against the literal
  spec wording for the interior values.
- **Dot rendering originally used two deliberately different visual languages; superseded
  post-launch by real-toddler QA (see the QA-adjustments note above).** The original design:
  answer cards used fixed dice/domino pip layouts (`DICE_DOT_LAYOUTS`, positions 1–5) —
  structured, recognizable-as-a-symbol — while the prompt's emoji cluster was organic/scattered,
  explicitly not gridlike. Testers found both choices worked against legibility for this age
  band (dot-only answers read slower than digit+dots; the scattered prompt read as too spread
  out to count), so both were changed: answer cards now combine a digit with a plain single-row
  dot count (`createDigitText` + `drawDotRow`), and the prompt uses a tidy compact grid
  (`clusterGridPositions`) instead of organic scatter. The one distinction that's still
  intentional and unchanged: the prompt (real objects to count) and the answers (an abstract
  quantity symbol) remain visually distinct from each other — a row of dots under a big digit
  reads differently from N loose emoji, which is the point — they just don't each also carry an
  *internal* structured-vs-organic distinction anymore.
- **`hasVoice()` treats "not confirmed loaded" as "missing."** Covers three states identically
  (muted, still-preloading — the Slice 4 "voice preload race," still unaddressed — and truly
  absent files) by design: for a game that's otherwise unplayable by guessing, showing the
  visual cue defensively whenever narration isn't *certain* to play is the only always-correct
  default. Worst case (voice arrives a beat after the cue already rendered) is a redundant but
  harmless visual; the alternative (assuming voice will come through) risks a genuinely
  unplayable round.
- **Big/small's introVoice lives on the round, not a static per-game map.** Unlike
  `THEME_INTRO_VOICE`/`SORT_GAME_INTRO_VOICE` (id → fixed voice key), big/small's line depends
  on the round's random target — `quiz_big_intro` or `quiz_small_intro` — so there's no single
  static key per game id to look up. `QuizRound.introVoice` carries it directly instead; no
  `QUIZ_GAME_INTRO_VOICE` map was added.
- **Size-cue and answer-scale ratio are tied to the same constants.** `BIG_SCALE`/`SMALL_SCALE`
  (1 / 1÷2.4, exported from `quizGames.ts`) drive both the answer cards' emoji scale AND
  (multiplied by `SIZE_CUE_BASE_RADIUS_PX = 100`) the no-audio dashed-circle cue's two radii —
  one ratio, reused, rather than an independently-tuned cue size that could drift out of sync
  with what the answers actually show. 2.4:1 chosen over the spec's 2.2:1 floor for extra
  margin, same "floor + explicit margin" pattern as SortScene's 1.5× `BIN_HIT_MULTIPLIER`
  (spec floor 1.4×) in Slice 5.
- **`correctStreak` resets on every QuizScene entry AND every resize-restart** (in `init()`,
  unconditionally). A resize mid-streak losing progress toward the next 5th-round celebration is
  a rare, harmless edge case (device rotation) — simplest option consistent with the rest of
  this scene's state handling, not worth extra plumbing (e.g. threading an `isResize` flag
  through init data just to preserve one counter) for something a toddler would never notice.
- **QuizScene's answer-card layout was built defensively from the start, using the same
  never-force-beyond-fit principle as the MenuScene fix, rather than needing its own reactive
  bug fix.** `computeAnswerLayout()`'s candidate-column search takes `bestSize` as-is (no floor
  clamp); at 390px phone width, a 3-answer counting round correctly wraps to 2 columns instead
  of forcing an impossible single row, landing at ≈127px CSS cards (confirmed by measurement) —
  under the 160px target but clearing the 120px floor, unlike the menu's 11-card case. Logged
  via `console.info` if it ever doesn't (mirrors MenuScene's fix exactly).
- **Menu card colors: counting `0x5c8fd6` (blue), bigsmall `0xe0a95c` (tan).** Not run through
  the full pairwise collision matrix in exhaustive detail — both cards' art (a plain dot row;
  two same-emoji glyphs at different scales) is silhouette-distinct from every existing card
  type (colored blobs, shapes, single icons/emoji, the sort game's basket) by construction, so a
  same-family color collision (the only kind the differentiation rule cares about) isn't a real
  risk here the way it was between e.g. Slice 4's shapes/destinations or Slice 5's fruits/shapes.
- **Verification tooling: Playwright installed via `npm install --no-save`, never touching
  `package.json`.** Confirmed `git diff` on `package.json`/`package-lock.json` was clean after
  `npm uninstall playwright` (one incidental `package-lock.json` lockfile-metadata diff was
  reverted with `git checkout --`). Same "temporary, fully removed" discipline as the
  `console.debug('[TEST] ...')` / `window.__game` instrumentation.

### Voice-recording checklist (extended)

Record each line in Indonesian, export as mp3, drop into `public/audio/voice/` using the exact
filename below — no code change needed either way.

| Key | Filename | Indonesian line | Trigger |
|---|---|---|---|
| `theme_colors_intro` | `theme_colors_intro.mp3` | "Ayo cocokkan warnanya!" | Entering the **colors** theme from the menu |
| `theme_shapes_intro` | `theme_shapes_intro.mp3` | "Ayo cocokkan bentuknya!" | Entering the **shapes** theme from the menu |
| `theme_shadows_intro` | `theme_shadows_intro.mp3` | "Dimanakah bayanganku?" | Entering the **shadows** theme from the menu |
| `theme_objects_intro` | `theme_objects_intro.mp3` | "Ayo cari yang sama!" | Entering the **objects** theme from the menu |
| `theme_destinations_intro` | `theme_destinations_intro.mp3` | "Di mana rumahku?" | Entering the **destinations** theme from the menu |
| `theme_animals_intro` | `theme_animals_intro.mp3` | "Ayo cari hewannya!" | Entering the **animals** theme from the menu |
| `theme_vehicles_intro` | `theme_vehicles_intro.mp3` | "Ayo cari kendaraannya!" | Entering the **vehicles** theme from the menu |
| `theme_fruits_intro` | `theme_fruits_intro.mp3` | "Ayo cari buahnya!" | Entering the **fruits** theme from the menu |
| `game_fruitsort_intro` | `game_fruitsort_intro.mp3` | "Ayo pilah buahnya!" | Entering the **fruit sorting** game from the menu |
| `quiz_counting_intro` | `quiz_counting_intro.mp3` | "Ayo hitung! Ada berapa?" | Each round of the **counting** quiz starts |
| `quiz_big_intro` | `quiz_big_intro.mp3` | "Mana yang besar?" | A **big/small** quiz round asks for "big" |
| `quiz_small_intro` | `quiz_small_intro.mp3` | "Mana yang kecil?" | A **big/small** quiz round asks for "small" |
| `praise_1` | `praise_1.mp3` | "Pintar!" | Random pick on full-board celebration |
| `praise_2` | `praise_2.mp3` | "Hebat!" | Random pick on full-board celebration |
| `praise_3` | `praise_3.mp3` | "Yeay!" | Random pick on full-board celebration |
| `praise_4` | `praise_4.mp3` | "Bagus sekali!" | Random pick on full-board celebration |

Each theme/sort-game intro line fires once per menu→entry visit (unchanged). The two quiz intro
lines are the one exception in this manifest: they fire once per **round**, not once per entry
(a fresh counting round or a fresh big/small target each need their own narration) — see
decisions above for why this isn't a static per-game id lookup like the others. Praise lines are
picked uniformly at random, one per celebration, alongside the fanfare SFX (which always plays).
**Big/small is playable with zero voice files recorded** (today's real state, verified this
slice) via its dashed-outline visual cue — recording `quiz_big_intro`/`quiz_small_intro` is not
a blocker for shipping the game, only for the narrated experience.

### Notes for Slice 7
- **Likely scope per this slice's DoD: memory flip + deployment prep.** Nothing built yet.
  Deployment-prep flag: this slice adds no new external dependencies, no server-side code, no
  new build-time asset pipeline (emoji/Graphics only, same as every prior slice) — nothing here
  should complicate a Vercel static deploy. The one thing worth a deploy-prep sanity check:
  `public/audio/voice/` currently ships with only a `.gitkeep` (zero real mp3s across all 15
  entries in the manifest) — confirm the static build doesn't choke on the missing directory
  contents (it shouldn't, `fetch()` 404s are handled gracefully) before relying on that in prod.
- **Menu is now at 11 entries, and phone-width cards are measured at ~106.7px CSS — already
  under the 120px touch-target floor, not just close to it.** If Slice 7 (or any future slice)
  adds a 12th entry, do NOT expect `computeGrid()`'s adaptive column search to rescue it further
  — 3 columns is already the best fit at 11, and going to 4 only shrinks cards more. The real
  fix at that point is scrolling (biggest, most correct, and was explicitly out of scope for
  this slice) or accepting a shrinking floor is no longer viable and redesigning the menu
  (e.g. category tabs). Don't just bump `GRID_COLUMN_CANDIDATES` and hope.
- **The counting-prompt cluster-overlap bug (see status notes above) is the second slice in a
  row where a scatter/placement algorithm's first cut silently overlapped at the extremes of its
  count range, caught only by reading a screenshot.** If a future slice adds another "N
  scattered items" mechanic, budget for a phone-width, max-count screenshot check specifically —
  property/assertion checks on the underlying data have proven blind to this entire bug class
  twice now (SortScene Slice 5, QuizScene this slice).
- **Voice preload race** (carried from Slice 4, still unaddressed): once real mp3s exist for any
  of the 15 manifest entries, spot-check whether the very first theme/game/quiz-round entered in
  a fresh session reliably plays its intro line, or whether the fetch/decode occasionally loses
  the race against the scene's `create()`. Now slightly more load-bearing than before: big/small
  actively *changes behavior* (shows the dashed cue) when a voice line hasn't resolved yet, so a
  slow preload on a fresh session could show the cue briefly even once real mp3s are recorded —
  harmless (redundant, not wrong) but worth knowing about.
- **`correctStreak` resets on resize** (QuizScene, see decisions) — unchanged/accepted, revisit
  only if it becomes user-noticeable.
- **`SHAPE_CROSS_COLOR_MODE`** (`renderers.ts`), **`initiateFrom: 'either'`** (`MatchScene.ts`),
  and now **a digits-mode for counting** (explicitly out of scope this slice, same
  unimplemented-seed pattern) are all still-unimplemented seeds for a future difficulty/age-mode
  toggle.
- Menu still shows all entries unconditionally with no progress/lock state; mute state still
  resets to ON every load (no persistence) — both unchanged, matches this slice's scope.
- `AudioManager` remains a plain module-level singleton (now shared across 4 scenes instead of
  3) — still fine at this scale; revisit only if a non-scene context (e.g. a future parent gate)
  needs audio.

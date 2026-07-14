# HANDOFF — Toddler Matching Game, Slice 7

## Context
Slice 6 complete: QuizScene (counting digit+dots, big/small with voice/visual-cue dual mode),
11-card menu at its geometric limit (flagged: 12th entry needs menu scrolling).
Read HANDOFF.md decisions first (scene reuse gotcha, MenuEntry model, createEmojiText,
grid clamping fix).
This slice: (A) menu scroll, (B) memory flip game, (C) Vercel deployment prep + PWA basics.

## Part A — Menu scrolling (prerequisite for the 12th card)
- Convert MenuScene's grid to a vertically scrollable container (Phaser camera scroll or
  container + drag — builder's choice, document it). Requirements:
  - Touch-drag scrolling with momentum feel is NOT required — simple direct drag is fine
    and more predictable for toddlers. No scrollbars, no visual chrome.
  - Rubber-band or hard-stop at ends (no infinite scroll, no wrap).
  - CRITICAL: a drag that scrolls must NOT fire a card tap on release. Tap vs scroll
    disambiguation: movement under ~12css px = tap, over = scroll (document threshold chosen).
  - Cards partially visible at the fold should be tappable only when ≥60% visible (prevents
    accidental edge taps mid-scroll).
- Verify scroll + tap disambiguation headless at both viewports, and the no-scroll case
  (tablet may fit all 12 without scrolling — behavior must degrade gracefully to static).

## Part B — Memory flip game (new mechanic, deliberately tiny)
- New `src/scenes/MemoryScene.ts`. 2–3yo memory is SHORT: grid of 4 cards (2 pairs) only.
  (Classic memory is 3–4+; this is the intro version. A bigger grid is a future age-mode.)
- Cards: face-down shows a neutral pattern (soft rounded rect + ? — no, no glyphs: use a
  simple star sticker motif drawn via Graphics). Face-up shows an emoji from a small pool
  (reuse animals/fruits pools).
- Interaction: tap flips a card (250ms flip tween — scaleX trick is fine). Two face-up:
  - Match → both pulse + chime + stay face-up; when all matched → celebration (existing
    pattern) → new round (fresh pair sample).
  - No match → both stay visible ~900ms (toddlers need longer look time than adults),
    then flip back with the neutral boop. No fail state, no attempt counting.
- Only 2 cards can be face-up at once; taps during resolve are ignored (input lock —
  test this, it's the classic memory-game race bug).
- Menu card: two Graphics card-backs slightly fanned. Voice manifest: `game_memory_intro`
  ("Di mana kembarannya?"). Extend recording checklist (13 lines).
- Home button: standard pattern (destroy-on-recreate).

## Part C — Deployment prep (Vercel + minimal PWA)
- Ensure `npm run build` produces a clean static build; fix anything Vite flags.
- `vercel.json` if needed (SPA, no rewrites expected for a single-page Phaser app — keep minimal).
- Minimal PWA layer, same scope as Beep Beep!: manifest.json (name "Toddler Match", portrait
  orientation preference, theme color matching the cream bg, icons — generate simple placeholder
  icons from the red-circle-with-eyes motif via a small build script or static pngs),
  apple-touch-icon, and a basic service worker for offline asset caching (vite-plugin-pwa is
  fine and battle-tested from Beep Beep!; pin its version).
  Rationale: this app's real usage is "kid grabs phone in the car" — offline matters more
  than for most apps.
- Voice files: ensure the build/deploy pipeline includes public/audio/voice/ contents when
  present, and the graceful-absence behavior is verified in the BUILT app (not just dev) —
  service worker must not cache-poison missing-then-added voice files (verify: deploy-like
  serve of dist/, add a file, confirm it's picked up after SW update cycle; document SW
  update strategy chosen — autoUpdate is fine).
- Do NOT deploy — Caroline connects the repo to Vercel herself (same flow as her other apps).
  Definition of done covers a local `npm run build && preview` verification only.

## Definition of done
- 12-entry menu scrolls correctly; tap/scroll disambiguation verified; static fallback on
  tall viewports verified.
- Memory game: full round + celebration loop; input-lock race verified (rapid triple-tap test);
  900ms reveal timing confirmed.
- `npm run build` clean; `vite preview` serves a fully working app including audio graceful
  absence; PWA installability checks pass (manifest + SW registered, Lighthouse PWA pass
  not required but note any misses).
- Full regression at both viewports, zero console errors.
- HANDOFF.md: file map, decisions, SW update strategy, extended voice checklist, notes for
  Slice 8 (likely: patterns game or age-mode selector — flag which looks cheaper given
  current architecture).

## Out of scope
Actual Vercel deploy, patterns/puzzles/tracing, persistence beyond PWA caching, parent gate,
age-mode selector, analytics, Twemoji, bigger memory grids.

---

## Slice 7 status: DONE

All three parts shipped: MenuScene now scrolls (fixed 2-column grid, hard-stop clamp, tap-vs-
scroll disambiguation, 60%-visibility fold rule); `MemoryScene` (4-card / 2-pair flip game,
race-proof input lock) is live as the 12th menu entry; the app builds as an installable PWA
(manifest, service worker, generated icons) with no Vercel-specific config needed. `npx tsc
--noEmit` clean throughout.

### Verification methodology
Two layers, matching the project's established split between a **permanent** regression guard
and **temporary**, delete-after-use behavioral scripts (Slices 4–6's discipline):

1. **`scripts/verify-audio-paths.ts` (permanent, extended)** — the Slice 6 audio-call-path
   regression guard now also covers MemoryScene's four sound events (flip = `select`, mismatch
   flip-back = `wrong`, pair match = `correct` chime, full board = `celebrate` fanfare),
   dynamically locating a round's real matching/mismatching pairs from live scene state (never
   assumed by index — round layout is shuffled) the same way it already does for QuizScene's
   answer cards. Because the menu now scrolls, its old `getMenuBoxes()` helper (which assumed
   every card was on-screen at load) had to be replaced with a `menuCardPos(index)` helper that
   explicitly scrolls the target card into view first — see "bugs found" below. All 10
   checkpoints pass: click=1, select=1, wrong=1, correct=3, celebrate=12 (MatchScene); pickup=1,
   correct-drop=4 (SortScene); wrong=1, correct=3 (QuizScene); and the memory sequence
   (select×2, wrong=1, select×2 + correct=3, select×2 + correct=3, celebrate=12).
2. **Temporary Playwright scripts (`scripts/tmp-verify-slice7.ts`, `scripts/tmp-verify-
   build.ts` — both written, run, then deleted; confirmed absent via `grep -rn "tmp-verify"
   scripts/` and `git status`)** covered everything the audio-path guard deliberately doesn't:
   - Menu scroll @ both viewports: a >12css px drag scrolls (`scrollY > 0`) and does **not**
     navigate; a <12css px jitter on a card **still** registers as a tap (real taps aren't
     pixel-perfect); a card scrolled to ~40% visibility at the bottom fold does **not** register
     a tap (60%-visibility rule).
   - Memory input-lock race, at the tightest possible margin: three **synchronous**, zero-
     elapsed-time calls to the scene's own tap handler (`scene.handleCardTap(cards[0/1/2])`
     back-to-back in one `page.evaluate()`) plus a realistic rapid-mouse-click burst on 3 real
     DOM events — both confirm exactly 2 cards are accepted as face-up and the 3rd is rejected
     (still `'down'`).
   - Mismatch timing: measured the actual elapsed time from the 2nd tap to the cards flipping
     back down, confirming it lands in the expected ~1150ms window (250ms flip-resolve delay +
     900ms look time, per spec).
   - Full sweep: all 12 menu entries, one visit each, at both viewports (390×844, 768×1024),
     zero console errors throughout (mirrors Slice 6's "each theme + fruit sort" sweep,
     extended to the two new mechanics).
   - Production build (`npm run build && vite preview`, real Chromium): service worker
     registers and activates; `manifest.webmanifest` is fetchable; the dev-only `window.__game`
     hook is confirmed dead-code-eliminated (absent) from the prod bundle; the audio graceful-
     absence `console.info` still fires after a real synthesized user gesture; zero console
     errors; and — the specific scenario the spec called out — a dummy `.mp3` dropped directly
     into the **already-built** `dist/audio/voice/` (simulating a static host gaining a file
     the currently-installed service worker's precache manifest never listed) is fetchable
     through that same already-registered SW on reload, not served a cached/poisoned 404.

### Bugs found
Unlike Slices 5 and 6 (which both found real placement/overflow bugs in the *app*), every bug
this slice surfaced was in the **verification tooling**, not the app itself — worth stating
plainly rather than implying parity with those prior findings:
1. `verify-audio-paths.ts`'s `getMenuBoxes()` assumed every menu card was on-screen at
   `scrollY=0`. Once the menu started scrolling (12 cards; only the first few rows fit in the
   initial viewport), clicking the fruit-sort/quiz/memory entries' *stale, off-screen*
   coordinates silently no-opped and the test hung on a `waitForScene` timeout. Fixed with a
   `menuCardPos(index)` helper that explicitly sets `scene.scrollY` to center the target card
   (clamped to `[0, maxScroll]`) and calls `scene.applyScroll()` before reading its position —
   the same direct-scene-state-mutation technique this project's tests already use elsewhere.
2. The temporary script's own 60%-visibility-fold test had an algebra error in the scroll
   position it computed to land a card at ~40% visibility, producing a false failure (the tap
   *did* register, correctly, because the card was actually still >60% visible). Corrected
   derivation: at `scrollY = maxScroll` the last card's bottom edge sits flush with the
   viewport's bottom edge (100% visible, by construction of `maxScroll`); solving for `cardTop
   = viewBottom - 0.4·size` gives `scrollY = baseY - viewBottom - 0.1·size`. Worth flagging
   since it's exactly the class of mistake prior slices' HANDOFF notes have repeatedly warned
   about (placement/geometry math needs to be actually checked, not just "looks right").
3. A test-pacing bug in the memory celebration check: the first attempt waited only 600ms after
   the round-completing tap, but `celebrate()` actually fires 750ms after that tap (a 250ms
   flip-resolve delay chained into a 500ms pre-celebrate delay inside `resolvePair()`) —
   undercounted oscillators (5 instead of 12) until the wait was corrected and reads were split
   apart to isolate each event, matching the granularity the rest of the script already uses.

### File map
- `src/scenes/MenuScene.ts` — rewritten for scrolling. `computeLayout()` replaces
  `computeGrid()`: fixed `GRID_COLS = 2` (see decisions for why the old candidate-column search
  is now dead code), returns `maxScroll` alongside positions/cardSize. New scene-level pointer
  handlers (`handlePointerDown/Move/Up`) replace per-card `pointerdown` navigation entirely —
  cards still call `setInteractive()` (kept purely so `scripts/verify-audio-paths.ts`'s
  `.input`-filtering tooling still finds them) but no listener is attached to it; navigation now
  fires from `handlePointerUp` only after confirming the whole gesture's max displacement never
  exceeded `TAP_MOVEMENT_THRESHOLD_CSS` (12) and the tapped card clears
  `CARD_VISIBILITY_TAP_THRESHOLD` (0.6) at release. `applyScroll()` repositions every card
  container directly (`container.y = (baseY - scrollY) * dpr`) — no wrapping Container was
  introduced (see decisions: this keeps cards as direct Scene children, preserving the existing
  audio-verification tooling's traversal assumptions). New `drawMemoryCardBacksIcon()` for the
  12th card's menu art (imports `starPoints` from `renderers.ts`).
- `src/scenes/MemoryScene.ts` — new. `computeLayout()` (fixed 2×2, no candidate search needed —
  the shape never varies), `createCard()` (back/front sub-containers toggled via `setVisible()`,
  scaleX-tween flip via `flipUp()`/`flipDown()`), `handleCardTap()` (the input-lock race fix —
  see decisions), `resolvePair()` (match vs. mismatch branching, mismatch's 900ms look-time +
  boop-on-flip-back), `celebrate()` (verbatim-pattern copy of MatchScene/SortScene's, not
  QuizScene's every-5th-round rhythm — see decisions for why).
- `src/data/memoryGames.ts` — new. `MemoryGame` interface (`id`, `emojiPool`, `cardColor`);
  `MEMORY_EMOJI_POOL` built from `[...ANIMAL_POOL, ...FRUIT_POOL].map(p => p.emoji)` (reuses
  the *actual* pool data, not a hand-copied duplicate list, so it can't drift); `MEMORY_GAMES`
  array (one entry, matching `SORT_GAMES`/`QUIZ_GAMES`'s shape for menuEntries.ts uniformity).
- `src/data/themes.ts` — `ANIMAL_POOL` and `FRUIT_POOL` are now `export`ed (previously
  module-private) so `memoryGames.ts` can reuse them.
- `src/rendering/renderers.ts` — `starPoints()` is now `export`ed (previously module-private) —
  a deliberate, narrow exception to this project's "duplicate scene logic, don't share a base
  class" precedent: it's a ~10-line pure trig helper, not scene behavior, and both MenuScene's
  memory-card preview and MemoryScene's actual face-down sticker need the identical geometry.
- `src/data/menuEntries.ts` — `MenuEntry` gains a fourth variant, `{ kind: 'memory'; id; game:
  MemoryGame }`; `MENU_ENTRIES` appends `MEMORY_GAMES` after `QUIZ_GAMES` (12 entries total: 8
  match + 1 sort + 2 quiz + 1 memory — memory is always the last entry).
- `src/audio/voiceManifest.ts` — new `game_memory_intro` key/manifest entry + new
  `MEMORY_GAME_INTRO_VOICE` map (id → key, same static-per-id pattern as
  `SORT_GAME_INTRO_VOICE`, fires once per menu → entry visit via the same `isResize` guard every
  other gameplay scene uses).
- `src/main.ts` — registers `MemoryScene` in the scene list.
- `scripts/verify-audio-paths.ts` — extended with the memory checkpoints (see "verification
  methodology"); `getMenuBoxes()` replaced by the scroll-aware `menuCardPos(index)` (see "bugs
  found").
- `scripts/generate-icons.ts` — new, **permanent** (not temporary — unlike the tmp-verify-*
  scripts, this is meant to be re-run whenever the icon design changes, same category as
  `verify-audio-paths.ts`). Hand-rolled PNG encoder (manual IHDR/IDAT/IEND chunks + CRC32,
  RGB truecolor, `zlib.deflateSync` for compression) using **zero new dependencies** — a
  deliberate choice over `sharp`/`canvas` (native bindings are exactly the kind of deploy-risk
  a "keep minimal" deployment-prep task should avoid). Draws this app's own colorBlob "red
  circle + eyes" character (same proportions as `renderers.ts`'s `addEyes()`) at icon scale,
  reusing the app's actual visual identity instead of importing external art. Run via
  `npm run generate-icons`.
- `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — new, generated output
  (committed, not built during `npm run build` — static, like every other asset in this app).
- `vite.config.ts` — new (this project previously ran on Vite's zero-config defaults).
  Configures `vite-plugin-pwa` (`registerType: 'autoUpdate'`, manifest inlined here rather than
  a hand-written `manifest.json` — the plugin generates `manifest.webmanifest` and injects the
  `<link rel="manifest">` tag automatically). `workbox.globPatterns` includes `mp3` so real
  voice lines recorded later get precached automatically on their *next* build — no code change
  needed, matching every other "drop a file in" pattern this app already uses for voice assets.
- `index.html` — added `<meta name="theme-color" content="#fff8ee">` and `<link rel=
  "apple-touch-icon">` (the web-manifest `<link>` itself is auto-injected by the plugin at
  build time, so it doesn't need to be hand-written here).
- `package.json` / `package-lock.json` — `vite-plugin-pwa` added as a **pinned, exact-version**
  (`1.3.0`, not `^1.3.0`) `devDependency`, per spec ("pin its version") — confirmed compatible
  with this project's `vite@8` via its published peerDependencies range. New `generate-icons`
  script alias.
- `HANDOFF.md` — this update; `slice7.md` (the staged spec) removed, its content now lives
  here, same consolidation pattern as prior slices.

### Decisions / deviations
- **Menu grid: fixed 2 columns, not a candidate-column search.** Slice 6's `[2, 3]` candidate
  search existed *only* to trade columns for vertical fit when the grid couldn't scroll — cellH
  was a hard constraint, and narrower-but-more columns sometimes cleared it when wider-but-fewer
  ones didn't (that's literally why 11 cards landed on 3 columns at Slice 6). Now that the grid
  scrolls, height is no longer a constraint at all, and cellW alone decides card size — which is
  *provably* always larger with fewer columns: `cellW(2) − cellW(3) = (usableW + gap) / 6 > 0`
  for any positive width/gap. 3 columns could never win the old comparison once cellH drops out
  of it, so keeping the search around would just be dead logic that always resolves one way.
  Replaced with a fixed 2-column grid instead.
- **Scroll mechanism: direct per-card `container.y` updates, no wrapping Container.** The
  obvious implementation wraps all cards in a single scrollable `Container` and moves *that*.
  Rejected because `scripts/verify-audio-paths.ts`'s existing card-lookup logic (and the general
  "read exact on-screen positions from scene state" pattern this project's tests all rely on)
  assumes menu cards are direct children of the Scene's display list — nesting them one level
  deeper would have silently broken that. Instead, `applyScroll()` just sets each card's own
  `container.y` directly on every scroll-position change (cheap at 12 cards) — cards stay flat
  scene children, tooling compatibility preserved for free.
- **Hard-stop clamp, no rubber-band, no momentum.** `scrollY` is clamped to `[0, maxScroll]` on
  *every* `pointermove`, so the grid can never be dragged past its bounds in the first place —
  which also means no scissor mask is needed (a card can never render above the top clearance or
  below the bottom margin, by construction). Spec explicitly offered either rubber-band or
  hard-stop and called momentum unnecessary ("simple direct drag is fine and more predictable
  for toddlers") — hard-stop is simpler to reason about and has zero tunable feel parameters.
- **Tap-vs-scroll: Euclidean max-displacement over the whole gesture, resolved at
  `pointerup`.** Movement is tracked as the maximum distance (not just vertical) from the
  gesture's start point across its entire lifetime, not just the net displacement at release —
  a toddler's finger can wobble sideways mid-scroll, and a naive "did it end near where it
  started" check would misclassify a wobbly scroll as a tap. Because a tap can't be
  distinguished from the start of a scroll until either the gesture ends or the threshold is
  crossed, cards no longer wire their own `pointerdown` → instant-navigate handler (every prior
  slice's pattern) — the actual navigate action now waits for `pointerup`. This means the
  press/bounce visual feedback is delayed until release rather than starting on press; accepted
  as the standard, simplest tap-vs-drag pattern rather than adding speculative "maybe-press"
  visual state that would need to be reverted if the gesture turns into a scroll.
- **Cards keep `setInteractive()` but no listener.** Purely so `scripts/verify-audio-paths.ts`'s
  `.input`-filtering introspection still finds them (see file map) — MenuScene's own scene-level
  pointer handlers drive all actual tap/scroll behavior; the object-level interactive state is
  vestigial by design, not a leftover.
- **Memory's input-lock race fix is synchronous state mutation at tap-*accept* time, not a
  cooldown timer.** `handleCardTap()` sets `card.state = 'up'` and pushes onto `this.faceUp`
  *before* starting the flip tween — both mutations happen in the same call stack as the tap
  itself, so a second (or third) tap arriving even a single frame later already sees the updated
  guard state, regardless of how far the first card's 250ms flip animation has actually
  progressed. The tempting alternative — doing this bookkeeping inside the tween's
  `onComplete` callback — is exactly the bug class the spec called out ("the classic memory-game
  race bug"): two taps landing before either animation resolves would both read the pre-update
  state and both slip through. Verified at the tightest possible margin (three zero-elapsed
  synchronous calls to the handler in one JS tick) as well as with realistic rapid mouse clicks.
- **Mismatch boop plays on flip-*back*, not on reveal.** Matches the spec's literal wording
  ("then flip back to face-down... with the neutral boop") — `AudioManager.sfx('wrong')` is
  called from inside `resolvePair()`'s 900ms-delayed callback, not synchronously when the
  mismatch is first detected.
- **Memory celebrates every round, not every-5th like QuizScene.** A memory round (2 pairs) is
  its own complete board — the same granularity as MatchScene/SortScene's "full board →
  celebrate," not QuizScene's every-5th-round rhythm (which exists specifically because one quiz
  question is a much smaller unit than a full board). No new rhythm concept was introduced.
- **`starPoints()` exported as a narrow exception to "duplicate scenes, don't share a base
  class."** That precedent (home buttons, confetti helpers duplicated verbatim across every
  gameplay scene) is about *scene behavior* staying independently editable. A ~10-line pure,
  stateless trig formula used identically in two places is a different category of choice —
  sharing it doesn't create the coupling the no-shared-base-class rule is protecting against.
- **Memory identity color `0x8a7fd6` (soft lavender)**, chosen fresh (not reused from any
  existing card) — its art (two fanned rectangular card-backs) is silhouette-distinct from
  every other card type (circles/shapes/single icons/dots/emoji-pairs/basket) by construction,
  so it wasn't run through the full pairwise color-collision matrix in exhaustive detail, same
  reasoning Slice 6 used for the quiz cards.
- **Icon generation: a hand-rolled PNG encoder over `zlib`, zero new dependencies.** See file
  map entry for `scripts/generate-icons.ts`.
- **No `vercel.json`.** This app has zero client-side routing (Phaser Scenes aren't URL routes —
  there is exactly one HTML page), so there's nothing for a rewrite rule to do; Vercel's Vite
  framework preset serves a static build (including the generated service worker and manifest)
  correctly with no config. Adding a no-op file would be pure surface area for a "keep minimal"
  instruction to cut against — documented here instead, per spec's own "if needed" phrasing.
- **Service worker: `generateSW` strategy (vite-plugin-pwa's default) + `registerType:
  'autoUpdate'`.** No custom `runtimeCaching` route was added for anything, voice files
  included. This is what keeps a later-added file from ever being cache-poisoned: precaching
  only lists files that existed at *build* time, and any other fetch (including today's
  currently-missing voice mp3s) simply falls through to the network with no SW interception —
  a 404 just 404s, nothing gets cached, and the next real build (once mp3s exist) picks them up
  automatically via `globPatterns` including `mp3`. Verified directly: a dummy file dropped into
  an already-built `dist/audio/voice/` was fetchable through the already-registered SW without
  a rebuild (see "verification methodology").
- **Chunk-size warning (`assets/index-*.js` ~1.25MB) is pre-existing, not a Slice 7
  regression, and not addressed.** It's Phaser's own bundle size (a well-known large library),
  unrelated to anything added this slice; code-splitting the scene architecture to chase Vite's
  500KB default warning threshold would be a substantial, out-of-scope architectural change for
  a deployment-prep task. `npm run build`'s actual success criterion — exits 0, no errors — is
  met.
- **Verification tooling: two temporary Playwright scripts written, run, then deleted** (same
  discipline as every prior slice's ad-hoc instrumentation) — confirmed absent via `git status`
  and a `grep -rn "tmp-verify" scripts/` returning nothing.

### Voice-recording checklist (extended, now 19 lines)

Record each line in the language given, export as mp3, drop into `public/audio/voice/` using
the exact filename below — no code change needed either way. Every line is Indonesian except
the two bilingual reward words (`word_big`/`word_small`), which are deliberately English — see
the bigsmall bilingual-reward-words note below.

| Key | Filename | Lang | Line | Trigger |
|---|---|---|---|---|
| `theme_colors_intro` | `theme_colors_intro.mp3` | id | "Ayo cocokkan warnanya!" | Entering the **colors** theme from the menu |
| `theme_shapes_intro` | `theme_shapes_intro.mp3` | id | "Ayo cocokkan bentuknya!" | Entering the **shapes** theme from the menu |
| `theme_shadows_intro` | `theme_shadows_intro.mp3` | id | "Dimanakah bayanganku?" | Entering the **shadows** theme from the menu |
| `theme_objects_intro` | `theme_objects_intro.mp3` | id | "Ayo cari yang sama!" | Entering the **objects** theme from the menu |
| `theme_destinations_intro` | `theme_destinations_intro.mp3` | id | "Di mana rumahku?" | Entering the **destinations** theme from the menu |
| `theme_animals_intro` | `theme_animals_intro.mp3` | id | "Ayo cari hewannya!" | Entering the **animals** theme from the menu |
| `theme_vehicles_intro` | `theme_vehicles_intro.mp3` | id | "Ayo cari kendaraannya!" | Entering the **vehicles** theme from the menu |
| `theme_fruits_intro` | `theme_fruits_intro.mp3` | id | "Ayo cari buahnya!" | Entering the **fruits** theme from the menu |
| `game_fruitsort_intro` | `game_fruitsort_intro.mp3` | id | "Ayo pilah buahnya!" | Entering the **fruit sorting** game from the menu |
| `game_memory_intro` | `game_memory_intro.mp3` | id | "Di mana kembarannya?" | Entering the **memory** game from the menu |
| `quiz_counting_intro` | `quiz_counting_intro.mp3` | id | "Ayo hitung! Ada berapa?" | Each round of the **counting** quiz starts |
| `quiz_big_intro` | `quiz_big_intro.mp3` | id | "Mana yang besar?" | A **big/small** quiz round asks for "big" |
| `quiz_small_intro` | `quiz_small_intro.mp3` | id | "Mana yang kecil?" | A **big/small** quiz round asks for "small" |
| `word_big` | `word_big.mp3` | en | "Big!" | A **CORRECT** big/small answer tap where the tapped card is the big one |
| `word_small` | `word_small.mp3` | en | "Small!" | A **CORRECT** big/small answer tap where the tapped card is the small one |
| `praise_1` | `praise_1.mp3` | id | "Pintar!" | Random pick on full-board celebration |
| `praise_2` | `praise_2.mp3` | id | "Hebat!" | Random pick on full-board celebration |
| `praise_3` | `praise_3.mp3` | id | "Yeay!" | Random pick on full-board celebration |
| `praise_4` | `praise_4.mp3` | id | "Bagus sekali!" | Random pick on full-board celebration |

`game_memory_intro` follows the same once-per-entry rule as `game_fruitsort_intro`/the theme
intros (fires on menu → scene entry, not on resize-restart, not per-round). Still **zero real
mp3s** shipped across all 19 manifest entries (`public/audio/voice/` still ships only a
`.gitkeep`) — every game remains fully playable without narration, verified again this slice
including in the production build specifically.

### Notes for Slice 8
- **Patterns game looks cheaper than an age-mode selector, given the current architecture —
  recommend it first.** A patterns/sequencing mechanic ("what comes next") is structurally just
  another `QuizScene`-shaped addition: a new game-data file + a `MenuEntry` variant + a menu-card
  branch + a voice key, the exact recipe SortScene, QuizScene, and now MemoryScene have each
  followed with zero changes to `MenuScene`/other scenes' core mechanics. An age-mode selector,
  by contrast, needs *persistence* (currently there is none anywhere in this app — mute state
  resets to unmuted every load, nothing survives a reload) plus new settings UI plus wiring
  through several already-seeded-but-unbuilt toggle points simultaneously
  (`SHAPE_CROSS_COLOR_MODE`, `initiateFrom: 'either'`, a counting digits-only mode) — a bigger,
  cross-cutting feature than a single new game.
- **The 13th+ menu entry is no longer a geometric concern.** Slice 6 flagged the 11→12 card
  jump as hitting a hard wall (120px floor already violated). Scrolling resolves this
  generically, by construction (`maxScroll = Math.max(0, gridH - usableH)` — never a special
  case), not just for exactly 12 cards. No further menu work should be needed when a 13th entry
  (e.g. a patterns game) is added.
- **Neither tested viewport (390×844 phone, 768×1024 tablet) naturally hit the "fits without
  scrolling" case at 12 entries** — both scroll (`maxScroll` ≈350css px phone, ≈620css px
  tablet). The degrade-to-static code path is nonetheless verified correct *by construction*
  (the `Math.max(0, ...)` floor on `maxScroll`, and the tap/visibility math both being
  scroll-amount-agnostic), not merely by having sampled a viewport where it happens to trigger —
  worth a real check on an actual wide-tablet device if one becomes available, but not a gap in
  the reasoning as it stands.
- **Persistence is still entirely absent** (mute state, any future progress/settings) — flagged
  again because a PWA install specifically implies *repeat* visits, where a mute preference
  reset on every single load is more noticeable than it was as a plain web page. Worth
  considering for a future slice; not implemented here (out of scope: "persistence beyond PWA
  caching").
- **Voice preload race** (carried since Slice 4, still unaddressed): once real mp3s exist for
  any of the 19 manifest entries, spot-check whether the very first theme/game/quiz-round/memory
  round entered in a fresh session reliably plays its intro line. Still most load-bearing for
  big/small's visual-cue fallback (QuizScene), unchanged this slice.
- **Post-Slice-6 "audio has stopped working" investigation: resolved as no reproducible code
  regression** (full investigation write-up was in this file before this consolidation — see
  git history at commit `eb9d18b` for the complete methodology if it's ever needed again). The
  permanent regression guard it produced (`scripts/verify-audio-paths.ts`, `npm run
  verify:audio`) is still in place and now additionally covers MemoryScene's sound paths. If
  silence is reported again: check the browser tab's own mute state and the site's sound
  permission first (the leading hypothesis); Safari/iOS was the one major engine that
  investigation never got to test against a real (non-Playwright-WebKit) device.
- **`correctStreak` resets on resize** (QuizScene) — unchanged/accepted, still not
  user-noticeable.
- Menu still shows all entries unconditionally with no progress/lock state — unchanged, matches
  every slice's scope so far.
- `AudioManager` remains a plain module-level singleton (now shared across 5 scenes instead of
  4) — still fine at this scale.

---

## Post-Slice-7: interaction model change — `initiateFrom: 'either'` is now the default

**Real-toddler QA finding:** the toddler initiates a match from the right column as often as
the left. `initiateFrom` (seeded in Slice 2, carried as a documented-but-unreachable flag ever
since — see the removed Slice 5/6/7 "unimplemented seed" notes that used to reference it) has
its answer: **`'either'` is now MatchScene's default** for every matching theme.

### Rule set (now the default, all matching themes)
1. Tap any item, either column → it becomes selected (pulse, unchanged from before).
2. Tap an item on the OPPOSITE side → normal match resolution (correct → connecting line +
   lock, wrong → wiggle; selection is preserved on a wrong tap either way).
3. Tap a different item on the SAME side as the current selection → selection switches to it.
4. Tap the ALREADY-SELECTED item again → nothing happens; it stays selected. Deliberately not a
   deselect toggle — toddlers double-tap constantly, and a toggle would make selection feel
   broken/inconsistent.

### The actual code change was one line
`handleTap()`/`canInitiate()`/`handleCorrectMatch()` (see MatchScene.ts) already implemented
every rule above generically, with zero branching on which side started the selection —
`canInitiate()` only gated the "start a selection from nothing" and "switch within the same
side" cases, and `handleCorrectMatch()` always derives left/right from `selected.side` before
doing anything match-specific. This was all built correctly back in Slice 2 as a clean insertion
point for exactly this QA outcome; it just wasn't the *default* yet. The entire change is
flipping `private readonly initiateFrom: 'left' | 'either' = 'left'` to `= 'either'`, plus
updating the comments that used to describe it as "not a supported mode yet" (in MatchScene.ts
itself, and two now-stale cross-references in `sortGames.ts`/`quizGames.ts` that pointed at it
as an example of an "unused insertion point"). `'left'` mode is untouched and still fully
functional — just no longer reachable via any default entry point; flip the field directly for
a manual comparison if ever needed again.

**Side-agnostic match resolution, specifically verified:** `RoundItem.lineColor` is set to
`resolved.leftColor` when *both* the left-column and right-column instances of a pair are
created (`createItem()` doesn't branch on `role` for this field) — so whichever instance
`handleCorrectMatch()`'s left/right ternary happens to read `.lineColor` from, it's always the
same value. This is why the connecting line and confetti color were already correct for
right-initiated matches with no changes needed; verified directly (see below) rather than just
inferred from reading the code.

### Verification
- **`npm run verify:audio`** (permanent regression guard, unchanged) — re-run and passed with
  no modifications; select/wrong/correct/celebrate all fire with identical call shapes
  regardless of which side initiates, as expected (the sfx call sites don't know or care about
  initiation side either).
- **Temporary Playwright script** (`scripts/tmp-verify-either.ts` — written, run, deleted;
  confirmed absent via `git status` and `grep -rn "tmp-verify" scripts/`), at both viewports,
  all against real taps within a single 4-pair round (the `colors` theme) so later phases
  build on earlier ones the way an actual play session would:
  1. Right-initiated correct match — selection starts on `right`, resolves correctly on the
     matching `left` tap, both items lock, the connecting line's `x1 < x2` (always drawn
     left→right on screen regardless of tap order) with the pair's true `lineColor`.
  2. Right-initiated wrong match — selection survives the wrong tap unchanged (still the
     original right item, per spec: no deselect on a wrong tap).
  3. Same-side switch on the **right** (continuing the still-active right selection from #2)
     and, in a separate phase, the **left** — both move the selection to the newly-tapped item.
  4. Double-tapping the already-selected item — selection unchanged **and** (checked via the
     same AudioContext-wrapping technique `verify-audio-paths.ts` uses) zero oscillators
     started, confirming the early-return truly short-circuits before any sfx call.
  5. A mixed sequence in one round: a left-started match completed, immediately followed by a
     right-started match completed, on two different pairs of the same board.
  - Followed by the standard full regression: all 12 menu entries, one visit each, both
    viewports, zero console errors.
- No app-code defects found — this change genuinely was "flip a default, the mechanism was
  already right," confirmed rather than assumed.

---

## Post-Slice-7: two real-toddler-QA changes — icon-to-emoji migration + memory progression

### 1. Objects and destinations themes migrated from hand-drawn icons to emoji

**QA finding:** the Slice 3 placeholder Graphics icons (`icons.ts`) weren't recognizable
enough for a 2yo — confusion was worst on the destinations theme. Both themes now use the
`emoji` renderer (Slice 5) instead, reusing this app's own established "real emoji, decorative
color only" pattern (animals/vehicles/fruits/objects[new]) rather than any new machinery.

- **Objects** (`renderer: 'object' -> 'emoji'`): fully migrated, no exceptions. Pool (6, per
  spec's own example): 🍎 apple, ⚽ ball, 🌸 flower, 🐟 fish, 🚗 car, 🐤 chick. Overlap with
  animals/vehicles/fruits' pools is fine — objects is explicitly the mixed-bag theme.
- **Destinations** (`renderer: 'destination'`, kept — extended, not replaced): 5 of 6 pairs are
  now emoji both sides — 🐦→🪹, 🐝→🌸, ⚽→🧺, 🚗→🏠 (was car→road; re-conceived as "car belongs
  at home," not "on the road" — a deliberate spec change, not an oversight), ⛵→🌊. **One
  deliberately-kept hybrid pair: `fish-bowl` (🐟→drawn bowl icon).** 🐟→🌊 would have collided
  with `boat-water`'s water glyph (two different pairs both landing on the same destination
  emoji is a real ambiguity, not a style nit) — the spec offered "keep the bowl, drop fish, or
  hybrid" as equally acceptable; hybrid was chosen since it preserves a 6th pair's worth of
  round variety for free, and the bowl specifically was never the part QA found confusing.
  `pairsPerRound` stays 3 (destinations is still the conceptually hardest theme, unchanged).
- **Emoji fallback check, done for real, not assumed:** 🪹 (nest) is Unicode 14.0, flagged as
  the one glyph that might tofu-box. Verified via a headless Chromium screenshot (this sandbox's
  actual test platform) before committing to it — it renders as a real glyph, so **no drawn-icon
  fallback was needed** for nest. (All eight new glyphs across both themes were screenshotted
  and visually confirmed recognizable — see the temporary verification script below.)
- **`icons.ts` cleanup:** removed everything that became unused (apple/ball/cup/fish/flower/car/
  bird/bee/boat/road/nest/water — eleven of thirteen `IconKind` variants and their `paintIcon`
  cases). Kept exactly two: `bowl` (the fish-bowl hybrid pair) and `basket` (still load-bearing —
  `SortScene.ts` draws its fruit-sort bins with `drawIcon(this, 'basket', ...)`, entirely
  unrelated to the destinations theme; this was checked via a full-repo grep before deleting
  anything, not assumed from the destinations pool alone). The now-fully-unused `'object'`
  `RendererDef`/`RendererKind` variant was removed from `renderers.ts`/`themes.ts` too — dead
  code, not a hook worth keeping (unlike e.g. `initiateFrom`, which was a deliberately-seeded
  future toggle; this was just leftover generality from before the migration). `PairDef.icon`
  (objects' old single-icon field) and `PairDef.leftIcon` (destinations' old object-side icon
  field — every pair's left/object side is emoji now, no exceptions) were both removed for the
  same reason; only `rightIcon` survives, for the one hybrid pair.
- **`renderers.ts`'s `destination` RendererDef** now branches per-side: emoji when
  `pair.leftEmoji`/`rightEmoji` is present (always true for left; true for 5 of 6 pairs on the
  right), falling back to `drawIcon()` only for the fish-bowl pair's right side. An emoji-glyph
  left side gets the same idle-breathing tween the plain `emoji` renderer uses (not drawn
  `addEyes()` — an emoji already has its own face/identity, and drawing googly eyes over a
  soccer-ball or car emoji would look like a rendering glitch, not a character). A drawn-icon
  right side keeps the original desaturate+dim matched-style; an emoji right side gets the
  plain renderer's alpha-only matched-style (glyphs can't be reliably tinted).
- **CARD_ICON_OVERRIDE re-checked, not blindly kept:** both entries turned out not to need
  changing, but only because of deliberate array ordering, not accident.
  - `objects: { pairId: 'fish', role: 'left' }` — 'fish' still exists in the migrated pool
    (now 🐟 instead of a drawn icon, same ~0xff9f45 orange identity color). No collision: no
    other card is orange/fish-shaped, and the nearest warm-tone neighbors (fruitsort's brown
    basket, bigsmall's tan elephant) have completely different silhouettes.
  - `destinations: { role: 'right' }` (no `pairId`, defaults to `pairs[0]`) — kept working
    specifically because `fish-bowl` was placed **first** in the new `DESTINATION_POOL` array
    for this reason: the destinations menu card still renders the exact same drawn blue bowl
    icon (0x7fb6e0) it always has, zero visual change. This does collide with the counting
    quiz card's blue dots (0x5c8fd6) — accepted, same "different silhouette, don't sweat close
    hues" category as every other logged exception in this file (a bowl vs. a row of dots
    share nothing but a hue family).
- **Verification:** a temporary Playwright script (`scripts/tmp-verify-icons-memory.ts` —
  written, run, deleted; confirmed absent via `grep -rn "tmp-verify" scripts/`) navigated to
  both migrated themes at both viewports, confirmed the right theme loaded, and saved a
  screenshot of each for by-eye recognizability review (reviewed directly — every glyph reads
  clearly, no tofu boxes, sensible object→destination pairings). `npm run verify:audio` re-run
  unchanged (match/select/wrong/correct/celebrate call shapes don't depend on which renderer
  draws the item). Full 12-entry regression, both viewports, zero console errors.

### 2. Memory game difficulty progression (2 -> 3 -> 4 pairs within a session)

**QA finding:** 2 pairs is now mastered. `MemoryScene` rounds now follow a sequence: start at
`MIN_PAIRS` (2), +1 pair after each completed round, capped at `MAX_PAIRS` (4) — 2×2, then
2×3, then 2×4, then every round after that stays at 2×4. `GRID_COLS` stays fixed at 2 (same
"no candidate-column search needed" reasoning as the original 2×2 board — only the row count
now varies, `rows = pairCount` since `cards = pairCount * 2`).

- **Resets to `MIN_PAIRS` on every `init()`, including a resize-restart** — deliberately the
  same simplification QuizScene's `correctStreak` already uses ("a resize mid-streak losing
  progress ... rare, harmless edge case, not worth extra plumbing to preserve across
  `scene.restart()`"). "Fresh session each visit" (spec) is satisfied by this covering a real
  menu → entry too; a device-rotation-mid-game reset is the accepted, harmless edge case, same
  category as QuizScene's.
- **Look-time scales with grid size:** `mismatchLookMs(pairCount)` returns 900ms at 2 pairs,
  1100ms at 3–4 — "more cards = more to remember = longer look needed" (spec, verbatim). The
  boop still fires on flip-*back*, not on reveal (unchanged from Slice 7's original decision).
- **120px floor verified empirically at every grid size, both viewports — no phone-specific
  cap was needed** (the spec's own fallback: "if not, cap phone at 3 pairs"). Measured
  `cardSize` via the scene's real `computeLayout()`, headless:

  | pairs | grid | 390×844 (phone) | 768×1024 (tablet) |
  |---|---|---|---|
  | 2 | 2×2 | 125px | 220px (capped by `CARD_MAX_PX`) |
  | 3 | 2×3 | 125px | 220px (capped by `CARD_MAX_PX`) |
  | 4 | 2×4 (`MAX_PAIRS`) | 125px | 187px |

  The reason phone stays flat at 125px across every pair count (not just "happens to clear
  120"): `cardSize = min(cellW, cellH, CARD_MAX_PX)`, and `cellW` depends only on `GRID_COLS`
  (fixed at 2) and viewport width — never on row count — so on phone width, `cellW` (125px) is
  the binding constraint at every grid size, not `cellH`. Tablet has enough width that
  `CARD_MAX_PX` (220) binds instead at 2–3 pairs, and only at 4 pairs does `cellH` finally
  become tighter than `cellW` (dropping to 187px) — still comfortably clear of the 120px floor.
- **Input-lock race re-verified specifically at 4 pairs (8 cards)**, both viewports, using the
  same two techniques as the original Slice 7 verification: three zero-elapsed synchronous
  calls to `handleCardTap()` in one JS tick (the tightest possible margin), confirming exactly
  2 of 8 cards are ever accepted as face-up regardless of board size — the gating logic
  (`this.resolving`, `this.faceUp.length`, synchronous state mutation at tap-accept time) never
  referenced card count in the first place, so this was expected to generalize, and was
  confirmed to.
- **Verification:** the same temporary script drove all of round 1 (2 pairs) → round 2 (3
  pairs) → round 3 (4 pairs) → round 4 (still 4 pairs, confirming the cap holds), completing
  each round for real (tapping genuine matching pairs, not poking scene state), checking grid
  shape, card-size floor, and mismatch timing at each step, plus the celebration firing between
  rounds and the fresh-entry reset back to 2 pairs. Both viewports. Followed by the standard
  full 12-entry regression, zero console errors. `npm run verify:audio` re-run unchanged (its
  memory checkpoints only ever exercise round 1, which is always exactly 2 pairs/4 cards
  regardless of this change, since `pairCount` resets to `MIN_PAIRS` on every fresh entry).

### File map (this change)
- `src/data/themes.ts` — `OBJECT_POOL` rewritten to `emoji`+`color` pairs; `DESTINATION_POOL`
  rewritten to `leftEmoji`/`rightEmoji` pairs (+ one `rightIcon` hybrid); `objects` theme's
  `renderer` changed to `'emoji'`; `RendererKind` and `PairDef` lost `'object'`/`icon`/`leftIcon`
  (dead after the migration).
- `src/rendering/renderers.ts` — `object` `RendererDef` removed; `destination` `RendererDef`
  rewritten for the emoji/icon hybrid (see above).
- `src/rendering/icons.ts` — cut from 14 `IconKind` variants to 2 (`bowl`, `basket`).
- `src/scenes/MenuScene.ts` — `CARD_ICON_OVERRIDE`'s comment block extended with the
  post-migration differentiation re-check (no data/logic change).
- `src/scenes/MemoryScene.ts` — `TOTAL_PAIRS`/`GRID_ROWS` constants replaced by `MIN_PAIRS`
  (2) / `MAX_PAIRS` (4) and a `pairCount` instance field; `computeLayout()` takes `pairCount`
  as a parameter (`rows = pairCount`); new `mismatchLookMs(pairCount)` helper; `celebrate()`
  bumps `pairCount` (clamped to `MAX_PAIRS`) before the next `startRound()`.

### Notes for Slice 8
- Both changes reused 100% existing machinery (`emoji` RendererDef, `destination` RendererDef's
  existing per-role branching pattern, `computeLayout`-per-scene conventions) — no new
  abstractions were introduced for either change.
- Objects/destinations' emoji migration means **every** matching theme now uses a renderer
  that shows a real, recognizable glyph or a solid color — `shapes`/`shadows` (abstract shapes)
  are now the only themes still relying on non-photorealistic shapes for identity. Worth
  keeping in mind if QA ever flags those as unclear too — the "migrate to emoji" playbook from
  this change would apply directly, though shapes are a fundamentally different pedagogical
  goal (shape recognition itself, not object recognition) so it's not obviously the right move
  there even if requested.
- Memory's difficulty progression is the second age/difficulty-adjacent feature shipped this
  slice's cluster (after "either"-initiation), and the third overall counting difficulty-
  adjacent seed still sits unimplemented (`SHAPE_CROSS_COLOR_MODE`, a counting digits-only
  mode) — an eventual age-mode selector would need to reconcile "always-on progression within a
  session" (memory, now real) against "static difficulty toggle" (the other two, still
  seeds) as two different shapes of the same underlying idea.

---

## Post-Slice-7: bigsmall bilingual reward words (`word_big` / `word_small`)

**Feature:** the bigsmall quiz now confirms a **correct** answer with an English word layered
shortly after the correct-match chime — "Big!" or "Small!", matching whichever card the toddler
actually tapped. Every other voice line in this app is Indonesian; these two are a deliberate
bilingual exception (early English exposure via a reward moment, not the core instruction —
`quiz_big_intro`/`quiz_small_intro`, the round's actual Indonesian prompt, are unchanged).

- **New manifest entries:** `word_big` ("Big!"), `word_small` ("Small!") — `src/audio/
  voiceManifest.ts`. Both English; the checklist table below now has a `Lang` column
  (id/en) since this is the first non-Indonesian pair.
- **Voice choice lives on the answer, not the round.** `AnswerSpec`'s `emojiScale` variant
  (`src/data/quizGames.ts`) gained a required `voice: VoiceKey` field, set per-answer
  (`scaleFactor: BIG_SCALE` → `word_big`, `SMALL_SCALE` → `word_small`) rather than derived from
  `round.prompt.target` on the scene side. Whichever card is tapped correct is definitionally
  the target, so the answer's own size already determines the right word — no separate lookup,
  no new state on `QuizScene`. `dots` answers (counting) don't carry a `voice` field at all; the
  type only requires it where it's meaningful.
- **Chime, then word ~150ms later — not synchronous.** Every existing sfx+voice pairing in this
  app (`sfx('celebrate')` immediately followed by `voice(randomPraiseKey())`, in Match/Sort/
  Quiz/MemoryScene) calls both on the same line, back to back. This is the first case that
  *deliberately* doesn't: `QuizScene.handleCorrect()` schedules the word via `this.time.
  delayedCall(150, () => AudioManager.voice(wordVoice))`, per spec ("layer naturally rather
  than queue"). Wrong answers are untouched — `handleWrong()` still only calls `sfx('wrong')`.
- **Graceful absence, unchanged mechanism.** No new guard was needed: `AudioManager.voice()`
  already no-ops when a buffer never loaded (missing file, still the default state — see
  below), so a missing `word_big.mp3`/`word_small.mp3` degrades to "chime only," identical to
  every other missing voice line in this app today.
- **`npm run verify:audio` extended with a real checkpoint, not skipped.** This surfaced a real
  gap in the existing tooling: `verify-audio-paths.ts`'s AudioContext-wrapping technique can
  only observe a voice line by watching for `AudioBufferSourceNode.start()` — which `voice()`
  never reaches when its buffer is missing (`if (!buffer) return`, before touching WebAudio at
  all). Since this repo ships **zero real mp3s** by design (every prior slice's stated state,
  still true), that path is permanently dead for every voice line in the current test
  environment, not just these two. Fix: `AudioManager.ts` gained a dev-only `debugVoiceLog:
  {key, t}[]` field that `voice()` pushes to unconditionally (before its mute/buffer guards),
  gated behind `import.meta.env.DEV` — same "stripped from production" pattern and rationale as
  `main.ts`'s `window.__game` hook, exposed the same way via a new `window.__audioManager` in
  `AudioManager.ts` itself. This records that the *call* happened regardless of whether audio
  would actually be audible, which is exactly what "assert the call path fires" means. Verified
  directly (not just reasoned about) that both the `window.__audioManager` write and the
  `debugVoiceLog.push(...)` call are dead-code-eliminated from the production bundle
  (`import.meta.env.DEV` false there) — `grep`'d `dist/assets/index-*.js` post-build: zero
  matches for `__audioManager`; `debugVoiceLog` appears exactly once, as the field's empty-array
  initializer, with no `.push` call anywhere near it. New checkpoints in `verify:audio`'s
  linear script (after the counting-quiz section, before Memory): bigsmall wrong tap → boop
  fires, `debugVoiceLog` stays empty; bigsmall correct tap → chime fires (3 oscillators) *and*
  a `voice()` call for the tapped answer's own `voice` key lands 100–400ms after the tap (a
  generous window around the spec's ~150ms, wide enough to tolerate real dispatch/timer
  overhead while still catching a regression to 0ms-synchronous or "never fires").
- **Verification:** `npm run verify:audio` passes end to end, all prior checkpoints unaffected
  (bigsmall word voice fired ~136ms after the chime in the actual run). A temporary Playwright
  script (`scripts/tmp-verify-bigsmall.ts` — written, run, deleted; confirmed absent via `git
  status` and `grep -rn "tmp-verify" scripts/`) additionally: ran the standard full 12-entry
  sweep at both viewports (390×844, 768×1024), zero console errors; drove several live bigsmall
  rounds at each viewport until both a `word_big`-card and a `word_small`-card round had been
  sampled, confirming the answer's `voice` field always matches its own `scaleFactor` (never
  hardcoded/swapped) and that the call actually reaches `AudioManager.voice()` on a real tap, not
  just by reading static data. `npm run build` re-run clean (existing chunk-size warning only,
  pre-existing and unrelated — see earlier decisions entry).
- **File map:** `src/audio/voiceManifest.ts` (2 new keys/entries + updated doc comment on
  `VoiceLine.text`), `src/data/quizGames.ts` (`AnswerSpec.emojiScale.voice`, both bigsmall
  answers populate it), `src/scenes/QuizScene.ts` (`handleCorrect()`'s new delayed-voice branch),
  `src/audio/AudioManager.ts` (`debugVoiceLog` field + `window.__audioManager` dev hook),
  `scripts/verify-audio-paths.ts` (`readAndClearVoiceLog()` helper + the new bigsmall section).
- No app-code defects found in the existing scenes/data — the only real gap uncovered was in
  the verification tooling's own reach (couldn't observe voice calls at all without real mp3s),
  fixed as above, same category as Slice 7's own "every bug this slice found was in the
  verification tooling" note.

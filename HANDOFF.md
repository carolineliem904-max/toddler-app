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

### Voice-recording checklist (extended, now 17 lines)

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
| `game_memory_intro` | `game_memory_intro.mp3` | "Di mana kembarannya?" | Entering the **memory** game from the menu |
| `quiz_counting_intro` | `quiz_counting_intro.mp3` | "Ayo hitung! Ada berapa?" | Each round of the **counting** quiz starts |
| `quiz_big_intro` | `quiz_big_intro.mp3` | "Mana yang besar?" | A **big/small** quiz round asks for "big" |
| `quiz_small_intro` | `quiz_small_intro.mp3` | "Mana yang kecil?" | A **big/small** quiz round asks for "small" |
| `praise_1` | `praise_1.mp3` | "Pintar!" | Random pick on full-board celebration |
| `praise_2` | `praise_2.mp3` | "Hebat!" | Random pick on full-board celebration |
| `praise_3` | `praise_3.mp3` | "Yeay!" | Random pick on full-board celebration |
| `praise_4` | `praise_4.mp3` | "Bagus sekali!" | Random pick on full-board celebration |

`game_memory_intro` follows the same once-per-entry rule as `game_fruitsort_intro`/the theme
intros (fires on menu → scene entry, not on resize-restart, not per-round). Still **zero real
mp3s** shipped across all 17 manifest entries (`public/audio/voice/` still ships only a
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
  any of the 17 manifest entries, spot-check whether the very first theme/game/quiz-round/memory
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

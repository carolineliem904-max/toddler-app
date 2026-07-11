# HANDOFF — Toddler Matching Game, Slice 1

## Project context
New educational browser game for toddlers (ages 2–3), Indonesian audience.
Core mechanic: tap-tap matching (tap item on left, tap its match on right).
Stack: Phaser 3 + TypeScript + Vite (same setup as Beep Beep!). Deploy target: Vercel (later slice).
This is Slice 1 of ~5. Do NOT build ahead of this slice.

## Slice 1 scope: one color-matching screen
Build a single playable screen with the color-matching mechanic, fully juiced feedback, no menus, no levels, no audio yet.

### Gameplay spec
- Portrait-friendly, responsive layout. Must work on iPad and phones (test at 390×844 and 768×1024).
- Left column: 4 colored items (use simple colored dinosaur or flower shapes — flat colored circles with eyes are fine as placeholder art). Colors: red, yellow, green, blue.
- Right column: 4 colored circles, SHUFFLED order (never same row order as left).
- Interaction: tap-tap, NOT drag.
  1. Tap a left item → it scales up slightly + gentle pulse (selected state).
  2. Tap a right item:
     - Correct color → animated line draws from left item to right item (tween, ~400ms), both items do a happy bounce, small confetti burst, pair becomes locked (dimmed slightly, no longer tappable).
     - Wrong color → right item does a gentle side-to-side wiggle (~300ms). NO red X, no error sound design yet, no penalty. Selection on left item stays active.
  3. Tapping a different left item while one is selected → switch selection.
- When all 4 pairs matched → big celebration: full-screen confetti + all characters bounce, then after ~2s the board reshuffles with a new random color set and restarts (endless loop for now).

### Toddler-specific requirements (non-negotiable)
- Touch targets minimum 120×120 px at phone size.
- No text anywhere in gameplay. No score, no timer, no fail state.
- Nothing tappable within 60px of screen edges (accidental palm touches).
- All animation durations short (<500ms) — toddlers lose the cause-effect link if feedback is slow.
- Disable double-tap zoom, pinch zoom, pull-to-refresh, long-press context menu (same PWA-style meta/CSS as Beep Beep!).

### Technical requirements
- Vite + TypeScript + Phaser 3, strict mode on.
- Use Phaser.Scale with the Retina-safe approach that worked in Beep Beep! (Scale.NONE + zoom) — document this choice in a code comment.
- Data-driven from the start: the pair set for the round must come from a plain data structure like
  `{ pairs: [{ id: "red", color: 0xff4444 }, ...] }`
  so Slice 2 can swap in themes (shapes, shadows, vehicles) without touching the mechanic code.
- One scene only: `MatchScene`. Keep a thin `main.ts`.
- Placeholder art is fine (generated shapes/graphics). No external assets this slice.
- No audio this slice.

## Definition of done
- `npm run dev` runs clean, no TS errors, no console errors.
- Playable with mouse on desktop AND touch on mobile viewport.
- All interactions above work exactly as specced.
- Short `HANDOFF.md` updated at project root: what was built, file map, any decisions/deviations, what Slice 2 needs to know.

## Out of scope (do not build)
Menus, levels, themes, audio, settings, parent gate, drag/trace mechanic, deployment config.

---

## Slice 1 status: DONE

`npm run dev` runs clean, no TS errors (`npx tsc --noEmit` passes), no console errors.
Verified with mouse-equivalent taps at both 390×844 and 768×1024 viewports (headless
Chromium via Playwright, driven with real per-round shuffle data so every interaction
path — select, wrong-match wiggle, selection switch, correct match, full-board
celebration, reshuffle — was exercised and screenshotted, not just eyeballed once).

### File map
- `index.html` — app shell + toddler-safe viewport meta (pinch/double-tap zoom
  disabled, PWA-style meta tags).
- `src/main.ts` — thin boot only: Phaser game config (Scale.NONE + zoom), global
  listeners that disable double-tap zoom / pinch / pull-to-refresh / long-press
  context menu, and window resize → game.scale.resize handling.
- `src/style.css` — fullscreen app shell, `touch-action: none`, overscroll/scroll
  prevention.
- `src/scenes/MatchScene.ts` — the one gameplay scene: responsive layout, item
  creation, the tap-tap state machine, and all feedback animations (select pulse,
  wrong-match wiggle, correct-match line + bounce + confetti + lock, full-board
  celebration + reshuffle).
- `src/data/pairs.ts` — data-driven `ROUND_DATA.pairs` (`{ id, color }[]`) plus
  `shuffled()` / `sameOrder()` helpers. MatchScene only reads `pair.id` / `pair.color`
  from this module.
- `CLAUDE.md` — project overview, stack, Architect/Builder workflow note, conventions.

### Decisions / deviations
- **Phaser version pinned to 3.90.0.** `npm install phaser` now resolves to Phaser 4
  by default (a major version has shipped since this stack was last used) — pinned
  explicitly since the spec calls for Phaser 3.
- **"New random color set" on reshuffle** interpreted as: redeal the same 4-color
  palette into a fresh randomized left/right arrangement, not introduce new colors.
  The spec fixes the palette at exactly red/yellow/green/blue with no larger pool
  given; `ROUND_DATA` stays a single swappable data structure so Slice 2 can point it
  at a bigger/different pool without touching `MatchScene`.
- **Touch target hit areas use the Container's default rectangular hit area**
  (`setSize()` + bare `setInteractive()`), not a circular `Phaser.Geom.Circle` hitArea.
  A custom Circle hitArea + `Contains` callback silently registers zero hits on
  Container game objects in Phaser 3.90 (confirmed via `input.hitTestPointer`
  debugging) — this cost significant debugging time before the workaround was found.
  The rectangle is slightly more generous than the round art but still respects the
  120×120px minimum and the 60px edge-safe margin. Documented inline in
  `createLeftItem`.
- **Resize/orientation change triggers a full scene restart** (relayout + reshuffle)
  rather than an in-place reflow. Phaser's ScaleManager fires one no-op `resize` event
  during boot; `MatchScene` guards against it via a `lastSize` comparison so the game
  doesn't double-initialize on load. Since Slice 1 has no persistent game state, a
  restart-on-resize is harmless; revisit if Slice 2 adds state that shouldn't reset.
- **Wrong-match wiggle tuned to exactly 300ms** (50ms leg, yoyo, repeat 2) to satisfy
  the <500ms animation rule while still reading clearly as "no".
- **Confetti** uses a tiny generated 8×8 white texture tinted per-particle via
  `add.particles(...).explode()` — no external assets.

### Notes for Slice 2
- `createLeftItem` / `createRightItem` currently hardcode "flat colored circle
  (+ eyes on the left)" as the visual. The tap-tap state machine only depends on
  `pair.id` matching, but the *rendering* is not yet theme-agnostic — introducing
  shapes/vehicles/shadows will likely mean parameterizing or replacing these two
  methods (e.g. accept a render callback or texture key per pair) rather than a
  drop-in data swap alone.
- If a circular hitArea is ever needed again (e.g. for pixel-accurate overlapping
  touch targets), re-test against whatever Phaser version is current — this may be
  fixed upstream, or may need a manual `hitAreaCallback`.
- No audio, score, or persistent state exists yet — none is wired up for future
  slices to hook into.
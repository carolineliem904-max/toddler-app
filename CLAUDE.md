# Toddler Match

## Project overview
Educational browser matching game for toddlers (ages 2–3), Indonesian audience.
Core mechanic: tap-tap matching — tap an item on the left, then tap its match on the right.

## Stack
- Phaser 3 (game engine)
- TypeScript, strict mode
- Vite (dev server / bundler)
- Deploy target: Vercel (later slice, not yet configured)

## Workflow
This project uses an Architect/Builder workflow. Scope is defined per-slice in
`HANDOFF.md` at the project root. Always read `HANDOFF.md` before starting work,
and never build ahead of the current slice — the "out of scope" section there is
a hard boundary, not a suggestion. Update `HANDOFF.md`'s Definition of Done
section when a slice is complete (what was built, file map, decisions/deviations,
notes for the next slice).

## Conventions
- One Phaser scene per file under `src/scenes/` (`MenuScene.ts` = entry point,
  `MatchScene.ts` = gameplay, launched with `scene.start('MatchScene', { theme })`).
- Gameplay content lives in plain data structures under `src/data/` —
  `src/data/themes.ts` (the `Theme`/`PairDef` model, currently 5 themes) and
  `src/data/palette.ts` (shared color constants).
- Theme-specific drawing lives in `src/rendering/renderers.ts` (keyed by
  `RendererKind`) plus `src/rendering/icons.ts` (hand-drawn placeholder icons
  for the object/destination themes). `MatchScene` and `MenuScene` (mechanic +
  menu chrome) must contain **zero theme-specific branches** — they only call
  through `RENDERERS[theme.renderer]`. Adding a new theme should mean adding
  data (and at most one new renderer), never touching `MatchScene`/`MenuScene`.
- Custom shapes/icons are drawn with `Graphics`, not Phaser's native `Triangle`/
  `Polygon` game objects — those don't reliably center on their `(x, y)` the
  way `Arc`/`Rectangle` do (found the hard way in Slice 2; see HANDOFF).
- `src/main.ts` stays thin: Phaser game config + boot only, no gameplay code.
- Toddler-specific, non-negotiable UX rules for **gameplay** (`MatchScene`),
  unless `HANDOFF.md` says otherwise:
  - No text, score, timers, or fail states in gameplay.
  - Touch targets minimum 120×120 px at phone size.
  - Nothing tappable within 60px of the screen edge (accidental palm touches).
  - Animations stay under 500ms — toddlers lose the cause-effect link if
    feedback is slow.
  - Double-tap zoom, pinch zoom, pull-to-refresh, and long-press context menu
    are disabled at the app shell level (`index.html` meta + `src/style.css` +
    listeners in `src/main.ts`) — don't reintroduce them per-scene.
  - `MenuScene` uses a smaller 24px edge margin (not 60px) — a deliberate,
    documented exception since a calm choice-menu isn't gameplay; see HANDOFF.
- When a scene's `create()` can run more than once on the same Scene instance
  (theme re-entry, resize restarts), anything it creates once-per-instance
  (e.g. `MatchScene`'s home button) must destroy its previous instance first —
  Phaser reuses the Scene object across `scene.start()` calls rather than
  constructing a fresh one, so skipping this leaks orphaned, still-interactive
  game objects (found the hard way in Slice 3; see HANDOFF).
- Scaling: Phaser.Scale.NONE + zoom (retina-safe approach), documented in
  `src/main.ts`. Game/world coordinates are device px, not CSS px — scenes that
  need CSS-px-accurate sizing (e.g. the 120px touch target rule) must convert
  via `window.devicePixelRatio`, following the pattern in `MatchScene.px()`.

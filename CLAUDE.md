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
- One Phaser scene per file under `src/scenes/` (e.g. `src/scenes/MatchScene.ts`).
- Gameplay content (themes, pairs, palette) lives in plain data structures under
  `src/data/` — `src/data/themes.ts` (the `Theme`/`PairDef` model + the theme
  rotation) and `src/data/palette.ts` (shared color constants).
- Theme-specific drawing lives in `src/rendering/renderers.ts`, keyed by
  `RendererKind`. `MatchScene` (the mechanic: selection, matching, lines,
  celebration) must contain **zero theme-specific branches** — it only calls
  through `RENDERERS[theme.renderer]`. Adding a new theme should mean adding
  data (and at most one new renderer), never touching `MatchScene`.
- `src/main.ts` stays thin: Phaser game config + boot only, no gameplay code.
- Toddler-specific, non-negotiable UX rules (apply to every slice unless
  `HANDOFF.md` says otherwise):
  - No text, score, timers, or fail states in gameplay.
  - Touch targets minimum 120×120 px at phone size.
  - Nothing tappable within 60px of the screen edge (accidental palm touches).
  - Animations stay under 500ms — toddlers lose the cause-effect link if
    feedback is slow.
  - Double-tap zoom, pinch zoom, pull-to-refresh, and long-press context menu
    are disabled at the app shell level (`index.html` meta + `src/style.css` +
    listeners in `src/main.ts`) — don't reintroduce them per-scene.
- Scaling: Phaser.Scale.NONE + zoom (retina-safe approach), documented in
  `src/main.ts`. Game/world coordinates are device px, not CSS px — scenes that
  need CSS-px-accurate sizing (e.g. the 120px touch target rule) must convert
  via `window.devicePixelRatio`, following the pattern in `MatchScene.px()`.

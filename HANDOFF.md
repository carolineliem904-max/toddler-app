# HANDOFF — Toddler Matching Game, Slice 2

## Context
Slice 1 is complete: tap-tap color matching in `MatchScene`, data-driven off `src/data/pairs.ts`.
Read the existing HANDOFF.md decisions/deviations section first (Phaser 3.90 pin, rectangular hitArea fix, ScaleManager double-restart guard).
This slice: polish carryover + theme/level system. Do NOT build audio, settings, parent gate, or drag/trace — those are later slices.

## Part A — Polish carryover from Slice 1 QA (do this first)

1. **Color palette fix.** Current colors are muddy (olive yellow, brick red). Replace with high-saturation toddler-friendly primaries:
   - red `0xFF3B30`, yellow `0xFFD500`, green `0x34C759`, blue `0x0A84FF`
   - Define these in one palette file/constant — themes will reference it.
2. **Light theme.** Replace the dark background with a soft light one (cream/off-white, e.g. `0xFFF8EE`). Ensure lines and confetti still read clearly against it (may need slightly darker line strokes).
3. **Finished-pair treatment.** Matched pairs currently stay too prominent. Change to: ~35–40% alpha AND desaturated (grey-shift the tint), while the connecting line stays full-color and full-alpha. Remaining unmatched items stay fully vivid. Do NOT remove finished items — no layout shift.

## Part B — Theme & level system

Goal: adding a new worksheet type = adding data + (at most) one renderer, never touching mechanic code.

### Data model
- Extend the data layer to a `Theme` concept:
```ts
  interface Theme {
    id: string;                 // "colors", "shapes", "shadows"
    renderer: RendererKind;     // how items are drawn
    pairs: PairDef[];           // pool, >= 6 per theme
    pairsPerRound: 3 | 4;       // 3 for easier themes
  }
```
- Each round randomly samples `pairsPerRound` pairs from the pool and shuffles right-column order (never mirror order, as now).

### Themes to ship in this slice (3 total)
1. **Colors** (existing) — migrate to new data model, new palette.
2. **Shapes** — left: colored shape with eyes (circle, square, triangle, star); right: same shape in a DIFFERENT color. Matching is by shape, not color — this is deliberate (teaches shape abstraction). Placeholder Phaser graphics fine.
3. **Shadows** — left: colored item; right: same silhouette in solid dark grey. Match item to its shadow. Reuse the shape renderer with a grey fill for now (real art comes later).

### Renderer parameterization
- Slice 1 HANDOFF notes say item-rendering methods need parameterizing — do that refactor now. `MatchScene` receives a theme and delegates drawing to a renderer keyed by `theme.renderer`. Mechanic code (selection, matching, lines, celebration) must be theme-agnostic.

### Theme progression (minimal)
- After each full-board celebration, advance to the next theme in a fixed rotation (colors → shapes → shadows → colors …), new random sample each round.
- No menu, no level select, no persistence this slice. The game is still one endless scene.

### Interaction model — keep flexible (important)
- Real-toddler QA on the left-first tap model is still pending. Refactor the selection logic so "which side can initiate a selection" is a single config flag (`initiateFrom: "left" | "either"`), default `"left"` (current behavior). Do NOT implement the `"either"` behavior beyond making the flag's insertion point clean — just don't paint the architecture into a corner.

## Definition of done
- All Part A polish visible and verified at 390×844 and 768×1024.
- Three themes rotate correctly; right column never in mirror order; per-round random sampling works (verify across multiple rounds in headless test like Slice 1).
- Mechanic code contains zero theme-specific branches.
- `npm run dev` clean, no TS errors, no console errors.
- HANDOFF.md updated: what was built, file map, decisions/deviations, notes for Slice 3 (audio hooks: note where correct/wrong/celebration events fire so SFX can attach cleanly).

## Out of scope
Audio, menus/level select, persistence, parent gate, settings, drag/trace mechanic, real art assets, deployment.

---

## Slice 2 status: DONE

`npm run dev` clean, no TS errors (`npx tsc --noEmit` passes), no console errors. Verified
with headless-browser interaction tests (Playwright) at both 390×844 and 768×1024, driving
2+ full rotations through all three themes (6+ consecutive rounds) with real per-round data
(not guessed taps), screenshotting each theme's initial/selected/wrong-match/switch/matched/
celebration states.

### File map
- `src/data/palette.ts` — shared `PALETTE` (red/yellow/green/blue), `PALETTE_LIST`, `SHADOW_GREY`.
- `src/data/themes.ts` — `Theme` / `PairDef` model, the 3 shipped themes (`colors`, `shapes`,
  `shadows`) in fixed rotation order, `shuffled()` / `sameOrder()` helpers. Replaces Slice 1's
  `src/data/pairs.ts`.
- `src/rendering/renderers.ts` — all theme-specific drawing. `RENDERERS: Record<RendererKind, ...>`
  exposes `resolveInstance(pair)` (per-round left/right color assignment) and `render(args)`
  (draws the item, returns `{ container, applyMatchedStyle }`). `MatchScene` never branches on
  theme/renderer kind — it only calls through this registry.
- `src/utils/color.ts` — `desaturate()` / `darken()` color-blend helpers shared by the renderer
  (finished-pair treatment) and `MatchScene` (line-stroke darkening).
- `src/scenes/MatchScene.ts` — mechanic only: layout, selection state machine, tap handling,
  line/confetti/celebration, theme rotation index. Zero theme-specific string literals (verified
  via grep as part of QA).
- `src/main.ts`, `src/style.css` — background color updated to the light theme (`#fff8ee`).
- `CLAUDE.md` — conventions updated for the theme/renderer split.

### Decisions / deviations
- **Pool size is 4 per theme, not the aspirational "≥ 6."** The spec's own theme list only names
  4 colors and 4 shapes — there was nothing to fill a 6-item pool with without inventing content
  outside spec. Colors and shapes use `pairsPerRound: 4` (the full pool every round — matches
  Slice 1 behavior for colors, no real "sampling" happening since pool size == round size).
  Shadows reuses the same 4-shape pool but ships as the "easier" theme via `pairsPerRound: 3`,
  which *does* give genuine per-round sampling variety (a random 3-of-4 shapes each round,
  verified in headless testing — two shadows rounds in the same session sampled different
  subsets). Silhouette matching seemed like the most abstract/hardest of the three themes, so
  it's the one that got the reduced pair count.
- **Real Phaser bug: Triangle/Polygon game objects don't center on their `(x, y)` position the
  way Arc/Rectangle do.** First shapes-theme render showed triangles and stars rendered
  oversized and badly offset from their container, overlapping neighboring rows and clipping
  off the top edge — screenshotted and caught before this got anywhere near a commit. Root
  cause: `scene.add.triangle()` / `scene.add.polygon()` don't reliably auto-center like other
  Shape subclasses. Fix: triangle and star are hand-drawn with `Graphics` (`drawPolygonWithGraphics`
  in `renderers.ts`), whose points are authored already centered on local `(0,0)`, sidestepping
  the origin quirk entirely. Circle and square still use native `Arc`/`Rectangle`, which do
  center correctly. A `ShapeHandle` interface (`{ gameObject, setFillStyle }`) unifies both paths
  so the matched-style dimming logic doesn't need to know which one it's dealing with.
- **Shape/shadow color assignment resolved once per round, not per left/right render call.**
  `RENDERERS[...].resolveInstance(pair)` runs once per pair per round and produces
  `{ leftColor, rightColor }`, which both the left and right item's `render()` call then read.
  This is what guarantees "shapes" theme's right-side color reliably differs from its own
  left-side instance (a real per-instance constraint, not just per-render randomness that could
  coincidentally match).
- **Line color and confetti tint use the item's `leftColor`** regardless of theme (a generic
  `RoundItem.lineColor` field every renderer populates), not a theme-aware color lookup — keeps
  `MatchScene` theme-agnostic while still giving every theme a sensible line/confetti color.
- **Confetti retinted for the light background.** Slice 1's white confetti particles would have
  been near-invisible on `#fff8ee`; confetti now tints `[color, darken(color, 0.35), 0x333333]`.
- **`initiateFrom` flag lives on `MatchScene`** (`private readonly initiateFrom: 'left' | 'either' = 'left'`),
  not on `Theme` — it's an interaction-model concern orthogonal to theme content. The selection
  logic was generalized into one `handleTap(item, side)` entry point with a `canInitiate(side)`
  check; switching the flag to `'either'` would need `handleCorrectMatch`'s left/right resolution
  to keep working (it already does, since it derives left/right from `selected.side` rather than
  assuming `selected` is always the left item) but `'either'`'s actual UX (can either side start
  a selection, and what does re-tapping the same side do) hasn't been designed or tested — per
  spec, only the insertion point is done, not the behavior.
- **SLICE2.md removed** — its spec content now lives in this file (the section above), so keeping
  both would just create a second source of truth.

### Notes for Slice 3
- **Audio hook points**, per Slice 3's likely need for SFX on correct/wrong/celebration:
  - Correct match: `MatchScene.handleCorrectMatch()` in `src/scenes/MatchScene.ts` — top of the
    method is where a "correct" sound should fire (before the bounce/line/confetti tweens start).
  - Wrong match: `MatchScene.handleWrongMatch()` — fire a "wrong" sound at the top, before the
    wiggle tween.
  - Selection: `MatchScene.select()` — a soft "pop" here would reinforce the tap-selected state.
  - Full-board celebration: `MatchScene.celebrate()` — top of the method, before the bounce/confetti
    loops start.
  - Theme change: the `themeIndex` increment happens inside `celebrate()`'s final `delayedCall` —
    if Slice 3 wants a distinct "new theme" stinger separate from the celebration sound, that's
    the insertion point.
- **`initiateFrom: 'either'` is not implemented.** If real-toddler QA calls for it, the dispatch
  point is `MatchScene.handleTap()` / `canInitiate()` — see decisions above for what already works
  and what still needs design (mainly: UX for re-tapping the already-selected side under `'either'`).
- **Theme pools are exactly at their "spec minimum" of 4.** If Slice 3 (or a later one) wants
  colors/shapes to have genuine per-round sampling variety like shadows does, that means adding
  more `PairDef`s to `COLOR_POOL`/`SHAPE_POOL` in `src/data/themes.ts` and dropping their
  `pairsPerRound` below the pool size — no code changes needed beyond the data.
- No audio, score, or persistence exists yet — still nothing for future slices to migrate away from.

# HANDOFF — Toddler Matching Game, Slice 3

## Context
Slice 2 complete: theme system with renderer registry, 3 themes rotating endlessly in one scene.
Read HANDOFF.md decisions/deviations first (Phaser 3.90 pin, Graphics-drawn triangle/star, ShapeHandle, initiateFrom flag).
This slice: shapes difficulty fix + home menu + expand to 5 matching themes.
Audio is NOT this slice. New mechanics (sorting, big/small, same/different) are NOT this slice.

## Part A — Shapes difficulty fix (do first, one-liner)
Shapes theme currently matches cross-color (red triangle → green triangle). Too hard for 2–3:
color actively misleads. Change the shapes resolver so rightColor = leftColor (same-color shape
matching). Keep the cross-color code path reachable via data/config — it becomes the future
"3–4 mode" difficulty step. Document the toggle in HANDOFF.md.

## Part B — Home menu scene

New `MenuScene`, the app's entry point.
- Grid of large tappable game cards (min 160×160 px at phone size), one per theme.
  Each card: colored panel + a representative icon drawn by that theme's renderer
  (e.g. colors = red circle with eyes, shadows = grey star). NO TEXT on cards.
- Tap card → short press-down animation → start `MatchScene` with that theme only.
  The theme now loops itself (new random sample each round) instead of rotating to the next.
- In `MatchScene`, add a small, out-of-the-way home button (top-left corner, simple house icon,
  ~80×80 px — deliberately smaller than gameplay targets and in the 60px edge margin zone is
  NOT allowed; place it just inside). Tap → back to menu. No confirmation dialog, but the button
  must not be reachable mid-celebration (disable input on it during celebrate()).
- Menu must be pleasant but calm: light background (existing cream), cards can bounce gently
  on entry, no looping animations that compete with choice-making.

Rationale for parent-facing note (put in HANDOFF.md): a menu this simple is toddler-operable,
and that's intentional — self-directed choice is part of the pedagogy.

## Part C — Two new matching themes (total: 5)

Both use the existing mechanic + renderer registry. Placeholder Phaser-graphics art is fine,
but keep every drawn object behind the renderer interface so real art can swap in later.

4. **Objects** (`objects`) — match identical simple objects (apple→apple, ball→ball, cup→cup,
   fish→fish, flower→flower, car→car). Left side has eyes, right side identical but no eyes.
   Same-object matching, color held constant. Pool ≥ 6, pairsPerRound: 4.
5. **Object-to-destination** (`destinations`) — match object to where it belongs:
   fish→bowl, car→road/garage, bird→nest, bee→flower, boat→water, ball→basket.
   This is the first NON-IDENTICAL match, so it's the "hardest" theme: pairsPerRound: 3.
   Destination art can be very simple (bowl = arc, nest = brown半circle, water = blue wavy rect).
   Left = the object (with eyes), right = the destination (no eyes).

Also: bump colors pool to 6 (add orange 0xFF9500, purple 0xAF52DE to palette) and shapes pool
to 6 (add heart, diamond — Graphics-drawn like triangle/star), so every theme has genuine
per-round sampling variety.

## Part D — Small structural change
Theme rotation logic in MatchScene (themeIndex advance in celebrate()) is now dead — remove it.
MatchScene receives its theme via scene init data from MenuScene. Single-theme looping only.

## Definition of done
- All 5 themes launchable from menu, each looping with per-round sampling variety.
- Home button works everywhere except during celebration.
- Menu cards render via theme renderers (no hardcoded card art in MenuScene).
- Same-color shapes verified; cross-color toggle documented but off.
- Headless test: menu → each theme → play a full round → home → next theme, both viewports,
  zero console errors. Screenshots of menu + each theme.
- HANDOFF.md updated: file map, decisions/deviations, notes for Slice 4 (audio hook points
  updated for menu: card-tap and home-button sounds; plus where per-theme intro voice line
  should fire — MatchScene create() on theme start).

## Out of scope
Audio, persistence/progress, parent gate, settings, new mechanics (sorting, big/small,
same/different, memory, counting, patterns), real art assets, deployment, age-mode selector.

---

## Slice 3 status: DONE

`npm run dev` clean, no TS errors (`npx tsc --noEmit` passes), no console errors. Verified with
headless-browser tests (Playwright) at both 390×844 and 768×1024: menu → each of the 5 themes →
play a full round → confirm celebration + same-theme reshuffle (loop, not rotation) → home →
next theme, for all 5 themes, twice through (10 total rounds captured per viewport run, zero
console errors). Mid-celebration home-button blocking verified in isolation with precise timing
control (tap confirmed blocked while `celebrate()` is active, confirmed working again the instant
the next round starts).

### File map
- `src/data/palette.ts` — `PALETTE` now has 6 colors (added `orange`, `purple`).
- `src/data/themes.ts` — `PairDef` extended with `icon` / `leftIcon` / `rightIcon` (on top of
  Slice 2's `color` / `shape`) for the two new themes; `ShapeKind` extended with `heart` /
  `diamond`; 5 `THEMES` total (`colors`, `shapes`, `shadows`, `objects`, `destinations`); the
  fixed-rotation array is now just an ordered list MenuScene iterates over, not a runtime cycle.
- `src/rendering/renderers.ts` — two new renderers (`object`, `destination`); `RenderArgs` now
  carries the full `pair: PairDef` instead of a flat `shape?` field, so new themes can add
  whatever identity fields they need without widening `RenderArgs` itself.
- `src/rendering/icons.ts` — new. 14 hand-drawn placeholder icons (apple, ball, cup, fish,
  flower, car, bird, bee, boat, bowl, road, nest, water, basket) behind one `drawIcon()` /
  `ICON_COLORS` interface, used by both `object` and `destination` renderers.
- `src/rendering/shapeHandle.ts` — new. The `ShapeHandle` interface (`{ gameObject, setFillStyle }`)
  pulled out of `renderers.ts` so `icons.ts` can share it without a circular import.
- `src/utils/color.ts` — added `lighten()` for the menu's pastel card panels.
- `src/scenes/MenuScene.ts` — new. The app's entry point: a 2-column grid of theme cards, each
  rendered via `RENDERERS[theme.renderer]` (zero hardcoded card art), tap → brief press animation
  → `scene.start('MatchScene', { theme })`.
- `src/scenes/MatchScene.ts` — theme now arrives via `init(data)`, not a rotating index; theme
  rotation logic removed (Part D). Added the home button (`createHomeButton()`), disabled during
  `celebrate()` and re-enabled at the top of `startRound()`. Gameplay grid layout now reserves
  extra top clearance (`TOP_MARGIN_PX`) so it never overlaps the home button's footprint.
- `src/main.ts` — scene list is now `[MenuScene, MatchScene]`, MenuScene auto-starts.
- `SLICE3.md` removed — its spec content now lives in this file, same as the Slice 2 → HANDOFF.md
  consolidation last time.

### Decisions / deviations
- **Shapes same-color fix implemented as a module-level toggle**, `SHAPE_CROSS_COLOR_MODE` in
  `renderers.ts`, currently `false`. Flipping it to `true` restores Slice 2's cross-color
  behavior for a future difficulty mode — not wired to any UI this slice, per spec ("keep the
  code path reachable," not "build the toggle UI").
- **Menu grid uses a 24px edge margin, not gameplay's 60px** (`MENU_EDGE_MARGIN_PX` in
  `MenuScene.ts`). The two requirements are mathematically incompatible at 390px phone width: 2
  columns × 160px-minimum cards + any margin ≥60px each side doesn't fit (390 − 2×60 = 270px
  available, 2×160px alone is already 320px). Since a menu of large, deliberate-tap choice cards
  is a calmer interaction than fast-paced gameplay (the rationale behind the 60px rule was
  guarding against *accidental* taps during energetic play), a reduced margin here is the
  simplest resolution consistent with the toddler requirements. Gameplay's 60px margin is
  untouched.
- **Home-button/gameplay-grid overlap — a real bug caught by testing, not just a design
  judgment call.** The home button occupies css `[60,140]×[60,140]`. Row 0's left-column item
  (bounding circle up to ~90px radius, centered per the *old* layout formula) spatially
  overlapped that square, so a tap in the shared region could hit either element unpredictably —
  confirmed via headless testing: a tap at the button's center landed on the gameplay item
  instead, leaving Home unreachable. Fixed by reserving extra clearance at the top of the
  gameplay grid (`TOP_MARGIN_PX = EDGE_MARGIN_PX + HOME_BUTTON_SIZE_PX + 16`) rather than trying
  to win the ambiguity via z-order.
- **Home button leaked across scene re-entries — a second real bug, also caught by testing.**
  `createHomeButton()` created a brand-new `Container` on every `create()` call (which re-runs
  on every `scene.start('MatchScene', ...)` and on resize) but never destroyed the previous one.
  Phaser reuses the same Scene *instance* across `start()` calls rather than constructing a fresh
  one, so each menu round-trip left an orphaned, still-interactive button stacked at the same
  position — and since `celebrate()`'s `disableInteractive()` only ever reached `this.homeButton`
  (the newest reference), a leaked older button remained tappable straight through a celebration
  after just one prior menu visit. Fixed with `this.homeButton?.destroy()` at the top of
  `createHomeButton()`. Both bugs were found by scripting the *exact* interaction sequence a
  toddler would produce (visit a theme, go home, visit another theme, complete a round) rather
  than testing each theme in isolation — worth remembering for Slice 4's testing too.
- **Icon color model:** each icon (`apple`, `bowl`, etc.) has one fixed color in
  `ICON_COLORS` (`icons.ts`), not a per-round-randomized one. For `objects`, both sides use the
  same icon's fixed color ("color held constant," per spec). For `destinations`, left/right are
  *different* icons, each keeping its own fixed color — there's no shared-identity color to
  preserve, so nothing needed to change on top of the objects-theme pattern.
- **Menu card icon selection**: defaults to each theme's first pool pair rendered in the "left"
  (friendly, eyed) role. Two overrides in `CARD_ICON_OVERRIDE` (`MenuScene.ts`): `shapes` uses
  `square` instead of the pool's first entry (`circle`) — a circle icon would have been visually
  indistinguishable from the `colors` card's circle blob; `shadows` and `destinations` render
  their "right" role instead (grey star silhouette; blue bowl) since that's each theme's more
  recognizable visual signature and avoids two theme cards both showing a generic colored
  circle-with-eyes.
- **Object/destination icons are hand-drawn Graphics**, not native Phaser Shapes — same
  reasoning as Slice 2's triangle/star fix, applied consistently from the start this time.

### Notes for Slice 4
- **Audio hook points** (extends Slice 2's list, still accurate — `handleCorrectMatch()`,
  `handleWrongMatch()`, `select()`, `celebrate()` in `MatchScene.ts`):
  - Card tap: `MenuScene.createCard()`'s `pointerdown` handler, before the press-down tween starts.
  - Home button tap: `MatchScene.createHomeButton()`'s `pointerdown` handler (`goHome()`), before
    `this.scene.start('MenuScene')`.
  - Per-theme intro voice line: top of `MatchScene.create()`, after `this.theme` is set (from
    `init()`) — this fires once per theme *entry* (menu → theme), not per round within a theme,
    since `startRound()` is what re-fires on every loop/reshuffle.
- **`SHAPE_CROSS_COLOR_MODE`** in `renderers.ts` is the "3–4yo difficulty mode" seed mentioned in
  Slice 2/3 handoffs — if Slice 4 or later adds an age-mode selector, this is the flag to wire up
  (currently a hardcoded module constant, not read from anywhere dynamic).
- **`initiateFrom: 'either'`** is still unimplemented (see Slice 2 notes — unchanged this slice).
- Menu currently shows all 5 themes unconditionally with no progress/lock state — first thing a
  persistence-adding slice would touch.

# HANDOFF — Toddler Matching Game, Slice 4

## Context
Slice 3 complete: MenuScene + 5 matching themes, all art via renderer registry.
Read HANDOFF.md decisions/deviations first (scene-instance reuse gotcha, home-button clearance,
CARD_ICON_OVERRIDE, audio hook points list — it's accurate and current).
This slice: polish carryover + the audio system (SFX + Indonesian voice lines).
New mechanics, persistence, parent gate, settings, deployment: still out of scope.

## Part A — Polish carryover from Slice 3 QA

1. **Menu card differentiation.** Three of five cards currently read as "red thing on pink panel"
   (red circle / red square / red apple). Fix via data only:
   - Choose visually distinct representative pairs per card via `CARD_ICON_OVERRIDE`:
     colors = red circle (keep), shapes = blue star, shadows = grey star (keep),
     objects = orange fish or yellow bee, destinations = blue bowl (keep).
     Requirement: no two cards share a dominant color, no two cards share a silhouette.
   - Derive each card's panel tint from its icon's dominant color (`lighten(iconColor, ...)`)
     instead of a shared pink — the panel itself becomes a differentiator.
2. **Nest vs bowl distinctness (destinations theme).** Both are currently semicircles, twins-by-
   silhouette; when one round samples both, difficulty spikes. Redraw the nest in `icons.ts` as
   clearly distinct: rough/twiggy top edge (a few short brown strokes poking above the rim) and
   a wider, shallower profile than the bowl. Verify at a glance in a screenshot that a toddler
   could not confuse the two silhouettes.

## Part B — Audio system

### Architecture (build this to be swap-friendly)
- New `src/audio/AudioManager.ts` — the ONLY module that touches Phaser sound. Scenes call
  semantic methods (`sfx('correct')`, `voice('theme_colors_intro')`), never raw keys.
- **Two asset classes, different sourcing:**
  1. **SFX — synthesized in code this slice.** Generate short WebAudio-based sounds at runtime
     (or pre-render to buffers in AudioManager init): soft pop (select), gentle "boop" (wrong —
     must sound neutral/curious, NOT sad or punishing), rising chime (correct), short sparkly
     fanfare (celebration), tiny click (menu card tap, home button). No external SFX files —
     keeps the slice self-contained and license-free. Keep each ≤400ms except celebration ≤1.5s.
  2. **Voice lines — file-based with graceful absence.** AudioManager loads Indonesian voice
     lines from `public/audio/voice/*.mp3` per a manifest in `src/audio/voiceManifest.ts`.
     If a file is missing (404), AudioManager logs one console.info and silently skips —
     the game must be 100% functional with zero voice files present. I will record/generate
     real Indonesian audio separately and drop files in later, no code change.

### Voice manifest (create the manifest + hook calls now, files come later)
- `theme_colors_intro`   — "Ayo cocokkan warnanya!"
- `theme_shapes_intro`   — "Ayo cocokkan bentuknya!"
- `theme_shadows_intro`  — "Dimanakah bayanganku?"
- `theme_objects_intro`  — "Ayo cari yang sama!"
- `theme_destinations_intro` — "Di mana rumahku?"
- `praise_1..praise_4`   — short praise variants ("Pintar!", "Hebat!", "Yeay!", "Bagus sekali!")
  Randomly pick one on each full-board celebration (NOT on every correct match — that gets
  grating; correct match keeps just the chime).
- Document the exact filename ↔ line mapping in HANDOFF.md so recording is a checklist.

### Hook wiring (points already mapped in Slice 3 notes)
- select() → pop; handleWrongMatch() → neutral boop; handleCorrectMatch() → chime;
  celebrate() → fanfare + random praise voice; MenuScene card tap → click;
  home button → click; MatchScene.create() → theme intro voice (once per theme entry,
  not per round — the hook point notes already distinguish this).
- **Autoplay policy handling:** browsers block audio before first user gesture. AudioManager
  must init/resume its AudioContext on the first pointerdown (menu card tap is naturally the
  first gesture — fine). No sound may be *required* before that.
- **Mute state:** a simple speaker icon button on the MenuScene only (NOT in gameplay —
  gameplay stays chrome-free except home). Toggles all audio. Persist nothing this slice;
  defaults to ON each load. Same size/placement discipline as the home button.

## Definition of done
- All SFX audible and correct-feeling at the mapped hooks (manually verified in a real browser,
  not just headless — headless can't judge sound).
- Voice system verified BOTH ways: with zero files present (silent, no errors, one info log)
  AND with at least one dummy mp3 dropped in to prove loading/playback works.
- Wrong-match sound demonstrably neutral (describe the synthesis in HANDOFF.md).
- Menu cards pass the differentiation requirement (screenshot).
- Nest/bowl visually distinct (screenshot).
- Headless regression: full Slice 3 flow still passes both viewports, zero console errors.
- HANDOFF.md updated: file map, decisions, the voice-recording checklist table, notes for
  Slice 5 (likely: first new mechanic — big-vs-small — plus deployment prep).

## Out of scope
New mechanics, persistence, parent gate, settings beyond mute, real art, deployment,
age-mode selector, recording the actual voice files.

---

## Slice 4 status: DONE

`npx tsc --noEmit` clean. Verified with headless-browser tests (Playwright) at both 390×844 and
768×1024: menu → each of the 5 themes → complete a full round (celebration + reshuffle) → home,
for all 5 themes, twice through (10 rounds captured per viewport, zero console errors). The
matching itself was driven by brute-force tap sequencing against the scene's deterministic row
layout (left row 0, then right rows in order until a match registers) rather than reading
internal pair identity — a temporary `console.debug('[TEST] ...')` signal was added to
`handleCorrectMatch()`/`handleWrongMatch()` for exactly this test run and removed immediately
after (confirmed absent via `grep` and a clean `tsc` re-run before this HANDOFF was written).

Voice system verified both required ways:
- **Zero files** (shipped state, `public/audio/voice/` empty except `.gitkeep`): silent, zero
  console errors, exactly **one** consolidated `console.info` reading
  `[AudioManager] 9/9 voice line(s) not found — running without them: ...`.
- **Dummy file present**: dropped a synthesized `.wav` renamed to `theme_colors_intro.mp3` (via
  macOS `say` + `afconvert`; decodeAudioData doesn't care about file extension, only the actual
  container bytes) into `public/audio/voice/`, reloaded, tapped the colors card. Log became
  `8/9 ... running without them: ...` (with `theme_colors_intro` no longer in the missing list)
  and zero console errors on the playback attempt — proof both fetch/decode and
  `AudioBufferSourceNode.start()` succeeded. Dummy file removed afterward; not part of the commit.

**SFX audible-quality verification is a known gap the agent cannot close.** Zero console errors
were confirmed for every SFX code path (select/wrong/correct/celebrate/click all fire their
WebAudio graph without throwing, across the full 10-round regression above), and the synthesis
choices are documented below against the spec's descriptive intent — but "does this sound
correct-feeling" is a human judgment call. The dev server was left running and a browser window
opened at `http://localhost:5183/` for Caroline to listen through the mapped hooks directly;
this bullet of the DoD is pending her ears, not further agent verification.

### File map
- `src/audio/AudioManager.ts` — new. The only module touching raw audio (WebAudio synthesis +
  voice decode/playback). Module-level singleton (`export const AudioManager = new
  AudioManagerImpl()`) so MenuScene and MatchScene share one AudioContext and one mute flag
  across `scene.start()`/`restart()` calls. Public surface: `unlock()`, `setMuted()`/
  `isMuted()`/`toggleMuted()`, `sfx(key)`, `voice(key)`, `randomPraiseKey()` — scenes never touch
  an oscillator, a buffer, or a file path directly.
- `src/audio/voiceManifest.ts` — new. `VOICE_MANIFEST` (key → `{ file, text }`), `THEME_INTRO_VOICE`
  (theme id → voice key), `PRAISE_VOICE_KEYS`. The Indonesian `text` field is the recording
  script, never rendered in-game (gameplay stays textless per CLAUDE.md).
- `src/main.ts` — added one capture-phase `document.addEventListener('pointerdown',
  () => AudioManager.unlock(), { capture: true, once: true })`. Capture phase specifically so
  this fires before any scene's own tap handler on the *same* first gesture (a bubble-phase
  document listener would fire after the canvas-level Phaser handler, since the canvas is closer
  to the event target — see decisions below).
- `src/scenes/MatchScene.ts` — `MatchSceneData` gained an internal-only `isResize?: boolean`
  (set only by `handleResize()`'s `scene.restart()`, never by MenuScene) so the theme-intro voice
  fires once per real menu→theme entry, not on every resize-restart of the same theme. Audio
  hooks wired: `select()` → `sfx('select')`, `handleWrongMatch()` → `sfx('wrong')`,
  `handleCorrectMatch()` → `sfx('correct')`, `celebrate()` → `sfx('celebrate')` +
  `voice(randomPraiseKey())`, `goHome()` → `sfx('click')` before `scene.start('MenuScene')`,
  `create()` → `voice(THEME_INTRO_VOICE[theme.id])` guarded by `!isResizeEntry`.
- `src/scenes/MenuScene.ts` — `CARD_ICON_OVERRIDE` entries updated for Slice 4 differentiation
  (see decisions) and gained an optional `color` field for renderers with randomized
  `resolveInstance()`. New `createMuteButton()` / `drawSpeakerIcon()` (hand-drawn Graphics,
  same reasoning as icons.ts/renderers.ts shapes — no native Phaser shape needed here since it's
  all custom paths anyway). `computeGrid()` now reserves `TOP_CLEARANCE_PX` at the top (mirrors
  MatchScene's `TOP_MARGIN_PX` fix from Slice 3) so the grid never overlaps the mute button's
  footprint. Card tap plays `sfx('click')` before the existing press-down tween.
- `src/rendering/icons.ts` — `nest` case redrawn: a wide/shallow half-ellipse path (vs. the
  bowl's circular semicircle) plus short twiggy strokes poking above the rim.
- `public/audio/voice/.gitkeep` — new. Keeps the directory present in git with zero real audio
  files; real Indonesian `.mp3`s drop in here later with no code change, per spec.
- `HANDOFF.md` — this update; `slice4.md` (the staged spec) removed, its content now lives here,
  same consolidation pattern as the Slice 2 → HANDOFF.md and Slice 3 → HANDOFF.md merges before it.

### Decisions / deviations
- **`CARD_ICON_OVERRIDE` gained a `color` override field.** The `shape` renderer's
  `resolveInstance()` picks a *random* left color on every call — without pinning it, the shapes
  card would reroll to a random color on every menu load/resize, defeating the "no two cards
  share a dominant color" requirement nondeterministically (it might occasionally coincide with
  colors/objects/destinations). `shapes: { pairId: 'star', role: 'left', color: PALETTE.blue }`
  fixes it. Renderers with a fixed per-pair/per-icon color (`colorBlob`, `shadow`, `object`,
  `destination`) didn't need this.
- **Shapes (blue star) and shadows (grey star) intentionally keep the same star silhouette.**
  The spec named both explicitly by shape and color, and the two DoD sentences ("no two cards
  share a silhouette" vs. the explicit per-card assignments) can't both be satisfied literally.
  Followed the concrete assignment: differentiation instead comes from color (solid blue vs.
  colorless grey) and panel tint (light blue vs. light grey) — a toddler reads "shadow" as
  specifically colorless, which a same-colored-but-shaped-differently pair wouldn't communicate
  as clearly.
- **Shapes (blue star) and destinations (blue bowl) are both blue-dominant** — again the spec's
  own explicit list, not an oversight. Accepted because the two cards land in non-adjacent grid
  cells (row 0 col 1 vs. row 2 col 0) and use visibly different blue shades (`PALETTE.blue`
  `0x0a84ff` vs. `ICON_COLORS.bowl` `0x7fb6e0`) plus different panel tints and totally different
  silhouettes (star vs. bowl) — confirmed by eye in the screenshot, not just by hex value.
- **Mute button top clearance (`TOP_CLEARANCE_PX`).** MenuScene's grid previously centered
  vertically across the full usable height with no reserved space; adding a fixed 80px corner
  button reintroduces the exact overlap risk Slice 3 already found and fixed for the home button
  (`TOP_MARGIN_PX`). Rather than wait to catch it via testing again, applied the same fix
  proactively: reserve `MENU_EDGE_MARGIN_PX + MUTE_BUTTON_SIZE_PX + 16` at the top of
  `computeGrid()`'s usable height. Verified by hand-checking the math at a short viewport
  (390×667) where the unreserved version would have overlapped (button bottom at css y=104,
  first-row card top at css y=74 without the fix).
- **Theme intro voice vs. resize-restart.** The spec says the intro voice fires "once per theme
  entry... not per round," but doesn't address `handleResize()`'s `scene.restart({ theme:
  this.theme })`, which re-runs `create()` for the *same* theme without a real menu visit. Added
  an internal `isResize` flag (MatchScene-only, never set by MenuScene) so resize-restarts don't
  replay the intro line — the simplest reading consistent with "once per entry."
- **Missing-voice logging consolidated to one line per preload batch, not one per key.** A
  literal per-file "log once and skip" would still emit 9 `console.info` calls in the zero-files
  default state, which reads as informational spam and doesn't match the DoD's parenthetical
  "(silent, no errors, one info log)." `preloadVoices()` now collects all missing keys from one
  `Promise.all` pass and emits a single summary line — zero-files → one log; fully-recorded →
  zero logs; partial → one log naming just the gaps.
- **SFX built on raw WebAudio (`AudioContext`/`OscillatorNode`/`GainNode`), not Phaser's sound
  manager.** Phaser's `this.sound` is asset-key-based (load a file, play a key); there's no
  runtime-synthesis equivalent, so going around it was the only way to meet "synthesized in code
  this slice, no external SFX files." AudioManager still owns 100% of the audio surface scenes
  ever touch, which is the actual intent behind "the only module that touches sound."
- **Wrong-match synthesis, spelled out for the "demonstrably neutral" DoD line:** a single sine
  tone sweeping **392Hz → 440Hz** (upward), ~220ms, no minor-interval harmony, same volume class
  as the other cues. Deliberately not a downward sweep or a buzzy/dissonant tone — those are the
  standard "error/fail" sonic cues and read as punishing; an upward "hm?" contour reads as
  curious/neutral instead. Correct match, by contrast, is a full ascending major triad (C5-E5-G5)
  — clearly more resolved/rewarding than the single wrong-match tone, so the two stay
  distinguishable without the wrong one sounding bad.
- **Known race, not fixed this slice:** `preloadVoices()` kicks off on `unlock()` (first
  pointerdown) but is async; if `MatchScene.create()`'s intro-voice call fires before that
  specific key's fetch/decode resolves, the very first theme visited in a session could silently
  skip its intro line even once real files exist (the buffer just isn't in the map yet — treated
  identically to "missing," per the existing graceful-absence design). Not addressed now since it
  needs real audio files to even observe; flagged below for Slice 5 in case it's noticeable
  during real-file QA.
- **Capture-phase (not bubble-phase) unlock listener.** `main.ts` registers `unlock()` with
  `{ capture: true }`. A bubble-phase document listener would fire *after* the canvas's own
  pointerdown handler (Phaser attaches directly to the canvas, which is closer to the event
  target than `document`), so on the very first tap — e.g. a menu card, which itself wants to
  play a click sound — the AudioContext might not exist yet when `sfx('click')` runs. Capture
  phase runs top-down before the target is reached, so `unlock()` always wins that race.

### Voice-recording checklist

Record each line in Indonesian, export as mp3, drop into `public/audio/voice/` using the exact
filename below — no code change needed either way.

| Key | Filename | Indonesian line | Trigger |
|---|---|---|---|
| `theme_colors_intro` | `theme_colors_intro.mp3` | "Ayo cocokkan warnanya!" | Entering the **colors** theme from the menu |
| `theme_shapes_intro` | `theme_shapes_intro.mp3` | "Ayo cocokkan bentuknya!" | Entering the **shapes** theme from the menu |
| `theme_shadows_intro` | `theme_shadows_intro.mp3` | "Dimanakah bayanganku?" | Entering the **shadows** theme from the menu |
| `theme_objects_intro` | `theme_objects_intro.mp3` | "Ayo cari yang sama!" | Entering the **objects** theme from the menu |
| `theme_destinations_intro` | `theme_destinations_intro.mp3` | "Di mana rumahku?" | Entering the **destinations** theme from the menu |
| `praise_1` | `praise_1.mp3` | "Pintar!" | Random pick on full-board celebration |
| `praise_2` | `praise_2.mp3` | "Hebat!" | Random pick on full-board celebration |
| `praise_3` | `praise_3.mp3` | "Yeay!" | Random pick on full-board celebration |
| `praise_4` | `praise_4.mp3` | "Bagus sekali!" | Random pick on full-board celebration |

Each intro line fires once per menu→theme entry (not on resize, not per round). Praise lines are
picked uniformly at random, one per celebration, alongside the fanfare SFX (which always plays).

### Notes for Slice 5
- **Likely scope per this slice's DoD:** first new mechanic (big-vs-small) + deployment prep —
  neither started.
- **Voice preload race** (see decisions above): once real mp3s exist, spot-check whether the
  very first theme entered in a fresh session reliably plays its intro line, or whether the
  fetch/decode occasionally loses the race against `MatchScene.create()`. If it's audible in
  practice, the fix is straightforward (await the specific key's load promise before checking the
  buffer map in `voice()`, or delay the first scene transition slightly) — just wasn't worth
  guarding against without real audio to observe it with.
- **`SHAPE_CROSS_COLOR_MODE`** (`renderers.ts`) is still the seed for a future difficulty/age-mode
  toggle — unchanged this slice.
- **`initiateFrom: 'either'`** is still unimplemented — unchanged this slice.
- Menu still shows all 5 themes unconditionally with no progress/lock state — first thing a
  persistence-adding slice would touch.
- Mute state resets to ON every load (no persistence) — matches this slice's explicit scope
  ("Persist nothing this slice"); a settings/persistence slice would be the natural place to fix
  that.
- `AudioManager` is a plain module-level singleton, not a Phaser plugin/registry entry — fine at
  this scale (two scenes), but if a third scene or a non-scene context (e.g. a future parent
  gate) needs audio, revisit whether it should move to Phaser's registry instead.

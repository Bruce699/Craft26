# Craft26 — Architecture & Contributor Guide

> A single, exhaustive reference for the next engineer/agent working on this site.
> Everything here was verified by reading the source directly. File references use
> repo-relative paths with line numbers, e.g. `src/App.jsx:186`.

---

## 0. TL;DR — read this first

- **What it is:** A personal portfolio site (`<title>Craft26</title>`). A **Vite 6 + React 18** single-page app. **No router, no TypeScript, no tests, no lint config.**
- **The experience:** A 3-column masonry **feed** of auto-playing video cards. **Double-click** any card → it "explodes": the other cards fly outward and the clicked card flies to screen-center, scales down, and the app drops into a **3D orthographic scatterplot** ("coordinate" view) where every video is a billboard plotted by *build-time (X) / procedural-ness (Y) / date (Z)*. Double-click the centered card to reverse back out. On screens **≤ 480px** there's a separate 2-column layout with a **tap-to-enlarge** overlay.
- **The one file you'll edit most:** `src/data/feedData.js` — the content source of truth. Its `cXrY` ids are **structurally coupled** to thumbnail filenames, the mobile order, and the 3D coordinate map. Editing content is **not local** (see §3 and §10).
- **The single biggest footgun:** ids like `c1r4` double as keys for **four** separate things. Insert/reorder a video and you must update all of them in lockstep, or things break **silently** (no errors).
- **Known incomplete state (the user is aware):** Two videos were just inserted — **Superpower Referral Cards (`c3r3`)** and **Hike Your Todos - Widget (`c1r4`)**. The **3D coordinate system was deliberately not updated for them**, and because the insert shifted ids, the existing 3D data is now **off-by-one** for the shifted range. Full details in **§10**.
- **Dev port:** `npm run dev` serves on **`http://localhost:5173`** (Vite default), *not* the `5174` in `.claude/launch.json`. See §11.

---

## 1. Repository map

```
Craft26/
├── index.html                      # Vite shell: #root + module script to /src/main.jsx
├── vite.config.js                  # 6 lines: just @vitejs/plugin-react, zero custom config
├── package.json                    # deps + dev/build/preview scripts (no lint/test)
├── .claude/launch.json             # debugger config — note port 5174 is WRONG (served on 5173)
├── ARCHITECTURE.md                 # ← this file
├── public/
│   ├── fonts/                      # TWK Lausanne 300 & 350 (woff2 + woff)
│   ├── thumbnails/                 # FEED posters: /thumbnails/{id}.jpg  (29 files, current scheme)
│   └── coordinate-thumbnail/       # 3D billboards: /coordinate-thumbnail/{id}.png (27 files, STALE scheme)
└── src/
    ├── main.jsx                    # React 18 createRoot + StrictMode; imports index.css
    ├── index.css                   # @font-face, global reset, body bg #CDCDCD
    ├── App.css                     # body bg transition, .is-dark, .is-mobile-focus(-exiting)
    ├── App.jsx                     # the phase state machine + mobile-focus machine (the brain)
    ├── components/
    │   ├── Nav.jsx / Nav.css       # the top "Site 25 / Craft 26" pill (feed phase only)
    │   ├── FeedGrid.jsx / .css      # responsive column layout + prop threading
    │   └── VideoCard.jsx / .css     # one tile: poster→video reveal, autoplay, all transform math
    └── coordinate/
        ├── useCoordinateData.js    # maps each item → absolute {x,y,z}; holds ITEM_COORDS (hand-authored)
        ├── CoordinateScene.jsx     # the R3F 3D scene (camera, billboards, axes, minimap, snapping)
        └── CoordinateScene.css     # DOM overlays for the 3D scene (axis labels, minimap, selection)
```

---

## 2. Tech stack, tooling & conventions

### Dependencies (`package.json:11-22`)

**Runtime:**
- `@mux/mux-video` `^0.30.6` — Mux's `<mux-video>` **custom element** (web component) for HLS playback. Imported for its side effect in `src/components/VideoCard.jsx:2`.
- `@react-three/fiber` `^8.18.0` — React renderer for three.js (the 3D scene).
- `@react-three/drei` `^9.122.0` — helpers for fiber (`OrbitControls`, `Billboard`).
- `three` `^0.170.0` — the 3D engine.
- `react` / `react-dom` `^18.3.1`.

> **Version pin gotcha:** fiber is **v8** while drei is **v9** — this is the *correct* compatible pairing (drei 9 targets fiber 8), and `three` is pinned to the `~0.170` line that matches. **Do not** bump fiber to v9 expecting drei to follow; you'll break the 3D view.

**Dev:** `@vitejs/plugin-react` `^4.3.4`, `vite` `^6.0.5`. `"type": "module"` (ESM everywhere).

### npm scripts (`package.json:6-10`)

```json
"dev":     "node ./node_modules/vite/bin/vite.js",
"build":   "node ./node_modules/vite/bin/vite.js build",
"preview": "node ./node_modules/vite/bin/vite.js preview"
```

These call Vite via an explicit `node …/vite.js` path (a Windows-friendly workaround) but are functionally plain `vite` / `vite build` / `vite preview` with **no flags**. So `dev` uses **default port 5173** and **binds localhost-only** (no `--host`). To expose on the LAN (e.g. for phone testing): `npm run dev -- --host` (see §11).

### Vite config (`vite.config.js`)

The entire file is `plugins: [react()]`. **No path aliases** (all imports are relative; `@/…` will not resolve), **no `server` block**, **no `base`/`build`/`resolve` customization**. Static assets live under `public/` and are served from web root `/`.

### Entry (`index.html`, `src/main.jsx`)

- `index.html`: `<div id="root">`, `<script type="module" src="/src/main.jsx">`, standard responsive `<meta viewport>` (no zoom lock), `<title>Craft26</title>`. No favicon/OG tags.
- `src/main.jsx`: React 18 `createRoot(...).render(<React.StrictMode><App/></React.StrictMode>)`. Imports `./index.css`.

> **StrictMode is ON** → in **dev**, every effect mounts → cleans up → re-runs. The many `setTimeout`, `IntersectionObserver`, `THREE.TextureLoader`, and `addEventListener` effects across `App.jsx`, `VideoCard.jsx`, `CoordinateScene.jsx` **must be idempotent & fully cleaned up** or they misbehave in dev only.

### Global CSS

- **`src/index.css`** (imported by `main.jsx`): two `@font-face` blocks for **`TWK Lausanne`** weights **300** and **350** (`woff2`+`woff`, `font-display: swap`); files in `public/fonts/`. Global reset (`box-sizing: border-box; margin/padding: 0`). `html { overflow-y: scroll; scrollbar-gutter: stable }` (reserves the scrollbar gutter so the feed column math never shifts). `body { background: #CDCDCD; min-height: 100vh }`.
- **`src/App.css`** (imported by `src/App.jsx` — **not** by `main.jsx`): `body { transition: background-color 0.6s … }` (the light↔dark fade). `body.is-dark { background: #0F0F0F; overflow: hidden }` and `html:has(body.is-dark) { scrollbar-gutter: auto }` (releases the gutter so the fixed 3D canvas spans full width). `body.is-mobile-focus / .is-mobile-focus-exiting { overscroll-behavior: none }`.

> Uses `:has()` selectors → modern browsers only. **App "mode" is signaled via `<body>` classes** (`is-dark`, `is-mobile-focus`, `is-mobile-focus-exiting`) toggled from `App.jsx`. Grep these to trace mode transitions.

### Code style (no formatter exists — match by hand)

- Modern **ESM + JSX**, **React 18 function components + hooks only**, **no TypeScript** (`.jsx`/`.js`).
- **2-space indent, single quotes, NO semicolons, trailing commas** in multiline lists.
- Imports are relative and often extensionless (`./App` → `src/App.jsx`).
- Component-scoped CSS: each component imports its own `.css` at the top; **BEM-ish** naming (`.video-card`, `.video-card__name`, `.video-card--loaded`).
- Brand accent color: **`#F83F01`** (orange-red). Page grey `#CDCDCD`; dark `#0F0F0F`.

---

## 3. Data model — `src/data/feedData.js` (the most important file)

A 56-line declarative file. It exports the master content list and a derived mobile ordering.

### `feedColumns` — the master list

```js
export const feedColumns = [ /* Col 1 */ [ {…}, … ], /* Col 2 */ [ … ], /* Col 3 */ [ … ] ]
```

- Shape: `feedColumns[colIndex][rowIndex]` — **0-indexed in code**, but the `id` encodes the **1-indexed** position.
- Each item is exactly: `{ id, playbackId, name, date }`.
  - **`id`** — `c{col}r{row}` (1-indexed), e.g. `c2r3`. Used as: React key, `data-grid-id` attr, **thumbnail filename** (`/thumbnails/{id}.jpg`), **mobile lookup key**, **3D coords key** (`ITEM_COORDS`), and **3D billboard filename** (`/coordinate-thumbnail/{id}.png`).
  - **`playbackId`** — opaque Mux id → `<mux-video playback-id={playbackId}>`.
  - **`name`** — display title (hover bar + 3D selection).
  - **`date`** — `"Month YYYY"` string. Shown verbatim **and parsed** for the 3D Z-axis (full English month, exact capitalization required — see §8).
- **Current counts:** Col 1 = **10** (`c1r1…c1r10`), Col 2 = **9** (`c2r1…c2r9`), Col 3 = **10** (`c3r1…c3r10`). **Total 29.**

### `mobileFeedColumns` — the mobile ordering (derived)

```js
const itemById = new Map(feedColumns.flat().map((item) => [item.id, item]))
const mobileOrder = [ [ /* MC1: 15 ids */ ], [ /* MC2: 14 ids */ ] ]
export const mobileFeedColumns = mobileOrder.map((ids) => ids.map((id) => itemById.get(id)))
```

- Mobile (≤480px) is a **2-column** hand-curated re-ordering that **references the same item objects by id** — single source of truth, no duplicated content.
- `mobileOrder` is a 2D array of **ids only** (MC1 has 15, MC2 has 14 → 29 total, matching desktop).
- **Footgun:** `itemById.get(id)` returns `undefined` for a stale/typo'd id, and `FeedGrid`'s `column.map(item => item.id)` then **crashes**. Remove an item → remove its id here; add an item → add it here or it won't appear on mobile.

### The five things coupled to `id` (see §10 for the full edit runbook)

When you insert/reorder/remove a video, ids in a column shift, and **all of these** must stay in sync:
1. `feedColumns` (the item itself).
2. `public/thumbnails/{id}.jpg` (feed poster) — **rename to match**.
3. `mobileOrder` (the id strings in `src/data/feedData.js`).
4. `ITEM_COORDS` in `src/coordinate/useCoordinateData.js` (+ maybe `X_LEVELS`).
5. `public/coordinate-thumbnail/{id}.png` (3D billboard) — **rename to match**.

> Items #4 and #5 are the "3D system." They were **intentionally left stale** in the current state — see §10.

---

## 4. The phase state machine — `src/App.jsx`

`App.jsx` owns two largely independent machines.

### 4a. The explosion / coordinate `phase` (desktop)

`phase` (init `'feed'`, `src/App.jsx:31`) is one string with six values (`src/App.jsx:8-14`):

| Phase | Meaning |
|---|---|
| `feed` | Normal grid; Nav visible; light bg. |
| `exploding` | Non-origin cards fade + fly outward; origin pauses & translates to center. |
| `centering` | Origin finished translating; scales down. **CoordinateScene mounts here.** |
| `coordinate` | 3D scene active; origin locked at center. **Resting state.** |
| `uncentering` | Reverse of centering; origin scales back up; 3D thumbnails fade out. |
| `unexploding` | Reverse of exploding; origin slides home; others fly back in. |

**Transition graph:**

```
 feed ──dblclick any card──► exploding ──500ms──► centering ──500ms──► coordinate
  ▲                                                                        │
  │ 500ms (+reset originId/originRect/sceneZoom)                  dblclick the ORIGIN card
  │                                                                        ▼
 feed ◄──500ms── unexploding ◄──500ms── uncentering ◄────────────────────┘
```

- **Manual edges** (`handleItemDoubleClick`, `src/App.jsx:59-70`): `feed → exploding` on any card; `coordinate → uncentering` **only if the double-clicked `id === originId`** (double-clicking a non-origin card in 3D is a no-op here).
- **Auto edges** (timing effect `src/App.jsx:186-208`): each transient phase is **exactly 500ms** (`PHASE_DURATIONS`, `src/App.jsx:15-20`); keyed on `[phase]` with `clearTimeout` cleanup so a mid-flight change cancels the pending advance. `coordinate` is the only phase with no outbound timer.
- **Origin reset** (`originId`, `originRect`, `sceneZoom` → null/null/1) happens **only at the end of `unexploding`** (`src/App.jsx:200-205`), in the same callback that returns to `feed`. Anything reading these mid-reverse-trip still sees the old origin.

**Origin state:** `originId` (`:32`), `originRect` (the card's `getBoundingClientRect()` at click, `:33`), `originTargetWidth` (`window.innerWidth * ORIGIN_WIDTH_RATIO`, where `ORIGIN_WIDTH_RATIO = 120/1200 = 0.1`, recomputed on resize, `:50-57`). `sceneZoom` (`:34`) is pushed **up** from the 3D scene via `onZoomChange` so the DOM origin card scale tracks the live R3F zoom.

**Dark mode:** `DARK_PHASES = {exploding, centering, coordinate, uncentering}` (`:24`) — note it **excludes `feed` AND `unexploding`**. An effect toggles `body.is-dark` (`:213-215`). Dark drops on entering `unexploding` (not `feed`) so the 0.6s bg fade runs *while* cards fly back in. **Don't "fix" this asymmetry.**

**Conditional mounting:**
- `Nav` renders **only when `phase === 'feed'`** (`:224`) — fully unmounted during the whole round-trip.
- `CoordinateScene` mounts when `phase ∈ {centering, coordinate, uncentering}` (`showScene`, `:219-220`) — it stays mounted through `uncentering` so thumbnails can fade out, then unmounts at `unexploding`. It gets `exiting={phase === 'uncentering'}`.
- `FeedGrid` is **always** mounted.

### 4b. The mobile-focus machine (≤480px)

Gated on `isMobile` **and** `phase === 'feed'` (the two machines never run together). `isMobile` = `clientWidth <= 480`, resize-tracked (`:38-46`).

`mobileFocus` is `null` or an object built at `:74-82`:
```
{ id, rect, scrollY, exiting, previousId, direction, phase }
```
- Sub-phase `phase` is set to **`'enter'`** on tap (`:80`) and **`'idle'`** once the 400ms settle timer fires (`:106`). `MOBILE_FOCUS_TRANSITION_MS = 400`; `MOBILE_FOCUS_EXIT_MS` aliases it.
- **Enter:** `handleMobileFocus(id, rect)` (`:72-83`). **Exit request:** `exitMobileFocus()` flips `exiting:true` (`:85-87`). **Exit completion:** after 400ms, `mobileFocus → null` (`:89-93`).
- **Body classes:** `is-mobile-focus` (active, not exiting) / `is-mobile-focus-exiting` (`:115-124`).
- **Scroll lock** (`:126-182`): while focused, non-passive `touchmove`/`wheel` `preventDefault`, scroll-key `preventDefault`, and an rAF snap-back to the locked `scrollY`; cleanup restores scroll.

> **⚠️ Dead code — the card "swap" path.** `App.jsx` **never** sets `previousId` to a real id, `direction` to non-zero, or `phase` to `'anim'`/`'prep'` — they're always reset to `null`/`0`/`'enter'`/`'idle'`. The matching machinery in `VideoCard` (the `mobileFocusPhase === 'anim' | 'prep'` branches, the `isMobileFocusPrevious` outgoing-card transforms, `VideoCard.jsx:235-266`) is therefore **unreachable today**. Treat swap-between-focused-cards as aspirational/half-built, not a live feature. (Also: `VideoCard` receives `phase: 'enter'`, which matches no branch and falls through to the default centered transform — that's how focus actually renders.)

---

## 5. Feed layout — `src/components/FeedGrid.jsx` (+ `.css`)

Owns responsive column sizing + prop threading; delegates all visuals to `VideoCard`. Rendered once from `App.jsx:225`, stays mounted across all phases.

- **Constants (`:6-14`):** desktop `H_PADDING=16`, `COL_GAP=8` (used for **both** column and row gap), `NUM_COLS=3`, `TOP_OFFSET=110`. Mobile `MOBILE_BREAKPOINT=480`, `MOBILE_GAP=4`, `MOBILE_NUM_COLS=2`, `MOBILE_TOP_OFFSET=116`. On mobile, horizontal padding **reuses `MOBILE_GAP`** (so padding == gap, `:45`).
- **`useWindowWidth(enabled)` (`:16-27`):** seeds from `document.documentElement.clientWidth`; attaches the resize listener **only when `enabled` (= `phase === 'feed'`, `:40`)**. → **Width is frozen during any transition** so animation geometry stays stable; it re-attaches on return to feed.
- **Layout pick (`:42-49`):** `isMobile = windowWidth <= 480` chooses `mobileFeedColumns` vs `feedColumns`. `columnWidth = (windowWidth - 2*hPadding - (numCols-1)*gap) / numCols`, applied **inline** (CSS sets no width).
- **Rendering (`:62-95`):** outer loop → `feed-grid__column` keyed by `colIndex`; inner loop → `VideoCard` keyed by **stable `item.id`** so React preserves each card's video/animation state across a desktop↔mobile resize. The root class is `feed-grid feed-grid--phase-${phase}`, but **`feed-grid--phase-*` has no authored CSS** — phase visuals live in `VideoCard` via the `phase` prop.
- **CSS (`FeedGrid.css`):** only 3 rules — `.feed-grid { box-sizing }`, `.feed-grid__columns { display:flex; align-items:flex-start }` (ragged-bottom masonry), `.feed-grid__column { display:flex; flex-direction:column; flex-shrink:0 }`. No media queries.

> Note: `FeedGrid` passes `mobileFocusScrollY` (`:86`) but `VideoCard` never destructures it — a harmless dead prop.

---

## 6. The tile — `src/components/VideoCard.jsx` (+ `.css`)

The richest UI file (423 lines). Three jobs: poster→video reveal, viewport-based autoplay, and all the transform math for both the desktop explosion and the mobile overlay.

### Reveal choreography (3 layers)
Card starts hidden (`opacity:0; translateY(8px)`, `VideoCard.css:9-15`).
1. **Card reveal** — poster `<img onLoad/onError → handlePosterLoad>` does a **double `requestAnimationFrame`** before `setPosterLoaded(true)` (`:56-60`). The double-rAF is **load-bearing** — it guarantees the hidden state is painted once before `.video-card--loaded` flips opacity, so cached posters still fade instead of popping in.
2. **Poster fade-out** — `.video-card--video-ready .video-card__poster { opacity:0 }`.
3. **Video fade-in** — `.video-card--video-ready mux-video { opacity:1 }`. `videoReady` is set from `readyState>=2` + `loadeddata`/`canplay` (`:72-100`).

> **Missing thumbnails fail silently:** the poster's `onError` is `handlePosterLoad` itself (`:406`), so a 404 thumbnail still flips `posterLoaded → true` and the card reveals with a broken `<img>`. **Always verify the file exists after any id change.**

### `<mux-video>` & autoplay
- Element (`:408-415`): `muted`, `loop`, `playsinline`, `preload` is `'auto'` only for the focused mobile card, else `'metadata'`.
- Two effects early-return unless `phase === 'feed'` (`:105-163`). An `IntersectionObserver` (`VISIBILITY_THRESHOLD = 0.3`) sets `isVisible`; the playback effect plays when visible (swallowing the `play()` promise rejection for autoplay policy) and pauses otherwise. When a card becomes the origin it's explicitly paused (`:166-171`) to freeze the frame for centering.

### Hardcoded id: `isVideoSizedCard = id === 'c3r1'` (`:40`)
A **literal string compare** — only `c3r1` ("Live Motion Panel") sizes to its true video aspect ratio (`aspectRatio` inline + `.video-card--video-sized` CSS). **If grid ids shift, this silently attaches to the wrong card.** (Same fragility class as `ITEM_COORDS`.)

### The transform `useMemo` (`:218-369`)
Returns an inline-style object per phase. Branch order:
- **A. Mobile focus** (`:220-275`, takes precedence in `feed`): `getMobileFocusTransform` moves the card center → viewport center, `scale = (innerWidth - 8)/rect.width`; card becomes `position:fixed`; `borderRadius = 4/scale` (so post-scale corner ≈ 4px). Sub-states `prep`/`anim`/`exiting`/centered — **`prep`/`anim` are dead today (see §4b).**
- **B. Feed** (`:277`): returns `null` (normal flow).
- **C. Origin** during transition (`:281-322`): translate to center; `baseScale = originTargetWidth/originRect.width`. In `coordinate` phase scale = `baseScale * sceneZoom` with `transition:'none'` so the DOM card tracks the live 3D zoom frame-tight.
- **D. Non-origin** (`:324-356`): unit vector from origin center → this card's center × `EXPLOSION_DISTANCE = 1600`, translate out + fade (`Math.hypot(...) || 1` guards divide-by-zero); reversed in `unexploding`.

> **`originalRectRef` (`:62-70`)** snapshots each card's feed-layout rect **only while `phase === 'feed' && !mobileFocusActive`**. Once transforms apply, a live `getBoundingClientRect()` would return the *moved* position — so fly-out math must read this frozen ref.

### Interaction
- `handleDoubleClick` (`:173-182`): **desktop only**, active in `feed` (enter) or on the origin in `coordinate` (reverse).
- `handleClick` (`:184-191`): **mobile + feed only** → `onMobileFocus`. Outside-tap-to-exit listener at `:194-213` (deferred 1 rAF so the opening tap doesn't immediately close it).

### CSS highlights (`VideoCard.css`)
The **hover info bar** `.video-card__info` (`:103-129`) is the "little tab" showing `name` + `date`; it only appears `@media (hover:hover) and (min-width:481px)` (`:136-144`) — never on touch — and is hidden in `body.is-dark`. `body.is-mobile-focus` dims+blurs every non-focused card (`opacity:0.5; filter:blur(40px)`).

---

## 7. The 3D coordinate scene — `src/coordinate/`

Renders every (non-origin) video as a camera-facing **billboard** in an **orthographic** scatterplot. Most algorithmically dense part of the app.

### 7a. Data — `useCoordinateData.js`
`useCoordinatePoints()` does `feedColumns.flat()` and returns **absolute** `{id, name, date, hours, procIndex, x, y, z}` per item, recomputed on viewport resize.

**Axes:**
- **X = build time in hours.** Raw hours come from `ITEM_COORDS[id].x`, then snap to a **discrete level** so the 60-hour outlier doesn't squash everything: `X_LEVELS = [0.3,0.5,0.6,0.8,1,2,3,4,6,8,17,18,20,22,60]` (`:50`); `x = X_LEVEL_INDEX.get(hours) * xPxPerLevel`. **A new hours value must be added to `X_LEVELS` or it collapses to slot 0** (`X_LEVEL_INDEX.get(x) ?? 0`, `:91`). Note `0` is **not** in `X_LEVELS`. Labels: "Less time spent" / "More time spent".
- **Y = procedural index 1..7** (1 = keyframed, 7 = procedural; `Y_MIN_INDEX=1`, `Y_MAX_INDEX=7`). Labels: "Keyframed" / "Procedural".
- **Z = date.** `parseMonthYear("April 2026") = year*12 + monthIndex` (`:5-12`); z scaled across `[earliest, latest]`. **Unknown/misspelled month silently falls back to January** (`months[month] ?? 0`). Labels: "Before" / "After".
- Ratios: X & Z each span 85% of viewport width; Y spans 80% of height (`:56-60`).

> **`ITEM_COORDS` (`:17-45`) is hand-authored and id-keyed — NOT derived from `feedData`.** Missing ids fall back to `{x:0, y:0}` (`:90`) → the point lands at the world origin reading "0 Hrs / Level 0". This is the crux of §10.

### 7b. Scene — `CoordinateScene.jsx`
- **Camera:** orthographic `<Canvas>` (`:1042`), frustum `[-w/2,w/2]×[h/2,-h/2]`, `near:-10000`, `far:10000`, `position:[0,0,2000]`, `zoom:1`. `onCreated` force-resizes the GL context + frustum to `window.innerWidth/Height` and a burst of synthetic resize events fire at 16/50/150/400ms (`:909-922`, `:1047-1059`) because R3F's first `ResizeObserver` read can be `0×0` mid-transition.
  - **⚠️ Stray debug log:** `console.log('[R3F] onCreated', …)` at `:1048` fires on every 3D entry. Shipping-code noise — safe to remove.
- **Origin-relative remap (`:892-902`):** finds `origin = points.find(p => p.id === originId)`, subtracts its `x/y/z` from every other point, and **drops the origin itself** (the DOM origin card represents it). **If `originId` has no matching point, `relative` is `[]` and the scene renders empty** — another reason a broken id is dangerous.
- **Billboards (`ThumbnailBillboard`, `:156-263`):** load `/coordinate-thumbnail/{id}.png?v={COORDINATE_THUMBNAIL_VERSION}` (`COORDINATE_THUMBNAIL_VERSION = '2026-04-22-icebreaker-fix'`, `:25`) via `THREE.TextureLoader`; the **`onError` is a no-op (`:192`)** so a missing PNG renders **nothing** (`return null` when `!texture`). Selected billboard gets a `#F83F01` edge outline. Scale+fade in over `ENTER_DURATION=500ms`, staggered `i * 20ms`.
- **`OrbitControls` (`:1081-1089):** `enablePan={false}`, `enableZoom`, `zoomToCursor={false}`, `zoomSpeed={1}`, `minZoom={0.2}`, `maxZoom={8}`, `makeDefault`.
- **`ZoomBroadcaster` (`:535-546):** per-frame, calls `onZoomChange(camera.zoom)` → App `sceneZoom` → DOM origin card scale stays glued to the 3D zoom.
- **`SnapToAxisView` (`:280-401):** after a drag ends, springs the camera to the nearest of 6 axis-aligned face-on views. XY/YZ use a spring (`SPRING_STIFFNESS=250`, `SPRING_DAMPING=24`, semi-implicit Euler, 6 substeps); the XZ snap uses a plain ease (spring overshoot would cross the pole and flip every billboard). **Note: the code comment at `:268-269` says "damping 10" — that's stale; the constant is 24.**
- **DOM overlays driven imperatively from `useFrame`** (writing `element.style.transform` each frame, no React state): axis-end labels (`AxisLabelDriver`, `:574-757`), bottom-left **minimap** (`AxisMinimap*`, `:407-533`), and the click **selection overlay** (`SelectionOverlay`, `:763-890`) which draws 3 orange droplines + labels ("{hours} Hrs", "Level {procIndex}", date).
- **`exiting` prop** threads into `Axes`, every billboard, `AxisLabelDriver`, and the minimap to reverse the enter animation and clear selection.
- **CSS (`CoordinateScene.css`):** `.coordinate-scene` is `position:fixed; inset:0; z-index:5` (the DOM origin card at `z-index:100` sits above it); `.axis-minimap` is `position:fixed; left/bottom:24px; 100×100; z-index:200`; labels are `font-weight:300`, white/`#F83F01`.

---

## 8. Navigation — `src/components/Nav.jsx` (+ `.css`)

Pure presentational pill, no props/state. A `<nav class="nav-pill">` with: an external `<a>` "**Site 25**" → `https://bruce-cao.com` (`target=_blank rel=noopener noreferrer`, muted `#949494`), and a non-link `<span>` "**Craft 26**" (accent `#F83F01`). `position: absolute; top:40px; left:50%; transform:translateX(-50%); z-index:10` (absolute, not fixed — scrolls with context). Dimmed/blurred via `body.is-mobile-focus`. **Mounted only in `feed` phase** (`App.jsx:224`).

---

## 9. Cross-cutting conventions & gotchas (aggregated)

**Conventions**
- `id` (`cXrY`, 1-indexed) is the canonical join key across feedData, `/thumbnails/{id}.jpg`, `mobileOrder`, `ITEM_COORDS`, and `/coordinate-thumbnail/{id}.png`. Keep them all in lockstep.
- Single content source: mobile is *derived* from `feedColumns` via `itemById` — never duplicate item objects.
- Drive cross-cutting visual modes via `<body>` classes from `[phase]`/`[state]`-keyed effects, letting global CSS own the animation.
- Advance multi-step transitions via `setTimeout` chains keyed on the state, with `clearTimeout` cleanup; keep durations in `PHASE_DURATIONS`.
- Layout sizing is computed in JS and applied inline; CSS only does flex/box-sizing. Key lists by stable `item.id`, not array index.
- Animations share `cubic-bezier(0.5, 0, 0, 1)`; desktop phases are 500ms (must equal `PHASE_DURATIONS`), mobile focus 0.4s, reveal 0.3s. The 3D `ease` solver replicates the same curve.
- DOM overlays in the 3D scene are positioned imperatively in `useFrame` (no per-frame React re-render).

**Top gotchas**
- **Silent-failure couplings:** both `/thumbnails/{id}.jpg` (`VideoCard.jsx:406`) and `/coordinate-thumbnail/{id}.png` (`CoordinateScene.jsx:192`) have no-op error handlers — missing/renamed assets fail invisibly.
- **Hardcoded `c3r1`** (`VideoCard.jsx:40`) and **id-keyed `ITEM_COORDS`/PNGs** break silently when ids shift.
- **StrictMode double-invoke** in dev — keep effects idempotent.
- **Frozen width during transitions** (`FeedGrid` resize listener only in `feed`).
- **Dead mobile-swap code path** (§4b).
- **Stray `console.log`** at `CoordinateScene.jsx:1048`; **stale "damping 10" comment** at `:268-269`.
- **Dev port 5173, not the `5174` in `.claude/launch.json`** (§11).

---

## 10. ⚠️ KNOWN INCOMPLETE STATE — the two new videos & the 3D system

This is the most important section for the immediate next task. **The user is aware and explicitly deferred the 3D work** ("don't touch the 3D coordinate system for now").

### What was just added (this cycle)
Two videos were **inserted** (not appended), each pushing the items below it down one row:

| Video | New id | Position | playbackId | date |
|---|---|---|---|---|
| **Superpower Referral Cards** | `c3r3` | Column 3, row 3 | `8AZ01lFBOOxlehVCCvnYwrkGo02jNhsqR9PfcSDcCqYq00` | May 2026 |
| **Hike Your Todos - Widget** | `c1r4` | Column 1, row 4 | `ZBAXXn5AAt3DGWG9lp9vzl00JYOyEhTYwO43uYi4SOe00` | May 2026 |

Inserting at `c3r3` shifted old `c3r3…c3r9` → `c3r4…c3r10`; inserting at `c1r4` shifted old `c1r4…c1r9` → `c1r5…c1r10`. So e.g. "Undo Todo" is now `c3r4`, "Cards for Onboarding" is now `c1r5`, "Media Preset" is now `c1r10`, "Smart Calendar" is now `c3r10`.

**Done & consistent:**
- ✅ `feedColumns` updated (new items + shifted ids).
- ✅ `public/thumbnails/*.jpg` renamed to the new scheme — **29 files**, fully aligned. The hover tab shows the right `name`/`date`.
- ✅ `mobileOrder` updated (remapped to preserve the existing mobile arrangement; the two new cards placed at the top of each mobile column).

**Deliberately NOT done — the 3D system is now inconsistent in two ways:**

1. **`ITEM_COORDS` (`src/coordinate/useCoordinateData.js:17-45`) is stale.** It still holds the **pre-shift 27 entries** (`c1r1–c1r9`, `c2r1–c2r9`, `c3r1–c3r9`). Because it's keyed by id:
   - The **two new videos have no real coordinates.** `c1r4`'s entry now resolves to the new Hike Widget but holds the *old* `c1r4` (Cards for Onboarding) values; `c3r3`'s entry resolves to Superpower but holds the *old* `c3r3` (Undo Todo) values.
   - **Everything in the shifted range is off-by-one:** for `c1r4…c1r9` and `c3r3…c3r9`, each id's hand-authored coords now describe the *previous* occupant, not the current one.
   - `c1r10` (Media Preset) and `c3r10` (Smart Calendar) have **no entry at all** → fall back to `{x:0, y:0}` and plot **stacked at the world origin** reading "0 Hrs / Level 0".

2. **`public/coordinate-thumbnail/*.png` is stale.** It's still the **pre-shift 27-file set** (`c1r1–c1r9`, `c2r1–c2r9`, `c3r1–c3r9`). The 3D billboards load by id, so:
   - Shifted ids show the **wrong image** (e.g. `/coordinate-thumbnail/c3r3.png` is the old Undo Todo, not Superpower).
   - `c1r10.png` and `c3r10.png` **don't exist** → those billboards render **nothing** (texture `onError` is a no-op).

> Net effect in the 3D view right now: the shifted videos appear at the wrong plotted positions with the wrong images, and Media Preset + Smart Calendar are invisible (origin-stacked, no texture). The 2D feed is fully correct.

### How to finish the 3D work (when ready)
For the two new videos **and** the entire shifted range (`c1r4…c1r10`, `c3r3…c3r10`):
1. **Re-key `ITEM_COORDS`** so each `cXrY` maps to the **current** occupant's real values (`x` = build hours, `y` = procedural index 1–7). Author real values for `c3r3` (Superpower) and `c1r4` (Hike Widget), and add `c1r10` / `c3r10`.
2. **Add any new `x` (hours) value to `X_LEVELS`** (`useCoordinateData.js:50`), keeping it sorted, or the point collapses to X-slot 0.
3. **Regenerate/rename `public/coordinate-thumbnail/*.png`** to the new id scheme (new `c1r4.png`, `c3r3.png`; shift the rest; add `c1r10.png`, `c3r10.png`). Rename top-down to avoid collisions (see runbook below).
4. **Bump `COORDINATE_THUMBNAIL_VERSION`** (`CoordinateScene.jsx:25`) when you replace any PNG, or browsers serve the stale cached image.

### General runbook — insert / reorder / remove a video
1. **`feedColumns`** — add/move/remove the item. Mid-column insert shifts every lower item's id.
2. **`public/thumbnails/{id}.jpg`** — rename to match. **Rename from the highest row downward** (e.g. `c1r9→c1r10`, then `c1r8→c1r9`, …) so you never overwrite a file still needed. Then drop the new file into the freed slot. Verify the final set has exactly one `.jpg` per id (missing files fail silently).
3. **`mobileOrder`** — update/add/remove the id strings in both MC1 and MC2.
4. **`ITEM_COORDS`** (+ `X_LEVELS` if a new hours value) — re-key/add.
5. **`public/coordinate-thumbnail/{id}.png`** — rename/add the same way as #2; bump `COORDINATE_THUMBNAIL_VERSION`.
6. **Check the `c3r1` hardcode** (`VideoCard.jsx:40`) if your change moves whatever should be the "video-sized" card.
7. Verify in-browser (feed + double-click into 3D). 29 items today.

---

## 11. Local dev, preview & testing

- **Run:** `npm install` then `npm run dev` → **`http://localhost:5173`** (Vite default). The `port: 5174` in `.claude/launch.json` is **wrong** and does not match what's served (recorded in the project memory).
- **Phone / LAN testing:** the default `dev` binds localhost only. Expose it with `npm run dev -- --host` (Vite prints a `Network: http://<lan-ip>:<port>/` URL). On Windows you may need to allow Node.js through the firewall (Private networks). The phone must be on the same Wi-Fi.
- **Production:** `npm run build` → `dist/`; `npm run preview` to serve the build (default 4173).
- **No automated tests/lint.** Verify changes by eye: load the feed, hover a card (info tab), double-click into the 3D scene and back, and resize ≤480px to check the mobile layout + tap-to-focus.
- There is **no intro/landing screen** — `App` renders `FeedGrid` immediately in the `feed` phase. A blank/black page means the dev server isn't ready or you're on the wrong port, not a loading state.

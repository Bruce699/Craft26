# Portfolio 2025 — Local Recreation of brucecao.framer.website

## Mission context

Bruce asked for a full local recreation of his old Framer portfolio,
**https://brucecao.framer.website** (canonical domain: https://bruce-cao.com),
with **every page and every asset** downloaded so the site is completely
self-contained and works offline.

It is now **mounted at `/2025`** inside the Craft26 (Portfolio 2026) repo, so
it ships as part of that Vercel deployment: https://bruce-cao.com/2025,
https://bruce-cao.com/2025/craft, and so on.

## What's here

The site itself lives in `public/2025/` (Vite copies `public/` into `dist/`
verbatim, so no build step touches it). This folder holds only the tooling that
regenerates it.

| Path | Purpose |
|---|---|
| `public/2025/index.html` + `public/2025/<slug>/index.html` | The 10 built pages, ready to serve |
| `public/2025/fuc/` | Complete mirror of framerusercontent.com assets (~577 MB): images, fonts, videos, the Framer runtime JS chunks, a Rive animation |
| `public/2025/fuc/vendor/` | Hand-added local shims that cut the last two calls home — `rive.wasm` (Rive's engine binary) and `editor-bar-stub.mjs`. `build.py` never rewrites this directory. |
| `public/2025/videos/` | The 7 project videos that the live site loads from github.com/Bruce699/Portfolio_Videos |
| `_raw/pages/` | Untouched original HTML as downloaded from the live site (source of truth for rebuilds) |
| `scripts/mirror.py` | Downloads all assets referenced by `_raw/pages/` into `public/2025/`, recursively following imports inside JS chunks (absolute URLs *and* relative `./chunk.mjs` imports). Idempotent. |
| `scripts/build.py` | Regenerates the built pages from `_raw/` — mounts everything under `BASE`, rewrites CDN URLs to local paths, fixes internal links, strips Framer analytics + edit badge. Safe to re-run. |
| `scripts/serve.py` | Zero-dependency static server **with HTTP Range support** (required for `<video>` rendering — plain `python3 -m http.server` can't serve byte ranges). |
| `scripts/manifest.json` | List of every downloaded URL (and any failures) |
| `scripts/.applied-base` | Records the base currently baked into the asset chunks, so `build.py` can re-base them in place |

The 10 pages (from the site's sitemap): `/2025` (home), `/2025/lets-see`,
`/2025/craft`, `/2025/work`, `/2025/about`, `/2025/motion`, `/2025/lore`,
`/2025/adit`, `/2025/icebreaker`, `/2025/etch`.

## How to run it

The site uses ES-module scripts, so it needs a static server (file:// won't work),
and videos need HTTP Range support. From the repo root:

```bash
python3 tools/portfolio-2025/scripts/serve.py 8080
```

then open http://localhost:8080/2025. Pages are directory-indexed, so
http://localhost:8080/2025/work etc. all work, as does the Framer SPA navigation.
(Plain `python3 -m http.server` also works for everything *except* video
rendering — it can't serve byte ranges.)

`npm run dev` at the repo root serves the 2026 site and will *not* directory-index
`/2025` — use `/2025/index.html` there, or `serve.py`, which matches production.

## Mounting it at a subpath

`BASE` at the top of `build.py` is the single knob (`"/2025"`; `""` would put the
site back at the domain root). Changing it and re-running `build.py` re-bases
everything: asset URLs, internal links, `<link rel=canonical>` / `og:url`, the
SPA router's route table in `script_main*.mjs`, and the search index keys. The
previous value is read back from `scripts/.applied-base` and stripped first, so
the asset chunks — which are rewritten in place — can be re-based repeatedly
without a re-mirror.

**Trailing slashes must be off.** Framer's router replaces every nav `href` at
hydration with a path *relative to the current route* (`./craft`), so the browser
URL has to match the route path exactly. At `/2025/craft` that resolves to
`/2025/work`; at `/2025/craft/` it would resolve to `/2025/craft/work` and 404.
`vercel.json` sets `"trailingSlash": false` so Vercel redirects the slashed form
away. Any other host needs the same. (This fragility is inherited from Framer —
the original site broke the same way on `/craft/`.)

## Approach & key decisions

- **Faithful mirror, not a hand rebuild.** The pages are Framer's published
  SSR HTML plus its real runtime JS chunks, all rehosted locally. This keeps
  every animation, hover state, and layout pixel-identical to the live site.
- **URL rewriting is a pure prefix swap**: `https://framerusercontent.com/X` →
  `/fuc/X` (including the `/`-escaped and `\/`-escaped forms inside inline
  JSON and JS), and the GitHub video URLs → `/videos/`. Asset paths keep their
  CDN structure so nothing else has to change.
- **`srcset` query params** (`?scale-down-to=512`) are left in place; static
  servers ignore the query string and serve the full-size original.
- **Stripped**: the `events.framer.com` analytics script and the
  `framer.com/edit` badge — nothing else was removed.
- **Cutting the last calls home.** Localizing every *asset* URL was not enough;
  the runtime still fetched two things at execution time, which only showed up
  in `performance.getEntriesByType('resource')` (a plain network-panel filter
  missed them, and browser caching masked them further):
  1. **Framer's editor bar** — `script_main.mjs` does a dynamic
     `import("https://framer.com/edit/init.mjs")`, which in turn pulls
     `app.framerstatic.com` chunks and pings `framer.com/edit?framerSiteId=…`.
     That import is rewritten to `fuc/vendor/editor-bar-stub.mjs`, a no-op
     component. It only ever rendered Framer's editing chrome, so nothing on
     the public site is lost.
  2. **Rive's WASM engine** — the Rive runtime defaults to
     `unpkg.com/@rive-app/canvas@2.27.5/rive.wasm` (with a jsdelivr fallback).
     That exact version is vendored to `fuc/vendor/rive.wasm` and both URLs
     are rewritten to it.
  Both rewrites live in `RUNTIME_PATCHES` in `build.py`, so they survive a
  rebuild. Verified afterwards: **0 external resource entries** on every page.
- **One asset was broken on the live site itself**: `Extend Cards_Bruce.mp4`
  404s in the GitHub repo (renamed upstream). Its replacement,
  `Final_Portfolio_Extend.mp4`, was downloaded and saved under the old
  referenced filename, so the Extend video plays locally even though it's
  broken on the live site.

## Status / next steps for the next agent

Done — all verified in a local browser (most recently against a server that
resolves `/2025` -> `/2025/index.html` without redirecting, the way Vercel does):
1. ✅ All 10 pages downloaded (`_raw/pages/`)
2. ✅ 148 assets mirrored recursively (images, fonts, mp4s, JS chunks, .riv)
3. ✅ Pages built with all URLs rewritten, **plus the two runtime call-homes
   above neutralized**. Confirmed with
   `performance.getEntriesByType('resource')` on a cache-free origin:
   **0 external entries** — nothing leaves localhost.
4. ✅ Every page checked — no broken images, no 404s, videos buffer and decode
   locally (verified readyState 4), favicon serves, fonts local, Rive loads.
5. ✅ Mounted at `/2025`: all 10 pages serve, every one of the 426 local refs in
   the HTML and 312 in the chunks resolves, canonical URLs read
   `https://bruce-cao.com/2025/...`, SPA nav and the back button land on
   `/2025/<slug>`, and `performance.getEntriesByType('resource')` still shows
   **0 external entries**.
6. ✅ Filled a gap in the original mirror: 9 lazily-imported chunks (the 404
   page, the Google-Fonts/Fontshare loaders, the snippets module) were never
   downloaded because they are only referenced as relative `./chunk.mjs`
   imports inside other chunks. One of them 404'd on every page load.
   `mirror.py` now follows relative imports too.

Verification notes (so the next agent doesn't re-chase these):
- **Verify offline-ness with the Performance API, not the network panel.**
  `performance.getEntriesByType('resource')` lists cached loads too; a network
  filter showed "all localhost" while unpkg and framer.com were in fact being
  hit. And test on a **fresh port** (e.g. `python3 scripts/serve.py 8099`) —
  chunk filenames are content-hashed, so the browser happily reuses stale
  copies from a previous port and hides whether a fix actually landed.
- **This folder was moved** from `~/Desktop/` to `~/Desktop/Design/` partway
  through the work. Nothing depends on the absolute path; all scripts resolve
  paths relative to the repo root.
- **/motion is empty on the live site too** (just the nav) — confirmed by
  loading https://brucecao.framer.website/motion side by side. Not a bug.
- Videos are `preload="none"` on the live site as well; they load on
  scroll-into-view. Matching behavior locally.
- The only console message is a Rive warning ("Could not find a View Model
  linked to Artboard MacBook Pro 14 - 1") that comes from the .riv file
  itself — present on the live site too.
- Screenshots of a **hidden/background** browser tab show blank sections:
  Framer's entrance animations (opacity fade-ins) run on requestAnimationFrame,
  which browsers throttle in hidden tabs. Foreground viewing is fine.

Possible next steps:
- If a rebuild is ever needed:
  `python3 tools/portfolio-2025/scripts/mirror.py && python3 tools/portfolio-2025/scripts/build.py`.
- `dist/` is gitignored: it would otherwise carry a second ~650 MB copy of
  `public/2025`. Vercel regenerates it from `npm run build`.

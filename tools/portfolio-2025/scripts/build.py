#!/usr/bin/env python3
"""Build the servable 2025 site from _raw/pages/ + mirrored assets.

Output goes to <repo>/public/2025/, which Vite copies verbatim into dist/,
so the site is served at https://bruce-cao.com/2025 (and /2025/craft, ...).

- Mounts the whole site under BASE (default "/2025"): asset URLs, internal
  links, the SPA router's route table and the canonical URLs all get the
  prefix, so client-side navigation lands on /2025/<slug>.
- Rewrites framerusercontent.com URLs (plain and JSON-escaped forms) to
  BASE/fuc/... and the GitHub-hosted video URLs to BASE/videos/...
- Strips Framer analytics (events.framer.com) and the framer.com edit badge.
- Emits index.html at the site root and <slug>/index.html for every other page.
- Applies the same rewrites to the downloaded JS/CSS chunks in fuc/.

Run:  python3 tools/portfolio-2025/scripts/build.py
Safe to re-run, and safe to re-run after changing BASE: the previously applied
base is recorded in scripts/.applied-base and stripped before the new one is
applied, so the asset chunks can be re-based in place without a re-mirror.
"""
import json
import pathlib
import re

# URL prefix the site is mounted at. "" would serve it from the domain root.
BASE = "/2025"
CANONICAL_ORIGIN = "https://bruce-cao.com"

TOOL = pathlib.Path(__file__).resolve().parent.parent   # tools/portfolio-2025
REPO = TOOL.parent.parent                               # repo root
SITE = REPO / "public" / "2025"                         # served site
RAW = TOOL / "_raw" / "pages"
FUC = SITE / "fuc"
STAMP = TOOL / "scripts" / ".applied-base"

GH_PREFIX = "https://github.com/Bruce699/Portfolio_Videos/raw/refs/heads/main/"
FUC_PREFIX = "https://framerusercontent.com/"

# Runtime calls out to these hosts even after all asset URLs are localized.
# Each is redirected to a local equivalent so the site never phones home.
RUNTIME_PATCHES = [
    # Framer's editor bar (which in turn pulls app.framerstatic.com chunks).
    ("https://framer.com/edit/init.mjs", "/fuc/vendor/editor-bar-stub.mjs"),
    # Rive ships its WASM from a public CDN by default, incl. a jsdelivr fallback.
    ("https://unpkg.com/${t.name}@${t.version}/rive.wasm", "/fuc/vendor/rive.wasm"),
    ("https://cdn.jsdelivr.net/npm/${t.name}@${t.version}/rive_fallback.wasm",
     "/fuc/vendor/rive.wasm"),
]

# Local roots that live under BASE once the site is mounted on a subpath.
LOCAL_ROOTS = ("/fuc/", "/videos/")

# Dead code in Framer's published HTML: guarded by localStorage.get (not a real
# method, so it always throws), but it references framer.com. Drop it.
EDITOR_SNIFF_RE = re.compile(
    r"<script>try\{if\(localStorage\.get\([^)]*__framer_force_showing_editorbar_since[^)]*\).*?</script>",
    re.S,
)

STYLES = ("plain", "u", "b")


def esc(s: str, style: str) -> str:
    if style == "u":  # /-escaped JSON
        return s.replace("/", "\\u002F")
    if style == "b":  # backslash-escaped JSON
        return s.replace("/", "\\/")
    return s


def localize(text: str) -> str:
    """CDN URLs -> root-relative local paths (no base applied yet)."""
    for style in STYLES:
        text = text.replace(esc(FUC_PREFIX, style), esc("/fuc/", style))
        text = text.replace(esc(GH_PREFIX, style), esc("/videos/", style))
        for remote, local in RUNTIME_PATCHES:
            text = text.replace(esc(remote, style), esc(local, style))
    return text


def unmount(text: str, base: str) -> str:
    """Strip a previously applied base so the paths are root-relative again."""
    if not base:
        return text
    for style in STYLES:
        for root in LOCAL_ROOTS:
            text = text.replace(esc(base + root, style), esc(root, style))
        text = text.replace(esc(CANONICAL_ORIGIN + base, style),
                            esc(CANONICAL_ORIGIN, style))
    return text


def mount(text: str, base: str) -> str:
    """Prefix root-relative local paths with the base."""
    if not base:
        return text
    for style in STYLES:
        for root in LOCAL_ROOTS:
            text = text.replace(esc(root, style), esc(base + root, style))
        # canonical/og URLs: both "…bruce-cao.com" and "…bruce-cao.com/craft".
        # The lookahead keeps this idempotent.
        origin, prefixed = esc(CANONICAL_ORIGIN, style), esc(CANONICAL_ORIGIN + base, style)
        text = re.sub(re.escape(origin) + r"(?!%s)" % re.escape(esc(base, style)),
                      prefixed.replace("\\", "\\\\"), text)
    return text


def route_path(path: str) -> str:
    """Map a root-relative route path onto the base ("/" -> BASE)."""
    if path == "/":
        return BASE or "/"
    return BASE + path


def rewrite_routes(text: str, old: str) -> str:
    """Re-base the SPA route table in script_main (path:`/craft` -> `/2025/craft`)."""
    if old:
        text = re.sub(r"path:`" + re.escape(old) + r"(/[^`]*)?`",
                      lambda m: "path:`%s`" % (m.group(1) or "/"), text)
    return re.sub(r"path:`(/[^`]*)`",
                  lambda m: "path:`%s`" % route_path(m.group(1)), text)


def build_page(src: pathlib.Path, dest: pathlib.Path) -> None:
    html = src.read_text(encoding="utf-8")
    html = mount(localize(html), BASE)
    # strip analytics + edit badge
    html = re.sub(r'<script[^>]*events\.framer\.com[^>]*>\s*</script>', "", html)
    html = re.sub(r'<script[^>]*framer\.com/edit[^>]*>\s*</script>', "", html)
    html = re.sub(r'<link[^>]*framer\.com/edit[^>]*>', "", html)
    html = EDITOR_SNIFF_RE.sub("", html)
    # internal links: ./slug -> BASE/slug, ./ -> BASE
    html = re.sub(
        r'href="\./([A-Za-z0-9-]*)([^"]*)"',
        lambda m: 'href="%s%s"' % (route_path("/" + m.group(1)) if m.group(1) else route_path("/"), m.group(2)),
        html,
    )
    # home was canonical at "…bruce-cao.com/", which mounts to "…/2025/" — but
    # the host serves the base without a trailing slash, so drop it.
    if BASE:
        html = html.replace('"%s%s/"' % (CANONICAL_ORIGIN, BASE),
                            '"%s%s"' % (CANONICAL_ORIGIN, BASE))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding="utf-8")
    print(f"built {dest.relative_to(REPO)}")


def rewrite_search_index(path: pathlib.Path, old: str) -> None:
    """The search index is keyed by route path; re-key it onto the base."""
    data = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for key, value in data.items():
        if old and key.startswith(old):
            key = key[len(old):] or "/"
        out[route_path(key) if key.startswith("/") else key] = value
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    old = STAMP.read_text(encoding="utf-8").strip() if STAMP.exists() else ""

    for src in sorted(RAW.glob("*.html")):
        slug = src.stem
        dest = SITE / "index.html" if slug == "index" else SITE / slug / "index.html"
        build_page(src, dest)

    # re-base the downloaded JS/CSS chunks in place
    n = 0
    for f in FUC.rglob("*"):
        if "vendor" in f.parts:
            continue  # hand-written local shims; never rewrite
        if not (f.is_file() and f.suffix in {".mjs", ".js", ".css", ".json", ".svg"}):
            continue
        if f.name.startswith("searchIndex-") and f.suffix == ".json":
            rewrite_search_index(f, old)
            n += 1
            continue
        text = f.read_text(encoding="utf-8")
        new = mount(localize(unmount(text, old)), BASE)
        if f.name.startswith("script_main"):
            new = rewrite_routes(new, old)
        if new != text:
            f.write_text(new, encoding="utf-8")
            n += 1

    STAMP.write_text(BASE + "\n", encoding="utf-8")
    print(f"rewrote {n} asset files; site mounted at {BASE or '/'}")


if __name__ == "__main__":
    main()

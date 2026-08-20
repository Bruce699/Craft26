#!/usr/bin/env python3
"""Mirror brucecao.framer.website into a self-contained static site.

- Downloads all framerusercontent.com assets (images, fonts, videos, JS chunks, CSS)
  referenced by the raw page HTML in _raw/pages/, following imports inside JS
  chunks recursively. Assets land in <repo>/public/2025/.
- Downloads the portfolio videos hosted on github.com/Bruce699/Portfolio_Videos.
- Assets keep their CDN path structure under fuc/ so URL rewriting is a pure
  prefix swap (https://framerusercontent.com/X -> /fuc/X).

Run:  python3 tools/portfolio-2025/scripts/mirror.py
Idempotent: already-downloaded files are skipped.
"""
import os
import re
import json
import pathlib
import urllib.parse
import urllib.request

TOOL = pathlib.Path(__file__).resolve().parent.parent   # tools/portfolio-2025
REPO = TOOL.parent.parent                               # repo root
SITE = REPO / "public" / "2025"                         # served site
RAW = TOOL / "_raw" / "pages"
FUC = SITE / "fuc"
VID = SITE / "videos"

FUC_RE = re.compile(r"https://framerusercontent\.com/[A-Za-z0-9./_%~-]+")
GH_RE = re.compile(r"https://github\.com/Bruce699/Portfolio_Videos/raw/refs/heads/main/[A-Za-z0-9.%_-]+")
REL_IMPORT_RE = re.compile(r"[\"`\'](\./[A-Za-z0-9._@%$-]+\.(?:mjs|js))[\"`\']")
TEXT_EXT = {".mjs", ".js", ".css", ".json", ".svg", ".html"}


def fetch(url: str, dest: pathlib.Path) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            while chunk := r.read(1 << 16):
                f.write(chunk)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  FAIL {url}: {e}")
        if dest.exists():
            dest.unlink()
        return False


def local_path_for(url: str) -> pathlib.Path:
    p = urllib.parse.urlparse(url)
    rel = urllib.parse.unquote(p.path.lstrip("/"))
    if p.netloc == "framerusercontent.com":
        return FUC / rel
    # github video -> videos/<basename>
    return VID / pathlib.PurePosixPath(rel).name


def scan_text(text: str, base_url: str | None = None) -> set[str]:
    text = text.replace("\\u002F", "/").replace("\\/", "/")
    found = set(FUC_RE.findall(text)) | set(GH_RE.findall(text))
    if base_url:
        # JS chunks import their lazy siblings relatively ("./chunk.mjs"); those
        # never appear as absolute URLs, so resolve them against the chunk's URL.
        found |= {urllib.parse.urljoin(base_url, m) for m in REL_IMPORT_RE.findall(text)}
    return found


def main() -> None:
    queue: set[str] = set()
    for page in sorted(RAW.glob("*.html")):
        queue |= scan_text(page.read_text(encoding="utf-8"))
    done: set[str] = set()
    failed: list[str] = []
    while queue:
        url = queue.pop()
        if url in done:
            continue
        done.add(url)
        dest = local_path_for(url)
        print(f"[{len(done)}] {url}")
        if not fetch(url, dest):
            failed.append(url)
            continue
        if dest.suffix in TEXT_EXT:
            try:
                new = scan_text(dest.read_text(encoding="utf-8"), url) - done
                queue |= new
            except UnicodeDecodeError:
                pass
    manifest = {"downloaded": sorted(done - set(failed)), "failed": failed}
    (TOOL / "scripts" / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nDone: {len(done) - len(failed)} ok, {len(failed)} failed")


if __name__ == "__main__":
    main()

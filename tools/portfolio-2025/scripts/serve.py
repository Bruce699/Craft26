#!/usr/bin/env python3
"""Static server with HTTP Range support (needed for <video> playback).

python3 -m http.server can't serve byte ranges, which makes browsers refuse to
render some mp4s. Use this instead:

    python3 tools/portfolio-2025/scripts/serve.py [port]   # default port 8080

It serves <repo>/public, so the site is at http://localhost:8080/2025 —
the same path it is mounted at in production.
"""
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class RangeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None
        size = os.fstat(f.fileno()).st_size
        m = RANGE_RE.match(rng)
        if not m:
            f.close()
            self.send_error(400, "Bad Range")
            return None
        start = int(m.group(1)) if m.group(1) else 0
        end = int(m.group(2)) if m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end or start >= size:
            f.close()
            self.send_error(416, "Range Not Satisfiable")
            return None
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        f.seek(start)
        self._range_remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_range_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        self._range_remaining = None
        while remaining > 0:
            chunk = source.read(min(1 << 16, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    tool = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    root = os.path.join(os.path.dirname(os.path.dirname(tool)), "public")
    os.chdir(root)
    print(f"Serving {root} on http://localhost:{port}/2025")
    ThreadingHTTPServer(("", port), RangeHandler).serve_forever()

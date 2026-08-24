"""Serve the DMC app locally with no-cache headers (so updates are never stuck).

Usage: python serve.py [port] [directory]   (defaults: 8765, ../app)
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
APP_DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass  # quiet


os.chdir(APP_DIR)
print(f"DMC app: http://localhost:{PORT}/  (serving {os.getcwd()})")
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler).serve_forever()

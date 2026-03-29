#!/usr/bin/env python3
"""
EchoLocate local server — serves the app on localhost so the browser
grants microphone access and service-worker registration (both require
a secure context, which localhost satisfies without needing HTTPS).

Usage:
    python3 server.py            # port 8080
    python3 server.py 9000       # custom port
"""
import http.server
import socketserver
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# Change to the directory this script lives in (the repo root),
# so relative paths like vendor/ and sw.js resolve correctly.
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js':   'application/javascript',
        '.mjs':  'application/javascript',
        '.css':  'text/css',
        '.vtt':  'text/vtt',
        '.wasm': 'application/wasm',
        '.json': 'application/json',
    }

    def log_message(self, fmt, *args):
        # Suppress per-request noise; only show the startup banner.
        pass

with socketserver.TCPServer(('', PORT), Handler) as httpd:
    httpd.allow_reuse_address = True
    print(f'\nEchoLocate is running at:')
    print(f'  http://localhost:{PORT}/')
    print(f'\nOpen that URL in Chrome or Edge, then close this terminal to stop.\n')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.\n')

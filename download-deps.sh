#!/usr/bin/env bash
# download-deps.sh — downloads all JavaScript dependencies into vendor/
# so EchoLocate can run completely offline.
#
# Requirements: curl (pre-installed on macOS, Linux, and Windows 10+)
# Run once after cloning, or again to upgrade a dependency.
#
# Usage:
#   chmod +x download-deps.sh
#   ./download-deps.sh

set -euo pipefail

HTMX_VERSION="2.0.4"
MEYDA_VERSION="5.6.3"
FRANC_VERSION="6.2.0"

mkdir -p vendor/franc-min

echo "Downloading HTMX ${HTMX_VERSION}..."
curl -fsSL \
  "https://unpkg.com/htmx.org@${HTMX_VERSION}/dist/htmx.min.js" \
  -o vendor/htmx.min.js

echo "Downloading Meyda ${MEYDA_VERSION}..."
curl -fsSL \
  "https://unpkg.com/meyda@${MEYDA_VERSION}/dist/web/meyda.min.js" \
  -o vendor/meyda.min.js

echo "Downloading franc-min ${FRANC_VERSION} (language detection)..."
curl -fsSL \
  "https://cdn.jsdelivr.net/npm/franc-min@${FRANC_VERSION}/index.js" \
  -o vendor/franc-min/index.js
curl -fsSL \
  "https://cdn.jsdelivr.net/npm/franc-min@${FRANC_VERSION}/expressions.js" \
  -o vendor/franc-min/expressions.js
curl -fsSL \
  "https://cdn.jsdelivr.net/npm/franc-min@${FRANC_VERSION}/data.js" \
  -o vendor/franc-min/data.js

echo ""
echo "Done. vendor/ contents:"
du -sh vendor/htmx.min.js vendor/meyda.min.js vendor/franc-min/
echo ""
echo "Now start the app with:  python3 server.py"

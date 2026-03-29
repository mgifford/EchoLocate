#!/usr/bin/env bash
# download-models.sh — optional on-device ML models for EchoLocate.
#
# These models run entirely in the browser via WebAssembly; no data
# ever leaves the device.  They improve language detection accuracy
# beyond the text-heuristic built into the base app.
#
# Requirements: curl, ~25 MB of free disk space
#
# Usage:
#   chmod +x download-models.sh
#   ./download-models.sh

set -euo pipefail

# ── Transformers.js runtime ───────────────────────────────────────────────────
# A lightweight ONNX Runtime wrapper that runs Hugging Face models in-browser.
TRANSFORMERS_VERSION="3.3.3"
ONNX_VERSION="1.17.1"

mkdir -p vendor/transformers vendor/onnx-runtime models/language-id

echo "Downloading Transformers.js runtime (~800 KB)..."
curl -fsSL \
  "https://cdn.jsdelivr.net/npm/@xenova/transformers@${TRANSFORMERS_VERSION}/dist/transformers.min.js" \
  -o vendor/transformers/transformers.min.js

echo "Downloading ONNX Runtime WASM backend..."
# The .wasm files are loaded at runtime alongside the JS entry point.
for f in ort-wasm.wasm ort-wasm-simd.wasm ort-wasm-threaded.wasm; do
  echo "  $f"
  curl -fsSL \
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_VERSION}/dist/${f}" \
    -o "vendor/onnx-runtime/${f}"
done

# ── Language identification model (~3 MB) ────────────────────────────────────
# Xenova/language_detection_v1 — supports 97 languages, runs in ~40 ms.
# Model source: https://huggingface.co/Xenova/language_detection_v1
echo ""
echo "Downloading language-id model (~3 MB)..."
MODEL_BASE="https://huggingface.co/Xenova/language_detection_v1/resolve/main"
mkdir -p models/language-id

for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json; do
  echo "  $f"
  curl -fsSL "${MODEL_BASE}/${f}" -o "models/language-id/${f}"
done

mkdir -p models/language-id/onnx
echo "  onnx/model_quantized.onnx"
curl -fsSL "${MODEL_BASE}/onnx/model_quantized.onnx" \
  -o models/language-id/onnx/model_quantized.onnx

echo ""
echo "Done. Size summary:"
du -sh vendor/transformers/ vendor/onnx-runtime/ models/language-id/
echo ""
echo "Models are ready. EchoLocate will load them automatically"
echo "when you run:  python3 server.py"

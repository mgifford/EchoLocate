# Vendored Transformers.js runtime

- `transformers.min.js` — `@xenova/transformers@2.17.2`, Apache-2.0.
- `ort-wasm-simd.wasm` — ONNX Runtime Web backend shipped with that package,
  MIT (onnxruntime-web 1.17.1).
- `LICENSE` — Apache-2.0 text for Transformers.js.

The WebGPU backend is not used yet; only the WASM SIMD backend is vendored.
Refresh with `./download-deps.sh`. Model weights are **not** vendored; they are
downloaded through the model consent UI and stored in Cache Storage.

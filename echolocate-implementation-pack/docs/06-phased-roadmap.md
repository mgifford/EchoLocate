# Six-PR roadmap

Each PR must remain reviewable, include tests, and keep existing baseline functioning. Do not combine all work into one giant branch.

## PR 0: Establish baseline (prerequisite) — **done**
- Pull latest EchoLocate; inspect AGENTS.md, tests, CI, SW caching, model downloads and current browser workarounds.
- Run existing JS syntax checks and test suite. Capture known limitations and reproducible fixtures without modifying the core behavior.
- Identify existing Web Speech event flow, separate audio capture limitations and segmentation assumptions.

## PR 1: Independent adapter contracts and capability detection — **partial**
- Wrap current Web Speech in `SpeechAdapter` contract; retain legacy behavior.
- Add speaker adapter contract but keep Meyda default; add capability registry and secure-context/mic/WebGPU/WASM/browser speech probing.
- Unit tests for interim/final events, restart/backoff, and no-download startup.
- Acceptance: existing Google/Web Speech path and current UI unchanged; clear unsupported engine handling.

**Status (2026-11-10):** engine selection, persistence, on-device
`available()`/`install()` and the privacy/disclosure wording shipped in PR #57.
The `SpeechAdapter` contract and a local-only capability snapshot (Web Speech,
on-device, WebGPU adapter, WASM, storage) shipped in PR #61. Still to do:
replacing the Chrome ≤149 UA gate after device testing.

## PR 2: Explicit model management and consent — **next**
- Add pinned, validated model manifest; separate download approvals; size/license/source/revision disclosure.
- Add progress, cancellation, retry, cache versioning, integrity checks, deletion and storage fallbacks.
- Tests must intercept network and assert **zero model-weight requests until consent**.
- Inventory the existing Chrome Translator model download (opt-in translation)
  and scope "no downloads until consent" to app-managed weights.
- Acceptance: user can refuse and continue existing path; model removal never deletes transcript.

## PR 3: WebGPU local speech adapter — **planned**
- Integrate selected Whisper Web-inspired local ASR (consider Whisper vs Parakeet). Worker inference, buffering, chunking/partials/finals, timestamps, disposal.
- Starting model: `onnx-community/whisper-base` (Apache-2.0, ~146 MB fp16,
  ~77 MB int8) with `whisper-tiny` (~76 MB fp16) as the constrained fallback.
  Parakeet (`istupakov/parakeet-tdt-0.6b-v2-onnx`, CC-BY-4.0, ~661 MB int8) is
  a later benchmark. No weights in the repo; pin the revision and hash artifacts.
- Compare performance on realistic browsers/devices; do not assume model size or latency from documentation.
- Acceptance: confirmed local inference; no remote audio submission, graceful GPU/device loss; existing STT remains selectable.

## PR 4: Advanced local speaker adapter
- PyAnnote segmentation + WeSpeaker embeddings, with proper on-device model licensing and model loading.
- Add quality gating, exemplars, provisional/established/unknown, explicit overlaps, stable speaker identity and speaker limit handling.
- Acceptance: measurable improvement over Meyda on fixed labeled recordings, without automatic profile corruption.

## PR 5: Timeline and speaker reconciliation
- Use shared capture clock; attach transcription to diarization regions, preserve revisions and manual corrections.
- Add accessible update notifications and user controls for speaker correction/merge/split.
- Acceptance: correct returning-speaker mapping, no duplicated/lost captions, no stale event overwriting edits.

## PR 6: Validation, accessibility, resource budget and docs
- Test browsers/device classes, latency, storage, offline/cached behavior, security/privacy/network auditing, CPU/GPU/memory, energy where practical.
- Update README/PRIVACY, UI help, models/licenses, AGENTS.md and feature flags.
- Acceptance: measured test report including failures and unknowns, not just green unit tests.

## Review gates for every PR

- Read repository guidance before editing.
- Write automated tests and a manual test plan.
- Confirm focus order, keyboard operation, status/ARIA-live behavior and reduced-motion UI.
- Run existing `node --check app.js`, `node --check sw.js`, and `npm test` if supported.
- Preserve existing functionality and backward-compatible storage/export, or include tested migration.
- State precisely what was changed, removed, deferred and why.

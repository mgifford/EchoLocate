# Implementation status against this pack

Snapshot: 2026-11-10. Update this file when a roadmap phase changes.

## Roadmap

| Pack phase | Status | Notes |
|---|---|---|
| PR 0 — baseline | **Done** | Repository reviewed, tests run (`node --check`, `npm test`), current behaviour recorded in `docs/00-project-baseline.md`. |
| PR 1 — adapters + capability detection | **Mostly done** | Engine selector, persistence, `browser-local` (`processLocally`, `available`, `install`) and disclosure shipped in PR #57. A `SpeechAdapter` contract and a local-only capability snapshot (Web Speech, on-device, WebGPU adapter, WASM, storage) shipped in PR #61. Still open: replacing the Chrome ≤149 UA gate after device testing. |
| PR 2 — model management + consent | **Done (infrastructure)** | Manifest at `models/manifest.json`, exact-revision consent, SHA-256 verification, progress/cancel, storage refusal, Cache Storage install, removal that keeps transcripts, and a consent dialog. No installable model ships yet; the first model entry arrives with the engine that consumes it. The Chrome Translator download still needs to be in the consent inventory. |
| PR 3 — WebGPU ASR | **Planned** | Start with `onnx-community/whisper-base` (Apache-2.0, fp16 ~146 MB); `whisper-tiny` fallback. Parakeet deferred. |
| PR 4 — advanced diarization | **Planned** | PyAnnote + WeSpeaker, quality gates, exemplars, overlap. |
| PR 5 — timeline/reconciliation | **Planned** | Shared monotonic clock, revisions, manual-correction precedence. |
| PR 6 — validation/docs | **Planned** | Browser/device matrix, network audit, resource budget. |

## Repo PRs that reconcile this pack

- **#55** — honest privacy copy, Unknown attribution at the cap, caption-first
  translation, Start/Stop recovery, offline `franc`.
- **#57** — experimental on-device speech engine and engine selector.
- **#58** — accessibility semantics pass (Label in Name, live regions, popup,
  privacy reopen, forced colors, bounded SW boot wait).
- **#59** — storage honesty, serialized caption commits, SW 503/cache cleanup.
- **#61** — SpeechAdapter contract and capability snapshot.
- **#62** — model manifest, consent manager and consent UI.
- **CSP** — meta policy, external theme bootstrap, hashed import map and tests.
- **Translation consent** — per-pair consent before Chrome's model download (PR #64).

## Current constraints that affect the plan

- `app.js` is a classic script tested by executing it in a Node `vm` context.
  ES-module adapters need an explicit loading/test strategy before PR 1 lands.
- There is no CI workflow; checks are `node --check` and `npm test` (357 tests
  at this snapshot).
- GitHub Pages cannot set COOP/COEP headers, so `SharedArrayBuffer` and
  multi-threaded WASM are unavailable. Plan single-thread ORT.
- The service worker deliberately refuses to cache `models/`, `onnx-runtime/`
  and `.onnx`/`.safetensors`/`.bin`. Model caching belongs to the consent work.
- No model weights or recordings are in the repository; the `models/` directory
  is only a placeholder.

## Next actionable items

1. Add the first whisper-base manifest entry with the WebGPU engine (PR 3).
2. Replace the Chrome ≤149 UA gate when a device test matrix is available.
3. Then measure WER/latency/memory and run the no-upload network audit.

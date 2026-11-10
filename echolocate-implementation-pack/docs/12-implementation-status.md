# Implementation status against this pack

Snapshot: 2026-11-10. Update this file when a roadmap phase changes.

## Roadmap

| Pack phase | Status | Notes |
|---|---|---|
| PR 0 — baseline | **Done** | Repository reviewed, tests run (`node --check`, `npm test`), current behaviour recorded in `docs/00-project-baseline.md`. |
| PR 1 — adapters + capability detection | **Partial** | Engine selector, persistence, `browser-local` (`processLocally`, `available`, `install`) and disclosure shipped in repo PR #57. Still missing: a `SpeechAdapter` contract around `SpeechEngine`, a CapabilityRegistry for WebGPU/WASM/storage, and removal of the Chrome-version UA gate. |
| PR 2 — model management + consent | **Next** | Not started. Include the existing Chrome Translator model download in the consent inventory. |
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

## Current constraints that affect the plan

- `app.js` is a classic script tested by executing it in a Node `vm` context.
  ES-module adapters need an explicit loading/test strategy before PR 1 lands.
- There is no CI workflow; checks are `node --check` and `npm test` (315 tests
  at this snapshot).
- GitHub Pages cannot set COOP/COEP headers, so `SharedArrayBuffer` and
  multi-threaded WASM are unavailable. Plan single-thread ORT.
- The service worker deliberately refuses to cache `models/`, `onnx-runtime/`
  and `.onnx`/`.safetensors`/`.bin`. Model caching belongs to the consent work.
- No model weights or recordings are in the repository; the `models/` directory
  is only a placeholder.

## Next actionable items

1. PR 2 consent/ModelManager inventory, including the Chrome Translator
   download already present in the app.
2. Finish PR 1's adapter/capability work after deciding the module strategy.
3. Then the WebGPU whisper-base experiment, with measured WER/latency/memory
   and a no-upload network audit.

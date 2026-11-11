# Implementation status against this pack

Snapshot: 2026-11-11. Update this file when a roadmap phase changes.

## Roadmap

| Pack phase | Status | Notes |
|---|---|---|
| PR 0 — baseline | **Done** | Repository reviewed, tests run (`node --check`, `npm test`), current behaviour recorded in `docs/00-project-baseline.md`. |
| PR 1 — adapters + capability detection | **Mostly done** | Engine selector, persistence, `browser-local` (`processLocally`, `available`, `install`) and disclosure shipped in PR #57. A `SpeechAdapter` contract and a local-only capability snapshot (Web Speech, on-device, WebGPU adapter, WASM, storage) shipped in PR #61. Still open: replacing the Chrome ≤149 UA gate after device testing. |
| PR 2 — model management + consent | **Done** | Manifest, exact-revision consent, SHA-256 verification, progress/cancel, storage refusal, Cache Storage install, removal that keeps transcripts, and a consent dialog. The manifest now pins `whisper-tiny-en`; the Chrome Translator download is consent-gated per language pair (PR #64). |
| PR 3 — local ASR | **Partial (WASM)** | WASM Whisper tiny.en (~43 MB, Apache-2.0) ships with worker, 5 s chunks and hash-verified cache (PR #66). Live microphone capture still needs manual verification; no partials/timestamps. WebGPU is blocked: Chrome on this Mac does not expose `navigator.gpu`. |
| PR 4 — advanced diarization | **Planned** | PyAnnote + WeSpeaker, quality gates, exemplars, overlap. Phase 1 audio queue shipped; Phase 2 shared timeline next. |
| PR 5 — timeline/reconciliation | **Planned** | Shared monotonic clock, revisions, manual-correction precedence. |
| PR 6 — validation/docs | **Planned** | Browser/device matrix, network audit, resource budget; a two-person local-Whisper test is the next evidence point. |

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
- **Local Whisper (WASM)** — pinned whisper-tiny.en, model consent, worker and engine (PR #66).
- **CI** — test/syntax workflow and single-branch workflow docs (PR #65).

## Current constraints that affect the plan

- `app.js` is a classic script tested by executing it in a Node `vm` context.
  ES-module adapters need an explicit loading/test strategy before PR 1 lands.
- CI runs `node --check` for `app.js`, `sw.js` and `theme-init.js`, then `npm test`
  on every push to `main` and every pull request (393 tests at this snapshot).
- GitHub Pages cannot set COOP/COEP headers, so `SharedArrayBuffer` and
  multi-threaded WASM are unavailable. Plan single-thread ORT.
- The service worker deliberately refuses to cache `models/`, `onnx-runtime/`
  and `.onnx`/`.safetensors`/`.bin`. Model caching belongs to the consent work.
- No model weights or recordings are in the repository; `models/manifest.json`
  is metadata only. Model weights are downloaded after consent.

## Next actionable items

1. Verify live microphone capture and Stop/mic release in a normal browser;
   measure caption latency, WER and memory with a two-person recording.
2. Replace the Chrome ≤149 UA gate when a device test matrix is available.
3. Phase 2: shared audio timeline, separate offsets from wall-clock metadata.
4. PR 4: advanced diarization (PyAnnote segmentation + WeSpeaker embeddings)
   and a measurable comparison against the current Meyda heuristic.
4. WebGPU remains blocked until a machine exposes `navigator.gpu`; keep the
   WASM engine as the working default.

# Implementation assessment — audio loss and shared timeline

Snapshot: **2026-11-11**, `main` at `3594848` (PRs #73, #74, #75 and #76
merged). The audio queue, local-first default and local Whisper speaker-analysis
fix are in `main`; this is no longer a pre-merge assessment.

This is the Phase 0/1 working record. Update it when a phase changes.

## What works today

- Browser Web Speech recognition, with an engine selector and persisted choice.
- Local Whisper is the recommended first-run default; the browser speech
  service is an explicit, labelled cloud choice.
- Chrome's experimental `processLocally` recognizer, behind explicit install.
- Local Whisper tiny.en (~43 MB, Apache-2.0) via Transformers.js/ONNX WASM in a
  worker, read from the ModelManager Cache Storage.
- Exact-revision model consent, SHA-256 verification, progress/cancel,
  storage checks and removal.
- Bounded Local Whisper audio queue with stable chunks, coverage, explicit
  missing intervals and a visible warning.
- Meyda speaker clustering is started for the local path; lanes/chat, Unknown
  lane, manual merge and a 500-card cap with storage warnings.
- Caption events (stable IDs, sequence, revision, VTT) and standalone labs for
  events, providers and the audio queue.
- Capability probing, CSP, no backend, local-first storage and WebVTT export.
- Accessible controls, live regions, focus handling, forced-colours support and
  a Node test suite (`394` tests on `main`).

## What is partial

- **Timeline.** Chunk offsets are sample-derived for the queue, but card display
  still uses a wall-clock start. Caption events carry epoch-based start/end;
  `eventToCard()` converts `endMs` to an ISO epoch timestamp, so it must not be
  fed recording-relative offsets without a timeline adapter.
- **Caption events.** Emitted alongside cards, but cards remain the storage and
  render source. Revisions are not authoritative, and `toVtt()` still exports
  cards.
- **Speaker analysis.** Meyda now receives frames on the local path, but it is
  still spectral/MFCC heuristics: no learned embeddings, turn segmentation,
  overlap handling or returning-speaker recovery.
- **Browser/live validation.** Live mic, Firefox and mobile are not yet a
  repeatable test matrix.

## What is missing

- Shared monotonic audio timeline separate from wall-clock metadata.
- Standalone diarization lab (Meyda vs WeSpeaker vs PyAnnote + WeSpeaker).
- Adaptive speaker profiles with quality-gated learning and corrections.
- Authoritative caption-event reconciliation across lane/chat/storage/VTT.
- Optional WebGPU backend and its benchmark.
- Playwright/browser-level tests and opt-in real-model tests.

## What caused incorrect or lost captions

1. **Silent single-slot loss (fixed).** When inference was busy,
   `this.queued = { samples, startMs }` overwrote the previous pending chunk.
   Replaced by `AudioChunkQueue` with explicit missing intervals and coverage.
2. **Stop cleared buffered audio (fixed).** Stop now abandons pending/in-flight
   chunks explicitly and keeps the coverage warning visible.
3. **Worker failure had no queue accounting (fixed).** Failures mark in-flight
   and queued audio missing and recreate the worker.
4. **Wall-clock chunk starts (partial).** `chunkStart` still derives from
   `Date.now()` for card display; the queue uses sample offsets. Phase 2.
5. **Local Whisper never started Meyda (fixed, PR #76).** The analyzer was
   created but only `SpeechEngine.onstart` started it, so local chunks produced
   no signature and fell into Unknown. Local start now starts the analyzer.
6. **Five-second chunks cut through speaker turns.** A card can contain two
   speakers; one label is applied to the whole chunk.
7. **Meyda is not diarization.** Similar voices, overlap and returning speakers
   remain unreliable; one Unknown lane conflates several people.
8. **Cards, not events, are authoritative.** A speaker correction cannot update
   all views/exports through a single revision path yet.

## Existing modules to reuse

- `ModelManager` / `models/manifest.json`: do not add another model cache.
- `modules/caption-events.js`: stable IDs/revisions/VTT; extend rather than
  replace.
- `modules/audio-chunk-queue.js`: bounded FIFO/coverage.
- `modules/provider-metadata.js`: local/cloud/browser-managed labels.
- `AudioWorklet` capture and `whisper-worker.js`: keep the worker/audio path.
- CSP, consent, storage and accessibility patterns.

## Documentation corrections

- `README.md` said **MIT** while `LICENSE` is **AGPL-3.0**. Fixed in PR #75.
- `FEATURES.md` predates local Whisper; updated in this cleanup.
- Browser support docs still need a tested matrix; local Whisper on Safari/mobile
  is not established.
- Test/docs counts were reconciled after the #74/#75/#76 merges.

## Plan changes

- Phase 1 is limited to **lossless audio capture/queue** and coverage reporting.
  No diarization, WebGPU or timeline refactor is included.
- Use sample-count offsets for queue coverage now. The full shared timeline
  (Phase 2) will replace the current wall-clock chunk start and make caption
  event times offset-based with an explicit wall-clock field.
- Keep five-second chunks for this phase; do not add overlapping windows until
  coverage and queue behavior are measured.
- A 15-minute simulated capture is the acceptance test, not a claim about real
  device performance.

## Phase 1 implementation

- `modules/audio-chunk-queue.js`: bounded FIFO (6 chunks / 30 s default),
  stable chunk IDs, monotonic sample offsets, drop-oldest backpressure,
  processed/pending/missing interval union, coverage and queue-depth stats.
- `LocalWhisper`: sequential pump with one in-flight chunk, worker failure
  cleanup/recreation, Stop/worker-failure abandonment, chunk IDs/offsets,
  and a user-visible `#local-audio-warning` coverage warning.
- `labs/audio-queue.html`: standalone synthetic FIFO/coverage lab.
- Tests: 394 total; queue tests cover faster/slower inference, 15-minute
  capture, capacity, rejected/overlapping chunks, gaps, failure, stop,
  restart and interval union.

## Phase 1 baseline / acceptance

- Baseline at Phase 0: 376 tests, 0 failures; `node --check` clean.
- Current: **394 tests**, 0 failures; `npm run check` clean.
- Queue capacity: 6 chunks / 30 seconds of 16 kHz audio (about 1.9 MB of
  Float32 samples), configurable.
- Overflow policy: drop the oldest **queued** chunk, never the in-flight chunk;
  record its interval as missing and update coverage.
- Stop/worker failure: abandon queued and in-flight audio as missing; preserve
  the warning after Stop.
- Acceptance: every captured interval is processed, explicitly pending, or
  recorded as missing with user-visible warning; `processed + pending + missing
  = captured` for non-overlapping chunks.
- No claim that this fixes diarization or the shared timeline.

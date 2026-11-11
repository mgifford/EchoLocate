# Implementation assessment — audio loss and shared timeline

Snapshot: **2026-11-11**, `main` at `6f144aa` (PR #73 merged). PR #74
(local-first first-run default) is open and is **not** assumed here.

This is the Phase 0/1 assessment requested for the multi-speaker work. It is
the working record; update it when a phase changes.

## What works today

- Browser Web Speech recognition, with an engine selector and persisted choice.
- Chrome's experimental `processLocally` recognizer, behind explicit install.
- Local Whisper tiny.en (~43 MB, Apache-2.0) via Transformers.js/ONNX WASM in a
  worker, read from the ModelManager Cache Storage.
- Exact-revision model consent, SHA-256 verification, progress/cancel,
  storage checks and removal.
- Capability probing, CSP, no backend, local-first storage and WebVTT export.
- Meyda-based speaker clustering, lanes/chat, Unknown lane, manual merge and a
  500-card cap with storage warnings.
- Caption events (stable IDs, sequence, revision, VTT) and a standalone
  `labs/events.html`.
- Accessible controls, live regions, focus handling, forced-colours support and
  a Node test suite (`376` tests on `main`).

## What is partial

- **LocalWhisper audio pipeline.** Phase 1 replaces the one pending slot with a
  bounded FIFO queue, chunk IDs/offsets, coverage and a visible loss warning.
  Worker recovery and a full shared timeline remain partial.
- **Timeline.** Chunk start uses `Date.now()`-derived wall time, not a shared
  sample clock. Caption events carry the current epoch-based start/end; the
  event module's `eventToCard()` converts `endMs` to an ISO epoch timestamp, so
  it must not be fed recording-relative offsets without a timeline adapter.
- **Caption events.** Emitted alongside cards, but cards remain the storage and
  render source. Revisions are not authoritative, and `toVtt()` still exports
  cards.
- **Diarization.** Meyda spectral/MFCC heuristics; no learned embeddings, no
  turn segmentation, no overlap handling, one Unknown lane.
- **Browser/live validation.** Live mic, Firefox and mobile are not yet a
  repeatable test matrix.

## What is missing

- Bounded FIFO buffering with explicit backpressure and loss reporting.
- Audio coverage, queue depth, inference duration and caption-latency metrics.
- Shared monotonic audio timeline separate from wall-clock metadata.
- Standalone diarization lab (Meyda vs WeSpeaker vs PyAnnote + WeSpeaker).
- Adaptive speaker profiles with quality-gated learning and corrections.
- Authoritative caption-event reconciliation across lane/chat/storage/VTT.
- Optional WebGPU backend and its benchmark.
- Playwright/browser-level tests and opt-in real-model tests.

## What currently causes incorrect or lost captions

1. **Silent single-slot loss.** Confirmed in `main`: when inference was busy,
   `this.queued = { samples, startMs }` overwrote the previous pending chunk.
   **Fixed in this PR** with `AudioChunkQueue`, explicit missing intervals and
   a visible coverage warning.
2. **Stop clears buffered audio.** `LocalWhisper.stop()` sets `samples = []`,
   `sampleLength = 0` and `queued = null` without recording pending audio as
   missing.
3. **Worker failure has no queue accounting.** `_fail()` rejects pending worker
   requests and sets an error, but there is no queue, no missing-interval record
   and no recreation path for the worker.
4. **Wall-clock chunk starts.** `chunkStart` is derived from `Date.now()` and
   buffer length. This is close enough for display cards but is not a shared
   audio clock and can drift with suspension.
5. **Five-second chunks cut through speaker turns.** A card can contain two
   speakers; one label is applied to the whole chunk.
6. **Meyda is not diarization.** Similar voices, overlap and returning speakers
   are unreliable; one Unknown lane conflates several people.
7. **Cards, not events, are authoritative.** A speaker correction cannot update
   all views/exports through a single revision path yet.

## Existing modules to reuse

- `ModelManager` / `models/manifest.json`: do not add another model cache.
- `modules/caption-events.js`: stable IDs/revisions/VTT; extend rather than
  replace.
- `AudioWorklet` capture and `whisper-worker.js`: keep the worker/audio path;
  add a queue around it.
- `ProviderMetadata` (PR #74, not in `main` yet): use for local/cloud labels when
  it lands.
- CSP, consent, storage and accessibility patterns.

## Documentation corrections

- `README.md` said **MIT** while `LICENSE` is **AGPL-3.0**. Fixed in this PR.
- `FEATURES.md` predates local Whisper and still describes only the Web Speech
  path. Marked for update; do not treat it as current behavior.
- `echolocate-implementation-pack/docs/12-implementation-status.md` still has
  stale test counts/next actions. Update when this phase lands.
- Browser support docs need a tested matrix; local Whisper on Safari/mobile is
  not established.
- PR #74 will change the first-run default and provider labels; rebase this
  assessment after it merges.

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

## Phase 1 implementation (this PR)

- `modules/audio-chunk-queue.js`: bounded FIFO (6 chunks / 30 s default),
  stable chunk IDs, monotonic sample offsets, drop-oldest backpressure,
  processed/pending/missing interval union, coverage and queue-depth stats.
- `LocalWhisper`: sequential pump with one in-flight chunk, worker failure
  cleanup/recreation, Stop/worker-failure abandonment, chunk IDs/offsets,
  and a user-visible `#local-audio-warning` coverage warning.
- `labs/audio-queue.html`: standalone synthetic FIFO/coverage lab.
- Tests: 387 total; queue tests cover faster/slower inference, 15-minute
  capture, capacity, rejected/overlapping chunks, gaps, failure, stop,
  restart and interval union.

## Phase 1 baseline / acceptance

- Baseline: `npm test` = 376 tests, 0 failures; `node --check` clean.
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

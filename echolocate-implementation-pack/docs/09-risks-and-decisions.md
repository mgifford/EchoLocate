# Risks, open decisions and scope control

## Key risks

1. **Audio timestamp alignment:** chunked local STT and diarization may generate different timing; require monotonic clock, revisioned reconciliation.
2. **Accuracy drift:** self-training on false positives can corrupt speaker profiles; quality gates, exemplars and manual overrides.
3. **Overlaps:** embeddings from mixed speech are unreliable; detection and abstention.
4. **Latency:** 10-second segmentation windows copied from file processing cannot serve as the only real-time label mechanism; use fast provisional labels and later correction.
5. **Model performance:** WebGPU support does not ensure model-compatible ops or sufficient memory; worker/WASM fallback needs testing.
6. **Mobile constraints:** power, caching, memory and mic routing make full advanced inference challenging.
7. **Storage and offline claims:** browser cache is evictable; encrypted? not implied. Do not promise permanent model availability.
8. **License attribution:** validate exact model/conversion/runtime licenses and preserve notices.
9. **Cloud escalation:** browser-recognition fallback can upload audio; never transition without approval.
10. **Accessibility:** caption stalls and noisy correction announcements undermine the product's purpose.

## Decisions recorded 2026-11-10

- `browser-local` is in scope and shipped experimentally; start simple and
  extend only with evidence. `webgpu-local`/`wasm-local` remain planned.
- The WebGPU experiment starts with `onnx-community/whisper-base` (Apache-2.0,
  fp16 ~146 MB, int8 ~77 MB); `whisper-tiny` (~76 MB fp16) is the constrained
  fallback. Parakeet is deferred until Whisper proves insufficient.
- One **Unknown** lane for now. Label "Unknown", card note "unattributed", VTT
  `<v Unknown>`. Multiple unattributed lanes need unknown-vs-unknown clustering
  and must not imply distinctions that were not measured.
- No model weights in the repository. Models come from a pinned Hugging Face
  revision with SHA-256 verification after consent.
- Keep the classic-script architecture and Node `vm` tests; no TypeScript
  build. `contracts/interfaces.ts` is illustrative, not source to merge.
- GitHub Pages cannot set COOP/COEP, so `SharedArrayBuffer` and multi-threaded
  WASM are unavailable; plan single-thread ORT or document the departure.
- No silent cloud fallback. Any local↔cloud change needs explicit consent.
- Captions render before optional translation; translation is patched in later.
- Storage failures and the 500-card trim are visible and announced.

## Open decisions

- Is ASR worker streaming available or only periodic chunk decoding? What is the measured delay?
- What memory/latency budget should define acceptable mobile performance?
- How will browser Web Speech on supported platforms coexist with one local mic stream?
- What are evidence-based speaker thresholds, minimum clean speech duration and maximum exemplar count?
- Should profile updates be retrospective? How far back can automatic revisions alter the transcript?
- What level of overlap precision can the UI honestly display?
- Should speaker correction history be persisted per session? How and for how long?
- Is optional local-audio retention needed for reproducibility? Only with separate opt-in and delete controls.

## Scope deferred

- Cross-session face/voice identification; automatic person naming; demographic classification.
- General LLM as speaker recognizer or source of diarization confidence.
- Automatic install of all models, automatic cloud fallback and unattended background downloads.
- Full replacement of existing Service Worker rendering or the entire `app.js` in one PR.
- Promise of cross-browser parity before test evidence is obtained.

# Agent prompt: Implement optional WebGPU STT and advanced speaker diarization in EchoLocate

You are an autonomous software-engineering agent operating on **https://github.com/mgifford/EchoLocate**. Your task is to build **optional local WebGPU speech-to-text** and **advanced in-browser speaker diarization**, using the attached planning package as requirements. Begin by reading `AGENTS.md`, `TODO.md`, `README.md`, `SPEECH_TO_TEXT_IMPLEMENTATION.md`, `STT_ADAPTER_MIGRATION_PLAN.md`, `app.js`, `sw.js`, `index.html`, `tests/`, and `echolocate-implementation-pack/docs/12-implementation-status.md`. Inspect the **current** repository, not just this dated package, and reconcile any differences. Do not overwrite or remove newer functionality.

The repository is a classic-script JavaScript app tested with Node's `vm`, not a TypeScript/ESM project. Do not assume a build step. `contracts/interfaces.ts` is illustrative only.

## Non-negotiable goals

1. **Choice:** Let users independently choose STT engine (`browser-service`, where supported `browser-local`, `webgpu-local`, optional `wasm-local`) and speaker analysis (`off`, `basic`, `advanced`). This assignment's target test configuration is `webgpu-local + advanced`. Do not force it as a universal default.
2. **No surprise downloads:** No ASR or speaker-model weights requested until the user affirmatively approves the exact model and its source, revision, size and license. Metadata may be fetched separately. Keep all models optional, cached per revision, independently deletable, and guarded by integrity verification.
3. **Local processing:** For local-only mode, do not upload audio, transcripts or speaker embeddings; verify network behavior. Browser Web Speech may be cloud-backed and must be disclosed; a fallback to it requires explicit consent.
4. **Accessibility first:** Live captions cannot block waiting for diarization; provide status/error and keyboard/screen-reader friendly model selection, progress, transcription states and speaker-correction controls. Preserve existing transcript and WebVTT paths.
5. **Robust speaker clustering:** Use local dedicated models (start with `onnx-community/pyannote-segmentation-3.0` and `onnx-community/wespeaker-voxceleb-resnet34-LM`; benchmark against Meyda). Accumulate session-local evidence with quality gating and multiple representative embeddings. Preserve Unknown and overlapping speaker states. Never force a new voice into an existing profile when the speaker cap is reached. Do not treat cosine similarity as a calibrated probability.
6. **Timing and reconciliation:** Capture with a shared monotonic clock. Separate ASR finalization from diarization turns. Support provisional labels and later revisions, never overriding user-confirmed labels or losing/duplicating captions.
7. **Static-hosting friendly:** Preserve GitHub Pages compatibility if possible; clearly document any tradeoffs, WebGPU constraints, and worker/Service Worker cache changes.
8. **Evidence:** Add reproducible tests and explicit experiment methodology. No unsupported claims of accuracy, energy savings or universal browser compatibility.

## Source references

- EchoLocate: https://github.com/mgifford/EchoLocate
- Whisper Web and reference worker: https://github.com/adamchaboryk/whisper-web and https://github.com/adamchaboryk/whisper-web/blob/main/src/worker.js
- Transformers.js: https://huggingface.co/docs/transformers.js/index
- ONNX speaker segmentation: https://huggingface.co/onnx-community/pyannote-segmentation-3.0
- ONNX speaker embeddings: https://huggingface.co/onnx-community/wespeaker-voxceleb-resnet34-LM
- Alternative: https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb
- Evaluation benchmark: https://huggingface.co/pyannote/speaker-diarization-community-1

Review current upstream licensing, pinned revisions, ONNX conversions, third-party code permissions, dependency versions and browser support before adoption. Do **not** copy unrelated parts of Whisper Web or bundle any downloaded weights in Git without a separate license and size review.

## Execution protocol

- Read every package document. Work in small feature branches, one scoped PR per phase in `docs/06-phased-roadmap.md`.
- Start with repository inspection and baseline tests (`node --check app.js`, `node --check sw.js`, `npm test`, where present). Report failures before editing.
- Implement and test the interface contracts first. Refactor current Web Speech behind adapter without changing behavior.
- Implement capability detection using feature checks, not browser-name assumptions. Distinguish 'WebGPU adapter found' from 'model inference tested'. Do not download model weights during capability probing.
- Implement ModelManager and consent UI next; test that unauthorized weight requests are impossible even on reload, error and fallback paths.
- Integrate local WebGPU STT in an inference worker. Select a concrete compatible Whisper/Parakeet variant only after comparing license, browser runtime compatibility, model size, latency, memory, accuracy and streaming behavior.
- Add speaker segmentation and embedding workers. Begin with local WASM inference as shown by Whisper Web; profile and optimize only after accurate baseline.
- Implement stable speaker IDs, Unknown/overlap, sample quality checks, session-only profiles, optional user confirmation, and an auditable reconciliation path.
- Integrate UI incrementally. Never make a local model mandatory for browser-service users, or vice versa.
- Extend tests and produce a measured evaluation report using consented/labeled recordings. Include null/unknown findings rather than making up results.
- Check security, privacy, CSS/HTML a11y and mobile resource behavior. Run tests on realistic browsers and devices, noting what could not be run.

## Required tests and experiment matrix

See `tests/TEST_PLAN.md`, `tests/fixtures/*.json`, `experiments/EXPERIMENT_PLAN.md`, and `experiments/matrix.csv`. Add controlled tests for download refusal, low storage, cache eviction, offline use, GPU initialization/device loss, mic permission denied, rapid speaker changes, overlap, returning speakers, short interjections, similar voices, silence, profile drift, max speaker count, manual correction precedence, stale result racing, and transcript retention. Include network monitoring for local-only mode. Measure DER components, false merge/split, abstention, WER, p50/p95 caption latency, resource use, model load time. Keep results associated with exact source revisions and device conditions.

## Pull request acceptance and output format

At the end of each phase provide:

1. Source branch/commit/PR link and a concise description of actual changes.
2. Files added/changed and rationale; explicitly list removals, deferrals and reasons.
3. Automated test output and manually tested browser/device matrix.
4. Observed risks and unresolved issues; avoid hiding blockers.
5. Privacy, license and download verification status.
6. Next narrowly scoped PR, *without silently starting a larger rewrite*.

Do not declare success if a browser model has not run end-to-end with a real, consented multi-speaker recording. If tools or hardware prevent some steps, commit the verified portions, document limitations and avoid false confidence.

## Implement phases

Follow PR 0 through PR 6 in `docs/06-phased-roadmap.md`. Prioritize PR 1 (adapters/capabilities) and PR 2 (download consent) before any production default changes. Do not expand to cross-session voice ID, automatic identity inference, or a general-purpose LLM for speaker identity.

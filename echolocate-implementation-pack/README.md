# EchoLocate: Optional local AI STT and adaptive speaker diarization

This is a **planning and experimental package**, not a completed implementation or a verified benchmark. It is intended to be copied into or reviewed against [mgifford/EchoLocate](https://github.com/mgifford/EchoLocate) on a feature branch.

> **Status 2026-11-10:** reconciled with the repository after PRs #55, #57, #58,
> #59, #61, #62 and #63, plus model/translation consent and CSP. See
> `docs/12-implementation-status.md` for what is shipped, partial or still
> planned. The package is versioned in the repository so future agents do not
> repeat stale baseline work.

## Goals

- Let a user choose **local WebGPU speech-to-text (STT)** and **advanced local speaker identification**, independently.
- **No application-managed model-weight downloads without informed user action**. An existing browser transcription service remains available when supported and permitted.
- Keep captions responsive while speaker labels are provisional; recognize returning panelists as evidence accumulates.
- Preserve the present Web Speech, Meyda, speaker-lane, service-worker, transcript, accessibility, and export flows during migration.
- Never silently switch local-only transcription to a cloud service, and never force ambiguous audio into a known speaker profile.
- Run as a static-hostable browser app when feasible; make any departure from GitHub Pages compatibility explicit.

## Start here

1. Read `docs/00-project-baseline.md` and `docs/12-implementation-status.md`, then compare against the latest upstream branch.
2. Read `docs/01-architecture.md` through `docs/09-risks-and-decisions.md`.
3. Give an implementing agent `prompts/AGENT_BUILD_PROMPT.md`.
4. Follow `docs/06-phased-roadmap.md` one small PR at a time.
5. Use `experiments/EXPERIMENT_PLAN.md`, `experiments/matrix.csv`, and `tests/TEST_PLAN.md` before making accuracy claims.
6. Use `config/models.example.json` as a **non-deployable manifest shape only**; model checksums, exact artifact sizes and compatibility must be verified and filled in first.

## Package map

- `docs/`: product decisions, architecture, model loading, diarization, synchronization, accessibility, security/privacy, roadmap, risks, references.
- `prompts/AGENT_BUILD_PROMPT.md`: detailed agentic implementation prompt with acceptance gates and stopping rules.
- `experiments/`: evaluation methodology, test conditions, baseline and experiment tracking sheet.
- `tests/`: test plan and synthetic **metadata** fixtures. No recordings, biometric data or model weights are bundled.
- `contracts/`: **illustrative interfaces** for integration discussion, not source code to merge unchanged.
- `config/`: sample model manifest schema shape only.

## Explicit exclusions

No audio samples, model weights, copied upstream third-party code, calibrated speaker-confidence thresholds, real-world benchmark scores, guaranteed browser compatibility, or claims of verified offline support. Those require consent, version-specific testing, and evidence.

## Primary references

- EchoLocate: https://github.com/mgifford/EchoLocate
- Current code: https://github.com/mgifford/EchoLocate/blob/main/app.js
- STT implementation notes: https://github.com/mgifford/EchoLocate/blob/main/SPEECH_TO_TEXT_IMPLEMENTATION.md
- STT migration plan: https://github.com/mgifford/EchoLocate/blob/main/STT_ADAPTER_MIGRATION_PLAN.md
- Whisper Web: https://github.com/adamchaboryk/whisper-web
- Whisper Web worker: https://github.com/adamchaboryk/whisper-web/blob/main/src/worker.js
- Transformers.js: https://huggingface.co/docs/transformers.js/index
- WebGPU documentation: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- PyAnnote ONNX: https://huggingface.co/onnx-community/pyannote-segmentation-3.0
- WeSpeaker ONNX: https://huggingface.co/onnx-community/wespeaker-voxceleb-resnet34-LM
- SpeechBrain ECAPA: https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb
- PyAnnote Community-1: https://huggingface.co/pyannote/speaker-diarization-community-1

Licenses, model cards, APIs and browser support may change. Verify from primary sources before distribution.

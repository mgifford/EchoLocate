# Testing and evidence requirements

See `tests/TEST_PLAN.md`, `experiments/EXPERIMENT_PLAN.md`, and `experiments/matrix.csv`.

## Metrics

- Diarization error rate (DER) with separately disclosed missed speech, false alarm and confusion.
- Speaker confusion, false splits, false merges, unknown/abstention and manual-correction frequency.
- Time to established profile, returning-speaker recognition, overlap identification.
- Word error rate (WER) / character error rate as appropriate; transcript latency p50/p95, speaker-assignment latency p50/p95.
- Model download size, load time, cache hit/miss and eviction recovery.
- Peak CPU/GPU/JS heap memory, sustained frame responsiveness, mobile battery/energy proxies where defensible.
- Privacy/network traffic when local-only; microphone failure and GPU device loss recovery.
- Keyboard, screen reader, high contrast, zoom, mobile and cognitive-load testing, with manual tests.

## Comparative baseline

Same labeled audio should run through:

A. Current Meyda + Web Speech baseline (where supported).
B. Same STT + WeSpeaker-only diarization.
C. Same STT + PyAnnote+WeSpeaker diarization.
D. Local WebGPU STT + advanced diarization with and without profile adaptation.

Avoid confounding engine effect with diarization effect: keep STT fixed during speaker comparisons and diarization fixed during STT comparisons where possible.

Do not publish thresholds as calibrated without a held-out evaluation set. Record exact revision, device, OS, browser, sample rate, language, number of speakers and room/mic conditions.

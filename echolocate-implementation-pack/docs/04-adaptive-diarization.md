# Advanced diarization: adaptive session profiles

## Desired semantics

Acoustic **speaker diarization** groups similar voices in a session. It does not determine real-world identities. Labels such as Speaker 1 are provisional; user-entered names are explicit metadata. Do not infer gender, accent, age, or identity from speech. General-purpose LLMs are **not** the speaker-ID model.

## Pipeline

1. Segment audio into speech vs non-speech; identify probable turn boundaries and overlapping speech.
2. For usable single-speaker segments, compute speaker embeddings using a trained speaker encoder.
3. Compare to representative **sets** of prior, high-quality embeddings; apply calibrated matching threshold and between-speaker margin.
4. Assign an established profile, provisional profile or Unknown; if overlap, preserve multi-speaker interval instead of blending voices into one enrollment sample.
5. Update speaker profiles only on sufficiently long, clean, confidently attributed, single-speaker audio. Reject low quality and uncertain segments.
6. Keep representative diversity (e.g., a bounded exemplar reservoir), quality metrics, timestamps, and update provenance. Avoid exponential drift from every guess.
7. Maintain a diarization timeline separately from ASR text; reconcile earlier provisional labels with accumulated evidence. Record revisions.
8. Explicit user corrections override later automatic reconciliation unless the user reopens the decision.

## Recommended profile fields

`id`, `displayName`, `state` (`provisional|established|uncertain|user-confirmed`), `embeddingExemplars`, `embeddingModelRevision`, `usableSpeechMs`, `acceptedSamples`, `rejectedSamples`, `clusterSeparation`, `qualitySummary`, `lastSeenMs`, `correctionHistory`.

## Do not

- Treat cosine similarity as a calibrated probability.
- Artificially increase confidence over elapsed time.
- Force a new voice into the closest cluster when max speaker count is reached.
- Update on overlapping voices or very short/high-noise utterances.
- Use words or inferred roles as proof of acoustic speaker identity.
- Persist speaker embeddings across sessions without a separate, explicit decision and deletion policy.

## Calibration and experiments

Thresholds, minimum speech length, embedding count, and release gates must come from labeled audio. Evaluate false merges, false splits, speaker confusion and abstention jointly. Higher abstention can reduce misattribution but impact usability; measure both. Compare MFCC baseline, WeSpeaker-only and PyAnnote+WeSpeaker with identical test fixtures.

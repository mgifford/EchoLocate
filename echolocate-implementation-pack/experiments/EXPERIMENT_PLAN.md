# Speaker and STT experimental protocol

## Questions to answer

1. Do dedicated speaker embeddings improve diarization over the current Meyda fingerprint?
2. Does segmentation+embedding outperform embedding-only on interruptions and overlap?
3. Does adaptive session learning improve **held-out later segments**, or merely reinforce early mistakes?
4. Is local WebGPU STT usable at live-caption latencies on representative desktop and mobile devices?
5. Does running diarization concurrently cause ASR latency, memory or energy regressions?
6. What is the cost of privacy-first local execution in model bytes, initialization time and power?

## Dataset

Use licensed public meeting corpora with known speaker turns plus a small **consented** realistic test set representing panel mic layouts. AMI and VoxConverse can be explored subject to each dataset's terms and provenance. Include quiet/loud audio, mixed genders without demographic modeling, similar timbre, accents, noise, distance, crosstalk, short replies and overlap. Include multiple languages if the product supports them. Never package biometric recordings in public repo by default.

## Split and methodology

- Create train/calibration/evaluation separation by **speaker and recording**, not random chunks from a single meeting; otherwise threshold performance will be overestimated.
- Fix exact source recordings, annotation conventions, sample rates and number of speakers per condition.
- Evaluate DER: miss/false alarm/confusion, with clearly documented overlap treatment and collar.
- Record speaker confusion, false splits/merges, Unknown rate, returning-speaker detection, time to stable profile, correction count.
- Separately compare ASR engines using WER/CER and caption latency. Do not infer diarization accuracy from transcription accuracy.
- Compare adaptation OFF vs ON with the **same segmentation and embedding pipeline**; freeze early ground truth and score later unseen turns.
- Cross-test cold cache, warm cache, offline and memory-constrained sessions.
- Report raw counts and uncertainty; do not claim numeric confidence until calibrated on held-out data.

## Experiment IDs

- E01: Baseline Meyda profile stability in a clean three-speaker panel.
- E02: WeSpeaker-only embedding clustering on the same panel.
- E03: PyAnnote + WeSpeaker on the same panel; overlaps and rapid turns.
- E04: Adaptive profile updates OFF vs ON; first minute vs late turns.
- E05: Unseen voice after max speaker cap; verify Unknown.
- E06: Similar voices / short interjections; quantify false merges and abstention.
- E07: Transcript alignment when speakers change mid-ASR segment.
- E08: WebGPU transcription vs browser service (with consent) and WASM fallback, using WER and latency.
- E09: Offline cold/warm model cache and interrupted downloads.
- E10: Browser/device compatibility, GPU device loss, energy/memory and accessibility.

## Evidence artifacts per run

Create immutable run ID; record timestamp, source commit, model revisions/hashes, browser version, OS, hardware/GPU, runtime backend, languages, mic condition, speaker count, data provenance/consent, test type, result file hashes, recorded failures, privacy/network findings. Keep raw recordings separately under consent controls. Publish summary results and reproduction method without exposing participants.

`matrix.csv` is a **blank experiment planning sheet**, not simulated results.

# Baseline and problem statement

## Current repository snapshot (2026-11-10, after PRs #55, #57, #58, #59)

EchoLocate is a static, client-side accessibility live-captioning app deployed
on GitHub Pages. It has no backend service.

Current runtime:

- **Speech engines:** `browser-service` (Web Speech API; Chrome/Edge may use a
  vendor cloud service) is the default. An experimental `browser-local` engine
  uses Chrome's `processLocally` recognizer with
  `SpeechRecognition.available()`/`install()`; the language pack is
  browser-managed and only installed on user action. `webgpu-local` and
  `wasm-local` are not implemented.
- **Speaker grouping:** per-utterance MFCC + spectral vectors, a 0.72/0.28
  profile blend, ~400 ms hysteresis, three-result smoothing and a ceiling of 6
  speaker profiles. At the cap an unmatched voice is attributed to a single
  session-local **Unknown** lane, is never enrolled, and consumes no speaker
  slot. A missing voice signature also goes to Unknown. This is still heuristic
  grouping, not calibrated diarization.
- **Caption pipeline:** final captions render and persist before optional
  translation; translation patches the card afterwards via a stable
  `data-segment-id`. Commits are serialized so two finals cannot interleave.
- **Other features:** Chrome Translator API (opt-in), system/computer audio via
  `getDisplayMedia`, chat view, debug console, vendored `franc-min` language
  detection with a heuristic fallback, audio-device picker.
- **Storage:** localStorage cards (500-card cap). Quota failures and the trim
  are shown in the footer and announced; merge/clear abort if the write fails.
- **Service worker:** `echolocate-v2` cache, cleanup of old caches, a real 503
  on an offline cache miss, and no caching of `models/`, `onnx-runtime/` or
  `.onnx`/`.safetensors`/`.bin` files.
- **Models:** `models/manifest.json` (empty in this build), exact-revision
  consent, SHA-256 verification, progress/cancel, storage refusal, Cache
  Storage install and removal that leaves transcripts untouched. No model
  weights ship; the Chrome Translator download is still to be inventoried.
- **Accessibility:** Label in Name fixes, one interim live region, non-modal
  translation popup with focus return, reopenable privacy notice, forced-colors
  fallbacks, and a bounded service-worker boot wait.
- **Security:** meta CSP with self-only defaults, a hashed import map, external
  theme bootstrap, no eval/inline scripts, `wasm-unsafe-eval`, inline styles and
  local-only `connect-src`.
- **Tests:** 348 Node tests (`sw`, `app`, `contrast`, `project`, `a11y`). There
  is no CI workflow yet.

## Historical problem statement (original review, still useful context)

EchoLocate's speaker grouping uses the microphone's Web Audio/Meyda features:
13 MFCCs, spectral measurements, utterance averaging and cosine similarity. It
updates an existing signature with a **0.72 historical / 0.28 current** blend,
uses approximately **400 ms hysteresis** and history smoothing, supports
speaker lanes and manual merging, and exports WebVTT. Browser-specific audio
conflicts can disable the analysis graph in captions-only mode.

Observed logic in `app.js`: `resolveSpeakerProfile()`,
`flushUtteranceMetrics()`, `TranscriptCtrl.commitCard()`, the Web Speech
`SpeechEngine`, and Meyda sampling. Matching threshold ~0.85, max speakers 6.
**These are heuristics, not calibrated probabilities.**

## Critical deficiencies and their status

1. Per-utterance averaged MFCC/spectral descriptors are not robust speaker
   embeddings. **Open.**
2. The 28% update can drift a profile after a false assignment. **Open** (the
   forced-assignment path that amplified it is fixed).
3. At the speaker cap, a low-similarity voice was attached to a known speaker.
   **Fixed** in PR #55: unmatched voices go to Unknown and are not enrolled.
4. ASR finals are not speaker-turn boundaries; two speakers may share one final.
   **Open** (timeline/diarization work).
5. Speaker confidence is not calibrated; ASR confidence must not be treated as
   diarization confidence. **Open.**
6. A single blended prototype loses speaker variation and provenance. **Open.**
7. Browser/model availability must not be inferred from the user agent.
   **Mostly fixed:** the engine selector and capability snapshot use feature
   checks (`available()`/`install()`, WebGPU adapter, WASM, storage); the
   Chrome ≤149 mic-analysis workaround is still UA-version based and is now
   reported as `compatibility.captionsOnly`.
8. "Audio stays on-device" conflicted with cloud-backed Web Speech. **Fixed**
   in PR #55 across the notice and docs.

## Success criteria

- A single audio-only panel of 3-4 speakers produces live text and stable,
  revisable speaker labels.
- Returning speakers are re-identified; a distinct unknown voice is not merged.
- Captions remain available if advanced diarization fails or lags.
- Users can correct, name (explicitly), merge, split and inspect assignments;
  corrections take precedence.
- `webgpu-local`+`advanced` processes audio locally; a network audit confirms
  model downloads only and no remote ASR audio.
- No model-weight download occurs until the user reviews metadata and opts in.
- Measured DER, confusion, false split/merge, abstention, latency, transcript
  accuracy, CPU/GPU/memory and energy are published with device conditions.

## Non-goals for initial rollout

No cross-session voice identification, automatic person naming, demographic
inference, LLM attribution from transcript semantics, silent cloud fallback,
model fine-tuning, or promises of perfect diarization.

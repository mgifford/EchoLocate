# Speech-to-Text Implementation (Current State)

This document explains how speech-to-text currently works in EchoLocate, from app startup through final caption rendering and storage.

It is intended as a baseline before exploring alternative engines such as Whisper.cpp and MacParakeet.

## 1. Executive Summary

EchoLocate currently uses the browser Web Speech API as its speech recognition engine:

- `window.SpeechRecognition` or `window.webkitSpeechRecognition`
- recognition events (`onstart`, `onresult`, `onerror`, `onend`) drive the transcript flow
- transcript rendering stays local by posting to local Service Worker routes

Important distinction:

- EchoLocate itself is a client-side app with no backend speech service.
- In browsers like Chrome/Edge, Web Speech recognition may still depend on vendor cloud services behind the browser API.

## 2. Main Runtime Components

- `index.html`
  - UI controls for start/stop, language, translation, and rendering modes
  - live regions for status and transcript updates
- `app.js`
  - recognition lifecycle (SpeechEngine)
  - interim/final transcript handling (TranscriptCtrl)
  - optional language detection helper
  - voice clustering and speaker-lane assignment
  - local persistence and export
- `sw.js`
  - local fragment rendering endpoints (`/api/add-card`, `/api/add-chat-msg`)
  - sanitizes all user-controlled fields before HTML output

## 3. Boot Sequence

During `boot()` in `app.js`, EchoLocate does the following in order:

1. Install debug log hooks.
2. Check secure context and browser support (`checkBrowserSupport`).
3. Initialize theme and speech-help modal.
4. Initialize language selector and optional language detection.
5. Initialize translation controls.
6. Initialize view/options/audio-device/speaker-limit controls.
7. Register and await Service Worker control (`registerServiceWorker`).
8. Initialize `TranscriptCtrl`.
9. Initialize `SpeechEngine` if Web Speech is available.
10. Bind UI controls and restore session cards from localStorage.

## 4. Speech Recognition Engine (Current)

`SpeechEngine` owns recognizer setup and restart logic.

### 4.1 Recognizer construction

Inside `SpeechEngine.init()`:

- `const SR = window.SpeechRecognition || window.webkitSpeechRecognition`
- `rec.continuous = !State.captionsOnly`
- `rec.interimResults = true`
- `rec.lang = State.recognitionLang || DEFAULT_RECOGNITION_LANG`
- `rec.maxAlternatives = 1`

### 4.2 Event lifecycle

- `onstart`
  - marks active session timing
  - starts pitch/signature sampling
  - starts language-hint timer
  - resumes suspended AudioContext if needed
- `onresult`
  - resets watchdog and retry counters
  - accumulates interim transcript text
  - for each final result, calls `TranscriptCtrl.commitCard(transcript, confidence)`
- `onerror`
  - handles `not-allowed`, `network`, and other failures
  - uses bounded retry with exponential backoff
  - shows browser-specific help dialogs for known failure modes
- `onend`
  - if still running, schedules restart
  - applies quick-end and no-result backoff logic
  - if stopped, tears down active UI sampling state and clears interim text

### 4.3 Reliability behaviors

EchoLocate has several protective mechanisms around Web Speech:

- watchdog timeout (`CFG.WATCHDOG_MS`) triggers stop/restart when stalled
- quick-restart backoff for very short failed sessions
- no-result backoff for repeated sessions without transcript results
- network retry strategy with online/offline handling
- browser-specific workarounds:
  - desktop Chrome <=149 uses captions-only mode (`continuous: false` and no mic analysis graph)
  - mobile Chrome may suspend AudioContext briefly before recognizer start to reduce mic-routing conflicts

## 5. Transcript Pipeline

### 5.1 Interim text

`TranscriptCtrl.showInterim(text)`:

- keeps bottom live strip as fallback
- prefers inline interim card in the active speaker lane
- removes interim card when text clears

### 5.2 Final text commit

`TranscriptCtrl.commitCard(text, confidence)` performs:

1. flush utterance metrics (`flushUtteranceMetrics`) from sampling buffers
2. resolve speaker profile (`resolveSpeakerProfile`) using voice signature similarity and hysteresis
3. detect/update language tags (`detectLanguageTag`, `updateLaneLanguage`)
4. construct card payload (text, timing, confidence, speaker, audio-source, matching metadata)
5. optional translation per effective lane/global settings
6. render to lanes via `postCard` and to chat feed via `postChatMsg`
7. persist card in localStorage (`Storage.save`)

## 6. Audio Analysis and Speaker Grouping (Not STT, but tightly coupled)

The recognized transcript is augmented by a parallel audio-analysis pipeline:

- mic stream via `getUserMedia`
- Web Audio analyzer + Meyda features (`mfcc`, spectral metrics, `rms`, `zcr`)
- per-utterance signature vector + cosine similarity against existing speaker profiles
- profile smoothing and hysteresis to reduce lane flicker

When captions-only mode is active, this clustering path is minimized/disabled to protect speech recognition reliability.

## 7. Language Selection and Detection

- User-selected recognition language is stored in localStorage (`echolocate-rec-lang`).
- If available, `SpeechRecognition.available(...)` is used to narrow selectable languages.
- Optional text-based language detection uses `franc-min` (vendored first, CDN fallback) and then simple heuristics.
- Language mismatch hints are displayed when detected language differs from selected recognition language.

## 8. Rendering and Safety

Final cards are rendered through local Service Worker endpoints:

- POST `/api/add-card`
- POST `/api/add-chat-msg`

`sw.js` sanitizes and constrains payload fields before generating HTML fragments, including:

- speaker IDs and tone enums
- confidence bounds
- color format validation
- translation language code pattern checks
- HTML escaping for transcript and metadata text

## 9. Persistence and Export

- Transcript cards are stored in localStorage key `echolocate_v1`.
- Cards are restored into lanes and chat on startup.
- Export format is WebVTT with speaker tags and escaped cue payloads.

## 10. Current Constraints Relevant to Engine Replacement

The current STT engine is deeply tied to Web Speech event semantics:

- `onresult` drives interim/final behavior
- `onend` drives restart loops
- confidence values are assumed to exist per final result

A replacement engine (Whisper.cpp or MacParakeet) will need to provide equivalent concepts:

- interim partials
- final segments
- confidence-like scoring (or a mapped proxy)
- start/stop/error/end lifecycle hooks

## 11. Suggested Integration Seam for Whisper.cpp / MacParakeet

Introduce an engine adapter layer so TranscriptCtrl and UI logic stay mostly unchanged.

Proposed interface (conceptual):

```js
SpeechAdapter.init(config)
SpeechAdapter.start()
SpeechAdapter.stop()
SpeechAdapter.setLanguage(tag)
SpeechAdapter.onInterim((text) => {})
SpeechAdapter.onFinal(({ text, confidence, startedAt, endedAt }) => {})
SpeechAdapter.onError((err) => {})
SpeechAdapter.onEnd(() => {})
```

### 11.1 Minimal refactor path

1. Keep `TranscriptCtrl` as-is.
2. Replace direct `SpeechRecognition` usage in `SpeechEngine` with adapter calls.
3. Map adapter callbacks to existing `TranscriptCtrl.showInterim` and `TranscriptCtrl.commitCard`.
4. Keep existing restart/backoff logic in `SpeechEngine` initially, then tune per-engine behavior.

### 11.2 Engine-specific notes

- Whisper.cpp
  - likely strongest path for fully local recognition
  - choose deployment strategy early (WASM in-browser vs local helper process)
  - define model loading UX and memory budget strategy
- MacParakeet
  - likely platform-specific (macOS)
  - decide whether this is a selectable local engine profile or a separate build/runtime mode

## 12. Recommended Next Steps

1. Add a new `STT_ENGINE` state/config option (`webspeech`, `whisper`, `macparakeet`).
2. Create `speech-adapters/` with one adapter first (`webspeech`) that mirrors current behavior.
3. Move existing Web Speech logic from `SpeechEngine.init()` into that adapter.
4. Keep all rendering/speaker-clustering/storage unchanged until adapter parity is proven.
5. Add targeted tests for adapter event mapping:
   - interim update path
   - final commit path
   - restart/error handling path

---

If you want, the next step can be a concrete adapter skeleton file layout and a phased migration checklist tied to the current `app.js` sections.

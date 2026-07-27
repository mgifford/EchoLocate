# STT Adapter Migration Plan

This plan converts the current Web Speech tightly-coupled flow into an engine-adapter architecture, while preserving existing behavior.

Goal:

- keep UI, lane clustering, rendering, and storage stable
- isolate STT engine differences behind a common interface
- enable future engines: Whisper.cpp and MacParakeet

## Scope and Non-Goals

In scope:

- add a speech adapter contract
- extract current Web Speech implementation into an adapter
- route SpeechEngine through adapter callbacks
- keep TranscriptCtrl integration unchanged where possible

Out of scope for first migration:

- rewriting speaker clustering
- changing Service Worker rendering routes
- changing export/storage format

## Target File Layout

Add:

- speech-adapters/base.js
- speech-adapters/webspeech-adapter.js
- speech-adapters/index.js
- docs for adapter contract (this file can serve as v1)

Touch existing:

- app.js
- tests/app.test.js

Optional later:

- speech-adapters/whisper-adapter.js
- speech-adapters/macparakeet-adapter.js

## Adapter Contract (v1)

Each adapter should expose:

```js
export function createAdapter(config) {
  return {
    name: 'webspeech',
    init() {},
    start() {},
    stop() {},
    setLanguage(langTag) {},
    destroy() {},
    isAvailable() { return true; },
  };
}
```

Adapter event callbacks supplied in config:

```js
{
  onStart: () => {},
  onInterim: ({ text }) => {},
  onFinal: ({ text, confidence, startedAt, endedAt }) => {},
  onError: ({ code, message, recoverable }) => {},
  onEnd: ({ reason }) => {},
}
```

Notes:

- `confidence` may be `null` for engines that do not provide confidence; SpeechEngine should map fallback value.
- `startedAt`/`endedAt` can be adapter-native or synthesized in SpeechEngine.

## Phase 0: Guardrails Before Refactor

Objective:

- establish confidence that behavior is preserved after extraction.

Changes:

1. Add a checklist section in this plan as migration acceptance criteria.
2. Capture current command checks:
   - `node --check app.js`
   - `node --check sw.js`
   - `npm test`

Acceptance:

- all baseline checks pass before edits.

## Phase 1: Introduce Engine Selection State

Objective:

- support selecting STT engine without changing behavior.

App.js touchpoints:

- add state key near existing recognition settings:
  - `State.sttEngine = localStorage.getItem('echolocate-stt-engine') || 'webspeech'`
- add constants:
  - `STT_ENGINES = ['webspeech', 'whisper', 'macparakeet']`

Behavior:

- default remains `webspeech`.
- no UI change required in this phase.

Acceptance:

- app runs exactly as before with default state.

## Phase 2: Add Adapter Modules

Objective:

- create adapter module structure and implement Web Speech adapter first.

New file: speech-adapters/base.js

- document contract and shared helper validators.

New file: speech-adapters/webspeech-adapter.js

- move recognizer setup from current `SpeechEngine.init()` logic:
  - `SpeechRecognition` construction
  - `continuous`, `interimResults`, `lang`, `maxAlternatives`
  - event hookup (`onstart`, `onresult`, `onerror`, `onend`)
- convert event payloads to contract callbacks.

New file: speech-adapters/index.js

- `createSpeechAdapter(engineName, config)` factory.
- return webspeech adapter for now.
- return graceful unavailable adapter for not-yet-implemented engines.

Acceptance:

- adapter unit can initialize/start/stop in browser context.
- no app-level behavior changes yet.

## Phase 3: Route SpeechEngine Through Adapter

Objective:

- SpeechEngine becomes engine-agnostic orchestration layer.

App.js migration steps:

1. Add `SpeechEngine._adapter = null`.
2. Replace direct recognizer init with adapter creation:
   - `SpeechEngine.init()` creates adapter from `State.sttEngine`.
3. Move existing inline recognizer event code into SpeechEngine callback handlers:
   - keep existing watchdog/retry logic
   - keep existing status messaging and browser-specific help behavior
4. `SpeechEngine.start()` calls `_adapter.start()`.
5. `SpeechEngine.stop()` calls `_adapter.stop()`.
6. `applyRecognitionLanguage(...)` calls `_adapter.setLanguage(...)` when available.

Key mapping table:

- adapter `onInterim` -> `TranscriptCtrl.showInterim(text)`
- adapter `onFinal` -> `TranscriptCtrl.commitCard(text, confidence)`
- adapter `onError` -> existing error/backoff handler path
- adapter `onEnd` -> existing restart path

Acceptance:

- default webspeech path matches prior runtime behavior.
- no regression in Start/Stop/restore/export/clear controls.

## Phase 4: Keep Browser Workarounds in Orchestrator

Objective:

- avoid engine-specific policy leaks into adapters unless necessary.

Keep in SpeechEngine (not adapter):

- captions-only mode decisions (`usesMicAnalysisGraph()`)
- AudioContext suspend/resume sequencing (`shouldSuspendAudioContextForSpeech()`)
- quick/no-result/network backoff counters
- status text and help modal triggering

Rationale:

- these are app policy decisions and UX behavior, not STT engine internals.

Acceptance:

- browser-specific reliability behavior remains intact.

## Phase 5: Minimal Engine Picker (Optional but Recommended)

Objective:

- allow test-driving non-default adapters in dev.

App.js/index.html changes:

- add hidden or advanced option select for STT engine:
  - Web Speech (default)
  - Whisper.cpp (placeholder)
  - MacParakeet (placeholder)
- persist to `echolocate-stt-engine`.

Behavior for unimplemented engine:

- show clear status: "Engine not available in this build".
- do not break existing Start/Stop flow.

Acceptance:

- selecting unsupported engine fails gracefully.

## Phase 6: Test Updates

Existing tests to update: tests/app.test.js

Add/adjust tests for:

1. engine-state defaulting
   - defaults to `webspeech` when key absent
2. language application routing
   - `applyRecognitionLanguage` updates adapter language when adapter exists
3. fallback behavior
   - unavailable adapter returns clear error status
4. callback mapping smoke tests
   - simulated `onFinal` invokes card commit path

Manual checks:

1. Start/Stop still function.
2. Interim text appears and clears.
3. Final cards appear in lane + chat.
4. Export and restore still include new cards.
5. Light/dark themes unaffected.

## Phase 7: Whisper.cpp Integration Plan (After Adapter Refactor)

Decision branch:

- Browser-only deployment:
  - Whisper.cpp WASM bundle + model file handling
- Desktop-assist deployment:
  - local helper process (outside current pure-static model)

Recommended first path for this repo constraints:

- browser-side WASM adapter to preserve client-only architecture.

Whisper adapter requirements:

- streaming partials (or pseudo-partials from chunk decoding)
- final segment callbacks
- language selection mapping
- confidence proxy strategy if native confidence unavailable

## Phase 8: MacParakeet Integration Plan

Assumption:

- likely macOS-focused runtime.

Two viable strategies:

1. optional adapter behind capability detection in browser if exposed by platform/runtime
2. separate local companion bridge (higher complexity, may violate current static-only assumptions)

Recommendation:

- treat MacParakeet as optional adapter profile with explicit availability checks and fallback to Web Speech.

## Migration Acceptance Criteria

A migration is complete when all are true:

1. `node --check app.js` passes.
2. `node --check sw.js` passes.
3. `npm test` passes.
4. Web Speech behavior remains equivalent for:
   - start/stop
   - interim and final transcript flow
   - restart/backoff logic
   - lane and chat rendering
5. Unsupported adapters fail gracefully without crashing app state.

## Risk Register

Risk: behavior drift during event extraction

- mitigation: preserve SpeechEngine orchestration logic and only swap recognizer plumbing.

Risk: confidence mismatch between engines

- mitigation: normalize confidence to nullable or default scalar at adapter boundary.

Risk: browser workaround regressions

- mitigation: keep workaround policy in SpeechEngine, not inside adapters.

Risk: model load delays for local engines

- mitigation: explicit loading status and non-blocking UI states.

## Suggested Edit Order (Concrete)

1. Add adapter files (`speech-adapters/base.js`, `speech-adapters/webspeech-adapter.js`, `speech-adapters/index.js`).
2. Add `State.sttEngine` and engine constants in `app.js`.
3. Refactor `SpeechEngine.init/start/stop` to use adapter.
4. Wire `applyRecognitionLanguage` to adapter.
5. Run syntax checks and tests.
6. Add optional engine picker UI if desired.

## What This Enables Next

After this refactor, adding Whisper.cpp or MacParakeet becomes mostly an adapter implementation task rather than a full rewrite of transcript flow, UI wiring, and reliability policy.

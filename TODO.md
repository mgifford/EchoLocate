# TODO — EchoLocate roadmap and parked work

Working backlog for EchoLocate. One item should be one reviewable PR. Items that
are not ready to build live under **Later** with the reason they are parked —
do not start them opportunistically.

Update this file in the PR that changes an item's status. Keep entries short:
the user-facing outcome, the acceptance test, and what is explicitly out of
scope. Do not add speculative checkboxes for work nobody has agreed to do.

Related material:

- [AGENTS.md](AGENTS.md) — project rules and code-change checklist
- [ACCESSIBILITY.md](ACCESSIBILITY.md) — conformance intent and manual test checklist
- [STT_ADAPTER_MIGRATION_PLAN.md](STT_ADAPTER_MIGRATION_PLAN.md) — current adapter plan
- [SOVEREIGN_MULTISPEAKER_ROADMAP.md](SOVEREIGN_MULTISPEAKER_ROADMAP.md) —
  prioritized TODO for panel diarization, local translation, digital
  sovereignty and optional conference mode (issues #67/#68)
- [TECHNOLOGY.md](TECHNOLOGY.md) — inventory of runtime, ASR, diarization,
  translation, presentation, transport, model and accessibility tech
- [labs/README.md](labs/README.md) — standalone module demos and their contracts
- [Planning pack](echolocate-implementation-pack/README.md) and
  [build prompt](prompts/AGENT_BUILD_PROMPT.md): now versioned in the repo.
  Status against the roadmap is tracked in
  [12-implementation-status.md](echolocate-implementation-pack/docs/12-implementation-status.md).

## Recently shipped

- **Local-first default** (this PR): first run recommends local Whisper instead
  of silently using the browser cloud service; the cloud choice is explicit,
  labelled and remembered. Adds provider metadata and `labs/providers.html`.
- **Caption event seam** (PR #73): a pure `modules/caption-events.js` contract
  with stable IDs, sequence, revisions, speaker metadata and WebVTT from
  events; the app emits events alongside cards and `labs/events.html`
  demonstrates the model without `app.js`, a mic or a model. See
  <https://github.com/mgifford/EchoLocate/pull/73>.
- **CI foundation**: a `Tests` workflow runs syntax checks and the full suite
  on every push to `main` and every pull request. One branch per PR; merged
  branches are deleted automatically. See
  [`.github/workflows/tests.yml`](.github/workflows/tests.yml).
- **PR #55** (merged): honest privacy copy, light/dark contrast, Unknown
  attribution at the speaker cap, captions before translation, Start/Stop
  recovery, fully offline `franc`, regression tests. See
  <https://github.com/mgifford/EchoLocate/pull/55>.
- **PR #57** (merged): experimental on-device speech engine, engine selector,
  availability/install flow. See
  <https://github.com/mgifford/EchoLocate/pull/57>.
- **A11y semantics pass** (PR #58): Label in Name, a single interim live
  region, non-modal translation popup with focus return, reopenable privacy
  notice, forced-colors fallbacks, modal dismissal-key fix, and a bounded
  service-worker boot wait. See
  <https://github.com/mgifford/EchoLocate/pull/58>.
- **Reliability pass** (PR #59): storage failures and the 500-card trim are
  visible and announced, caption commits are serialized, and the service
  worker returns a real 503 with a versioned cache and cleanup. See
  <https://github.com/mgifford/EchoLocate/pull/59>.
- **SpeechAdapter + capabilities** (PR #61): both engines expose the same
  adapter contract, and a local-only capability snapshot (Web Speech,
  on-device status, WebGPU adapter, WASM, storage) is available from Debug.
  See <https://github.com/mgifford/EchoLocate/pull/61>.
- **Local-only browser defaults** (PR #71): Firefox and browsers without Web
  Speech default to local Whisper, disable the service engines, surface model
  setup in the empty state, and open consent from Start when the model is
  missing. See <https://github.com/mgifford/EchoLocate/pull/71>.
- **Local Whisper (WASM)** (PR #66): pinned `whisper-tiny-en` model, consent +
  SHA-256 install, WASM worker, 5-second caption chunks, engine selector and
  model removal. English-only. See
  <https://github.com/mgifford/EchoLocate/pull/66>.
- **Translation model consent** (PR #64): per-pair consent before Chrome
  downloads a translation model, with a disclosure dialog and no captions
  blocked when consent is refused. See
  <https://github.com/mgifford/EchoLocate/pull/64>.
- **Content Security Policy** (PR #63): meta CSP with a hashed import map,
  external theme bootstrap, no eval/inline scripts, local-only connect-src,
  plus regression tests. See <https://github.com/mgifford/EchoLocate/pull/63>.
- **Model consent infrastructure** (PR #62): manifest, exact-revision
  consent, SHA-256 verification, progress/cancel, storage refusal, Cache
  Storage install/removal and a consent dialog. No model ships yet. See
  <https://github.com/mgifford/EchoLocate/pull/62>.
- **Planning pack reconciliation** (PR #60): the pack is versioned at the
  repository root, its baseline matches the current app, its synthetic fixtures
  are confirmed present and referenced, contracts are annotated as
  illustrative, and the decisions/hosting constraints are recorded. See
  <https://github.com/mgifford/EchoLocate/pull/60>.

## Next

### N1. SpeechAdapter + CapabilityDetector + browser-local engine

- [x] Wrap the existing Web Speech recognizer in a `SpeechAdapter` contract
      (`init`/`start`/`stop`/`setLanguage`/`dispose`, engine metadata).
      Default and behaviour stay `browser-service`; event delivery stays inside
      `SpeechEngine` until the worker work.
- [x] Add `CapabilityDetector`: secure context, `getUserMedia`, Web Speech
      presence, `SpeechRecognition.available({ langs, quality: 'conversation',
      processLocally: true })`, WebGPU adapter, WASM features, storage
      estimate. Records *why* something is unavailable and never fetches
      weights or the network.
- [x] Add the experimental `browser-local` engine: `processLocally = true`,
      `available()`/`install()` behind an explicit user action, disclosure that
      the browser downloads a language pack, `language-not-supported`
      handling, and `downloadable`/`downloading`/`unavailable` states (PR #57).
- [x] Persist the chosen engine. Keep it independent from the speaker-analysis
      setting (`off`/`basic`/`advanced`) (PR #57).
- [x] Fall back only with disclosure: a local-to-cloud change needs explicit
      consent, and an unavailable engine must leave the other one usable.
- [ ] Replace Chrome-version UA gates for the mic-analysis graph with a
      feature/runtime decision where that can be done safely. The capability
      snapshot now reports `compatibility.captionsOnly` and the workaround is
      documented; changing it still needs device testing.

Acceptance:

- Existing Web Speech path is unchanged (existing tests + manual Start/Stop).
- Zero model or language-pack downloads at boot; `install()` only after user
  action.
- Unavailable engine has a readable status and does not disable Start for the
  working engine.
- Adapter tests cover interim, final, error, end and restart/backoff.
- Manual: Chrome desktop with and without the language pack, the reported
  Chrome 155 Windows on-device no-result regression, and Edge fallback.

Out of scope: WebGPU ASR, model consent, diarization changes.

### N2. Accessibility semantics pass

- [x] Fix Label in Name (WCAG 2.5.3) on the eight buttons whose `aria-label`
      replaces the visible text: Save Chat, Copy Chat, Summarize, Debug,
      Stereo, Sys Audio, Clear Local, Layout toggle.
- [x] Stop duplicate live-region announcements: the interim card is
      `role="status"` inside the `role="log"` lane, and the interim strip is
      `aria-atomic="true"` and rewritten per result.
- [x] Replace `role="dialog"` on the non-modal translation dropdown with a
      non-modal popup pattern and return focus to the trigger.
- [x] Make the privacy notice reopenable after dismissal (help/about entry).
- [x] Add forced-colors handling for status and confidence cues; confirm no
      meaningful cue is colour-only.
- [x] Fix the modal dismissal key: closing an error dialog currently suppresses
      the Edge/mobile setup dialog too.

Acceptance: keyboard and screen-reader pass on the ACCESSIBILITY.md checklist;
no regression in lane announcement behaviour.

### N3. Reliability and storage honesty

- [x] Surface storage failures: `Storage.save` swallows quota errors while the
      footer always shows "Auto-saved ✓".
- [x] Make `CARD_LIMIT` (500) truncation visible; long sessions currently lose
      their start from VTT export with no warning.
- [x] Bound the service-worker boot wait so a page without a controller still
      initializes TranscriptCtrl and every control (fixed with the a11y pass).
- [x] Service worker: return a real 503 when the network fails and the cache
      misses (today the fallback can resolve to `undefined`); version and clean
      the cache; do not pre-cache model weights.
- [x] Serialise caption commits so two finals in one `onresult` cannot
      interleave; keep a stable segment ordering.
- [x] Decide and document a CSP before workers/models are added: meta policy
      with `default-src 'self'`, self + hashed-import-map scripts,
      `wasm-unsafe-eval`, inline styles only, no eval, and local-only
      `connect-src`. Model hosts must be added before downloads ship.

Acceptance: storage failure is visible and recoverable; export never silently
drops cards; offline navigation gets a real response; out-of-order cards are
impossible.

### N4. Reconcile the planning pack with the app

- [x] Update the pack baseline to cover translation, system audio, chat view,
      debug console, franc language detection, the device picker and the
      Chrome/Edge workarounds.
- [x] Verify `tests/fixtures/` references: the five synthetic metadata fixtures
      are present and the build prompt's reference is accurate.
- [x] Convert or annotate `contracts/interfaces.ts`: the app is a classic
      script tested in a VM, not a TypeScript/ESM project.
- [x] Record hosting constraints: GitHub Pages cannot set COOP/COEP (no
      `SharedArrayBuffer`/multi-threaded WASM) or custom headers.
- [x] Decide where the pack lives: committed at the repository root
      (`echolocate-implementation-pack/`, `prompts/`), not under `docs/planning/`.

Acceptance: an implementing agent can follow the pack without inventing
history, and no reference points at a file that does not exist.

### N5. First installable model and consent inventory

- [x] Add the first local model entry: `whisper-tiny-en` for the WASM engine,
      with a pinned revision, exact sizes and SHA-256 (PR #65).
- [x] Put the existing Chrome Translator download into the consent inventory:
      per source:target consent, dialog before `Translator.create`, and refusal
      that leaves captions working.
- [ ] Test cache eviction and reinstall on a real device.

## Later (parked — do not start yet)

- [ ] **WebGPU ASR experiment.** Blocked on a machine where Chrome exposes
      WebGPU (this Mac reports `navigator.gpu === false`). Start with
      `onnx-community/whisper-base`
      (Apache-2.0, ~146 MB fp16) and `whisper-tiny` (~76 MB) as the constrained
      fallback. Chunking, partials, timestamps; measure WER, caption p50/p95,
      load time, peak memory; handle GPU device loss. Compare against
      `browser-service` with the same audio.
- [ ] **Parakeet benchmark.** Only if Whisper is insufficient.
      `istupakov/parakeet-tdt-0.6b-v2-onnx` is CC-BY-4.0 and ~661 MB int8;
      licence attribution and bandwidth are open questions.
- [ ] **Advanced diarization.** PyAnnote segmentation + WeSpeaker embeddings
      (WASM), quality gates, exemplar sets, provisional/established states,
      explicit overlap. Benchmark against the current Meyda baseline on fixed
      labelled audio.
- [ ] **Multiple Unknown lanes.** Unknown-vs-unknown clustering and numbered
      `Unknown 1..N`. Today one lane conflates several unattributed voices;
      numbering without evidence would imply distinctions we have not measured.
- [ ] **Timeline and reconciliation.** Shared monotonic clock, provisional
      labels, revisions, manual-correction precedence, no stale overwrite, and
      revised labels in VTT.
- [ ] **Accessibility statement for experimental engines.** Say plainly which
      modes are local, which are browser-managed, and which may use a vendor
      cloud service.

## Decisions recorded

- `browser-local` is in scope. Start simple and extend only with evidence.
- WebGPU experiment model: `whisper-base` fp16, `whisper-tiny` fallback;
  Parakeet parked. No weights in the repository; pin revision and hash before
  any consent UI.
- One **Unknown** lane for now. Label "Unknown", card note "unattributed",
  VTT `<v Unknown>`.
- Keep the classic-script architecture and VM tests; no TypeScript build.
- GitHub Pages: no COOP/COEP, so single-thread WASM; model files from a pinned
  Hugging Face revision, not bundled.
- No silent cloud fallback. Any local↔cloud change needs explicit consent.

## Open questions

- Does the browser-local language-pack download need a size or terms
  disclosure? Chrome does not expose the pack size.
- Is the Chrome 155 Windows on-device no-result bug
  (<https://issues.chromium.org/issues/579050368>) a blocker or a documented
  warning with runtime fallback?
- What CSP shape works with the inline theme script, htmx and the vendored ESM
  modules?
- Should speaker analysis be a separate persisted setting from STT? The pack
  says yes; the UI is not designed yet.
- How many Unknown lanes are useful before they become misleading?

## Branch policy

- Work on one short-lived branch per PR; do not stack unrelated work.
- Merge to `main` through a PR, then delete the branch. The repository setting
  `delete_branch_on_merge` is enabled.
- `main` is the only long-lived branch.

## Known defects still open (2026-11 review)

- Chrome ≤149 detection is UA-version based and disables speaker analysis
  entirely.
- `smoothMatch` history is session-global rather than per-speaker; revisit with
  real diarization.
- One card per ASR final; speakers changing mid-segment are not split.

## Out of scope (unless explicitly requested)

Server-side storage, cloud speech APIs, user accounts, streaming transcripts to
external systems, LLM-based speaker identity, demographic inference, and
cross-session voice identification.

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
- Local, untracked planning inputs: `prompts/AGENT_BUILD_PROMPT.md` and
  `echolocate-implementation-pack/` (decide whether either should live in the repo)

## Recently shipped

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

## Next

### N1. SpeechAdapter + CapabilityDetector + browser-local engine

- [ ] Wrap the existing Web Speech recognizer in a `SpeechAdapter` contract
      (`init`/`start`/`stop`/`setLanguage`/`dispose`, interim/final/error/end
      callbacks, engine metadata). Default and behaviour stay
      `browser-service`.
- [ ] Add `CapabilityDetector`: secure context, `getUserMedia`, Web Speech
      presence, `SpeechRecognition.available({ langs, quality: 'conversation',
      processLocally: true })`, WebGPU adapter/limits, WASM, storage estimate.
      Record *why* something is unavailable. Never fetch weights to probe.
- [x] Add the experimental `browser-local` engine: `processLocally = true`,
      `available()`/`install()` behind an explicit user action, disclosure that
      the browser downloads a language pack, `language-not-supported`
      handling, and `downloadable`/`downloading`/`unavailable` states (PR #57).
- [x] Persist the chosen engine. Keep it independent from the speaker-analysis
      setting (`off`/`basic`/`advanced`) (PR #57).
- [ ] Fall back only with disclosure: a local-to-cloud change needs explicit
      consent, and an unavailable engine must leave the other one usable.
- [ ] Replace Chrome-version UA gates for the mic-analysis graph with a
      feature/runtime decision where that can be done safely; keep the current
      workaround until it is tested.

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
- [ ] Decide and document a CSP before workers/models are added (inline theme
      script, htmx, vendored modules today).

Acceptance: storage failure is visible and recoverable; export never silently
drops cards; offline navigation gets a real response; out-of-order cards are
impossible.

### N4. Reconcile the planning pack with the app

- [ ] Update the pack baseline: it omits translation, system audio, chat view,
      debug console, franc language detection, the device picker and the
      Chrome/Edge workarounds.
- [ ] Add the missing `tests/fixtures/` or remove the references to it.
- [ ] Convert or annotate `contracts/interfaces.ts`: the app is a classic
      script tested in a VM, not a TypeScript/ESM project.
- [ ] Record hosting constraints: GitHub Pages cannot set COOP/COEP (no
      `SharedArrayBuffer`/multi-threaded WASM) or custom headers.
- [ ] Decide whether the pack is committed under `docs/planning/` or stays out
      of the repository.

Acceptance: an implementing agent can follow the pack without inventing
history, and no reference points at a file that does not exist.

## Later (parked — do not start yet)

- [ ] **ModelManager + consent.** Pinned manifest, license/size/source/revision,
      separate consent per model, progress/cancel/retry, SHA-256 verification,
      cache by immutable revision, per-model delete, quota/eviction recovery,
      no service-worker pre-caching. Include the existing Chrome Translator
      download in the inventory so "no downloads until consent" is scoped to
      app-managed weights.
- [ ] **WebGPU ASR experiment.** Start with `onnx-community/whisper-base`
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

## Known defects still open (2026-11 review)

- No CI workflow; only manual checks in AGENTS.md.
- Chrome ≤149 detection is UA-version based and disables speaker analysis
  entirely.
- `smoothMatch` history is session-global rather than per-speaker; revisit with
  real diarization.
- One card per ASR final; speakers changing mid-segment are not split.

## Out of scope (unless explicitly requested)

Server-side storage, cloud speech APIs, user accounts, streaming transcripts to
external systems, LLM-based speaker identity, demographic inference, and
cross-session voice identification.

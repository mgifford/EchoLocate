# Sovereign multi-speaker captions — prioritized TODO

Status: **proposed 2026-11-11**. This is a working roadmap, not a commitment to
build every item. One item should become one reviewable PR.

Related: [TODO.md](TODO.md), [issue #67](https://github.com/mgifford/EchoLocate/issues/67),
[issue #68](https://github.com/mgifford/EchoLocate/issues/68), and the
[planning pack](echolocate-implementation-pack/README.md).

## 1. Thesis

EchoLocate is not a caption-overlay product with a transcript attached. Its
differentiator is an **accessible, local-first transcript for multi-speaker
group and panel discussion**, with **on-device translation for each reader**.

CAPTION.ninja is strong prior art for presentation, streaming and OBS overlays.
It is not the design centre for EchoLocate:

| | CAPTION.ninja | EchoLocate |
|---|---|---|
| Typical use | One-to-many presentation, video, stream | Many-to-many group/panel, personal reading |
| Speech recognition | Browser Web Speech → Google/Microsoft cloud | Local Whisper default; service speech optional and labelled |
| Local inference | Separate Caption Local Python server | In-browser WASM; no server |
| Speaker attribution | None | Diarization and corrections; the core panel problem |
| Translation | Bergamot local + optional remote providers | Local-first; per-reader language and display |
| Distribution | Public WebSocket rooms / OBS overlay | Local transcript first; optional private relay later |
| Firefox | Capture unsupported | Local Whisper default |
| Licence | MPL-2.0 | AGPL-3.0 |

**Design consequence:** do not copy presentation-first defaults. A panel has
fast turns, interruptions, overlap, names, corrections, and several readers who
each want a different language and text size. That is a different product.

## 2. Digital sovereignty rules

These are product requirements, not aspirations.

1. **No vendor speech service in the default path.** Local Whisper (weights
   running in this tab) is the recommended and default engine when available.
   Chrome's on-device language pack is browser-managed — label it separately
   from EchoLocate-managed local Whisper. The browser service is explicitly
   labelled as a cloud service and is never selected silently.
2. **No silent cloud fallback.** If local inference fails, say so and keep the
   original captions; do not switch to Google/Microsoft without consent.
3. **Local translation is the default.** Chrome's Translator API may be offered
   as an optional browser-managed provider, but it is not the sovereignty path.
4. **Models are pinned, hashed, licensed and replaceable.** No CDN-only
   dependency, no hidden remote model, no unpinned revision. Prefer models that
   can be mirrored or self-hosted.
5. **No accounts, telemetry or analytics.** Captions, audio and preferences stay
   in the browser unless the user explicitly enables sharing.
6. **Sharing is opt-in and explicit.** A relay, if added, is a separate,
   self-hostable component. It receives caption text, not audio; it keeps no
   permanent transcript; it does not log content by default.
7. **Offline after setup.** Once models are installed, the caption path should
   work without a network.
8. **The UI states what is local and what is not.** Engine, translation provider,
   model source and relay status must be visible and understandable. Providers
   expose machine-readable `processing`/`network` metadata so this is not
   hand-written per screen.
9. **Export and deletion are first-class.** Users can export their transcript
   and remove models/data without an account.
10. **No dark patterns.** A download, cloud call or share action is never
    triggered by Start alone.

Sovereignty is the property of the **default path**, not a settings toggle.

## 3. Modularity and demonstrability

Complexity is the main risk. Do not build one monolith and demonstrate it only
at the end.

### Rules

1. Each capability is a module with a narrow contract and no DOM/UI assumptions.
2. Every module has a **standalone demo** under `labs/` with synthetic fixtures.
   A demo must work without a microphone or a model download by default.
3. Composition is separate from the modules. `labs/pipeline.html` wires them
   together; the main app is one composition, not the only one.
4. Every ASR/translation/transport provider declares **sovereignty metadata**:
   `processing` (`local`, `browser-managed`, `cloud`, `self-hosted`), `network`
   (`none`, `model-download`, `streaming`), model source and licence. The UI and
   tests read that metadata instead of guessing from a brand name.
5. Optional modules may fail. Captions must continue without diarization,
   translation, TTS, transport or an overlay.
6. No mandatory backend. Transport and remote translation are adapters.
7. One module per PR: contract tests, demo, short README. No feature without a
   demo and a documented failure mode.
8. Keep the classic-script architecture and Node `vm` tests. Do not introduce a
   framework, bundler or build step just to look modular.
9. Version the data contracts. Evaluate WebVTT/TTML before inventing a new
   interchange format.
10. Accessibility is part of each module contract, not a final polish layer.

### Module map

| Module | Contract | Standalone demo | Notes |
|---|---|---|---|
| Capture | `MediaStream` → audio frames | `labs/capture.html` | Mic/system audio; no network. |
| ASR adapters | audio → `interim`/`final` events | `labs/asr.html` | Service, browser-managed on-device, local WASM. |
| VAD / turns | frames → speech segments | `labs/vad.html` | Silero VAD is the likely local option. |
| Diarization | segments/audio → speaker turns + confidence | `labs/diarization.html` | Meyda baseline; PyAnnote/WeSpeaker target. |
| Caption events | append/revision/render model | `labs/events.html` | Pure; no DOM or network. |
| Translation | text + pair → translated text | `labs/translation.html` | Original, Chrome, Bergamot, local model, optional remote. |
| Transcript views | events → lanes/chat/reader | `labs/viewer.html` | Existing UI is one view. |
| Audience/overlay | events → audience/overlay view | `labs/audience.html`, `labs/overlay.html` | Local first; relay later. |
| Model registry | manifest/consent/cache | `labs/models.html` | Hash, licence, size, remove. |
| Transport | events → subscribers | `labs/transport.html` | `BroadcastChannel` first; optional relay. |
| Preferences | display/a11y settings | `labs/preferences.html` | Local storage; forced colours, RTL, zoom. |
| Diagnostics | capability/sovereignty snapshot | `labs/diagnostics.html` | Explains local vs cloud vs unavailable. |

### Demo lab

- `labs/events.html` — synthetic captions, speaker revisions, interim/final,
  render to lanes/chat/VTT. No network, no model.
- `labs/asr.html` — mock transcript plus optional real local inference; shows
  the sovereignty badge.
- `labs/diarization.html` — a short sample WAV with synthetic turns; model
  download optional.
- `labs/translation.html` — sample sentences and a chosen pair; mock provider by
  default, Bergamot/local when installed.
- `labs/viewer.html` — accessible reader with history, pause-scroll, font and
  contrast controls.
- `labs/audience.html` — two windows over `BroadcastChannel`; no server.
- `labs/overlay.html` — OBS-style overlay from events; no public room.
- `labs/pipeline.html` — toggle each module on/off to show composition and
  graceful degradation.

Every lab must state **local / browser-managed / cloud / network required** in
visible text and in an accessible status. Demos are part of CI where feasible;
at minimum, module contracts and synthetic event fixtures are tested.

### Documentation deliverables

- `TECHNOLOGY.md` — the inventory of what is used, why, status, licence, limits
  and demo.
- `labs/README.md` — index, how to run each demo, what is mocked, what is real.
- A README per module: purpose, contract, inputs/outputs, failure modes,
  privacy boundary, tests, demo URL.
- Keep `FEATURES.md`, `AGENTS.md` and `README.md` in sync when a module changes.
- A text architecture diagram (and an accessible Mermaid version if used) that
  shows modules and optional edges, not one giant pipeline.
- A licence/provenance table for every model and every borrowed idea.
- Record decisions in `TODO.md`; do not bury them in code comments.

### Complexity budget

- No new framework, bundler or backend for the core.
- A module that cannot be demonstrated alone is not ready.
- A module that fails must leave the transcript readable.
- Do not add a second implementation of an existing module; replace or delete.
- Delete experiments that are not promoted within a milestone.

## 4. What to learn from CAPTION.ninja

### Adopt or adapt

- **Per-reader translation.** Distribute the source transcript and let each
  device translate into its own language; do not force one projected language.
- **TTS readout** via `speechSynthesis`, opt-in and never reading every interim.
- **Custom vocabulary and restricted-word lists** for names, acronyms and terms
  that ASR reliably gets wrong.
- **Interim/finalisation controls**: auto-finalise after silence, max words,
  sentence splitting. These matter more once Whisper chunks are shorter.
- **Manual correction / editor** for a human captioner, with revisions that do
  not duplicate cards.
- **Export breadth**: SRT and TXT in addition to the existing WebVTT.
- **Overlay/streaming mode**, later, as a same-device window or local browser
  source. Remote overlay delivery needs the optional relay.
- **Self-hosting and disclosure docs**: state exactly which parts are local,
  which are browser-managed and which are remote.

### Do not copy

- Cloud STT as the default.
- Public room URLs as the privacy model.
- API keys in URLs.
- Presentation-first assumptions (one speaker, one language, one display).
- A feature surface with no speaker attribution.
- Code without respecting CAPTION.ninja's MPL-2.0 file-level obligations.
  EchoLocate is AGPL-3.0; ideas are reusable, code copying needs care.

## 5. Prior art and references

| Project | Licence | Why it matters |
|---|---|---|
| [CAPTION.ninja](https://github.com/steveseguin/captionninja) · [site](https://caption.ninja/) | MPL-2.0 | Overlay, translation, TTS, interim handling, vocabulary, self-hosting. Presentation-first. |
| [Caption Local](https://github.com/steveseguin/caption-local) | MPL-2.0 | Self-hosted Whisper server, ~6 s windows; shows the server-side local option and its setup cost. |
| [whisper-web](https://github.com/adamchaboryk/whisper-web) | MIT | Browser PyAnnote segmentation 3.0 + WeSpeaker ResNet34-LM through Transformers.js; the closest diarization reference. File-based, not live. |
| [Transformers.js](https://github.com/xenova/transformers.js) | Apache-2.0 | Runtime already used for local Whisper; translation and diarization pipelines. |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | MIT | WASM backend; WebGPU backend when hardware permits. |
| [OpenAI Whisper](https://github.com/openai/whisper) | MIT | ASR model family and reference implementation. |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | MIT | Alternative local runtime; useful for performance comparisons. |
| [pyannote-audio](https://github.com/pyannote/pyannote-audio) / [segmentation](https://github.com/pyannote/segmentation) | MIT | Speaker segmentation and diarization pipeline. |
| [WeSpeaker](https://github.com/wenet-e2e/wespeaker) | CC BY 4.0 (model) | Speaker embeddings for diarization; attribution required. |
| [Silero VAD](https://github.com/snakers4/silero-vad) | MIT | Voice activity and turn boundaries; helps split ASR at speaker changes. |
| [Mozilla Bergamot](https://github.com/mozilla/translate) / [firefox-translations](https://github.com/mozilla/firefox-translations) | MPL-2.0 | Local browser translation for a bounded set of pairs. |
| [Marian / OPUS-MT](https://github.com/marian-nmt/marian) | varies per model | Additional local translation pairs; check each model licence and size. |
| [LiveKit](https://github.com/livekit/livekit) / [Jitsi](https://github.com/jitsi/jitsi-meet) | Apache-2.0 | Self-hostable real-time transport if a relay is added. |
| [CTranslate2](https://github.com/OpenNMT/CTranslate2) / [Argos Translate](https://github.com/argosopentech/argos-translate) | MIT / check | Self-hosted translation alternatives; not browser-local by default. |
| [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) | browser API | Convenient, but Chrome/Edge normally send audio to the vendor. Not the sovereignty path. |

Licences and model terms must be re-checked before adding anything to
`models/manifest.json`; model licences are separate from code licences.

## 6. Issue #68 — assessment

[Issue #68](https://github.com/mgifford/EchoLocate/issues/68) proposes a
QR-based, multilingual conference mode. The direction is strong, but it is a
programme, not one PR.

**Keep:**

- Explicit opt-in; local-only remains the default.
- No raw audio, voiceprints or acoustic embeddings over the relay.
- Structured caption events rather than HTML.
- Per-participant language and display preferences.
- Accessibility, reconnection and caption history requirements.
- Speaker metadata optional; Unknown rather than guessed names.
- Transport-neutral event model; WebVTT/TTML considered before inventing a
  format.

**Change before building:**

- **The Cloudflare relay must not be a core dependency.** Make transport an
  optional adapter with a self-hostable reference relay. Phase 1 and 2 should
  have no network at all.
- **Do not assume Chrome Translator.** Add a local translation adapter and
  treat remote translation as explicit opt-in.
- **Sequence:** event model → same-device audience viewer → optional relay/QR.
  Do not start with QR codes or 200-viewer claims.
- **Diarization is not optional for the panel differentiator.** It can be
  optional for a conference MVP, but panel quality needs it before distribution.
- **Relay privacy needs a threat model:** session IDs, publisher auth, expiry,
  no content logs, data minimisation, and a clear statement that the relay can
  see caption text.

Recommendation: keep #68 as a design note. Implement its first two phases only
after the local panel and local translation paths are credible.

### Translation strategy for “whatever language”

No single on-device model covers every language. Be explicit about tiers rather
than promising “all languages”:

1. **Tier A — Bergamot:** small, fast, local, roughly the 17 languages in
   CAPTION.ninja's free set. Good default for common conference pairs.
2. **Tier B — local per-pair models:** Marian/OPUS/Transformers models added
   one pair at a time. Each pair has a size, licence, quality and latency cost;
   download only after consent and keep it offline afterwards.
3. **Tier C — optional remote:** explicit opt-in only, never a silent fallback,
   no API keys in shared URLs, and the original transcript remains available.

For conference mode, distribute **source text only** and let each device
translate locally into the reader's chosen language. That keeps the relay
language-agnostic, avoids sending translated text to every participant, and lets
each reader choose without changing anyone else's view. If a local pair is
missing, show the original with a clear explanation; do not call a remote
provider silently.

## 7. TODO

Ordered by what most improves a **sovereign panel discussion** first.

### P0 — credible local panel

- [x] **Module seams and the caption-events lab.**
  Extract the pure caption event model first: stable segment IDs, sequence,
  revision, source language, timing and optional speaker metadata. Render the
  existing lanes/chat/VTT from it and add `labs/events.html` with synthetic
  events. No microphone, model or network.
  - Acceptance: existing transcription and VTT are unchanged; the demo runs
    without `app.js`; contract tests cover interim/final/revision; the classic
    script architecture is preserved.
  - This is the smallest useful seam and the template for every later module.
    Shipped in PR #73.

- [ ] **Make local the recommended default everywhere.**
  On a clean profile, offer local Whisper setup and do not silently choose the
  browser cloud service. If the user chooses service speech, label it **cloud**
  and remember that explicit choice.
  - Acceptance: no Google/Microsoft STT request without an explicit choice;
    engine status says local/cloud; Firefox and Chrome behave consistently.
  - Note: Chrome already has an experimental on-device engine; this item is
    about the default and the disclosure, not a new model.

- [x] **Lossless audio queue.**
  Bounded FIFO with stable chunks, drop-oldest backpressure, processed/pending/
  missing coverage and a visible warning. Shipped in PR #75.

- [ ] **Prove live panel capture and measure it.**
  Complete the live-mic/Firefox/Stop audit and record p50/p95 caption latency,
  CPU, memory, and network requests for 10–15 minute two-person sessions.
  - Acceptance: a labelled recording with two voices, at least one overlap and
    one returning speaker; zero network requests after model install; Stop
    releases the mic.
  - Depends on: merged #69/#71; local Whisper model.

- [ ] **Sovereignty audit and guardrails.**
  Audit every default network path; document model provenance and licences;
  add tests/checks that fail if a default path calls a vendor STT endpoint.
  - Acceptance: DevTools network log shows only the consented model download;
    CSP allowlist matches documented hosts; README/PRIVACY/AGENTS updated;
    no analytics or accounts.

- [ ] **Panel evaluation corpus and baseline.**
  Record consented, labelled 2–4 speaker panel audio (turn-taking, overlap,
  pauses, returning speakers). Measure WER, speaker-attributed WER and
  diarization error rate for the current Meyda heuristic.
  - Acceptance: reproducible harness and numbers; recordings are not committed
    unless consent and privacy allow; failures documented.
  - Use this to decide whether PyAnnote/WeSpeaker is worth its model and CPU cost.

- [ ] **Local translation adapter v1 (Bergamot).**
  Define a translation adapter with `original`, `chrome-translator`,
  `bergamot` and future `local-model` providers. Ship Bergamot for a small set
  of pairs with per-pair consent, download progress, offline use and the
  original always available.
  - Acceptance: no remote call; pair download consent; unsupported pairs fail
    gracefully; translations never block source captions; quality/size notes.
  - Do not call this “all languages”; measure coverage and quality.

### P1 — panel attribution and multilingual reading

- [ ] **Advanced local diarization.**
  Add PyAnnote segmentation + WeSpeaker embeddings in a worker, with pinned
  models, consent, and no cross-session voice identity. Use whisper-web as a
  reference, but make it live rather than file-based.
  - Acceptance: measurable DER improvement over Meyda on the P0 corpus;
    provisional/established/Unknown states; embeddings never leave the device;
    model licences/attribution recorded.
  - Guardrail: do not present inferred labels as real names.

- [ ] **Turn segmentation and alignment.**
  Use VAD/turn boundaries and word timestamps to split captions when the
  speaker changes mid-chunk; mark overlap instead of assigning it to one person.
  - Acceptance: a two-person exchange produces separate cards per turn; no
    words lost at boundaries; overlap is visible and not silently misattributed.

- [ ] **Panel corrections.**
  Let the organizer rename, merge/split and correct speakers; propagate
  revisions to existing cards and VTT without duplicates; preserve Unknown.
  - Acceptance: corrections update prior captions and translations; undo is
    possible; screen readers hear a concise revision, not a full re-read.

- [ ] **On-device translation breadth.**
  Add additional local pairs via Marian/OPUS/Transformers only where size,
  licence and quality are acceptable; make the pair list explicit and
  download-on-consent.
  - Acceptance: language coverage table; per-pair model size/quality; no
    silent remote fallback; offline after install.

- [ ] **Personal bilingual display.**
  Original / translated / both, with font, size, contrast, line spacing,
  language metadata, RTL and forced-colours support. Preferences local.
  - Acceptance: independent settings; original remains readable during
    translation failure; WCAG 2.2 AA checks and manual screen-reader pass.

- [ ] **TTS readout (opt-in).**
  Browser `speechSynthesis`, pause/stop, no reading of every interim, clear
  status. Do not autoplay by default.
  - Acceptance: keyboard controls; no double announcements; can be disabled and
    remembered; works with translated text.

- [ ] **Vocabulary and restricted-word lists.**
  Session-local replacement/phonetic mapping and masking, editable and
  exportable, applied before translation.
  - Acceptance: names/acronyms corrected; masking does not leak in VTT or
    translations; no network.

- [ ] **Interim/finalisation controls.**
  Auto-finalise after silence, max words, sentence splitting, and a visible
  “transcribing” state for the 5-second Whisper path.
  - Acceptance: fast speech does not produce unbounded interim text; controls
    persist; captions remain accessible.

- [ ] **Manual caption/editor and SRT/TXT export.**
  A human can correct or type captions; revisions flow through the event model;
  export SRT, WebVTT, TXT.
  - Acceptance: no duplicate cards; timestamps valid; edits survive export;
    keyboard/screen-reader tested.

### P2 — conference and distribution

- [ ] **Same-device audience viewer.**
  `audience.html` fed by `BroadcastChannel`/`window.open`, no network, with
  caption history, pause-scroll, personal display settings and local
  translation.
  - Acceptance: separate window/tab works without mic permission; structured
    events; accessible; no relay.

- [ ] **Optional self-hosted relay + QR.**
  Transport adapter, reference WebSocket relay, publisher auth, session expiry,
  no content logs, CSP update, QR code. Cloudflare or another host is an
  implementation detail, never a requirement.
  - Acceptance: laptop publishes to phone; only organizer can publish; relay
    sees text but not audio; opt-in; existing local-only mode unchanged.

- [ ] **Per-viewer local translation at the edge.**
  Distribute source text only; each viewer translates locally into its chosen
  language. Fall back to original with an explanation, never silently to a
  remote provider.
  - Acceptance: different viewers use different languages simultaneously;
    translation never blocks source captions; model downloads are per-device
    and consented.

- [ ] **Conference privacy/security review.**
  Threat model, session unguessability, publisher/viewer separation, retention,
  no raw audio/embeddings, CSP, documentation, explicit “relay can see text”.
  - Acceptance: privacy doc and tests; no permanent relay storage by default.

- [ ] **Conference reliability and scale.**
  Reconnect/backoff, duplicate/out-of-order handling, history during
  disconnection, 10/50/200 viewer tests only when the relay exists.
  - Acceptance: measured latency/failure/reconnect numbers; no unsupported
    scale claims.

- [ ] **Same-device overlay / OBS mode.**
  A local browser-source window with line limits, auto-hide, styling and no
  cloud relay. This borrows CAPTION.ninja's ergonomics without its public rooms.
  - Acceptance: OBS/vMix browser source works on the same machine; no network;
    captions remain available in the main app.

### P3 — performance and reach

- [ ] **WebGPU ASR backend.**
  Only on hardware where `navigator.gpu` is real; reuse the worker and model
  manifest. Keep WASM as the fallback.
- [ ] **Larger/multilingual Whisper models.**
  `base`/multilingual variants with size, latency and WER measurements; do not
  ship a bigger model without evidence.
- [ ] **Mobile and low-power matrix.**
  Android/iOS/Firefox performance, memory, thermal/battery, text input and
  screen-reader behaviour.
- [ ] **Self-hosted model mirror and supply-chain docs.**
  Mirror pinned weights, verify hashes, document licences and offline install.
- [ ] **Caption interchange/export.**
  Consider WebVTT/TTML compatibility and a documented event schema before
  inventing anything new.

## 8. Sequencing

0. **Module seams:** caption events + labs harness; then one module at a time.
1. **Walking skeleton:** mic → local Whisper → caption events → lanes/VTT,
   plus one Bergamot pair. No diarization, audience view or relay. This is the
   first composition demo and the baseline for every later module.
2. **Sovereign panel MVP:** local default, live panel capture, evaluation
   corpus, Bergamot translation v1.
3. **Panel quality:** PyAnnote/WeSpeaker, turn alignment, corrections, overlap.
4. **Personal multilingual reading:** translation breadth, bilingual display,
   TTS, vocabulary, manual editor.
5. **Conference mode:** same-device audience viewer, then optional self-hosted
   relay/QR and per-viewer local translation.
6. **Scale and reach:** reliability tests, mobile, WebGPU, larger models.

## 9. Success measures

- **Sovereignty:** zero vendor STT requests on the default path; zero network
  requests after model install; every model pinned/hashed/licensed.
- **Panel quality:** DER, WER, speaker-attributed WER on a labelled corpus;
  turn splits at speaker changes; overlap marked, not guessed.
- **Latency:** caption p50/p95 from speech end to display, separately for WASM
  Whisper, diarization and translation.
- **Accessibility:** keyboard and screen-reader pass with continuous updates;
  no duplicate announcements; reflow/forced-colours/zoom.
- **Translation:** per-pair coverage, model size, quality notes, no silent
  remote fallback, original always available.
- **Conference:** only claim viewer counts and reliability that were measured.

## 10. Out of scope until explicitly requested

- Cloud speech recognition in the default path.
- Public room URLs or permanent relay transcript storage.
- Raw audio/voiceprint/embedding transmission.
- Accounts, telemetry or cross-session speaker identity.
- LLM-based identity or demographic inference.
- A new caption standard.
- Claiming “all languages” or conference scale without evidence.

# Technology inventory

Status: **2026-11-11**. This is a map of what EchoLocate uses, what is being
considered, and what each choice costs in privacy, complexity and maintenance.
It is not a tutorial.

Related: [sovereign multi-speaker roadmap](SOVEREIGN_MULTISPEAKER_ROADMAP.md),
[TODO.md](TODO.md), [FEATURES.md](FEATURES.md).

Each capability should expose a machine-readable sovereignty descriptor:

```text
processing: local | browser-managed | cloud | self-hosted
network:    none | model-download | streaming
```

The UI, demos and tests use this metadata instead of guessing from a product
name.

## Runtime and delivery

| Technology | Role | Status | Processing / network | Notes |
|---|---|---|---|---|
| Classic scripts + Node `vm` tests | Application and test harness | Shipped | Local / none | No framework or build step; preserve until a module seam proves otherwise. |
| Service worker + Cache Storage | Offline shell, local fragment route, model cache | Shipped | Local / none | Model weights use a separate cache and are never pre-cached. |
| Content Security Policy | Limits scripts, workers, connections | Shipped | Local / none | Meta CSP; GitHub Pages cannot set headers. `connect-src` is the model-host allowlist. |
| Web Audio + AudioWorklet | Mic capture and level/pitch analysis | Shipped | Local / none | The local Whisper path uses an AudioWorklet for 16 kHz chunks. |
| Web Workers | Local ASR inference off the main thread | Shipped | Local / model-download | Module worker imports vendored Transformers.js. |
| WebAssembly SIMD | Whisper/ONNX execution | Shipped | Local / model-download | Single-thread: GitHub Pages cannot set COOP/COEP. |
| WebGPU | Faster local inference | Blocked here | Local / model-download | Chrome on the development Mac reports `navigator.gpu === false`; re-check on real hardware. |
| Provider metadata | Local/cloud/browser-managed labels | Shipped | Local / none | `modules/provider-metadata.js`; labels engine options and drives the setup choice. |
| Audio chunk queue | Bounded FIFO/coverage | Shipped | Local / none | `modules/audio-chunk-queue.js`; drops oldest queued chunk and records missing intervals. |
| localStorage | Transcript, preferences, consent | Shipped | Local / none | 500-card cap and quota failures are surfaced; no server copy. |
| CI (`Tests` workflow) | Syntax + test suite | Shipped | — | One short-lived branch per PR. |

## Speech recognition

| Technology | Status | Processing / network | Why / limits |
|---|---|---|---|
| Web Speech API (browser service) | Shipped, explicit opt-in | Cloud / streaming | Works in Chrome/Edge but normally sends audio to the vendor. Must be explicitly labelled **cloud**; never the sovereignty default. |
| Chrome on-device `SpeechRecognition` (`processLocally`) | Experimental | Browser-managed / model-download | Chrome installs a language pack; inference is local but the pack is vendor-managed. Label it separately from EchoLocate-managed local models. |
| Whisper tiny.en via Transformers.js + ONNX Runtime WASM | Shipped | Local / model-download | ~43 MB, Apache-2.0, English-only, 5 s chunks. Pinned revision and SHA-256; inference reads only Cache Storage. |
| Whisper base/multilingual models | Planned | Local / model-download | Bigger, slower, potentially more accurate; do not ship without WER/latency/memory evidence. |
| Parakeet ONNX | Parked | Local / model-download | CC-BY-4.0, ~661 MB int8; benchmark only if Whisper is insufficient. |
| whisper.cpp | Alternative | Local / model-download | MIT; useful comparison runtime, not currently integrated. |

## Speaker analysis and diarization

| Technology | Status | Processing / network | Why / limits |
|---|---|---|---|
| Meyda MFCC/spectral heuristics | Shipped | Local / none | Fast, no model, but not real diarization. Similar voices and overlap break it. |
| PyAnnote segmentation 3.0 | Planned | Local / model-download | MIT model; closest browser reference is `whisper-web`. |
| WeSpeaker ResNet34-LM embeddings | Planned | Local / model-download | CC-BY-4.0; attribution required. Embeddings stay on device. |
| Silero VAD | Planned | Local / model-download | MIT; turn boundaries and overlap handling before ASR chunking. |
| Word timestamps / turn alignment | Planned | Local / none | Needed so one 5 s Whisper chunk does not collapse two speakers into one card. |

## Translation

| Technology | Status | Processing / network | Why / limits |
|---|---|---|---|
| Chrome Translator API | Shipped, opt-in | Browser-managed / model-download | Per-pair consent exists. Chrome may use a vendor-managed model; not the sovereignty default. |
| Mozilla Bergamot | Planned | Local / model-download | MPL-2.0; small, fast, ~17 languages. Tier A for common conference pairs. |
| Marian / OPUS-MT / Transformers.js models | Exploratory | Local / model-download | Adds pairs, but each has size/licence/quality costs. Tier B, one pair at a time. |
| Remote translation (Google/OpenAI/Anthropic/Ollama) | Optional future | Cloud / streaming | Only explicit opt-in; no silent fallback; no API keys in shared URLs. |
| Argos Translate / CTranslate2 | Self-hosted option | Self-hosted / model-download | Useful for a server-side translation service, not browser-local by default. |

## Caption model and presentation

| Technology | Status | Processing / network | Why / limits |
|---|---|---|---|
| Structured caption events | Shipped (app emission + lab) | Local / none | Stable segment IDs, sequence, revision, timing, language, optional speaker. The app emits events alongside cards; `labs/events.html` renders them without `app.js`. |
| Lanes / chat views | Shipped | Local / none | Accessible transcript; one card per ASR final. |
| WebVTT export | Shipped | Local / none | Speaker labels and timestamps; SRT/TXT are planned. |
| Manual editor/corrections | Planned | Local / none | Human correction with revisions, not duplicate cards. |
| TTS readout | Planned | Local / none | Browser `speechSynthesis`; opt-in; never every interim. |
| Custom vocabulary / restricted words | Planned | Local / none | Names and acronyms; masking must also apply to translations and exports. |
| Audience viewer | Planned | Local / none | Same-device first via `BroadcastChannel`; no mic permission. |
| Overlay / OBS mode | Planned | Local / none | Same-device browser source; borrows CAPTION.ninja ergonomics without public rooms. |

## Distribution and conference mode

| Technology | Status | Processing / network | Why / limits |
|---|---|---|---|
| `BroadcastChannel` / `window.open` | Planned | Local / none | Same-device audience and overlay; no server. |
| WebSocket relay | Optional future | Self-hosted / streaming | Must be opt-in, self-hostable, text-only, no permanent transcript, no content logs. Cloudflare is an implementation choice, not a requirement. |
| QR code | Optional future | Local / none | Joining aid only; do not start here. |
| CAPTION.ninja relay/interop | External | Cloud / streaming | Do not treat as a stable API. Learn from its UX; do not copy its public-room privacy model. |
| WebRTC / LiveKit / Jitsi | Alternative transport | Self-hosted / streaming | Options if a real-time relay is needed; not part of the core. |

## Model management and supply chain

| Technology | Status | Processing / network | Why / limits |
|---|---|---|---|
| `models/manifest.json` + ModelManager | Shipped | Local / model-download | Pinned revision, exact bytes, SHA-256, licence, consent, progress/cancel, removal. |
| Cache Storage model cache | Shipped | Local / none | Transformers.js reads it through `env.customCache`; no remote model fetch at inference. |
| Self-hosted model mirror | Planned | Self-hosted / model-download | Sovereignty requires an escape from a single model host. |
| Licence/provenance table | Ongoing | — | Every model and borrowed idea needs a licence and attribution. |

## Accessibility and security

| Technology | Status | Notes |
|---|---|---|
| Live regions, focus return, forced-colours | Shipped | Single polite interim region; dialog focus management; high-contrast fallbacks. |
| Per-reader display preferences | Planned | Font, size, contrast, line spacing, RTL, bilingual layout; stored locally. |
| CSP and consent/cache boundaries | Shipped | Scripts/workers/connections are restricted; model hosts are allowlisted. |
| No telemetry/accounts | Shipped | Keep it that way. |
| Threat model for optional relay | Planned | Caption text is visible to the relay; document it, minimise retention, separate publish/view. |

## Testing and demos

| Technology | Status | Notes |
|---|---|---|
| Node contract tests | Shipped | 394 tests at this snapshot, including caption events, provider metadata and the audio queue. |
| CI syntax/contract workflow | Shipped | Runs on PRs and `main`. |
| `labs/` standalone demos | Started | `events.html`, `providers.html` and `audio-queue.html` are live; the remaining pages are planned. See [labs/README.md](labs/README.md). |
| Browser/CDP manual runs | Ad hoc | Used for CSP, model install, worker and synthetic-audio checks. |
| Labelled panel corpus | Planned | Needed for DER/WER/speaker-attributed WER; consent and privacy first. |

## Known limits and debt

- `app.js` is still a large classic script; module seams are the next step.
- The audio queue now reports loss, but the shared audio timeline (Phase 2) is still missing.
- Local Whisper is 5 s chunks, English-only, and has no partials/timestamps.
- Meyda is heuristic speaker grouping, not diarization.
- Live microphone capture still needs a normal-browser/device matrix.
- Chrome Translator is browser-managed and not a sovereignty guarantee.
- WebGPU is unavailable on this Mac, so the WASM path is the working one.
- GitHub Pages limits headers and threading.
- Optional relay, audience viewer and overlay do not exist yet.
- CAPTION.ninja is prior art, not a dependency.

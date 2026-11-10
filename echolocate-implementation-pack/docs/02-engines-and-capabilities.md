# Engine selection, browser capabilities and progressive enhancement

## Product options

STT: `browser-service` (Web Speech; may use cloud), `browser-local` (only if on-device recognition API and language are supported), `webgpu-local`, `wasm-local`. Speaker analysis: `off`, `basic` (existing Meyda), `advanced` (local dedicated model). These settings are **independent**.

Chosen experiment mode: `webgpu-local` + `advanced`. Do not make it the default for all users. Persist selected engine and speaker level, but not automatic download consent across materially changed model versions without reapproval.

## Implementation status (2026-11-10)

| Option | Status |
|---|---|
| `browser-service` | Implemented and default. Chrome/Edge may use a vendor cloud service, disclosed in the privacy notice. |
| `browser-local` | Implemented experimentally in PR #57. Uses `processLocally = true`, `available({ langs, quality: 'conversation', processLocally: true })` and a user-pressed `install()`. The browser owns and downloads the language pack; EchoLocate never fetches weights. The engine choice is persisted independently of language. A reported Chrome 155 Windows no-result regression needs a runtime fallback. |
| `webgpu-local` | Not implemented. |
| `wasm-local` | Not implemented. |
| Speaker `basic` | Implemented (Meyda + pitch). |
| Speaker `off` / `advanced` | Not implemented; `advanced` is the diarization work. |

The capability snapshot now covers secure context, `getUserMedia`, Web Speech
presence, on-device `available()`/`install()`, a WebGPU adapter probe (API vs
adapter found, never a model run), WASM support/SIMD/threads and a storage
estimate. It records a reason for each unavailable engine and runs no network
requests. The Chrome-version mic-analysis gate remains, reported as
`compatibility.captionsOnly`, until it can be replaced and device-tested.

## Capability detection

1. Check secure context and presence of `navigator.mediaDevices.getUserMedia`.
2. Check WebGPU presence; request an adapter and inspect limits/capabilities, recording reasons if unavailable.
3. Check WASM runtime support and any required features (e.g., SIMD/threads) separately.
4. Detect Web Speech API availability, not presumed network success. `SpeechRecognition.available`/`install`/`processLocally` are implemented for `browser-local`; treat `available` as availability, not as proof that recognition will fire results (see the Chrome 155 Windows issue).
5. Check storage estimate and model-cache status. Estimate may be unreliable; error handling remains mandatory.
6. **Do not fetch weight files to probe support**. After consent, verify actual model initialization, including runtime ops, GPU memory and device loss handling.
7. Display user-friendly, screen-reader-readable status without claiming compatibility from an unexecuted model.

## Selection policy

- Current behaviour: the browser speech service is the default, its privacy implications are disclosed, and `browser-local` is an explicit opt-in. Do not trigger a model or language-pack download.
- Future: when no browser engine works, ask whether to install a local model rather than failing unconditionally.
- With explicit WebGPU+advanced choice, start only if both needed models are cached or user approves installation. Report any partial readiness.
- No silent switching across data-location boundaries: `local-only` -> cloud requires new consent.
- Graceful degradation is *per capability*: diarization failure must not stop captions; text failure must not erase the transcript.
- On Firefox and mobile, detect features per version, hardware, permissions and language. Do not make permanent assumptions from browser names; WebGPU does not imply a specific model runs.

## Fallback matrix

| Condition | Behavior |
|---|---|
| WebGPU unsupported | Offer WASM local ASR or browser service with disclosure |
| WebGPU model weight missing | Present model/size/license and explicit approval |
| WebGPU initialization fails | Preserve transcript; offer local WASM if supported, no auto cloud |
| GPU device lost | Stop/restart inference safely; checkpoint final captions, explain recovery |
| Speaker advanced model unavailable/slow | Continue captions; mark attribution Unknown/pending; offer Meyda basic |
| Speaker limit exceeded | Unknown rather than forced assignment |
| Low storage / evicted cache | Explain issue and request action; no automatic repeated download |
| Offline, weights cached | Continue local processing when verified; otherwise state precisely what's unavailable |
| Browser speech unavailable | Offer local model path, not unconditional failure |
| Shared microphone conflicts | Try single capture flow; if Web Speech requires separate ownership, warn and reduce features gracefully |

## UX states

`not-supported`, `available-not-installed`, `awaiting-consent`, `downloading`, `paused-or-cancelled`, `verifying`, `initializing`, `ready`, `running`, `degraded`, `failed`, `deleting`. These are engine-specific, not one global boolean.

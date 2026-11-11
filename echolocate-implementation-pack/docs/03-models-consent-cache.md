# Models, consent, caching and licensing

> **Current status (2026-11-11):** `models/manifest.json` pins
> `whisper-tiny-en` for the WASM engine. ModelManager downloads the seven
> artifacts with consent and SHA-256, and Transformers.js reads them from the
> same Cache Storage via a custom cache (no remote model fetch at inference). Installs
> require approval for the exact revision and a SHA-256 match, can be cancelled,
> and are stored in Cache Storage; removal revokes consent and never touches
> transcripts. The experimental `browser-local` engine asks the browser to
> install a language pack only after a user action. Optional translation uses
> Chrome's built-in Translator API; it now requires per-language-pair consent
> before `Translator.create`, and refusal leaves captions working. The service worker refuses to cache `models/`,
> `onnx-runtime/` and ONNX artifacts.

## Candidates (must independently verify current cards and terms)

| Role | Candidate | URL | Inference starting point |
|---|---|---|---|
| WebGPU ASR | Whisper or Parakeet implementation from Whisper Web | https://github.com/adamchaboryk/whisper-web | Transformers.js/WebGPU; select based on benchmark |
| Speaker segmentation | ONNX PyAnnote segmentation 3.0 | https://huggingface.co/onnx-community/pyannote-segmentation-3.0 | fp32 WASM (existing Whisper Web reference) |
| Speaker embeddings | ONNX WeSpeaker ResNet34-LM | https://huggingface.co/onnx-community/wespeaker-voxceleb-resnet34-LM | q8 WASM (existing Whisper Web reference) |
| Alternative embeddings | SpeechBrain ECAPA | https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb | Evaluate browser conversion complexity |
| Benchmark (offline) | PyAnnote Community-1 | https://huggingface.co/pyannote/speaker-diarization-community-1 | Python benchmark, not initial browser engine |

Whisper Web's `src/worker.js` (as reviewed 2026-11-10) uses segmentation windows around **10 seconds with 2-second overlap**, exclusive-speaker embeddings from **0.75–5 seconds** of audio, segmentation `wasm/fp32`, WeSpeaker `wasm/q8`, and a project-specific clustering threshold. **Do not transfer its threshold directly to EchoLocate without validation.** Check upstream code/version/terms.

## Consent workflow

1. Fetch a small signed/pinned **metadata manifest**, not weight files.
2. Display identity, revision, license, model size, expected local storage, execution target, source domain and privacy description.
3. Separate consent for ASR and speaker models; provide clear 'Not now' and baseline option.
4. On accept, download selected models; show real progress, errors, retry and cancellation.
5. Verify hashes for each artifact; pin model revision and ONNX/runtime compatibility.
6. Initialize worker (progress separately from download).
7. Cache by immutable revision and runtime compatibility; support purge of only selected model assets.
8. Keep transcript storage and speaker profiles separate from model cache; deleting a model does not delete transcripts, and deleting session profiles does not necessarily delete weights.

Browser caches are subject to storage eviction, and downloads may be retried only with appropriate consent. `navigator.storage.persist()` can be requested where appropriate but is not guaranteed. Service Worker offline caching should not blindly pre-cache large weights.

## License and origin review

Licenses vary by model, weights and converted artifacts. Previously documented model cards indicate MIT for PyAnnote segmentation 3.0 and CC BY 4.0 for WeSpeaker, while a conversion repository can have additional notices. Confirm provenance and conditions for each **exact revision** and its dependencies. This pack does **not** distribute any weights or vendor code.

## Manifest

`config/models.example.json` is intentionally non-deployable: placeholders for SHA-256, exact weights sizes and IDs must be filled after verification. No guessed figures should be presented to the user as exact download commitments.

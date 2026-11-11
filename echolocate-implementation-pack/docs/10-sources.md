# Reference index and verification checklist

**EchoLocate:** https://github.com/mgifford/EchoLocate

**Existing pipeline:** https://github.com/mgifford/EchoLocate/blob/main/SPEECH_TO_TEXT_IMPLEMENTATION.md

**Existing adapter plan:** https://github.com/mgifford/EchoLocate/blob/main/STT_ADAPTER_MIGRATION_PLAN.md

**Whisper Web:** https://github.com/adamchaboryk/whisper-web

**Whisper Web worker:** https://github.com/adamchaboryk/whisper-web/blob/main/src/worker.js

**Transformers.js:** https://huggingface.co/docs/transformers.js/index

**WebGPU:** https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

**Web Speech API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

**PyAnnote segmentation:** https://huggingface.co/onnx-community/pyannote-segmentation-3.0

**WeSpeaker:** https://huggingface.co/onnx-community/wespeaker-voxceleb-resnet34-LM

**SpeechBrain ECAPA alternative:** https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb

**PyAnnote Community-1 benchmark:** https://huggingface.co/pyannote/speaker-diarization-community-1

**SpeechRecognition.available():** https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static

**SpeechRecognition.install():** https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/install_static

**On-device speech explainer:** https://github.com/webaudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md

**Chrome 155 Windows on-device no-result issue:** https://issues.chromium.org/issues/579050368

**Whisper tiny.en ONNX (Apache-2.0):** https://huggingface.co/Xenova/whisper-tiny.en

**Transformers.js:** https://github.com/xenova/transformers.js

**Whisper base ONNX (Apache-2.0):** https://huggingface.co/onnx-community/whisper-base

**Whisper tiny ONNX:** https://huggingface.co/onnx-community/whisper-tiny

**Parakeet TDT 0.6B v2 ONNX (CC-BY-4.0):** https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx

**AMI meeting corpus:** https://groups.inf.ed.ac.uk/ami/corpus/

**VoxConverse:** https://www.robots.ox.ac.uk/~vgg/data/voxconverse/

## Before implementing

- Verify the latest Whisper Web model names, commits, use of WASM vs WebGPU, tested hardware and licensing.
- Verify current Hugging Face model card licenses, gated access, revisions and exact file sizes. Converted artifacts can carry different notices from original models.
- Verify API compatibility and exact browser support for the selected versions.
- Verify GitHub Pages CSP/cross-origin isolation constraints if WASM threads or shared memory are used. Pages cannot set COOP/COEP headers, so `SharedArrayBuffer` is unavailable; assume single-threaded WASM.
- Verify real inference timing; sample code does not establish real-time performance.

/**
 * Local Whisper inference worker (WASM).
 *
 * Model files are downloaded and hash-verified by ModelManager, then stored in
 * Cache Storage under their exact Hugging Face URLs. Transformers.js is pointed
 * at that cache and remote model loading is disabled, so inference never
 * touches the network.
 */
import { pipeline, env } from './vendor/transformers/transformers.min.js';

const MODEL_CACHE = 'echolocate-models-v1';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = {
  async match(request) {
    // Transformers.js checks the local path first; our files are cached under
    // the remote (Hugging Face) URL instead.
    if (typeof request === 'string' && request.startsWith('/models/')) return undefined;
    try {
      const cache = await caches.open(MODEL_CACHE);
      return await cache.match(request);
    } catch {
      return undefined;
    }
  },
  async put() {
    // ModelManager owns writes to the model cache.
  },
};

env.backends.onnx.wasm.wasmPaths = new URL('./vendor/transformers/', import.meta.url).href;

let transcriber = null;

self.addEventListener('message', async (event) => {
  const data = event.data || {};

  if (data.type === 'init') {
    try {
      const started = performance.now();
      transcriber = await pipeline('automatic-speech-recognition', data.model, {
        revision: data.revision,
        quantized: true,
        progress_callback: (progress) => {
          self.postMessage({ type: 'progress', progress });
        },
      });
      self.postMessage({ type: 'ready', loadMs: Math.round(performance.now() - started) });
    } catch (err) {
      self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
    }
    return;
  }

  if (data.type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ type: 'error', id: data.id, message: 'Whisper is not initialised' });
      return;
    }
    try {
      const started = performance.now();
      const output = await transcriber(data.audio, { chunk_length_s: 30, stride_length_s: 5 });
      self.postMessage({
        type: 'result',
        id: data.id,
        text: (output && output.text) || '',
        ms: Math.round(performance.now() - started),
      });
    } catch (err) {
      self.postMessage({ type: 'error', id: data.id, message: err && err.message ? err.message : String(err) });
    }
  }
});

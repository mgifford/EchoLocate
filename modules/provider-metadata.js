/**
 * Provider metadata — a small, pure module that makes local/cloud/browser
 * processing explicit. The UI can render badges from this instead of guessing
 * from an engine name.
 *
 * Browser: window.ProviderMetadata
 * Node:    require('./modules/provider-metadata.js')
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ProviderMetadata = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROVIDERS = Object.freeze({
    'asr.browser-service': Object.freeze({
      id: 'asr.browser-service',
      label: 'Browser speech service',
      kind: 'asr',
      processing: 'cloud',
      network: 'streaming',
      description: 'Chrome/Edge speech recognition; audio may be processed by the browser vendor.',
    }),
    'asr.browser-local': Object.freeze({
      id: 'asr.browser-local',
      label: 'Chrome on-device recognizer',
      kind: 'asr',
      processing: 'browser-managed',
      network: 'model-download',
      description: 'Chrome manages the language pack; inference is local, but the pack is vendor-managed.',
    }),
    'asr.wasm-local': Object.freeze({
      id: 'asr.wasm-local',
      label: 'Local Whisper (WASM)',
      kind: 'asr',
      processing: 'local',
      network: 'model-download',
      description: 'Whisper runs in this tab from the hash-verified model cache.',
    }),
    'translation.original': Object.freeze({
      id: 'translation.original',
      label: 'Original only',
      kind: 'translation',
      processing: 'local',
      network: 'none',
      description: 'No translation; source captions only.',
    }),
    'translation.chrome': Object.freeze({
      id: 'translation.chrome',
      label: 'Chrome Translator',
      kind: 'translation',
      processing: 'browser-managed',
      network: 'model-download',
      description: 'Chrome manages the translation model; not a sovereignty guarantee.',
    }),
    'translation.bergamot': Object.freeze({
      id: 'translation.bergamot',
      label: 'Bergamot',
      kind: 'translation',
      processing: 'local',
      network: 'model-download',
      description: 'Mozilla Bergamot runs locally for a bounded set of pairs.',
    }),
    'translation.remote': Object.freeze({
      id: 'translation.remote',
      label: 'Remote translation',
      kind: 'translation',
      processing: 'cloud',
      network: 'streaming',
      description: 'Explicit opt-in only; never a silent fallback.',
    }),
  });

  const PROCESSING_LABELS = Object.freeze({
    local: 'On this device',
    'browser-managed': 'Browser-managed',
    cloud: 'Cloud',
    'self-hosted': 'Self-hosted',
  });

  const NETWORK_LABELS = Object.freeze({
    none: 'No network',
    'model-download': 'Model download',
    streaming: 'Streaming',
  });

  function getProvider(id) {
    return PROVIDERS[id] || null;
  }

  function processingLabel(providerOrId) {
    const provider = typeof providerOrId === 'string' ? getProvider(providerOrId) : providerOrId;
    return provider ? (PROCESSING_LABELS[provider.processing] || provider.processing) : 'Unknown';
  }

  function networkLabel(providerOrId) {
    const provider = typeof providerOrId === 'string' ? getProvider(providerOrId) : providerOrId;
    return provider ? (NETWORK_LABELS[provider.network] || provider.network) : 'Unknown';
  }

  function describeProvider(id) {
    const provider = getProvider(id);
    if (!provider) return null;
    return {
      ...provider,
      processingLabel: processingLabel(provider),
      networkLabel: networkLabel(provider),
      badge: `${processingLabel(provider)} · ${networkLabel(provider)}`,
    };
  }

  function listProviders(kind) {
    return Object.values(PROVIDERS)
      .filter((provider) => !kind || provider.kind === kind)
      .map((provider) => describeProvider(provider.id));
  }

  return {
    PROVIDERS,
    getProvider,
    processingLabel,
    networkLabel,
    describeProvider,
    listProviders,
  };
});

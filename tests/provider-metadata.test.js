'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  PROVIDERS,
  getProvider,
  processingLabel,
  networkLabel,
  describeProvider,
  listProviders,
} = require('../modules/provider-metadata.js');

describe('provider metadata', () => {
  it('describes local browser Whisper as local with a model download', () => {
    const provider = describeProvider('asr.wasm-local');
    assert.equal(provider.processing, 'local');
    assert.equal(provider.network, 'model-download');
    assert.equal(provider.processingLabel, 'On this device');
    assert.equal(provider.badge, 'On this device · Model download');
  });

  it('labels the browser service as cloud streaming', () => {
    assert.equal(processingLabel('asr.browser-service'), 'Cloud');
    assert.equal(networkLabel('asr.browser-service'), 'Streaming');
  });

  it('labels Chrome on-device as browser-managed, not local', () => {
    const provider = getProvider('asr.browser-local');
    assert.equal(provider.processing, 'browser-managed');
    assert.notEqual(provider.processing, 'local');
  });

  it('lists providers by kind and preserves the unknown case', () => {
    assert.ok(listProviders('asr').every((provider) => provider.kind === 'asr'));
    assert.ok(listProviders('translation').some((provider) => provider.id === 'translation.bergamot'));
    assert.equal(getProvider('missing'), null);
    assert.equal(describeProvider('missing'), null);
    assert.equal(processingLabel('missing'), 'Unknown');
  });

  it('keeps remote translation opt-in metadata explicit', () => {
    assert.equal(PROVIDERS['translation.remote'].processing, 'cloud');
    assert.equal(PROVIDERS['translation.remote'].network, 'streaming');
    assert.match(PROVIDERS['translation.remote'].description, /opt-in/i);
  });
});

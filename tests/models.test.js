'use strict';

/**
 * ModelManager tests: consent gating, manifest validation, integrity checks,
 * cancellation, storage refusal and removal.
 *
 * Network and Cache Storage are mocked; no real downloads happen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf-8');
const encoder = new TextEncoder();
const MODEL_BYTES = encoder.encode('test-model-bytes');

function makeLocalStorage() {
  const store = Object.create(null);
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

function makeCaches() {
  const entries = new Map();
  return {
    _entries: entries,
    async open() {
      return {
        put: async (request, response) => { entries.set(request.url, response); },
        match: async (request) => entries.get(request.url) || null,
        delete: async (request) => entries.delete(request.url),
      };
    },
  };
}

function makeElement() {
  const attrs = Object.create(null);
  return {
    style: { setProperty() {} },
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    className: '',
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getAttribute: (k) => attrs[k] ?? null,
    setAttribute: (k, v) => { attrs[k] = v; },
    addEventListener() {},
    appendChild() {},
    append() {},
    remove() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    showModal() {},
    close() {},
    open: false,
  };
}

function loadApp() {
  const ctx = vm.createContext({
    URL,
    Request,
    Response,
    Headers,
    AbortController,
    DOMException,
    TextEncoder,
    crypto: webcrypto,
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    localStorage: makeLocalStorage(),
    document: {
      readyState: 'loading',
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => makeElement(),
      addEventListener() {},
      removeEventListener() {},
      documentElement: {
        getAttribute: () => null,
        setAttribute() {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      },
      body: { appendChild() {}, contains: () => false, classList: { add() {}, remove() {} } },
    },
    window: {
      isSecureContext: true,
      Meyda: null,
      SpeechRecognition: null,
      webkitSpeechRecognition: null,
      addEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      location: { href: 'http://localhost:8099/' },
    },
    navigator: {
      userAgent: 'Chrome/157',
      onLine: true,
      mediaDevices: null,
      storage: { estimate: async () => ({ usage: 0, quota: 10_000_000_000 }) },
    },
    location: { href: 'http://localhost:8099/' },
    caches: makeCaches(),
    fetch: () => Promise.reject(new Error('fetch not expected in this test')),
    performance: { now: () => 0 },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    Promise,
  });
  vm.runInContext(appCode, ctx);
  return ctx;
}

const MODEL_BASE = {
  id: 'test-model',
  displayName: 'Test model',
  role: 'speech-to-text',
  sourceUrl: 'https://models.example/test/',
  revision: 'a'.repeat(40),
  license: 'MIT',
  declaredBytes: MODEL_BYTES.byteLength,
  artifacts: [],
  backends: ['wasm'],
};

async function makeModel(overrides = {}) {
  const digest = await webcrypto.subtle.digest('SHA-256', MODEL_BYTES);
  const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const model = {
    ...MODEL_BASE,
    ...overrides,
    artifacts: [{
      path: 'model.onnx',
      sha256,
      bytes: MODEL_BYTES.byteLength,
    }],
  };
  return model;
}

function setManifest(ctx, manifest) {
  vm.runInContext(`
    ModelManager._manifest = ${JSON.stringify(manifest)};
    ModelManager._consent = {};
    ModelManager._meta = {};
  `, ctx);
}

function configure(ctx, { fetchImpl = null, quota = 10_000_000_000 } = {}) {
  if (fetchImpl) ctx.fetch = fetchImpl;
  ctx.navigator.storage.estimate = async () => ({ usage: 0, quota });
}

describe('validateModelManifest', () => {
  const fn = loadApp().validateModelManifest;

  it('accepts an empty deployable manifest', () => {
    const result = fn({ schemaVersion: 1, deployable: true, models: [] });
    assert.equal(result.ok, true);
  });

  it('accepts a fully specified model', async () => {
    const model = await makeModel();
    const result = fn({ schemaVersion: 1, models: [model] });
    assert.equal(result.ok, true, result.errors.join('; '));
  });

  it('rejects placeholders, bad hashes and unpinned revisions', async () => {
    const model = await makeModel({ revision: 'VERIFY_PINNED_REVISION' });
    model.artifacts[0].sha256 = 'abc';
    const result = fn({ schemaVersion: 2, models: [model] });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('schemaVersion')));
    assert.ok(result.errors.some((e) => e.includes('revision')));
    assert.ok(result.errors.some((e) => e.includes('sha256')));
  });

  it('rejects non-https sources and path traversal', async () => {
    const model = await makeModel({ sourceUrl: 'http://models.example/test/' });
    model.artifacts[0].path = '../model.onnx';
    const result = fn({ schemaVersion: 1, models: [model] });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('https')));
    assert.ok(result.errors.some((e) => e.includes('relative path')));
  });
});

describe('formatBytes', () => {
  const fn = loadApp().formatBytes;

  it('formats bytes, kB, MB and GB', () => {
    assert.equal(fn(999), '999 B');
    assert.equal(fn(1500), '1.5 kB');
    assert.equal(fn(146_000_000), '146 MB');
    assert.equal(fn(1_500_000_000), '1.5 GB');
  });

  it('handles invalid values', () => {
    assert.equal(fn(-1), 'unknown size');
    assert.equal(fn(Number.NaN), 'unknown size');
  });
});

describe('ModelManager consent and install', () => {
  it('refuses to download before consent and makes no request', async () => {
    const ctx = loadApp();
    const model = await makeModel();
    setManifest(ctx, { schemaVersion: 1, models: [model] });

    let requests = 0;
    configure(ctx, { fetchImpl: async () => { requests += 1; return new Response(MODEL_BYTES); } });

    await assert.rejects(
      vm.runInContext(`ModelManager.install(ModelManager.get('test-model'))`, ctx),
      /consent required/i,
    );
    assert.equal(requests, 0);
  });

  it('downloads, verifies and caches after approval', async () => {
    const ctx = loadApp();
    const model = await makeModel();
    setManifest(ctx, { schemaVersion: 1, models: [model] });

    const requested = [];
    configure(ctx, {
      fetchImpl: async (url) => {
        requested.push(String(url));
        return new Response(MODEL_BYTES, { headers: { 'content-length': String(MODEL_BYTES.byteLength) } });
      },
    });

    const result = await vm.runInContext(`(async () => {
      const model = ModelManager.get('test-model');
      ModelManager.approve(model);
      const installed = await ModelManager.install(model);
      return {
        installed,
        isInstalled: ModelManager.isInstalled(model),
        verified: await ModelManager.verify(model),
      };
    })()`, ctx);

    assert.equal(result.installed.installed, true);
    assert.equal(result.installed.cached, false);
    assert.equal(result.isInstalled, true);
    assert.equal(result.verified, true);
    assert.equal(requested.length, 1);
    assert.match(requested[0], /models\.example\/test\/model\.onnx/);
    assert.equal(ctx.caches._entries.size, 1);
  });

  it('rejects a hash mismatch and leaves no cached artifact', async () => {
    const ctx = loadApp();
    const model = await makeModel();
    model.artifacts[0].sha256 = '0'.repeat(64);
    setManifest(ctx, { schemaVersion: 1, models: [model] });
    configure(ctx, { fetchImpl: async () => new Response(MODEL_BYTES) });

    await assert.rejects(
      vm.runInContext(`(async () => {
        const model = ModelManager.get('test-model');
        ModelManager.approve(model);
        return ModelManager.install(model);
      })()`, ctx),
      /integrity check failed/i,
    );
    assert.equal(ctx.caches._entries.size, 0);
    assert.equal(vm.runInContext(`ModelManager.isInstalled(ModelManager.get('test-model'))`, ctx), false);
  });

  it('refuses when storage is too small', async () => {
    const ctx = loadApp();
    const model = await makeModel();
    setManifest(ctx, { schemaVersion: 1, models: [model] });
    let requests = 0;
    configure(ctx, {
      quota: 10,
      fetchImpl: async () => { requests += 1; return new Response(MODEL_BYTES); },
    });

    await assert.rejects(
      vm.runInContext(`(async () => {
        const model = ModelManager.get('test-model');
        ModelManager.approve(model);
        return ModelManager.install(model);
      })()`, ctx),
      /not enough storage/i,
    );
    assert.equal(requests, 0);
  });

  it('rejects a model that is not in the trusted manifest', async () => {
    const ctx = loadApp();
    const model = await makeModel();
    setManifest(ctx, { schemaVersion: 1, models: [] });
    configure(ctx, { fetchImpl: async () => new Response(MODEL_BYTES) });

    await assert.rejects(
      vm.runInContext(`(async () => {
        ModelManager.approve(${JSON.stringify(model)});
        return ModelManager.install(${JSON.stringify(model)});
      })()`, ctx),
      /trusted manifest/i,
    );
  });

  it('requires consent for the exact revision', async () => {
    const ctx = loadApp();
    const model = await makeModel();
    setManifest(ctx, { schemaVersion: 1, models: [model] });
    vm.runInContext(`
      ModelManager.approve(ModelManager.get('test-model'));
      ModelManager._manifest.models[0].revision = 'b'.repeat(40);
    `, ctx);
    assert.equal(vm.runInContext(`ModelManager.isApproved(ModelManager.get('test-model'))`, ctx), false);
  });

  it('cancels before fetch when the signal is already aborted', async () => {
    const ctx = loadApp();
    const model = await makeModel();
    setManifest(ctx, { schemaVersion: 1, models: [model] });
    let requests = 0;
    configure(ctx, { fetchImpl: async () => { requests += 1; return new Response(MODEL_BYTES); } });

    await assert.rejects(
      vm.runInContext(`(async () => {
        const model = ModelManager.get('test-model');
        ModelManager.approve(model);
        const controller = new AbortController();
        controller.abort();
        return ModelManager.install(model, { signal: controller.signal });
      })()`, ctx),
      /aborted/i,
    );
    assert.equal(requests, 0);
  });

  it('removes the cached artifact and consent but keeps transcripts', async () => {
    const ctx = loadApp();
    const model = await makeModel();
    setManifest(ctx, { schemaVersion: 1, models: [model] });
    configure(ctx, { fetchImpl: async () => new Response(MODEL_BYTES) });

    const result = await vm.runInContext(`(async () => {
      const model = ModelManager.get('test-model');
      ModelManager.approve(model);
      await ModelManager.install(model);
      Storage.save({ segmentId: 'seg-1', text: 'keep me' });
      await ModelManager.remove(model);
      return {
        installed: ModelManager.isInstalled(model),
        approved: ModelManager.isApproved(model),
        cards: Storage.allCards().length,
      };
    })()`, ctx);

    assert.equal(result.installed, false);
    assert.equal(result.approved, false);
    assert.equal(result.cards, 1);
    assert.equal(ctx.caches._entries.size, 0);
  });
});

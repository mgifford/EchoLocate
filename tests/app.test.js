'use strict';

/**
 * Tests for app.js pure functions.
 *
 * app.js is loaded into an isolated vm context so browser APIs (document,
 * window, localStorage) can be stubbed out without a real browser environment.
 *
 * We use the non-strict assert module for deepEqual so cross-realm objects
 * returned by vm-context functions compare structurally rather than by
 * prototype identity.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// ── Minimal browser-globals mock ─────────────────────────────────────────────

function makeMockLocalStorage() {
  const store = Object.create(null);
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

function makeMockElement() {
  const attrs = Object.create(null);
  const classes = new Set();
  return {
    style: {},
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    value: '',
    children: [],
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, force) => {
        if (force === undefined ? classes.has(c) : !force) classes.delete(c);
        else classes.add(c);
      },
      contains: (c) => classes.has(c),
    },
    getAttribute: (k) => attrs[k] ?? null,
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: (k) => { delete attrs[k]; },
    addEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    focus: () => {},
  };
}

// ── Load app.js into an isolated vm context ───────────────────────────────────

const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf-8');

function loadApp() {
  const mockDoc = {
    // Setting readyState to 'loading' prevents boot() from being called
    // synchronously, keeping the module load side-effect-free.
    readyState: 'loading',
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeMockElement(),
    addEventListener: () => {},
    removeEventListener: () => {},
    documentElement: {
      getAttribute: () => null,
      setAttribute: () => {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false,
      },
    },
    body: {
      appendChild: () => {},
      contains: () => false,
      classList: { add: () => {}, remove: () => {} },
    },
  };

  const ctx = vm.createContext({
    URL,
    console,
    localStorage: makeMockLocalStorage(),
    document: mockDoc,
    window: {
      isSecureContext: false,
      Meyda: null,
      SpeechRecognition: null,
      webkitSpeechRecognition: null,
      confirm: () => false,
      addEventListener: () => {},
      location: { href: 'http://localhost/' },
    },
    navigator: {
      userAgent: 'Mozilla/5.0 (Test)',
      clipboard: null,
      mediaDevices: null,
    },
    location: { href: 'http://localhost/' },
    performance: { now: () => 0 },
    fetch: () => Promise.reject(new Error('fetch not available in tests')),
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    Promise,
  });

  vm.runInContext(appCode, ctx);
  return ctx;
}

const ctx = loadApp();

// ── Helper to set State.pitchHistory inside the vm context ───────────────────
// State is declared with `const` in app.js so it is NOT a property on the vm
// context object (const/let top-level declarations are script-scoped, not
// global-scoped).  We use vm.runInContext to reach it from outside.

function setPitchHistory(values) {
  vm.runInContext(`State.pitchHistory = ${JSON.stringify(values)}`, ctx);
}

// ── normalizeTranslationTargets ───────────────────────────────────────────────

describe('normalizeTranslationTargets', () => {
  const fn = ctx.normalizeTranslationTargets;

  it('returns empty array for non-array input', () => {
    assert.deepEqual(fn(null), []);
    assert.deepEqual(fn(undefined), []);
    assert.deepEqual(fn('fr'), []);
    assert.deepEqual(fn({}), []);
  });

  it('returns empty array for empty array', () => {
    assert.deepEqual(fn([]), []);
  });

  it('lowercases codes', () => {
    assert.deepEqual(fn(['FR', 'DE']), ['fr', 'de']);
  });

  it('filters out codes shorter than 2 chars', () => {
    assert.deepEqual(fn(['f', 'fr']), ['fr']);
  });

  it('filters out codes longer than 8 chars', () => {
    assert.deepEqual(fn(['toolongcode', 'fr']), ['fr']);
  });

  it('filters out codes with non-alpha characters', () => {
    assert.deepEqual(fn(['fr2', 'fr']), ['fr']);
    assert.deepEqual(fn(['fr-FR', 'de']), ['de']); // hyphen not allowed
  });

  it('deduplicates codes', () => {
    assert.deepEqual(fn(['fr', 'fr', 'de']), ['fr', 'de']);
  });

  it('limits output to 2 codes', () => {
    assert.deepEqual(fn(['fr', 'de', 'es', 'zh']), ['fr', 'de']);
  });

  it('handles mixed valid and invalid codes', () => {
    assert.deepEqual(fn(['fr', '', 'toolong123', 'de']), ['fr', 'de']);
  });
});

// ── parseMaxSpeakers ──────────────────────────────────────────────────────────

describe('parseMaxSpeakers', () => {
  const fn = ctx.parseMaxSpeakers;

  it('returns the value for valid integers 1–6', () => {
    assert.equal(fn('1'), 1);
    assert.equal(fn('3'), 3);
    assert.equal(fn('6'), 6);
  });

  it('clamps to 6 when value exceeds maximum', () => {
    assert.equal(fn('10'), 6);
    assert.equal(fn('100'), 6);
  });

  it('clamps to 1 when value is below minimum', () => {
    assert.equal(fn('0'), 1);
    assert.equal(fn('-5'), 1);
  });

  it('returns default (6) for NaN / empty / null input', () => {
    assert.equal(fn(''), 6);
    assert.equal(fn(null), 6);
    assert.equal(fn('abc'), 6);
  });

  it('truncates floats to integer (parseInt behaviour)', () => {
    assert.equal(fn('3.9'), 3);
  });
});

// ── mean ─────────────────────────────────────────────────────────────────────

describe('mean', () => {
  const fn = ctx.mean;

  it('returns 0 for empty array', () => {
    assert.equal(fn([]), 0);
  });

  it('returns the value for a single-element array', () => {
    assert.equal(fn([7]), 7);
  });

  it('computes the arithmetic mean', () => {
    assert.equal(fn([1, 2, 3]), 2);
    assert.equal(fn([0, 10]), 5);
  });

  it('handles negative values', () => {
    assert.equal(fn([-2, 2]), 0);
    assert.equal(fn([-3, -1]), -2);
  });

  it('handles floating-point values', () => {
    assert.ok(Math.abs(fn([0.1, 0.2, 0.3]) - 0.2) < 1e-10);
  });
});

// ── meanVector ────────────────────────────────────────────────────────────────

describe('meanVector', () => {
  const fn = ctx.meanVector;

  it('returns empty array for empty input', () => {
    assert.deepEqual(fn([]), []);
  });

  it('returns a copy of the single vector', () => {
    assert.deepEqual(fn([[1, 2, 3]]), [1, 2, 3]);
  });

  it('computes element-wise mean of two vectors', () => {
    const result = fn([[0, 4], [2, 0]]);
    assert.deepEqual(result, [1, 2]);
  });

  it('computes element-wise mean of three vectors', () => {
    const result = fn([[3, 0], [0, 3], [0, 0]]);
    assert.equal(result[0], 1);
    assert.equal(result[1], 1);
  });

  it('treats missing (undefined) elements as 0', () => {
    // Second vector is shorter — missing elements should be treated as 0
    const result = fn([[2, 4], [0]]);
    assert.equal(result[0], 1);   // (2+0)/2
    assert.equal(result[1], 2);   // (4+0)/2 — missing treated as 0
  });
});

// ── cosineSimilarity ──────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  const fn = ctx.cosineSimilarity;

  it('returns 1 for identical vectors', () => {
    assert.ok(Math.abs(fn([1, 2, 3], [1, 2, 3]) - 1) < 1e-10);
  });

  it('returns 1 for parallel vectors (different magnitudes)', () => {
    assert.ok(Math.abs(fn([1, 0], [5, 0]) - 1) < 1e-10);
  });

  it('returns 0 for orthogonal vectors', () => {
    assert.ok(Math.abs(fn([1, 0], [0, 1])) < 1e-10);
  });

  it('returns -1 for anti-parallel vectors', () => {
    assert.ok(Math.abs(fn([1, 0], [-1, 0]) - (-1)) < 1e-10);
  });

  it('returns 0 for null or undefined inputs', () => {
    assert.equal(fn(null, [1, 2]), 0);
    assert.equal(fn([1, 2], null), 0);
    assert.equal(fn(null, null), 0);
  });

  it('returns 0 for empty arrays', () => {
    assert.equal(fn([], []), 0);
  });

  it('returns 0 for vectors of different lengths', () => {
    assert.equal(fn([1, 2], [1, 2, 3]), 0);
  });

  it('returns 0 when either vector is all zeros', () => {
    assert.equal(fn([0, 0, 0], [1, 2, 3]), 0);
    assert.equal(fn([1, 2, 3], [0, 0, 0]), 0);
  });

  it('treats undefined/missing elements as 0', () => {
    // Arrays that include undefined → treated as 0 in the loop
    const a = [1, undefined, 0];
    const b = [1, 0, 0];
    // Both have the same effective vector [1,0,0] → similarity = 1
    assert.ok(Math.abs(fn(a, b) - 1) < 1e-10);
  });
});

// ── buildSignatureVector ──────────────────────────────────────────────────────

describe('buildSignatureVector', () => {
  const fn = ctx.buildSignatureVector;

  it('returns null for null frame', () => {
    assert.equal(fn(null), null);
    assert.equal(fn(undefined), null);
  });

  it('scales MFCC coefficients by 1/100', () => {
    const frame = { mfcc: [100, 200, 0], spectralFlatness: 0, spectralSlope: 0 };
    const vec = fn(frame);
    assert.equal(vec[0], 1);    // 100/100
    assert.equal(vec[1], 2);    // 200/100
    assert.equal(vec[2], 0);    // 0/100
  });

  it('clamps spectralFlatness * 10 into [0, 1]', () => {
    const frameHigh = { mfcc: [], spectralFlatness: 0.5, spectralSlope: 0 };
    const vecHigh = fn(frameHigh);
    // flatness * 10 = 5, clamped to 1
    assert.equal(vecHigh[vecHigh.length - 2], 1);

    const frameLow = { mfcc: [], spectralFlatness: -1, spectralSlope: 0 };
    const vecLow = fn(frameLow);
    // flatness * 10 = -10, clamped to 0
    assert.equal(vecLow[vecLow.length - 2], 0);

    const frameMid = { mfcc: [], spectralFlatness: 0.05, spectralSlope: 0 };
    const vecMid = fn(frameMid);
    // 0.05 * 10 = 0.5
    assert.ok(Math.abs(vecMid[vecMid.length - 2] - 0.5) < 1e-10);
  });

  it('clamps spectralSlope * 1000 into [-1, 1]', () => {
    const framePos = { mfcc: [], spectralFlatness: 0, spectralSlope: 0.002 };
    const vecPos = fn(framePos);
    // 0.002 * 1000 = 2, clamped to 1
    assert.equal(vecPos[vecPos.length - 1], 1);

    const frameNeg = { mfcc: [], spectralFlatness: 0, spectralSlope: -0.002 };
    const vecNeg = fn(frameNeg);
    // -0.002 * 1000 = -2, clamped to -1
    assert.equal(vecNeg[vecNeg.length - 1], -1);

    const frameMid = { mfcc: [], spectralFlatness: 0, spectralSlope: 0.0005 };
    const vecMid = fn(frameMid);
    // 0.0005 * 1000 = 0.5
    assert.ok(Math.abs(vecMid[vecMid.length - 1] - 0.5) < 1e-10);
  });

  it('treats non-finite spectralFlatness/spectralSlope as 0', () => {
    const frame = { mfcc: [], spectralFlatness: NaN, spectralSlope: Infinity };
    const vec = fn(frame);
    // flatness: NaN → not finite → treated as 0 → clamped to 0
    assert.strictEqual(vec[vec.length - 2], 0);
    // slope: Infinity → not finite → treated as 0 → clamped to 0
    assert.strictEqual(vec[vec.length - 1], 0);
  });

  it('returns vector with mfcc part only as long as the provided mfcc array (up to 13)', () => {
    const frame5 = { mfcc: [1, 2, 3, 4, 5], spectralFlatness: 0, spectralSlope: 0 };
    assert.equal(fn(frame5).length, 7); // 5 + flatness + slope

    const frame13 = { mfcc: new Array(13).fill(0), spectralFlatness: 0, spectralSlope: 0 };
    assert.equal(fn(frame13).length, 15); // 13 + 2

    const frame15 = { mfcc: new Array(15).fill(0), spectralFlatness: 0, spectralSlope: 0 };
    assert.equal(fn(frame15).length, 15); // sliced to 13 + 2
  });

  it('handles frame with no mfcc array (uses empty array)', () => {
    const frame = { spectralFlatness: 0, spectralSlope: 0 };
    const vec = fn(frame);
    assert.equal(vec.length, 2); // just flatness + slope
  });
});

// ── classifyTone ──────────────────────────────────────────────────────────────

describe('classifyTone', () => {
  const fn = ctx.classifyTone;

  it('returns "mid" when pitchHistory has fewer than 6 entries', () => {
    setPitchHistory([100, 200, 300]);
    assert.equal(fn(150), 'mid');
    setPitchHistory([]);
    assert.equal(fn(0), 'mid');
  });

  it('returns "low" for value at or below the 33rd percentile', () => {
    // 10 values sorted: [10,20,30,40,50,60,70,80,90,100]
    // 33rd pct index = floor(10*0.33) = 3 → value 40
    // 66th pct index = floor(10*0.66) = 6 → value 70
    setPitchHistory([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assert.equal(fn(40), 'low');
    assert.equal(fn(10), 'low');
  });

  it('returns "high" for value at or above the 66th percentile', () => {
    setPitchHistory([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assert.equal(fn(70), 'high');
    assert.equal(fn(100), 'high');
  });

  it('returns "mid" for values between the two percentiles', () => {
    setPitchHistory([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assert.equal(fn(50), 'mid');
    assert.equal(fn(60), 'mid');
  });

  it('works with exactly 6 history entries', () => {
    // 6 values sorted: [10,20,30,40,50,60]
    // 33rd pct index = floor(6*0.33) = 1 → value 20
    // 66th pct index = floor(6*0.66) = 3 → value 40
    setPitchHistory([10, 20, 30, 40, 50, 60]);
    assert.equal(fn(10), 'low');
    assert.equal(fn(20), 'low');
    assert.equal(fn(30), 'mid');
    assert.equal(fn(40), 'high');
    assert.equal(fn(60), 'high');
  });
});

// ── laneHintFromTone ──────────────────────────────────────────────────────────

describe('laneHintFromTone', () => {
  const fn = ctx.laneHintFromTone;

  it('returns lower-pitch hint for "low"', () => {
    assert.equal(fn('low'), 'Lower pitch profile');
  });

  it('returns higher-pitch hint for "high"', () => {
    assert.equal(fn('high'), 'Higher pitch profile');
  });

  it('returns mid-pitch hint for "mid"', () => {
    assert.equal(fn('mid'), 'Mid pitch profile');
  });

  it('returns mid-pitch hint for unrecognized tones', () => {
    assert.equal(fn('unknown'), 'Mid pitch profile');
    assert.equal(fn(''), 'Mid pitch profile');
    assert.equal(fn(undefined), 'Mid pitch profile');
  });
});

// ── confidenceFromSimilarity ──────────────────────────────────────────────────

describe('confidenceFromSimilarity', () => {
  const fn = ctx.confidenceFromSimilarity;
  // CFG.SIGNATURE_HIGH_SIMILARITY = 0.93
  // CFG.SIGNATURE_MED_SIMILARITY  = 0.88

  it('returns "high" at or above 0.93', () => {
    assert.equal(fn(0.93), 'high');
    assert.equal(fn(1.0), 'high');
    assert.equal(fn(0.95), 'high');
  });

  it('returns "medium" between 0.88 (inclusive) and 0.93 (exclusive)', () => {
    assert.equal(fn(0.88), 'medium');
    assert.equal(fn(0.90), 'medium');
    assert.equal(fn(0.929), 'medium');
  });

  it('returns "low" below 0.88', () => {
    assert.equal(fn(0.879), 'low');
    assert.equal(fn(0.5), 'low');
    assert.equal(fn(0), 'low');
  });

  it('handles boundary values precisely', () => {
    assert.equal(fn(0.93), 'high');
    assert.equal(fn(0.93 - Number.EPSILON), 'medium');
    assert.equal(fn(0.88), 'medium');
    assert.equal(fn(0.88 - Number.EPSILON), 'low');
  });
});

// ── smoothMatch ───────────────────────────────────────────────────────────────

describe('smoothMatch', () => {
  const fn = ctx.smoothMatch;

  function makeCandidate(id, similarity) {
    return { profile: { id }, similarity };
  }

  it('returns null for empty array', () => {
    assert.equal(fn([]), null);
  });

  it('returns the single candidate when only one is provided', () => {
    const c = makeCandidate('s1', 0.9);
    assert.equal(fn([c]), c);
  });

  it('returns the candidate with majority (>= 2 occurrences) when present', () => {
    const a1 = makeCandidate('s1', 0.9);
    const a2 = makeCandidate('s1', 0.85);
    const b  = makeCandidate('s2', 0.95);
    // MATCH_HISTORY_SIZE=3, last 3 = [a1, a2, b] → s1 appears 2× → majority
    const result = fn([a1, a2, b]);
    assert.equal(result.profile.id, 's1');
  });

  it('returns median similarity candidate when no majority', () => {
    const a = makeCandidate('s1', 0.80);
    const b = makeCandidate('s2', 0.90);
    const c = makeCandidate('s3', 0.70);
    // sorted by similarity: [c(0.70), a(0.80), b(0.90)]
    // median index = floor(3/2) = 1 → a (0.80)
    const result = fn([a, b, c]);
    assert.equal(result.profile.id, 's1');
    assert.equal(result.similarity, 0.80);
  });

  it('returns higher-similarity candidate as median for 2 different candidates', () => {
    // sorted ascending: [low, high]; median index = floor(2/2) = 1 → high
    const low  = makeCandidate('s1', 0.70);
    const high = makeCandidate('s2', 0.90);
    const result = fn([low, high]);
    assert.equal(result.profile.id, 's2');
  });

  it('only considers the last MATCH_HISTORY_SIZE (3) candidates', () => {
    // Even though s4 appears many times earlier, the last 3 are s1, s1, s2
    const old1 = makeCandidate('s4', 0.6);
    const old2 = makeCandidate('s4', 0.6);
    const old3 = makeCandidate('s4', 0.6);
    const r1   = makeCandidate('s1', 0.9);
    const r2   = makeCandidate('s1', 0.85);
    const r3   = makeCandidate('s2', 0.80);
    const result = fn([old1, old2, old3, r1, r2, r3]);
    // last 3 = [r1, r2, r3]; s1 appears 2× → majority
    assert.equal(result.profile.id, 's1');
  });
});

// ── formatVttTime ─────────────────────────────────────────────────────────────

describe('formatVttTime', () => {
  const fn = ctx.formatVttTime;

  it('formats zero milliseconds', () => {
    assert.equal(fn(0), '00:00:00.000');
  });

  it('formats whole seconds', () => {
    assert.equal(fn(1000), '00:00:01.000');
    assert.equal(fn(59000), '00:00:59.000');
  });

  it('formats whole minutes', () => {
    assert.equal(fn(60000), '00:01:00.000');
    assert.equal(fn(90000), '00:01:30.000');
  });

  it('formats whole hours', () => {
    assert.equal(fn(3600000), '01:00:00.000');
  });

  it('formats hours, minutes, seconds, and milliseconds together', () => {
    // 1h 1m 1s 500ms = 3661500
    assert.equal(fn(3661500), '01:01:01.500');
  });

  it('pads single-digit values with leading zeros', () => {
    assert.equal(fn(5000), '00:00:05.000');
    assert.equal(fn(61000), '00:01:01.000');
  });

  it('pads milliseconds to 3 digits', () => {
    assert.equal(fn(1), '00:00:00.001');
    assert.equal(fn(50), '00:00:00.050');
  });

  it('floors non-integer milliseconds', () => {
    assert.equal(fn(1500.9), '00:00:01.500');
  });

  it('clamps negative values to 0', () => {
    assert.equal(fn(-100), '00:00:00.000');
  });

  it('handles large multi-hour durations', () => {
    // 25 hours = 90000000 ms
    assert.equal(fn(90000000), '25:00:00.000');
  });
});

// ── toVtt ─────────────────────────────────────────────────────────────────────

describe('toVtt', () => {
  const fn = ctx.toVtt;

  // Use non-zero startedAt so 0 is not treated as falsy by the `||` fallback
  // that falls through to Date.parse(timestamp) → Date.now().
  function makeCard(overrides = {}) {
    return {
      startedAt: 1000,
      speakerLabel: 'Guest 1',
      text: 'Hello world',
      ...overrides,
    };
  }

  it('returns a WEBVTT header for an empty cards array', () => {
    const out = fn([]);
    assert.ok(out.startsWith('WEBVTT - EchoLocate transcript'));
    assert.ok(out.includes('NOTE'));
    assert.ok(out.includes('Generated:'));
  });

  it('includes a cue for a single card', () => {
    const out = fn([makeCard()]);
    // Cue index 1
    assert.ok(out.includes('\n1\n'));
    // Relative start = 0 (base is the first card's startedAt)
    assert.ok(out.includes('00:00:00.000 -->'));
    assert.ok(out.includes('<v Guest 1>Hello world</v>'));
  });

  it('sets cue end time to next card start when endedAt is absent', () => {
    const cards = [
      makeCard({ startedAt: 1000 }),
      makeCard({ startedAt: 4000, text: 'Second' }),
    ];
    const out = fn(cards);
    // base=1000; card 1 has no endedAt → uses next.startedAt(4000) → relative 3000ms
    assert.ok(out.includes('00:00:00.000 --> 00:00:03.000'));
  });

  it('sets cue end time to endedAt when present', () => {
    const out = fn([makeCard({ startedAt: 1000, endedAt: 3000 })]);
    // base=1000; relative end = 3000-1000 = 2000ms
    assert.ok(out.includes('00:00:00.000 --> 00:00:02.000'));
  });

  it('enforces minimum cue duration of 300 ms', () => {
    // endedAt only 50ms after start but minimum is 300ms
    const out = fn([makeCard({ startedAt: 1000, endedAt: 1050 })]);
    assert.ok(out.includes('00:00:00.000 --> 00:00:00.300'));
  });

  it('sorts cards by startedAt', () => {
    const cards = [
      makeCard({ startedAt: 6000, text: 'Second' }),
      makeCard({ startedAt: 1000, text: 'First' }),
    ];
    const out = fn(cards);
    const firstIdx = out.indexOf('First');
    const secondIdx = out.indexOf('Second');
    assert.ok(firstIdx < secondIdx, 'First card should appear before second');
  });

  it('skips cards with empty text', () => {
    const out = fn([makeCard({ text: '' }), makeCard({ startedAt: 2000, text: 'Hello' })]);
    assert.strictEqual((out.match(/<v /g) || []).length, 1);
  });

  it('escapes & < > in cue text', () => {
    const out = fn([makeCard({ text: 'A & B < C > D' })]);
    assert.ok(out.includes('A &amp; B &lt; C &gt; D'));
    assert.ok(!out.includes('A & B'));
  });

  it('prevents --> in cue text from being interpreted as timing separator', () => {
    const out = fn([makeCard({ text: 'A --> B' })]);
    // Pipeline: '>' → '&gt;' makes it '--&gt;', then '--&gt;' → '- &gt;'
    // The output WILL contain '-->' in the timing line; we verify the cue payload is safe.
    assert.ok(out.includes('<v Guest 1>A - &gt; B</v>'));
  });

  it('strips < > from speaker names (protects VTT <v> tag)', () => {
    const out = fn([makeCard({ speakerLabel: '<evil>name</evil>' })]);
    assert.ok(!out.includes('<evil>'));
    assert.ok(out.match(/<v [^>]*>/));
  });

  it('collapses whitespace in speaker names', () => {
    const out = fn([makeCard({ speakerLabel: 'Guest  1  A' })]);
    assert.ok(out.includes('<v Guest 1 A>'));
  });

  it('falls back to "Speaker" for empty/whitespace-only speaker labels', () => {
    const out = fn([makeCard({ speakerLabel: '   ' })]);
    assert.ok(out.includes('<v Speaker>'));
  });

  it('computes timestamps relative to the first card startedAt', () => {
    const cards = [
      makeCard({ startedAt: 10000, text: 'First', endedAt: 12000 }),
      makeCard({ startedAt: 15000, text: 'Second', endedAt: 18000 }),
    ];
    const out = fn(cards);
    // base=10000; first: 0→2s; second: 5s→8s
    assert.ok(out.includes('00:00:00.000 --> 00:00:02.000'));
    assert.ok(out.includes('00:00:05.000 --> 00:00:08.000'));
  });

  it('increments cue index for each non-empty card', () => {
    const cards = [
      makeCard({ startedAt: 1000, text: 'First' }),
      makeCard({ startedAt: 2000, text: '' }),
      makeCard({ startedAt: 3000, text: 'Third' }),
    ];
    const out = fn(cards);
    assert.ok(out.includes('\n1\n'));
    assert.ok(out.includes('\n2\n'));
    assert.ok(!out.includes('\n3\n')); // empty card skipped → only 2 cues
  });
});

// ── toPlainText ───────────────────────────────────────────────────────────────

describe('toPlainText', () => {
  const fn = ctx.toPlainText;

  it('returns empty string for no cards', () => {
    assert.equal(fn([]), '');
  });

  it('formats a single card as "Speaker: text"', () => {
    const card = { startedAt: 0, speakerLabel: 'Alice', text: 'Hello' };
    assert.equal(fn([card]), 'Alice: Hello');
  });

  it('sorts multiple cards by startedAt', () => {
    const cards = [
      { startedAt: 2000, speakerLabel: 'Bob', text: 'World' },
      { startedAt: 0, speakerLabel: 'Alice', text: 'Hello' },
    ];
    const result = fn(cards);
    assert.ok(result.startsWith('Alice: Hello'));
    assert.ok(result.endsWith('Bob: World'));
  });

  it('collapses newlines in text to spaces', () => {
    const card = { startedAt: 0, speakerLabel: 'Alice', text: 'Hello\nworld\nfoo' };
    assert.equal(fn([card]), 'Alice: Hello world foo');
  });

  it('strips HTML special chars from speaker names', () => {
    const card = { startedAt: 0, speakerLabel: '<evil>', text: 'Hi' };
    const result = fn([card]);
    assert.ok(!result.includes('<evil>'));
    assert.ok(result.includes('evil'));
  });

  it('falls back to "Speaker" for missing speakerLabel', () => {
    const card = { startedAt: 0, text: 'Hello' };
    assert.ok(fn([card]).startsWith('Speaker: Hello'));
  });

  it('falls back to empty text for missing text field', () => {
    const card = { startedAt: 0, speakerLabel: 'Alice' };
    assert.equal(fn([card]), 'Alice: ');
  });
});

// ── escapeHTML (app.js) ───────────────────────────────────────────────────────

describe('escapeHTML (app.js)', () => {
  const fn = ctx.escapeHTML;

  it('escapes ampersands', () => {
    assert.equal(fn('a & b'), 'a &amp; b');
  });

  it('escapes < and >', () => {
    assert.equal(fn('<b>bold</b>'), '&lt;b&gt;bold&lt;/b&gt;');
  });

  it('escapes double quotes', () => {
    assert.equal(fn('"text"'), '&quot;text&quot;');
  });

  it('escapes single quotes', () => {
    assert.equal(fn("it's"), 'it&#39;s');
  });

  it('handles all characters at once', () => {
    const input = `<div class="x" data-y='z'>a & b</div>`;
    assert.ok(!fn(input).includes('<div'));
    assert.ok(!fn(input).includes('"x"'));
    assert.ok(!fn(input).includes("'z'"));
    assert.ok(!fn(input).includes('a & b'));
  });

  it('returns empty string unchanged', () => {
    assert.equal(fn(''), '');
  });

  it('coerces non-string input', () => {
    assert.equal(fn(0), '0');
    assert.equal(fn(null), 'null');
  });
});

// ── avgByte ───────────────────────────────────────────────────────────────────

describe('avgByte', () => {
  const fn = ctx.avgByte;

  it('computes the average of a full array', () => {
    assert.equal(fn([10, 20, 30], 0, 3), 20);
  });

  it('computes the average of a slice', () => {
    assert.equal(fn([10, 20, 30, 40], 1, 3), 25); // [20, 30] → 25
  });

  it('returns 0 when start equals end (empty range)', () => {
    assert.equal(fn([10, 20, 30], 1, 1), 0);
  });

  it('handles a single-element range', () => {
    assert.equal(fn([100], 0, 1), 100);
  });

  it('handles all-zero values', () => {
    assert.equal(fn([0, 0, 0], 0, 3), 0);
  });
});

// ── hexToRgba ─────────────────────────────────────────────────────────────────

describe('hexToRgba', () => {
  const fn = ctx.hexToRgba;

  it('converts a valid hex color to rgba string', () => {
    assert.equal(fn('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)');
    assert.equal(fn('#00ff00', 1), 'rgba(0, 255, 0, 1)');
    assert.equal(fn('#0000ff', 0), 'rgba(0, 0, 255, 0)');
  });

  it('handles uppercase hex letters', () => {
    assert.equal(fn('#FF8800', 1), 'rgba(255, 136, 0, 1)');
  });

  it('handles hex without leading #', () => {
    assert.equal(fn('ff8800', 1), 'rgba(255, 136, 0, 1)');
  });

  it('returns fallback blue for invalid hex', () => {
    const fallback = fn('notvalid', 0.5);
    assert.ok(fallback.startsWith('rgba(77, 171, 247,'));
  });

  it('returns fallback blue for empty input', () => {
    const fallback = fn('', 1);
    assert.ok(fallback.startsWith('rgba(77, 171, 247,'));
  });

  it('returns fallback blue for hex that is too short', () => {
    const fallback = fn('#abc', 1);
    assert.ok(fallback.startsWith('rgba(77, 171, 247,'));
  });

  it('preserves the alpha value in the output', () => {
    assert.ok(fn('#000000', 0.25).includes(', 0.25)'));
    assert.ok(fn('#000000', 0).includes(', 0)'));
  });
});

// ── heuristicLangFromText ─────────────────────────────────────────────────────

describe('heuristicLangFromText', () => {
  const fn = ctx.heuristicLangFromText;

  it('detects Spanish from typical words', () => {
    assert.equal(fn('Hola, ¿cómo estás?'), 'es-ES');
    assert.equal(fn('Gracias por todo'), 'es-ES');
    assert.equal(fn('Buenos días'), 'es-ES');
  });

  it('detects French from typical words', () => {
    assert.equal(fn('Bonjour, comment ça va?'), 'fr-FR');
    assert.equal(fn('Merci beaucoup'), 'fr-FR');
    assert.equal(fn('oui, non, avec vous'), 'fr-FR');
  });

  it('detects Russian from Cyrillic script', () => {
    assert.equal(fn('Привет, как дела?'), 'ru-RU');
  });

  it('detects Chinese from CJK characters', () => {
    assert.equal(fn('你好世界'), 'cmn-Hans-CN');
  });

  it('detects Japanese from kana', () => {
    assert.equal(fn('こんにちは'), 'ja-JP');
    assert.equal(fn('カタカナ'), 'ja-JP');
  });

  it('detects Korean from Hangul', () => {
    assert.equal(fn('안녕하세요'), 'ko-KR');
  });

  it('returns null for plain English text', () => {
    assert.equal(fn('Hello, how are you today?'), null);
    assert.equal(fn('The quick brown fox'), null);
  });

  it('returns null for null or empty input', () => {
    assert.equal(fn(null), null);
    assert.equal(fn(''), null);
    assert.equal(fn(undefined), null);
  });

  it('is case-insensitive for word patterns', () => {
    assert.equal(fn('HOLA BUENOS DIAS'), 'es-ES');
  });
});

// ── languageBadgeText ─────────────────────────────────────────────────────────

describe('languageBadgeText', () => {
  const fn = ctx.languageBadgeText;

  it('returns "Auto" for empty string', () => {
    assert.equal(fn(''), 'Auto');
  });

  it('returns "Auto" for falsy values', () => {
    assert.equal(fn(null), 'Auto');
    assert.equal(fn(undefined), 'Auto');
    assert.equal(fn(0), 'Auto');
  });

  it('returns the language code for non-empty input', () => {
    assert.equal(fn('fr-FR'), 'fr-FR');
    assert.equal(fn('en-US'), 'en-US');
    assert.equal(fn('zh'), 'zh');
  });
});

// ── isMobileBrowser ───────────────────────────────────────────────────────────

describe('isMobileBrowser', () => {
  const fn = ctx.isMobileBrowser;
  const savedUA = ctx.navigator.userAgent;

  const withUA = (ua, cb) => {
    ctx.navigator.userAgent = ua;
    try { return cb(); } finally { ctx.navigator.userAgent = savedUA; }
  };

  it('returns true for Android Chrome mobile UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36',
      fn,
    ), true);
  });

  it('returns true for iPhone UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      fn,
    ), true);
  });

  it('returns true for iPad UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      fn,
    ), true);
  });

  it('returns false for desktop Chrome UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      fn,
    ), false);
  });

  it('returns false for desktop Firefox UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0',
      fn,
    ), false);
  });

  it('returns false for the generic test UA', () => {
    assert.equal(fn(), false);
  });
});

// ── isChromeBrowser ───────────────────────────────────────────────────────────

describe('isChromeBrowser', () => {
  const fn = ctx.isChromeBrowser;
  const savedUA = ctx.navigator.userAgent;

  const withUA = (ua, cb) => {
    ctx.navigator.userAgent = ua;
    try { return cb(); } finally { ctx.navigator.userAgent = savedUA; }
  };

  it('returns true for Android Chrome mobile UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
      fn,
    ), true);
  });

  it('returns true for desktop Chrome UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      fn,
    ), true);
  });

  it('returns false for Edge UA (which also contains Chrome/)', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      fn,
    ), false);
  });

  it('returns false for Firefox UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0',
      fn,
    ), false);
  });

  it('returns false for Safari UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      fn,
    ), false);
  });

  it('returns false for the generic test UA', () => {
    assert.equal(fn(), false);
  });
});

// ── parseBrowserName ──────────────────────────────────────────────────────────

describe('parseBrowserName', () => {
  const fn = ctx.parseBrowserName;
  const savedUA = ctx.navigator.userAgent;

  const withUA = (ua, cb) => {
    ctx.navigator.userAgent = ua;
    try { return cb(); } finally { ctx.navigator.userAgent = savedUA; }
  };

  it('returns "Chrome <version> on Android" for Android Chrome UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
      fn,
    ), 'Chrome 147 on Android');
  });

  it('returns "Chrome <version>" for desktop Chrome UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      fn,
    ), 'Chrome 120');
  });

  it('returns "Safari on iOS" for Chrome on iOS UA (CriOS uses Safari engine, no Version token)', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
      fn,
    ), 'Safari on iOS');
  });

  it('returns "Edge <version>" for Edge UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
      fn,
    ), 'Edge 120');
  });

  it('returns "Firefox <version>" for Firefox UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0',
      fn,
    ), 'Firefox 115');
  });

  it('returns "Safari <version> on iOS" for Safari on iPhone UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      fn,
    ), 'Safari 17 on iOS');
  });

  it('returns "Safari <version>" for desktop Safari UA', () => {
    assert.equal(withUA(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      fn,
    ), 'Safari 17');
  });

  it('returns "Unknown" for unrecognised UA', () => {
    assert.equal(withUA('Some/1.0 UnknownBrowser/2.0', fn), 'Unknown');
  });
});


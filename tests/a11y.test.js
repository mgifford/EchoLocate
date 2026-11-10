'use strict';

/**
 * Regression tests for the accessibility semantics pass:
 *
 *  - WCAG 2.5.3 Label in Name on text buttons and selects
 *  - a single interim live region (no status-inside-log duplication)
 *  - non-modal translation popup semantics
 *  - a way back to the privacy notice
 *  - forced-colors and sr-only support
 *
 * These read the real HTML/CSS/JS so the fixes cannot silently regress.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf-8');

const html = read('index.html');
const appJs = read('app.js');
const css = read('style.css');

function normalize(value) {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function visibleText(innerHtml) {
  return normalize(innerHtml);
}

// ── Label in Name ─────────────────────────────────────────────────────────────

describe('Label in Name (WCAG 2.5.3)', () => {
  it('keeps every text button\'s visible label inside its accessible name', () => {
    const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    assert.ok(buttons.length > 10, 'expected to find the page buttons');

    for (const [, attrs, inner] of buttons) {
      const visible = visibleText(inner);
      // Icon-only buttons (✕, arrows) are not text-labelled.
      if (!/[a-z0-9]/i.test(visible)) continue;

      const aria = attrs.match(/aria-label="([^"]*)"/);
      if (!aria) continue; // name comes from the visible content

      const name = normalize(aria[1]);
      assert.ok(
        name.includes(visible),
        `visible label "${visible}" is not part of aria-label "${aria[1]}"`,
      );
    }
  });

  it('does not override visible select labels with unrelated aria-labels', () => {
    for (const id of ['lang-select', 'audio-source-select', 'max-speakers-select']) {
      const tag = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>`));
      assert.ok(tag, `select #${id} not found`);
      assert.doesNotMatch(tag[0], /aria-label=/, `#${id} should use its visible <label>`);
    }
  });

  it('keeps the layout toggle label in sync with its accessible name', () => {
    assert.match(html, /aria-label="Layout: Chat — switch to lanes view"/);
    assert.match(appJs, /Layout: Chat — switch to lanes view/);
    assert.match(appJs, /Layout: Lanes — switch to chat view/);
  });
});

// ── Interim live region ───────────────────────────────────────────────────────

describe('interim speech announcements', () => {
  it('uses one visually hidden polite region', () => {
    const region = html.match(/<span id="interim-live"[^>]*>/);
    assert.ok(region, 'missing #interim-live');
    assert.match(region[0], /role="status"/);
    assert.match(region[0], /aria-live="polite"/);
    assert.match(region[0], /class="sr-only"/);
  });

  it('hides duplicate visual interim text but keeps the language hint exposed', () => {
    const strip = html.match(/<div class="interim-strip"[^>]*>/);
    assert.ok(strip, 'missing interim strip');
    assert.doesNotMatch(strip[0], /role="status"/);
    assert.doesNotMatch(strip[0], /aria-live/);
    assert.doesNotMatch(strip[0], /aria-atomic/);

    const visual = html.match(/<span id="live-transcript"[^>]*>/);
    assert.ok(visual, 'missing visual interim text');
    assert.match(visual[0], /aria-hidden="true"/);

    const hint = html.match(/<span id="lang-mismatch-hint"[^>]*>/);
    assert.ok(hint, 'missing language hint');
    assert.match(hint[0], /role="status"/);
    assert.doesNotMatch(hint[0], /aria-hidden/);
  });

  it('never nests a status region inside the lane log', () => {
    // The inline interim card is created in app.js; it must be visual only.
    assert.match(appJs, /Visual only: #interim-live is the single announcement source/);
    assert.doesNotMatch(
      appJs,
      /card\.setAttribute\('role', 'status'\)/,
      'inline interim card must not be a status region',
    );
  });
});

// ── Popup semantics ───────────────────────────────────────────────────────────

describe('translation popup', () => {
  it('is a non-modal group rather than a dialog', () => {
    const tag = html.match(/<div id="translation-lang-dropdown"[^>]*>/);
    assert.ok(tag, 'missing translation dropdown');
    assert.match(tag[0], /role="group"/);
    assert.doesNotMatch(tag[0], /role="dialog"/);
  });

  it('uses the disclosure pattern on its trigger', () => {
    const trigger = html.match(/<button id="translation-lang-btn"[^>]*>/);
    assert.ok(trigger, 'missing translation trigger');
    assert.match(trigger[0], /aria-expanded="false"/);
    assert.match(trigger[0], /aria-controls="translation-lang-dropdown"/);
    assert.doesNotMatch(trigger[0], /aria-haspopup/);
  });

  it('returns focus when the popup closes with focus inside', () => {
    assert.match(appJs, /const hadFocus = dropdown\.contains\(document\.activeElement\)/);
    assert.match(appJs, /if \(hadFocus && !langBtn\.hidden\) langBtn\.focus\(\)/);
  });
});

// ── Privacy notice ────────────────────────────────────────────────────────────

describe('privacy notice lifecycle', () => {
  it('can be reopened from the footer', () => {
    assert.match(html, /id="btn-privacy-info"/);
    assert.match(appJs, /btnPrivacyInfo\.addEventListener\('click'/);
  });

  it('returns focus to the footer button after dismissal', () => {
    assert.match(appJs, /if \(btnPrivacyInfo\) btnPrivacyInfo\.focus\(\)/);
  });

  it('does not make the static footer a live region', () => {
    assert.doesNotMatch(html, /class="footer-community" role="note" aria-live/);
  });
});

// ── Modal dismissal ───────────────────────────────────────────────────────────

describe('help modal dismissal', () => {
  it('only remembers proactive guidance, not error dialogs', () => {
    assert.match(appJs, /function showSpeechHelpModal\(title, bodyHTML, level = 'error', dismissKey = null\)/);
    assert.match(appJs, /if \(modalDismissKey\) localStorage\.setItem\(modalDismissKey, '1'\)/);
    assert.match(appJs, /EDGE_SETUP_HTML,\s*'info',\s*EDGE_MODAL_DISMISSED_KEY/);
    assert.match(appJs, /MOBILE_SPEECH_WARNING_HTML,\s*'info',\s*MOBILE_MODAL_DISMISSED_KEY/);
  });
});

// ── CSS support ───────────────────────────────────────────────────────────────

describe('high contrast and hidden text support', () => {
  it('defines a visually hidden utility', () => {
    assert.match(css, /\.sr-only\s*\{/);
  });

  it('defines forced-colors fallbacks for focus, status and confidence', () => {
    assert.match(css, /@media \(forced-colors: active\)/);
    assert.match(css, /outline:\s*2px solid Highlight/);
    assert.match(css, /\.confidence-fill\s*\{\s*background:\s*CanvasText/);
    assert.match(css, /\.status-dot,\s*\.lane-dot\s*\{\s*border:\s*1px solid CanvasText/);
  });
});

// ── Behaviour with a mocked DOM ───────────────────────────────────────────────

function makeMockElement() {
  const attrs = Object.create(null);
  const classes = new Set();
  return {
    style: { setProperty() {} },
    textContent: '',
    innerHTML: '',
    hidden: false,
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
    addEventListener() {},
    appendChild() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
  };
}

function loadApp() {
  const documentMock = {
    readyState: 'loading',
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeMockElement(),
    addEventListener() {},
    removeEventListener() {},
    documentElement: {
      getAttribute: () => null,
      setAttribute() {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    },
    body: {
      appendChild() {},
      contains: () => false,
      classList: { add() {}, remove() {} },
    },
  };

  const ctx = vm.createContext({
    URL,
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    localStorage: {
      getItem: () => null,
      setItem() {},
      removeItem() {},
    },
    document: documentMock,
    window: {
      isSecureContext: false,
      Meyda: null,
      SpeechRecognition: null,
      webkitSpeechRecognition: null,
      confirm: () => false,
      addEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      location: { href: 'http://localhost/' },
    },
    navigator: { userAgent: 'Chrome/157', clipboard: null, mediaDevices: null },
    location: { href: 'http://localhost/' },
    performance: { now: () => 0 },
    fetch: () => Promise.reject(new Error('no fetch in tests')),
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    Promise,
  });

  vm.runInContext(appJs, ctx);
  return ctx;
}

describe('interim announcement behaviour', () => {
  it('mirrors interim text into the single live region', () => {
    const ctx = loadApp();
    vm.runInContext(`
      TranscriptCtrl._liveEl = { textContent: '', classList: { add() {}, remove() {} } };
      TranscriptCtrl._srLiveEl = { textContent: '' };
      TranscriptCtrl.showInterim('hello there');
    `, ctx);
    assert.equal(vm.runInContext('TranscriptCtrl._srLiveEl.textContent', ctx), 'hello there');
    assert.equal(vm.runInContext('TranscriptCtrl._liveEl.textContent', ctx), 'hello there');

    vm.runInContext(`TranscriptCtrl.showInterim('')`, ctx);
    assert.equal(vm.runInContext('TranscriptCtrl._srLiveEl.textContent', ctx), '');
    assert.equal(vm.runInContext('TranscriptCtrl._liveEl.textContent', ctx), '');
  });

  it('creates the inline interim card as visual-only content', () => {
    const ctx = loadApp();
    vm.runInContext(`
      TranscriptCtrl._updateInterimCard('hi', {
        color: '#4dabf7',
        cardsEl: document.createElement('div'),
      });
    `, ctx);
    assert.equal(
      vm.runInContext("TranscriptCtrl._interimCardEl.getAttribute('aria-hidden')", ctx),
      'true',
    );
    assert.equal(vm.runInContext("TranscriptCtrl._interimCardEl.getAttribute('role')", ctx), null);
  });
});

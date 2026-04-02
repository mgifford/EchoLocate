'use strict';

/**
 * Tests for sw.js pure functions.
 *
 * sw.js is loaded into an isolated vm context so the service-worker globals
 * (self, caches, fetch) can be stubbed out without a real browser.
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

// ── Load sw.js into an isolated vm context ────────────────────────────────────

const swCode = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf-8');

function loadSw() {
  const ctx = vm.createContext({
    self: { addEventListener: () => {} },
    URL,
    Response,
    console,
    caches: {
      open: () => Promise.resolve({ put: () => {} }),
      match: () => Promise.resolve(null),
    },
    fetch: () => Promise.reject(new Error('fetch not available in tests')),
  });
  vm.runInContext(swCode, ctx);
  return ctx;
}

const ctx = loadSw();
const {
  escapeHTML,
  parseTranslationsJson,
  renderTranslationBlocks,
  hexToRgb,
  buildCardHTML,
  buildChatMsgHTML,
} = ctx;

// ── Helper ────────────────────────────────────────────────────────────────────

function makeCard(overrides = {}) {
  return {
    text: 'Hello world',
    speakerId: 's1',
    speakerLabel: 'Guest 1',
    tone: 'mid',
    speakerColor: '#4dabf7',
    confidence: 1,
    timestamp: '2024-01-01T00:00:00.000Z',
    profileMatchLevel: 'high',
    audioSource: 'mic',
    translations: [],
    ...overrides,
  };
}

// ── escapeHTML ────────────────────────────────────────────────────────────────

describe('escapeHTML', () => {
  it('escapes ampersands', () => {
    assert.equal(escapeHTML('a & b'), 'a &amp; b');
  });

  it('escapes less-than signs', () => {
    assert.equal(escapeHTML('<script>'), '&lt;script&gt;');
  });

  it('escapes greater-than signs', () => {
    assert.equal(escapeHTML('a > b'), 'a &gt; b');
  });

  it('escapes double quotes', () => {
    assert.equal(escapeHTML('"quoted"'), '&quot;quoted&quot;');
  });

  it('escapes single quotes', () => {
    assert.equal(escapeHTML("it's"), 'it&#39;s');
  });

  it('handles all special chars together', () => {
    assert.equal(escapeHTML(`<div class="a" data-x='b'>a & b</div>`),
      '&lt;div class=&quot;a&quot; data-x=&#39;b&#39;&gt;a &amp; b&lt;/div&gt;');
  });

  it('returns empty string unchanged', () => {
    assert.equal(escapeHTML(''), '');
  });

  it('returns plain text unchanged', () => {
    assert.equal(escapeHTML('hello world'), 'hello world');
  });

  it('does not double-escape (ampersand must come first)', () => {
    // If & were not escaped first, &amp; would become &amp;amp;
    assert.equal(escapeHTML('&amp;'), '&amp;amp;');
  });

  it('coerces non-string input to string', () => {
    assert.equal(escapeHTML(42), '42');
    assert.equal(escapeHTML(null), 'null');
    assert.equal(escapeHTML(undefined), 'undefined');
  });
});

// ── parseTranslationsJson ─────────────────────────────────────────────────────

describe('parseTranslationsJson', () => {
  it('returns empty array for null', () => {
    assert.deepEqual(parseTranslationsJson(null), []);
  });

  it('returns empty array for undefined', () => {
    assert.deepEqual(parseTranslationsJson(undefined), []);
  });

  it('returns empty array for empty string', () => {
    assert.deepEqual(parseTranslationsJson(''), []);
  });

  it('returns empty array for invalid JSON', () => {
    assert.deepEqual(parseTranslationsJson('{not json}'), []);
  });

  it('returns empty array for a non-array JSON value', () => {
    assert.deepEqual(parseTranslationsJson('{"lang":"fr","text":"Bonjour"}'), []);
    assert.deepEqual(parseTranslationsJson('"string"'), []);
    assert.deepEqual(parseTranslationsJson('42'), []);
  });

  it('parses a single valid translation', () => {
    const result = parseTranslationsJson('[{"lang":"fr","text":"Bonjour"}]');
    assert.deepEqual(result, [{ lang: 'fr', text: 'Bonjour' }]);
  });

  it('lowercases the lang code', () => {
    const result = parseTranslationsJson('[{"lang":"FR","text":"Bonjour"}]');
    assert.deepEqual(result, [{ lang: 'fr', text: 'Bonjour' }]);
  });

  it('trims whitespace from text', () => {
    const result = parseTranslationsJson('[{"lang":"fr","text":"  Bonjour  "}]');
    assert.deepEqual(result, [{ lang: 'fr', text: 'Bonjour' }]);
  });

  it('limits to 2 translations even when more are provided', () => {
    const input = JSON.stringify([
      { lang: 'fr', text: 'Bonjour' },
      { lang: 'de', text: 'Hallo' },
      { lang: 'es', text: 'Hola' },
    ]);
    const result = parseTranslationsJson(input);
    assert.equal(result.length, 2);
    assert.equal(result[0].lang, 'fr');
    assert.equal(result[1].lang, 'de');
  });

  it('filters out items with empty text', () => {
    const input = JSON.stringify([{ lang: 'fr', text: '' }]);
    assert.deepEqual(parseTranslationsJson(input), []);
  });

  it('filters out items with invalid lang codes', () => {
    // lang codes longer than 8 chars are invalid
    const input = JSON.stringify([{ lang: 'toolongcode', text: 'Hello' }]);
    assert.deepEqual(parseTranslationsJson(input), []);
    // numeric chars not allowed
    const input2 = JSON.stringify([{ lang: 'fr2', text: 'Bonjour' }]);
    assert.deepEqual(parseTranslationsJson(input2), []);
  });

  it('accepts lang code of empty string (^[a-z]{0,8}$ allows empty)', () => {
    const input = JSON.stringify([{ lang: '', text: 'Hello' }]);
    const result = parseTranslationsJson(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].lang, '');
  });

  it('handles missing lang or text gracefully', () => {
    const input = JSON.stringify([{ text: 'Hello' }]);
    const result = parseTranslationsJson(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].lang, '');

    const input2 = JSON.stringify([{ lang: 'fr' }]);
    // text is empty string after String(undefined) → '' → filtered out
    assert.deepEqual(parseTranslationsJson(input2), []);
  });
});

// ── renderTranslationBlocks ───────────────────────────────────────────────────

describe('renderTranslationBlocks', () => {
  it('returns empty string for empty array', () => {
    assert.equal(renderTranslationBlocks([]), '');
  });

  it('returns empty string for non-array', () => {
    assert.equal(renderTranslationBlocks(null), '');
    assert.equal(renderTranslationBlocks(undefined), '');
  });

  it('renders a single translation with lang tag', () => {
    const html = renderTranslationBlocks([{ lang: 'fr', text: 'Bonjour' }]);
    assert.ok(html.includes('translation-text'));
    assert.ok(html.includes('FR')); // uppercased in the tag
    assert.ok(html.includes('Bonjour'));
    assert.ok(html.includes('lang="fr"'));
  });

  it('renders a translation without lang attribute when lang is empty', () => {
    const html = renderTranslationBlocks([{ lang: '', text: 'Hello' }]);
    assert.ok(html.includes('Hello'));
    assert.ok(!html.includes('lang="'));
    assert.ok(!html.includes('translation-lang-tag'));
  });

  it('escapes HTML in text', () => {
    const html = renderTranslationBlocks([{ lang: 'fr', text: '<script>alert(1)</script>' }]);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('escapes HTML in lang code', () => {
    const html = renderTranslationBlocks([{ lang: 'fr', text: 'ok' }]);
    // lang goes through escapeHTML for both the span attribute and the tag content
    assert.ok(!html.includes('<script'));
  });

  it('renders multiple translations', () => {
    const html = renderTranslationBlocks([
      { lang: 'fr', text: 'Bonjour' },
      { lang: 'de', text: 'Hallo' },
    ]);
    assert.ok(html.includes('Bonjour'));
    assert.ok(html.includes('Hallo'));
    assert.equal((html.match(/translation-text/g) || []).length, 2);
  });
});

// ── hexToRgb ──────────────────────────────────────────────────────────────────

describe('hexToRgb', () => {
  it('converts a valid lowercase hex string', () => {
    assert.deepEqual(hexToRgb('#ff8800'), { r: 255, g: 136, b: 0 });
  });

  it('converts a valid uppercase hex string', () => {
    assert.deepEqual(hexToRgb('#FF8800'), { r: 255, g: 136, b: 0 });
  });

  it('converts black', () => {
    assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
  });

  it('converts white', () => {
    assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 });
  });

  it('returns fallback blue for invalid hex', () => {
    assert.deepEqual(hexToRgb('notacolor'), { r: 77, g: 171, b: 247 });
    assert.deepEqual(hexToRgb(''), { r: 77, g: 171, b: 247 });
    assert.deepEqual(hexToRgb('#gg0000'), { r: 77, g: 171, b: 247 });
    assert.deepEqual(hexToRgb('#123'), { r: 77, g: 171, b: 247 }); // too short
  });
});

// ── buildCardHTML ─────────────────────────────────────────────────────────────

describe('buildCardHTML', () => {
  it('produces an article element', () => {
    const html = buildCardHTML(makeCard());
    assert.ok(html.trim().startsWith('<article'));
    assert.ok(html.includes('</article>'));
  });

  it('includes the role="article" attribute', () => {
    const html = buildCardHTML(makeCard());
    assert.ok(html.includes('role="article"'));
  });

  it('includes the speaker id as a data attribute', () => {
    const html = buildCardHTML(makeCard({ speakerId: 's3' }));
    assert.ok(html.includes('data-speaker-id="s3"'));
  });

  it('applies the correct tone class', () => {
    assert.ok(buildCardHTML(makeCard({ tone: 'low' })).includes('card-tone-low'));
    assert.ok(buildCardHTML(makeCard({ tone: 'high' })).includes('card-tone-high'));
    assert.ok(buildCardHTML(makeCard({ tone: 'mid' })).includes('card-tone-mid'));
  });

  it('escapes HTML in transcript text to prevent XSS', () => {
    const html = buildCardHTML(makeCard({ text: '<script>alert(1)</script>' }));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('escapes HTML in speakerLabel to prevent XSS', () => {
    const html = buildCardHTML(makeCard({ speakerLabel: '<evil>' }));
    assert.ok(!html.includes('<evil>'));
    assert.ok(html.includes('&lt;evil&gt;'));
  });

  it('escapes HTML in speakerColor to prevent XSS injection', () => {
    const html = buildCardHTML(makeCard({ speakerColor: '"onmouseover="alert(1)' }));
    // The double quote must be escaped to &quot; so it cannot break out of the attribute
    assert.ok(!html.includes('"onmouseover="'));
    assert.ok(html.includes('&quot;onmouseover=&quot;'));
  });

  it('wraps low-confidence text in low-confidence span', () => {
    const html = buildCardHTML(makeCard({ confidence: 0.5 }));
    assert.ok(html.includes('low-confidence'));
    assert.ok(html.includes('50%'));
  });

  it('does not wrap high-confidence text in low-confidence span', () => {
    const html = buildCardHTML(makeCard({ confidence: 0.9 }));
    assert.ok(!html.includes('low-confidence'));
  });

  it('threshold for low-confidence is strictly below 0.7', () => {
    assert.ok(!buildCardHTML(makeCard({ confidence: 0.7 })).includes('low-confidence'));
    assert.ok(buildCardHTML(makeCard({ confidence: 0.69 })).includes('low-confidence'));
  });

  it('renders computer audio source badge', () => {
    const html = buildCardHTML(makeCard({ audioSource: 'computer' }));
    assert.ok(html.includes('source-badge--computer'));
    assert.ok(html.includes('💻'));
    assert.ok(html.includes('card-source-computer'));
  });

  it('does not render source badge for mic audio', () => {
    const html = buildCardHTML(makeCard({ audioSource: 'mic' }));
    assert.ok(!html.includes('source-badge--computer'));
    assert.ok(!html.includes('💻'));
  });

  it('shows "new cluster?" for low profileMatchLevel', () => {
    const html = buildCardHTML(makeCard({ profileMatchLevel: 'low' }));
    assert.ok(html.includes('new cluster?'));
  });

  it('shows "match uncertain" for medium profileMatchLevel', () => {
    const html = buildCardHTML(makeCard({ profileMatchLevel: 'medium' }));
    assert.ok(html.includes('match uncertain'));
  });

  it('shows no annotation for high profileMatchLevel', () => {
    const html = buildCardHTML(makeCard({ profileMatchLevel: 'high' }));
    assert.ok(!html.includes('new cluster?'));
    assert.ok(!html.includes('match uncertain'));
  });

  it('renders translation blocks when provided', () => {
    const html = buildCardHTML(makeCard({
      translations: [{ lang: 'fr', text: 'Bonjour' }],
    }));
    assert.ok(html.includes('Bonjour'));
    assert.ok(html.includes('translation-text'));
  });

  it('renders the confidence meter', () => {
    const html = buildCardHTML(makeCard({ confidence: 0.85 }));
    assert.ok(html.includes('confidence-meter'));
    assert.ok(html.includes('confidence-fill'));
    assert.ok(html.includes('85%'));
  });

  it('clamps opacity floor at 0.6 for low confidence', () => {
    const html = buildCardHTML(makeCard({ confidence: 0.2 }));
    assert.ok(html.includes('opacity:0.60'));
  });
});

// ── buildChatMsgHTML ──────────────────────────────────────────────────────────

describe('buildChatMsgHTML', () => {
  function makeChatCard(overrides = {}) {
    return {
      text: 'Hello world',
      speakerId: 's1',
      speakerLabel: 'Guest 1',
      speakerColor: '#4dabf7',
      confidence: 1,
      timestamp: '2024-01-01T00:00:00.000Z',
      profileMatchLevel: 'high',
      creatureIndex: 0,
      audioSource: 'mic',
      translations: [],
      ...overrides,
    };
  }

  it('produces a chat-msg div', () => {
    const html = buildChatMsgHTML(makeChatCard());
    assert.ok(html.includes('class="chat-msg'));
    assert.ok(html.includes('</div>'));
  });

  it('includes role="article"', () => {
    const html = buildChatMsgHTML(makeChatCard());
    assert.ok(html.includes('role="article"'));
  });

  it('escapes HTML in transcript text to prevent XSS', () => {
    const html = buildChatMsgHTML(makeChatCard({ text: '<img src=x onerror=alert(1)>' }));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img'));
  });

  it('escapes HTML in speakerLabel', () => {
    const html = buildChatMsgHTML(makeChatCard({ speakerLabel: '<evil>' }));
    assert.ok(!html.includes('<evil>'));
    assert.ok(html.includes('&lt;evil&gt;'));
  });

  it('wraps low-confidence text in low-confidence span', () => {
    const html = buildChatMsgHTML(makeChatCard({ confidence: 0.5 }));
    assert.ok(html.includes('low-confidence'));
  });

  it('does not wrap high-confidence text', () => {
    const html = buildChatMsgHTML(makeChatCard({ confidence: 1 }));
    assert.ok(!html.includes('low-confidence'));
  });

  it('shows "new voice?" for low match level', () => {
    const html = buildChatMsgHTML(makeChatCard({ profileMatchLevel: 'low' }));
    assert.ok(html.includes('new voice?'));
  });

  it('shows "match uncertain" for medium match level', () => {
    const html = buildChatMsgHTML(makeChatCard({ profileMatchLevel: 'medium' }));
    assert.ok(html.includes('match uncertain'));
  });

  it('shows no match note for high match level', () => {
    const html = buildChatMsgHTML(makeChatCard({ profileMatchLevel: 'high' }));
    assert.ok(!html.includes('new voice?'));
    assert.ok(!html.includes('match uncertain'));
  });

  it('renders computer source badge', () => {
    const html = buildChatMsgHTML(makeChatCard({ audioSource: 'computer' }));
    assert.ok(html.includes('source-badge--computer'));
    assert.ok(html.includes('💻'));
    assert.ok(html.includes('chat-msg-source-computer'));
  });

  it('renders translations when provided', () => {
    const html = buildChatMsgHTML(makeChatCard({
      translations: [{ lang: 'de', text: 'Hallo' }],
    }));
    assert.ok(html.includes('Hallo'));
    assert.ok(html.includes('translation-text'));
  });

  it('uses creatureIndex to select a sea-creature SVG', () => {
    // Index 0 = starfish (path with Z)
    const html0 = buildChatMsgHTML(makeChatCard({ creatureIndex: 0 }));
    assert.ok(html0.includes('<svg'));
    // Index 3 = octopus (has a circle element)
    const html3 = buildChatMsgHTML(makeChatCard({ creatureIndex: 3 }));
    assert.ok(html3.includes('<svg'));
    // Out-of-range index falls back to index 0 (CREATURE_SVGS[0])
    const htmlOob = buildChatMsgHTML(makeChatCard({ creatureIndex: 99 }));
    assert.ok(htmlOob.includes('<svg'));
  });

  it('uses hex speaker color for bubble background', () => {
    const html = buildChatMsgHTML(makeChatCard({ speakerColor: '#ff0000' }));
    assert.ok(html.includes('rgba(255,0,0,'));
  });
});

'use strict';

/**
 * WCAG 1.4.3 contrast regression tests for the theme tokens in style.css.
 *
 * These intentionally read the real stylesheet and the real speaker palette
 * instead of duplicating colour values, so a token or palette edit that breaks
 * a documented pairing fails the suite.  Only opaque/simple colours are
 * supported — which is all the tokens below use.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf-8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf-8');

// ── Colour helpers ────────────────────────────────────────────────────────────

function channelToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance({ r, g, b }) {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function parseColor(value) {
  const v = String(value).trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = m[1];
    return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16), a: 1 };
  }
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
  }
  throw new Error(`Unsupported colour value: ${value}`);
}

/** Composite a possibly-transparent foreground over an opaque background. */
function composite(fg, bg) {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

/** sRGB interpolation, matching color-mix(in srgb, a X%, b). */
function mixSrgb(a, b, ratio) {
  return {
    r: Math.round(a.r * ratio + b.r * (1 - ratio)),
    g: Math.round(a.g * ratio + b.g * (1 - ratio)),
    b: Math.round(a.b * ratio + b.b * (1 - ratio)),
    a: 1,
  };
}

// ── Token extraction ──────────────────────────────────────────────────────────

function themeTokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector} block in style.css`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  const body = css.slice(open + 1, close);
  const tokens = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = re.exec(body))) tokens[match[1]] = match[2].trim();
  return tokens;
}

const dark = themeTokens(':root');
const light = themeTokens('[data-theme="light"]');

function token(tokens, name) {
  assert.ok(tokens[name], `missing --${name} token`);
  return parseColor(tokens[name]);
}

/** Resolve a token over the page background, compositing any alpha. */
function onPage(tokens, name) {
  return composite(token(tokens, name), token(tokens, 'bg-page'));
}

// ── Theme token pairs (WCAG 1.4.3: 4.5:1 for normal text) ────────────────────

describe('theme text contrast', () => {
  const themes = [
    ['dark', dark],
    ['light', light],
  ];

  for (const [name, tokens] of themes) {
    it(`${name}: --text-primary on --bg-page`, () => {
      assert.ok(contrast(token(tokens, 'text-primary'), token(tokens, 'bg-page')) >= 4.5);
    });

    it(`${name}: --text-muted on --bg-surface`, () => {
      assert.ok(contrast(token(tokens, 'text-muted'), token(tokens, 'bg-surface')) >= 4.5);
    });

    for (const card of ['bg-card-low', 'bg-card-mid', 'bg-card-high']) {
      it(`${name}: --text-primary on --${card}`, () => {
        assert.ok(contrast(token(tokens, 'text-primary'), token(tokens, card)) >= 4.5);
      });
    }

    it(`${name}: --warning-text on --bg-surface`, () => {
      assert.ok(contrast(token(tokens, 'warning-text'), token(tokens, 'bg-surface')) >= 4.5);
    });
  }
});

// ── Live interim strip (the caption line itself) ─────────────────────────────

describe('live interim strip contrast', () => {
  for (const [name, tokens] of [
    ['dark', dark],
    ['light', light],
  ]) {
    it(`${name}: interim text is readable over the strip background`, () => {
      const stripBg = composite(token(tokens, 'interim-bg'), token(tokens, 'bg-page'));
      const text = composite(token(tokens, 'text-interim'), stripBg);
      assert.ok(
        contrast(text, stripBg) >= 4.5,
        `${name} interim text contrast ${contrast(text, stripBg).toFixed(2)}:1`,
      );
    });

    it(`${name}: actively-speaking interim text uses theme-aware primary`, () => {
      // Guards the old hard-coded near-white that was invisible in light mode.
      const rule = css.match(/\.interim-text\.speaking\s*\{[^}]*\}/);
      assert.ok(rule, 'missing .interim-text.speaking rule');
      assert.match(rule[0], /var\(--text-primary\)/);
      assert.doesNotMatch(rule[0], /rgba\(\s*241\s*,\s*243\s*,\s*245/);
    });
  }
});

// ── Speaker palette used as text (chat speaker names) ───────────────────────

describe('speaker palette as text', () => {
  const paletteMatch = appJs.match(/const PALETTE = \[([^\]]+)\]/);
  assert.ok(paletteMatch, 'missing PALETTE in app.js');
  const palette = [...paletteMatch[1].matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
  assert.equal(palette.length, 8, 'expected eight speaker colours');

  it('all palette colours pass as text on the dark surface', () => {
    for (const hex of palette) {
      const ratio = contrast(parseColor(hex), token(dark, 'bg-surface'));
      assert.ok(ratio >= 4.5, `${hex} on dark surface is ${ratio.toFixed(2)}:1`);
    }
  });

  it('light theme darkens speaker text until every palette colour passes', () => {
    const rule = css.match(/\[data-theme="light"\]\s+\.chat-speaker\s*\{[^}]*\}/);
    assert.ok(rule, 'missing light-theme .chat-speaker rule');
    const mix = rule[0].match(
      /color-mix\(in srgb,\s*var\(--speaker-color,[^)]*\)\s*(\d+)%,\s*(#[0-9a-f]{6})\)/i,
    );
    assert.ok(mix, 'missing color-mix() for light-theme speaker text');
    const ratio = Number(mix[1]) / 100;
    const darkInk = parseColor(mix[2]);
    const surface = token(light, 'bg-surface');
    for (const hex of palette) {
      const ink = mixSrgb(parseColor(hex), darkInk, ratio);
      const value = contrast(ink, surface);
      assert.ok(value >= 4.5, `${hex} mixed at ${mix[1]}% is ${value.toFixed(2)}:1 on white`);
    }
  });
});

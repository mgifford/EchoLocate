'use strict';

/**
 * CSP regression tests. The policy is delivered via a meta tag because GitHub
 * Pages cannot set response headers, and the import map is inline, so its hash
 * must stay in sync with the tag.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');

function parsePolicy(value) {
  const directives = {};
  for (const part of value.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...sources] = trimmed.split(/\s+/);
    directives[name] = sources.join(' ');
  }
  return directives;
}

const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
const policy = meta ? parsePolicy(meta[1]) : {};
const scriptSrc = policy['script-src'] || '';

describe('Content Security Policy', () => {
  it('is delivered in a meta tag before resources', () => {
    assert.ok(meta, 'missing CSP meta tag');
    const metaIndex = html.indexOf('http-equiv="Content-Security-Policy"');
    const firstScript = html.indexOf('<script');
    assert.ok(metaIndex > 0 && metaIndex < firstScript, 'CSP must precede scripts');
  });

  it('uses a self-only default and forbids objects and base changes', () => {
    assert.equal(policy['default-src'], "'self'");
    assert.equal(policy['object-src'], "'none'");
    assert.equal(policy['base-uri'], "'self'");
    assert.equal(policy['form-action'], "'self'");
    assert.equal(policy['frame-src'], "'none'");
  });

  it('does not allow eval or arbitrary inline scripts', () => {
    assert.doesNotMatch(scriptSrc, /'unsafe-eval'/);
    assert.doesNotMatch(scriptSrc, /'unsafe-inline'/);
    assert.match(scriptSrc, /'self'/);
  });

  it('allows the hashed import map and WebAssembly compilation', () => {
    const importMap = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
    const hash = crypto.createHash('sha256').update(importMap, 'utf-8').digest('base64');
    assert.match(scriptSrc, new RegExp(`'sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
    assert.match(scriptSrc, /'wasm-unsafe-eval'/);
  });

  it('allows inline styles but not external style origins', () => {
    assert.equal(policy['style-src'], "'self' 'unsafe-inline'");
  });

  it('keeps network, workers and images restricted', () => {
    assert.match(policy['connect-src'], /'self'/);
    assert.match(policy['connect-src'], /https:\/\/huggingface\.co/);
    assert.match(policy['connect-src'], /https:\/\/\*\.hf\.co/);
    assert.equal(policy['worker-src'], "'self' blob:");
    assert.equal(policy['img-src'], "'self' data:");
    assert.equal(policy['font-src'], "'self'");
  });

  it('leaves no executable inline script outside the hashed import map', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    const inline = scripts.filter(([, attrs]) => !/\bsrc=/.test(attrs));
    assert.equal(inline.length, 1, 'expected only the import map to be inline');
    assert.match(inline[0][1], /type="importmap"/);
  });

  it('loads the theme bootstrap as an external script', () => {
    const theme = fs.readFileSync(path.join(ROOT, 'theme-init.js'), 'utf-8');
    assert.match(theme, /echolocate-theme/);
    assert.match(html, /<script src="theme-init\.js"><\/script>/);
    assert.doesNotMatch(html, /localStorage\.getItem\('echolocate-theme'\)/);
  });
});

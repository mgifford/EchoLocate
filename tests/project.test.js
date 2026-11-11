'use strict';

/**
 * Project-level regression tests for two promises that are easy to break:
 *
 *  1. Privacy copy must not claim that Chrome/Edge speech recognition is fully
 *     local — the browser vendor may process audio on its servers.
 *  2. Language detection must load from the repository, with no CDN fallback,
 *     so the app really works offline and boot makes no third-party request.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf-8');

const indexHtml = read('index.html');
const appJs = read('app.js');
const readme = read('README.md');

// ── Privacy copy ──────────────────────────────────────────────────────────────

describe('privacy notice copy', () => {
  const notice = (indexHtml.match(/<div id="privacy-notice"[\s\S]*?<\/div>/) || [''])[0];

  it('is present in index.html', () => {
    assert.ok(notice.length > 0, 'privacy notice block not found');
  });

  it('says the transcript stays in this browser', () => {
    assert.match(notice, /stays in this browser/i);
  });

  it('discloses that browser speech services may process audio remotely', () => {
    assert.match(notice, /browser vendor/i);
  });

  it('does not claim all audio is processed entirely in the browser', () => {
    assert.doesNotMatch(notice, /processed entirely in your browser/i);
  });

  it('does not claim nothing is sent to any third party', () => {
    assert.doesNotMatch(notice, /any third party/i);
  });

  it('README no longer claims audio stays on-device', () => {
    assert.doesNotMatch(readme, /Audio stays on-device/i);
    assert.match(readme, /browser vendor/i);
  });

  it('AGENTS.md and ACCESSIBILITY.md no longer describe processing as fully local', () => {
    assert.doesNotMatch(read('AGENTS.md'), /all processing remains in browser/i);
    assert.doesNotMatch(read('ACCESSIBILITY.md'), /local-only processing/i);
  });
});

// ── Offline language detection ────────────────────────────────────────────────

describe('language detection stays offline', () => {
  it('app.js has no CDN fallback', () => {
    assert.doesNotMatch(appJs, /esm\.sh/);
    assert.doesNotMatch(appJs, /https:\/\/[^'"]*franc/);
  });

  it('index.html declares an import map for franc\'s bare imports', () => {
    const block = indexHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    assert.ok(block, 'import map missing');

    const map = JSON.parse(block[1]).imports;
    const expected = {
      'trigram-utils': './vendor/trigram-utils/index.js',
      'n-gram': './vendor/n-gram/index.js',
      'collapse-white-space': './vendor/collapse-white-space/index.js',
    };
    for (const [specifier, target] of Object.entries(expected)) {
      assert.equal(map[specifier], target, `import map entry for ${specifier}`);
      const file = path.join(ROOT, target.replace(/^\.\//, ''));
      assert.ok(fs.existsSync(file), `${target} is not vendored`);
      assert.ok(fs.statSync(file).size > 0, `${target} is empty`);
    }
  });

  it('download-deps.sh can reproduce the vendored modules', () => {
    const script = read('download-deps.sh');
    for (const pkg of ['trigram-utils', 'n-gram', 'collapse-white-space']) {
      assert.match(script, new RegExp(pkg), `download-deps.sh does not fetch ${pkg}`);
    }
  });
});

// ── CI and branch hygiene ────────────────────────────────────────────────────

describe('CI checks every main change and pull request', () => {
  const workflow = read('.github/workflows/tests.yml');

  it('runs on main pushes and pull requests', () => {
    assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
    assert.match(workflow, /pull_request:/);
  });

  it('checks syntax and runs the full test suite', () => {
    assert.match(workflow, /node --check app\.js/);
    assert.match(workflow, /node --check sw\.js/);
    assert.match(workflow, /npm test/);
  });
});

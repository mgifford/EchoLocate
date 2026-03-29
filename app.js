/**
 * EchoLocate Phase 1 — app.js
 *
 * Dynamic voice clusters with 10-second room profiling and VTT export.
 * Uses Web Speech API + Web Audio API + Meyda + HTMX + Service Worker local routes.
 */

'use strict';

const CFG = Object.freeze({
  STORAGE_KEY:        'echolocate_v1',
  PITCH_WINDOW:       24,
  PITCH_HZ:           8,
  WATCHDOG_MS:        12_000,
  CARD_LIMIT:         500,
  RESTART_DELAY:      150,
  VOICE_MATCH_RATIO:  0.18,
  HIGH_CONF_RATIO:    0.06,
  MED_CONF_RATIO:     0.12,
  SIGNATURE_MATCH_DISTANCE: 0.22,
  SIGNATURE_HIGH_DISTANCE:  0.11,
  SIGNATURE_MED_DISTANCE:   0.18,
  ROOM_PROFILE_MS:          10_000,
  MFCC_COEFFS:              13,
  MAX_SPEAKERS:       6,
  DEBUG_POINTS_MAX:   120,
});

function apiUrl(path) {
  return new URL(`./api/${path}`, location.href).href;
}

const API = Object.freeze({
  ADD_CARD:     apiUrl('add-card'),
  ADD_CHAT_MSG: apiUrl('add-chat-msg'),
});

const DEFAULT_RECOGNITION_LANG = '';

const LANGUAGE_OPTIONS = [
  { code: '', label: 'None (Auto)', flag: '🌐' },
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
  { code: 'es-ES', label: 'Spanish (Spain)', flag: '🇪🇸' },
  { code: 'es-MX', label: 'Spanish (Mexico)', flag: '🇲🇽' },
  { code: 'fr-FR', label: 'French', flag: '🇫🇷' },
  { code: 'de-DE', label: 'German', flag: '🇩🇪' },
  { code: 'it-IT', label: 'Italian', flag: '🇮🇹' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)', flag: '🇧🇷' },
  { code: 'pt-PT', label: 'Portuguese (Portugal)', flag: '🇵🇹' },
  { code: 'nl-NL', label: 'Dutch', flag: '🇳🇱' },
  { code: 'sv-SE', label: 'Swedish', flag: '🇸🇪' },
  { code: 'no-NO', label: 'Norwegian', flag: '🇳🇴' },
  { code: 'da-DK', label: 'Danish', flag: '🇩🇰' },
  { code: 'fi-FI', label: 'Finnish', flag: '🇫🇮' },
  { code: 'pl-PL', label: 'Polish', flag: '🇵🇱' },
  { code: 'cs-CZ', label: 'Czech', flag: '🇨🇿' },
  { code: 'hu-HU', label: 'Hungarian', flag: '🇭🇺' },
  { code: 'ro-RO', label: 'Romanian', flag: '🇷🇴' },
  { code: 'ru-RU', label: 'Russian', flag: '🇷🇺' },
  { code: 'uk-UA', label: 'Ukrainian', flag: '🇺🇦' },
  { code: 'tr-TR', label: 'Turkish', flag: '🇹🇷' },
  { code: 'el-GR', label: 'Greek', flag: '🇬🇷' },
  { code: 'ar-SA', label: 'Arabic', flag: '🇸🇦' },
  { code: 'he-IL', label: 'Hebrew', flag: '🇮🇱' },
  { code: 'hi-IN', label: 'Hindi', flag: '🇮🇳' },
  { code: 'bn-BD', label: 'Bengali', flag: '🇧🇩' },
  { code: 'ta-IN', label: 'Tamil', flag: '🇮🇳' },
  { code: 'te-IN', label: 'Telugu', flag: '🇮🇳' },
  { code: 'th-TH', label: 'Thai', flag: '🇹🇭' },
  { code: 'vi-VN', label: 'Vietnamese', flag: '🇻🇳' },
  { code: 'id-ID', label: 'Indonesian', flag: '🇮🇩' },
  { code: 'ms-MY', label: 'Malay', flag: '🇲🇾' },
  { code: 'ja-JP', label: 'Japanese', flag: '🇯🇵' },
  { code: 'ko-KR', label: 'Korean', flag: '🇰🇷' },
  { code: 'cmn-Hans-CN', label: 'Chinese (Simplified)', flag: '🇨🇳' },
  { code: 'cmn-Hant-TW', label: 'Chinese (Traditional)', flag: '🇹🇼' },
];

const ISO3_TO_BCP47 = {
  eng: 'en-US', spa: 'es-ES', fra: 'fr-FR', deu: 'de-DE', ita: 'it-IT', por: 'pt-BR',
  nld: 'nl-NL', rus: 'ru-RU', ukr: 'uk-UA', tur: 'tr-TR', ell: 'el-GR', ara: 'ar-SA',
  heb: 'he-IL', hin: 'hi-IN', ben: 'bn-BD', tam: 'ta-IN', tel: 'te-IN', tha: 'th-TH',
  vie: 'vi-VN', ind: 'id-ID', msa: 'ms-MY', jpn: 'ja-JP', kor: 'ko-KR', cmn: 'cmn-Hans-CN',
};

const State = {
  isRunning:                 false,
  pitchHistory:              [],
  utteranceSamples:          [],
  currentUtteranceStartedAt: null,
  recognitionLang:           localStorage.getItem('echolocate-rec-lang') ?? DEFAULT_RECOGNITION_LANG,
  languageDetector:          null,
  supportedLanguages:        [],
  lastResultAt:              0,
  languageHintTimer:         null,
  audioCtx:                  null,
  analyser:                  null,
  meydaAnalyzer:             null,
  latestSignatureFrame:      null,
  utteranceSignatureSamples: [],
  profilingStartedAt:        0,
  sampleTimer:               null,
  visualizer:                null,
  profiles:                  [], // [{id,label,color,lastSpokenAt,avgPitch,tone,el,cardsEl,count}]
  activeSpeakerId:           null,
  nextSpeakerNum:            1,
  micDiagnostics:            null,
  stereoEnabled:             false,
  stereoAnalyserL:           null,
  stereoAnalyserR:           null,
  stereoSamplesL:            [],
  stereoSamplesR:            [],
  debugEnabled:              false,
  debugPoints:               [],
  mediaSource:               null,
};

const PALETTE = ['#4dabf7', '#cc5de8', '#f59f00', '#20c997', '#ff8787', '#74c0fc', '#ffd43b', '#b197fc'];

function checkSecureContext() {
  if (!window.isSecureContext) {
    document.getElementById('secure-warning').classList.remove('hidden');
  }
}

function checkBrowserSupport() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) return true;

  const warning = document.getElementById('speech-warning');
  if (warning) warning.classList.remove('hidden');

  const start = document.getElementById('btn-start');
  const stop = document.getElementById('btn-stop');
  if (start) start.disabled = true;
  if (stop) stop.disabled = true;

  setStatus('error', 'Web Speech API not supported');
  return false;
}

// ── Theme ─────────────────────────────────────────────────────────────────────────────────
const THEME_KEY = 'echolocate-theme';

function applyTheme(theme, persist = true) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
  if (persist) localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  // inline script in <head> already set data-theme; here we sync aria-label
  // and listen for OS preference changes when user hasn't made a manual choice.
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'), !!saved);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? 'dark' : 'light', false);
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('[EchoLocate] SW registration skipped:', err.message);
  }
}

class Visualizer {
  constructor(canvasEl, analyserNode) {
    this._canvas = canvasEl;
    this._analyser = analyserNode;
    this._ctx = canvasEl.getContext('2d');
    this._rafId = null;
    this._w = 0;
    this._h = 0;
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this._canvas.getBoundingClientRect();
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;
    this._ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._ctx.scale(dpr, dpr);
    this._w = rect.width;
    this._h = rect.height;
  }

  start() {
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      this._draw();
    };
    tick();
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this._ctx.fillStyle = '#0d0d0d';
    this._ctx.fillRect(0, 0, this._w, this._h);
  }

  _draw() {
    const analyser = this._analyser;
    const timeData = new Uint8Array(analyser.frequencyBinCount);
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);

    const active = profileById(State.activeSpeakerId);
    const accent = active ? active.color : '#4dabf7';

    const ctx = this._ctx;
    const W = this._w;
    const H = this._h;

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0d0d0d');
    bg.addColorStop(1, hexToRgba(accent, 0.14));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Three lightweight band meters (low/mid/high) tinted with active speaker color.
    const seg = Math.floor(freqData.length / 3);
    const low = avgByte(freqData, 0, seg);
    const mid = avgByte(freqData, seg, seg * 2);
    const high = avgByte(freqData, seg * 2, freqData.length);

    drawBandMeter(ctx, 0, W / 3, H, low, accent);
    drawBandMeter(ctx, W / 3, W / 3, H, mid, accent);
    drawBandMeter(ctx, (W / 3) * 2, W / 3, H, high, accent);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = accent;
    ctx.beginPath();

    const slice = W / timeData.length;
    let x = 0;
    for (let i = 0; i < timeData.length; i++) {
      const y = ((timeData[i] / 128) * H) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += slice;
    }
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }
}

function spectralCentroid() {
  if (!State.analyser || !State.audioCtx) return 0;
  const freqData = new Float32Array(State.analyser.frequencyBinCount);
  State.analyser.getFloatFrequencyData(freqData);

  const nyquist = State.audioCtx.sampleRate / 2;
  let weighted = 0;
  let total = 0;

  for (let i = 0; i < freqData.length; i++) {
    const power = Math.pow(10, freqData[i] / 20);
    const freq = (i / freqData.length) * nyquist;
    weighted += freq * power;
    total += power;
  }
  return total > 0 ? weighted / total : 0;
}

function startPitchSampling() {
  if (State.sampleTimer) return;
  State.utteranceSamples = [];
  State.utteranceSignatureSamples = [];
  State.stereoSamplesL = [];
  State.stereoSamplesR = [];
  State.sampleTimer = setInterval(() => {
    const c = spectralCentroid();
    if (c > 0) {
      State.utteranceSamples.push(c);
      State.pitchHistory.push(c);
      if (State.pitchHistory.length > CFG.PITCH_WINDOW) State.pitchHistory.shift();
    }

    if (State.latestSignatureFrame) {
      State.utteranceSignatureSamples.push(State.latestSignatureFrame);
    }

    updateProfilingStatus();

    if (State.stereoEnabled && State.stereoAnalyserL && State.stereoAnalyserR) {
      const left = channelEnergy(State.stereoAnalyserL);
      const right = channelEnergy(State.stereoAnalyserR);
      State.stereoSamplesL.push(left);
      State.stereoSamplesR.push(right);
      updateStereoInfoText(left, right);
    }
  }, 1000 / CFG.PITCH_HZ);
}

function stopPitchSampling() {
  clearInterval(State.sampleTimer);
  State.sampleTimer = null;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function isSignatureModeEnabled() {
  return !!window.Meyda;
}

function isProfilingPhase() {
  if (!isSignatureModeEnabled() || !State.profilingStartedAt) return false;
  return (Date.now() - State.profilingStartedAt) < CFG.ROOM_PROFILE_MS;
}

function updateProfilingStatus() {
  if (!State.isRunning) return;
  if (!isSignatureModeEnabled()) {
    setStatus('active', 'Listening (pitch fallback)');
    return;
  }

  if (isProfilingPhase()) {
    const remainingMs = Math.max(0, CFG.ROOM_PROFILE_MS - (Date.now() - State.profilingStartedAt));
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    setStatus('active', `Profiling room... ${seconds}s`);
  } else {
    setStatus('active', 'Listening (voice clusters ready)');
  }
}

function meanVector(vectors) {
  if (!vectors.length) return [];
  const dim = vectors[0].length;
  const acc = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) acc[i] += v[i] || 0;
  }
  return acc.map((x) => x / vectors.length);
}

function vectorDistance(a, b) {
  if (!a || !b || !a.length || !b.length || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

function buildSignatureVector(frame, fallbackCentroid) {
  if (!frame) return null;

  const mfcc = Array.isArray(frame.mfcc) ? frame.mfcc.slice(1, 8) : [];
  const mfccScaled = mfcc.map((v) => (v || 0) / 100);
  const centroid = Number.isFinite(frame.spectralCentroid) ? frame.spectralCentroid : (fallbackCentroid || 0);
  const rolloff = Number.isFinite(frame.spectralRolloff) ? frame.spectralRolloff : centroid;
  const flatness = Number.isFinite(frame.spectralFlatness) ? frame.spectralFlatness : 0;
  const zcr = Number.isFinite(frame.zcr) ? frame.zcr : 0;

  return [
    ...mfccScaled,
    centroid / 6000,
    rolloff / 6000,
    Math.min(1, Math.max(0, flatness * 10)),
    Math.min(1, Math.max(0, zcr * 10)),
  ];
}

function signatureDescriptor(features) {
  if (!features) return 'Profile warming up';

  const attack = features.zcr > 0.065 ? 'Sharp attack' : 'Smooth attack';
  const formants = features.spectralCentroid > 1800 ? 'Higher formants' : 'Lower formants';
  const tempo = features.rms > 0.05 ? 'Stronger tempo' : 'Softer tempo';
  return `${attack}, ${formants}, ${tempo}`;
}

function clusterLabelFromIndex(n) {
  return `Cluster ${String.fromCharCode(64 + Math.min(n, 26))}`;
}

function classifyTone(value) {
  if (State.pitchHistory.length < 6) return 'mid';
  const sorted = [...State.pitchHistory].sort((a, b) => a - b);
  const lowCut = sorted[Math.floor(sorted.length * 0.33)] || sorted[0];
  const highCut = sorted[Math.floor(sorted.length * 0.66)] || sorted[sorted.length - 1];
  if (value <= lowCut) return 'low';
  if (value >= highCut) return 'high';
  return 'mid';
}

function laneHintFromTone(tone) {
  if (tone === 'low') return 'Lower pitch profile';
  if (tone === 'high') return 'Higher pitch profile';
  return 'Mid pitch profile';
}

function setStatus(state, label) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;
  dot.className = `status-dot ${state}`;
  text.textContent = label;
}

function updateCardCount() {
  const total = document.querySelectorAll('.card').length;
  const el = document.getElementById('card-count');
  if (el) el.textContent = `${total} card${total !== 1 ? 's' : ''}`;
}

function updateEmptyStage() {
  const panel = document.getElementById('empty-stage');
  if (!panel) return;
  const count = Storage.allCards().length;
  panel.classList.toggle('hidden', count > 0);
}

function updateSpeakerIndicator(profile) {
  const el = document.getElementById('speaker-indicator');
  if (!el) return;
  if (!profile) {
    el.textContent = '';
    return;
  }
  el.textContent = `Active cluster: ${profile.label}`;
  el.style.color = profile.color;
}

function updateMicInfoText() {
  const el = document.getElementById('mic-info');
  if (!el) return;

  if (!State.micDiagnostics) {
    el.textContent = isSignatureModeEnabled() ? 'Voice split: Meyda signatures + pitch fallback' : 'Voice split: tone profile only';
    return;
  }

  const d = State.micDiagnostics;
  const channels = d.channelCount || 1;
  if (channels > 1) {
    el.textContent = isSignatureModeEnabled()
      ? `Mic channels: ${channels} (Meyda timbre clusters + pitch fallback)`
      : `Mic channels: ${channels} (transcript still mixed; separation is mainly tone-based)`;
  } else {
    el.textContent = isSignatureModeEnabled()
      ? 'Mic channels: 1 (Meyda timbre clusters + pitch fallback)'
      : 'Mic channels: 1 (speaker split is tone-based)';
  }
}

function updateStereoInfoText(left = 0, right = 0) {
  const el = document.getElementById('stereo-info');
  if (!el) return;

  if (!State.stereoEnabled || !State.micDiagnostics || (State.micDiagnostics.channelCount || 1) < 2) {
    el.classList.add('hidden');
    return;
  }

  el.classList.remove('hidden');
  const bias = left + right > 0 ? (left - right) / (left + right) : 0;
  const side = Math.abs(bias) < 0.08 ? 'Center' : (bias > 0 ? 'Left-leaning' : 'Right-leaning');
  el.textContent = `Stereo L:${left.toFixed(0)} R:${right.toFixed(0)} ${side}`;
}

function showLanguageHint(message) {
  const el = document.getElementById('lang-mismatch-hint');
  if (!el) return;
  if (!message) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  el.textContent = message;
  el.classList.remove('hidden');
}

function selectedLanguageLabel() {
  const meta = languageMeta(State.recognitionLang);
  return meta ? meta.label : (State.recognitionLang || 'None (Auto)');
}

function showDetectedLanguageFeedback(detectedTag) {
  if (!detectedTag) return;
  if (!State.recognitionLang) {
    showLanguageHint(`Detected ${detectedTag} while in Auto mode.`);
    return;
  }
  if (detectedTag !== State.recognitionLang) {
    showLanguageHint(`Detected ${detectedTag} but selected ${selectedLanguageLabel()}. Try None (Auto) or switch language.`);
  } else {
    showLanguageHint('');
  }
}

function languageMeta(tag) {
  if (tag === '') return LANGUAGE_OPTIONS.find((l) => l.code === '') || null;
  if (!tag) return null;
  const base = tag.toLowerCase();
  return LANGUAGE_OPTIONS.find((l) => l.code.toLowerCase() === base)
    || LANGUAGE_OPTIONS.find((l) => base.startsWith(l.code.toLowerCase().split('-')[0]))
    || null;
}

function languageFlag(tag) {
  const meta = languageMeta(tag);
  return meta ? meta.flag : '🌐';
}

function languageBadgeText(tag) {
  return tag || 'Auto';
}

function updateLaneLanguage(profile, tag, shifted = false) {
  if (!profile || !profile.el || !tag) return;
  const badge = profile.el.querySelector(`#lane-${profile.id}-lang`);
  if (!badge) return;
  badge.textContent = `${languageFlag(tag)} ${languageBadgeText(tag)}`;
  badge.classList.toggle('shifted', !!shifted);
}

function normalizeSupportedLangs(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (typeof item === 'string') out.push(item);
    if (item && typeof item === 'object' && typeof item.lang === 'string') out.push(item.lang);
  }
  return [...new Set(out)];
}

async function getSpeechLanguageCodes() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || typeof SR.available !== 'function') {
    return LANGUAGE_OPTIONS.map((l) => l.code);
  }

  try {
    const requested = LANGUAGE_OPTIONS.map((l) => l.code).filter(Boolean);
    const available = await SR.available(requested);
    const normalized = normalizeSupportedLangs(available);
    return normalized.length ? ['', ...normalized] : LANGUAGE_OPTIONS.map((l) => l.code);
  } catch {
    return LANGUAGE_OPTIONS.map((l) => l.code);
  }
}

async function initLanguageSelector() {
  const select = document.getElementById('lang-select');
  if (!select) return;

  const codes = await getSpeechLanguageCodes();
  const mapped = codes.map((code) => languageMeta(code) || { code, label: code, flag: '🌐' });
  mapped.sort((a, b) => {
    if (a.code === '') return -1;
    if (b.code === '') return 1;
    return a.label.localeCompare(b.label);
  });
  State.supportedLanguages = mapped;

  select.innerHTML = '';
  for (const lang of mapped) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = `${lang.flag} ${lang.label}`;
    select.appendChild(opt);
  }

  if (!mapped.find((l) => l.code === State.recognitionLang)) {
    State.recognitionLang = mapped[0]?.code || DEFAULT_RECOGNITION_LANG;
  }
  select.value = State.recognitionLang;
}

async function initLanguageDetection() {
  // Try vendored copy first (works fully offline), then CDN, then heuristic fallback.
  const sources = [
    './vendor/franc-min/index.js',
    'https://esm.sh/franc-min@6.2.0',
  ];
  for (const src of sources) {
    try {
      const mod = await import(src);
      if (typeof mod.franc === 'function') {
        State.languageDetector = mod.franc;
        return;
      }
    } catch {
      // try next source
    }
  }
  State.languageDetector = null;
}

function heuristicLangFromText(text) {
  const t = (text || '').toLowerCase();
  if (/[¿¡]|\b(hola|gracias|usted|porque|est[áa]|buenos|buenas)\b/.test(t)) return 'es-ES';
  if (/\b(bonjour|merci|oui|non|avec|pourquoi|fran[cç]ais)\b/.test(t)) return 'fr-FR';
  if (/[а-яё]/i.test(t)) return 'ru-RU';
  if (/[\u4e00-\u9fff]/.test(t)) return 'cmn-Hans-CN';
  if (/[\u3040-\u30ff]/.test(t)) return 'ja-JP';
  if (/[\uac00-\ud7af]/.test(t)) return 'ko-KR';
  return null;
}

function detectLanguageTag(text) {
  const clean = String(text || '').trim();
  if (!clean || clean.length < 10) return null;

  if (State.languageDetector) {
    const code3 = State.languageDetector(clean, { minLength: 6 });
    if (code3 && code3 !== 'und' && ISO3_TO_BCP47[code3]) {
      return ISO3_TO_BCP47[code3];
    }
  }

  return heuristicLangFromText(clean);
}

function applyRecognitionLanguage(lang, opts = { fromUser: false }) {
  if (lang == null) return;
  State.recognitionLang = lang;
  localStorage.setItem('echolocate-rec-lang', lang);

  const select = document.getElementById('lang-select');
  if (select && select.value !== lang) select.value = lang;

  if (SpeechEngine._rec) {
    SpeechEngine._rec.lang = lang || '';
    if (opts.fromUser && State.isRunning) {
      const label = languageMeta(lang)?.label || lang || 'None (Auto)';
      setStatus('restarting', `Switching language to ${label}...`);
      try {
        SpeechEngine._rec.stop();
      } catch {
        // Ignore stop race.
      }
    }
  }
}

function applyView(view) {
  const normalized = view === 'chat' ? 'chat' : 'lanes';
  document.body.classList.toggle('view-chat', normalized === 'chat');
  document.body.classList.toggle('view-lanes', normalized !== 'chat');
  localStorage.setItem('echolocate-view', normalized);

  const btn = document.getElementById('btn-view-toggle');
  if (!btn) return;
  const inChat = normalized === 'chat';
  btn.textContent = inChat ? 'Layout: Chat' : 'Layout: Lanes';
  btn.setAttribute('aria-pressed', inChat ? 'true' : 'false');
  btn.setAttribute('aria-label', inChat ? 'Switch layout (currently chat)' : 'Switch layout (currently lanes)');
  btn.title = 'Switch between chat and lanes layouts';
}

function initViewToggle() {
  const saved = localStorage.getItem('echolocate-view');
  const mobileDefault = window.matchMedia('(max-width: 700px)').matches ? 'chat' : 'lanes';
  applyView(saved || mobileDefault);

  const btn = document.getElementById('btn-view-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = document.body.classList.contains('view-chat') ? 'lanes' : 'chat';
    applyView(next);
  });
}

function startLanguageHintTimer() {
  clearInterval(State.languageHintTimer);
  State.lastResultAt = Date.now();
  State.languageHintTimer = setInterval(() => {
    if (!State.isRunning) return;
    if (!State.recognitionLang) return;
    if (Date.now() - State.lastResultAt < 9000) return;
    showLanguageHint(`No transcript yet. Selected ${selectedLanguageLabel()}. Try None (Auto) or switch language.`);
  }, 4000);
}

function stopLanguageHintTimer() {
  clearInterval(State.languageHintTimer);
  State.languageHintTimer = null;
}

function pushDebugPoint(point) {
  State.debugPoints.push(point);
  if (State.debugPoints.length > CFG.DEBUG_POINTS_MAX) {
    State.debugPoints.shift();
  }
  if (State.debugEnabled) renderDebugOverlay();
}

function renderDebugOverlay() {
  const canvas = document.getElementById('debug-canvas');
  const summary = document.getElementById('debug-summary');
  if (!canvas || !summary) return;

  const points = State.debugPoints;
  if (!points.length) {
    summary.textContent = 'No pitch data yet.';
    return;
  }

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const pad = 12;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 0, W, H);

  const minV = Math.min(...points.map((p) => p.centroid));
  const maxV = Math.max(...points.map((p) => p.centroid));
  const span = Math.max(1, maxV - minV);

  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, H - pad);
  ctx.lineTo(W - pad, H - pad);
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, H - pad);
  ctx.stroke();

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const x1 = pad + ((i - 1) / Math.max(1, points.length - 1)) * (W - pad * 2);
    const y1 = H - pad - ((prev.centroid - minV) / span) * (H - pad * 2);
    const x2 = pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
    const y2 = H - pad - ((cur.centroid - minV) / span) * (H - pad * 2);

    ctx.strokeStyle = cur.speakerColor || '#4dabf7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (cur.speakerId !== prev.speakerId) {
      ctx.strokeStyle = '#ffd43b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x2, pad);
      ctx.lineTo(x2, H - pad);
      ctx.stroke();
    }
  }

  const latest = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const switched = prev && prev.speakerId !== latest.speakerId;
  const ratioText = Number.isFinite(latest.matchRatio) ? latest.matchRatio.toFixed(3) : 'n/a';
  summary.textContent = switched
    ? `Switch detected. New cluster ${latest.speakerId.toUpperCase()} at ${latest.centroid.toFixed(1)}Hz (ratio ${ratioText}, ${latest.matchLevel}).`
    : `Stable cluster ${latest.speakerId.toUpperCase()} at ${latest.centroid.toFixed(1)}Hz (ratio ${ratioText}, ${latest.matchLevel}).`;
}

function updateDebugUI() {
  const overlay = document.getElementById('debug-overlay');
  const btn = document.getElementById('btn-debug');
  if (!overlay || !btn) return;
  overlay.classList.toggle('hidden', !State.debugEnabled);
  btn.setAttribute('aria-pressed', State.debugEnabled ? 'true' : 'false');
  if (State.debugEnabled) renderDebugOverlay();
}

function profileById(id) {
  return State.profiles.find((p) => p.id === id) || null;
}

function buildLane(profile) {
  const lane = document.createElement('section');
  lane.className = 'lane';
  lane.id = `lane-${profile.id}`;
  lane.setAttribute('aria-label', `${profile.label} lane`);
  lane.style.setProperty('--speaker-color', profile.color);

  const header = document.createElement('header');
  header.className = 'lane-header';
  header.innerHTML = `
    <span class="lane-dot"></span>
    ${escapeHTML(profile.label)}
    <span class="lane-language" id="lane-${profile.id}-lang">${languageFlag(State.recognitionLang)} ${escapeHTML(languageBadgeText(State.recognitionLang))}</span>
    <span class="lane-hint">${escapeHTML(laneHintFromTone(profile.tone))}</span>
  `;

  const cards = document.createElement('div');
  cards.className = 'lane-cards';
  cards.id = `lane-${profile.id}-cards`;

  lane.appendChild(header);
  lane.appendChild(cards);
  document.getElementById('lanes-container').appendChild(lane);

  profile.el = lane;
  profile.cardsEl = cards;
}

function ensureLane(profile) {
  if (!profile.el || !profile.cardsEl) buildLane(profile);
}

function touchProfile(profile, now) {
  profile.lastSpokenAt = now;
  State.activeSpeakerId = profile.id;

  for (const p of State.profiles) {
    if (!p.el) continue;
    p.el.classList.toggle('active', p.id === profile.id);
  }

  updateSpeakerIndicator(profile);
}

function newProfile(pitch, tone) {
  const n = State.nextSpeakerNum;
  State.nextSpeakerNum += 1;
  const label = clusterLabelFromIndex(n);

  return {
    id: `s${n}`,
    label,
    color: PALETTE[(n - 1) % PALETTE.length],
    lastSpokenAt: Date.now(),
    avgPitch: pitch,
    tone,
    el: null,
    cardsEl: null,
    count: 0,
    matchLevel: 'medium',
    signature: null,
    signatureStats: null,
  };
}

function confidenceFromRatio(ratio) {
  if (ratio <= CFG.HIGH_CONF_RATIO) return 'high';
  if (ratio <= CFG.MED_CONF_RATIO) return 'medium';
  return 'low';
}

function confidenceFromSignatureDistance(distance) {
  if (distance <= CFG.SIGNATURE_HIGH_DISTANCE) return 'high';
  if (distance <= CFG.SIGNATURE_MED_DISTANCE) return 'medium';
  return 'low';
}

function resolveSpeakerProfile(metrics) {
  const pitch = metrics.centroid;
  const tone = metrics.tone;
  const signature = metrics.signature;
  const signatureStats = metrics.signatureStats;

  if (!State.profiles.length) {
    const first = newProfile(pitch, tone);
    first.signature = signature || null;
    first.signatureStats = signatureStats || null;
    State.profiles.push(first);
    ensureLane(first);
    first.matchLevel = 'medium';
    if (first.el && first.signatureStats) {
      const hint = first.el.querySelector('.lane-hint');
      if (hint) hint.textContent = signatureDescriptor(first.signatureStats);
    }
    return { profile: first, matchRatio: 0, confidenceLevel: first.matchLevel, createdNew: true };
  }

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let useSignature = !!signature;

  for (const p of State.profiles) {
    const distance = (useSignature && p.signature)
      ? vectorDistance(p.signature, signature)
      : Math.abs(p.avgPitch - pitch) / Math.max(p.avgPitch, pitch, 1);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = p;
    }
  }

  const threshold = useSignature ? CFG.SIGNATURE_MATCH_DISTANCE : CFG.VOICE_MATCH_RATIO;
  if (best && (bestDistance <= threshold || State.profiles.length >= CFG.MAX_SPEAKERS)) {
    best.avgPitch = best.avgPitch * 0.7 + pitch * 0.3;
    best.tone = tone;
    if (signature) {
      if (best.signature) {
        best.signature = best.signature.map((v, i) => (v * 0.72) + ((signature[i] || 0) * 0.28));
      } else {
        best.signature = signature;
      }
    }
    best.signatureStats = signatureStats || best.signatureStats;
    best.matchLevel = useSignature ? confidenceFromSignatureDistance(bestDistance) : confidenceFromRatio(bestDistance);

    if (best.el) {
      const hint = best.el.querySelector('.lane-hint');
      if (hint) {
        hint.textContent = best.signatureStats
          ? signatureDescriptor(best.signatureStats)
          : laneHintFromTone(tone);
      }
    }
    return { profile: best, matchRatio: bestDistance, confidenceLevel: best.matchLevel, createdNew: false };
  }

  const next = newProfile(pitch, tone);
  next.signature = signature || null;
  next.signatureStats = signatureStats || null;
  State.profiles.push(next);
  ensureLane(next);
  next.matchLevel = 'low';
  if (next.el && next.signatureStats) {
    const hint = next.el.querySelector('.lane-hint');
    if (hint) hint.textContent = signatureDescriptor(next.signatureStats);
  }
  return { profile: next, matchRatio: 1, confidenceLevel: next.matchLevel, createdNew: true };
}

function flushUtteranceMetrics() {
  const samples = State.utteranceSamples;
  const signatureFrames = State.utteranceSignatureSamples;
  const stereoL = State.stereoSamplesL;
  const stereoR = State.stereoSamplesR;
  stopPitchSampling();
  State.utteranceSamples = [];
  State.utteranceSignatureSamples = [];
  State.stereoSamplesL = [];
  State.stereoSamplesR = [];

  const centroid = samples.length ? mean(samples) : (State.pitchHistory.length ? mean(State.pitchHistory) : 200);
  const tone = classifyTone(centroid);
  const signatureStats = signatureFrames.length
    ? {
        spectralCentroid: mean(signatureFrames.map((f) => f.spectralCentroid || centroid)),
        spectralRolloff: mean(signatureFrames.map((f) => f.spectralRolloff || centroid)),
        spectralFlatness: mean(signatureFrames.map((f) => f.spectralFlatness || 0)),
        zcr: mean(signatureFrames.map((f) => f.zcr || 0)),
        rms: mean(signatureFrames.map((f) => f.rms || 0)),
      }
    : null;
  const signature = signatureFrames.length
    ? meanVector(signatureFrames.map((f) => buildSignatureVector(f, centroid)).filter(Boolean))
    : null;
  const leftEnergy = stereoL.length ? mean(stereoL) : 0;
  const rightEnergy = stereoR.length ? mean(stereoR) : 0;
  const balance = (leftEnergy + rightEnergy) > 0 ? (leftEnergy - rightEnergy) / (leftEnergy + rightEnergy) : 0;
  return { centroid, tone, signature, signatureStats, leftEnergy, rightEnergy, balance };
}

const Storage = {
  _load() {
    try {
      return JSON.parse(localStorage.getItem(CFG.STORAGE_KEY) || '{"cards":[]}');
    } catch {
      return { cards: [] };
    }
  },

  save(card) {
    const data = this._load();
    data.cards.push(card);
    if (data.cards.length > CFG.CARD_LIMIT) {
      data.cards = data.cards.slice(-CFG.CARD_LIMIT);
    }
    try {
      localStorage.setItem(CFG.STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage quota errors.
    }
  },

  clear() {
    localStorage.removeItem(CFG.STORAGE_KEY);
  },

  allCards() {
    return this._load().cards;
  },
};

async function postCard(cardData) {
  if (!window.htmx) {
    console.warn('[EchoLocate] htmx not loaded — card not rendered');
    return;
  }

  const profile = profileById(cardData.speakerId);
  if (!profile) return;
  ensureLane(profile);

  const target = `#lane-${profile.id}-cards`;

  await htmx.ajax('POST', API.ADD_CARD, {
    target,
    swap: 'beforeend',
    values: {
      text: cardData.text,
      speakerId: cardData.speakerId,
      speakerLabel: cardData.speakerLabel,
      tone: cardData.tone,
      speakerColor: cardData.speakerColor,
      confidence: String(cardData.confidence),
      timestamp: cardData.timestamp,
      profileMatchLevel: cardData.profileMatchLevel || 'high',
    },
  });

  if (profile.cardsEl) {
    profile.cardsEl.scrollTop = profile.cardsEl.scrollHeight;
  }
}

async function postChatMsg(cardData) {
  if (!window.htmx) return;
  const feed = document.getElementById('chat-feed');
  if (!feed) return;
  await htmx.ajax('POST', API.ADD_CHAT_MSG, {
    target: '#chat-feed',
    swap: 'beforeend',
    values: {
      text:              cardData.text,
      speakerId:         cardData.speakerId,
      speakerLabel:      cardData.speakerLabel,
      speakerColor:      cardData.speakerColor,
      confidence:        String(cardData.confidence),
      timestamp:         cardData.timestamp,
      profileMatchLevel: cardData.profileMatchLevel || 'high',
    },
  });
  feed.scrollTop = feed.scrollHeight;
}

const TranscriptCtrl = {
  _liveEl: null,

  init() {
    this._liveEl = document.getElementById('live-transcript');
  },

  showInterim(text) {
    if (!this._liveEl) return;
    this._liveEl.textContent = text;
    this._liveEl.classList.toggle('speaking', text.length > 0);
    if (text && !State.currentUtteranceStartedAt) {
      State.currentUtteranceStartedAt = Date.now();
    }
  },

  clearInterim() {
    this.showInterim('');
  },

  async commitCard(text, confidence) {
    const now = Date.now();
    const startedAt = State.currentUtteranceStartedAt || (now - 1500);
    State.currentUtteranceStartedAt = null;

    const { centroid, tone, signature, signatureStats, leftEnergy, rightEnergy, balance } = flushUtteranceMetrics();
    const match = resolveSpeakerProfile({ centroid, tone, signature, signatureStats });
    const profile = match.profile;
    profile.count += 1;

    const detectedLang = detectLanguageTag(text);
    const laneLang = detectedLang || State.recognitionLang || '';
    const shiftedLang = !!profile.languageTag && !!laneLang && profile.languageTag !== laneLang;
    profile.languageTag = laneLang;
    if (laneLang) updateLaneLanguage(profile, laneLang, shiftedLang);
    showDetectedLanguageFeedback(detectedLang);

    touchProfile(profile, now);

    const cardData = {
      text,
      speakerId: profile.id,
      speakerLabel: profile.label,
      speakerColor: profile.color,
      tone,
      confidence,
      timestamp: new Date(now).toISOString(),
      startedAt,
      endedAt: now,
      pitch: centroid,
      languageTag: detectedLang,
      clusterDescriptor: profile.signatureStats ? signatureDescriptor(profile.signatureStats) : laneHintFromTone(tone),
      profileMatchRatio: match.matchRatio,
      profileMatchLevel: match.confidenceLevel,
      stereoBalance: balance,
      stereoLeftEnergy: leftEnergy,
      stereoRightEnergy: rightEnergy,
    };

    pushDebugPoint({
      timestamp: now,
      centroid,
      speakerId: profile.id,
      speakerColor: profile.color,
      matchRatio: match.matchRatio,
      matchLevel: match.confidenceLevel,
      createdNew: match.createdNew,
      leftEnergy,
      rightEnergy,
      balance,
    });

    this.clearInterim();

    await postCard(cardData);
    await postChatMsg(cardData);
    Storage.save(cardData);
    updateCardCount();
    updateEmptyStage();

    startPitchSampling();
  },
};

const SpeechEngine = {
  _rec: null,
  _watchdogTimer: null,

  init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();

    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = State.recognitionLang || DEFAULT_RECOGNITION_LANG;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      State.profilingStartedAt = Date.now();
      updateProfilingStatus();
      startPitchSampling();
      startLanguageHintTimer();
      showLanguageHint('');
      if (State.meydaAnalyzer) {
        try {
          State.meydaAnalyzer.start();
        } catch {
          // Meyda start can race if already running.
        }
      }
      this._resetWatchdog();
    };

    rec.onresult = (event) => {
      this._resetWatchdog();
      State.lastResultAt = Date.now();
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        const confidence = result[0].confidence ?? 1;

        if (result.isFinal && transcript) {
          TranscriptCtrl.commitCard(transcript, confidence);
        } else if (transcript) {
          interim += transcript + ' ';
          showDetectedLanguageFeedback(detectLanguageTag(transcript));
        }
      }

      TranscriptCtrl.showInterim(interim.trim());
    };

    rec.onerror = (event) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'not-allowed') {
        setStatus('error', 'Mic access blocked');
        State.isRunning = false;
        return;
      }
      setStatus('restarting', `Error: ${event.error}`);
    };

    rec.onend = () => {
      clearTimeout(this._watchdogTimer);
      if (State.isRunning) {
        setStatus('restarting', 'Reconnecting...');
        setTimeout(() => {
          if (State.isRunning) this._rawStart();
        }, CFG.RESTART_DELAY);
      } else {
        setStatus('idle', 'Ready');
        stopLanguageHintTimer();
        showLanguageHint('');
        if (State.visualizer) State.visualizer.stop();
        stopPitchSampling();
        if (State.meydaAnalyzer) {
          try {
            State.meydaAnalyzer.stop();
          } catch {
            // Ignore stop race.
          }
        }
        TranscriptCtrl.clearInterim();
      }
    };

    this._rec = rec;
  },

  _resetWatchdog() {
    clearTimeout(this._watchdogTimer);
    this._watchdogTimer = setTimeout(() => {
      if (State.isRunning) {
        try {
          this._rec.stop();
        } catch {
          // Ignore stop race.
        }
      }
    }, CFG.WATCHDOG_MS);
  },

  _rawStart() {
    try {
      this._rec.start();
    } catch (err) {
      if (err.name !== 'InvalidStateError') setStatus('error', err.message);
    }
  },

  async start() {
    if (State.isRunning) return;
    if (!this._rec) {
      setStatus('error', 'Web Speech API unavailable');
      return;
    }
    State.isRunning = true;

    try {
      await setupAudio();
    } catch {
      setStatus('error', 'Mic access denied');
      State.isRunning = false;
      return;
    }

    this._rawStart();
  },

  stop() {
    State.isRunning = false;
    stopLanguageHintTimer();
    showLanguageHint('');
    clearTimeout(this._watchdogTimer);
    stopPitchSampling();
    State.latestSignatureFrame = null;
    if (State.meydaAnalyzer) {
      try {
        State.meydaAnalyzer.stop();
      } catch {
        // Ignore stop race.
      }
    }
    try {
      this._rec.stop();
    } catch {
      // Ignore stop race.
    }
  },
};

function initMeyda(source) {
  if (!window.Meyda || !State.audioCtx || !source) return;
  if (State.meydaAnalyzer) return;

  try {
    State.meydaAnalyzer = window.Meyda.createMeydaAnalyzer({
      audioContext: State.audioCtx,
      source,
      bufferSize: 1024,
      featureExtractors: ['mfcc', 'spectralCentroid', 'spectralRolloff', 'spectralFlatness', 'zcr', 'rms'],
      numberOfMFCCCoefficients: CFG.MFCC_COEFFS,
      callback: (features) => {
        State.latestSignatureFrame = features;
      },
    });
  } catch (err) {
    State.meydaAnalyzer = null;
    console.warn('[EchoLocate] Meyda init skipped:', err.message);
  }
}

async function setupAudio() {
  if (State.audioCtx) {
    if (State.audioCtx.state === 'suspended') await State.audioCtx.resume();
    if (State.visualizer) State.visualizer.start();
    updateMicInfoText();
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const track = stream.getAudioTracks()[0];
  const settings = track && track.getSettings ? track.getSettings() : {};
  State.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = State.audioCtx.createMediaStreamSource(stream);
  State.mediaSource = source;

  State.micDiagnostics = {
    channelCount: settings.channelCount || 1,
    sampleRate: settings.sampleRate || State.audioCtx.sampleRate,
    echoCancellation: settings.echoCancellation,
  };
  updateMicInfoText();

  State.analyser = State.audioCtx.createAnalyser();
  State.analyser.fftSize = 2048;
  State.analyser.smoothingTimeConstant = 0.8;
  source.connect(State.analyser);
  initMeyda(source);

  if ((State.micDiagnostics.channelCount || 1) > 1) {
    const splitter = State.audioCtx.createChannelSplitter(2);
    source.connect(splitter);
    State.stereoAnalyserL = State.audioCtx.createAnalyser();
    State.stereoAnalyserR = State.audioCtx.createAnalyser();
    State.stereoAnalyserL.fftSize = 1024;
    State.stereoAnalyserR.fftSize = 1024;
    splitter.connect(State.stereoAnalyserL, 0);
    splitter.connect(State.stereoAnalyserR, 1);
  }

  refreshStereoControlState();

  const canvas = document.getElementById('visualizer');
  State.visualizer = new Visualizer(canvas, State.analyser);
  State.visualizer.start();
}

function formatVttTime(ms) {
  const clamped = Math.max(0, Math.floor(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const msPart = clamped % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(msPart).padStart(3, '0')}`;
}

function toVtt(cards) {
  if (!cards.length) return 'WEBVTT\n\n';

  const sorted = [...cards].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  const base = sorted[0].startedAt || Date.parse(sorted[0].timestamp) || Date.now();
  let out = 'WEBVTT\n\n';

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const start = cur.startedAt || Date.parse(cur.timestamp) || Date.now();
    const end = cur.endedAt || (next ? (next.startedAt || Date.parse(next.timestamp) || (start + 3000)) : (start + 3000));

    out += `${i + 1}\n`;
    out += `${formatVttTime(start - base)} --> ${formatVttTime(Math.max(end, start + 300) - base)}\n`;
    out += `${cur.speakerLabel || 'Cluster'}: ${cur.text}\n\n`;
  }

  return out;
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function restoreSession() {
  const cards = Storage.allCards();
  if (!cards.length) {
    updateEmptyStage();
    return;
  }

  for (const card of cards) {
    let profile = profileById(card.speakerId);
    if (!profile) {
      profile = {
        id: card.speakerId || `s${State.nextSpeakerNum}`,
        label: card.speakerLabel || clusterLabelFromIndex(State.nextSpeakerNum),
        color: card.speakerColor || PALETTE[(State.nextSpeakerNum - 1) % PALETTE.length],
        lastSpokenAt: card.endedAt || Date.now(),
        avgPitch: card.pitch || 200,
        tone: card.tone || 'mid',
        languageTag: card.languageTag || State.recognitionLang,
        el: null,
        cardsEl: null,
        count: 0,
        matchLevel: card.profileMatchLevel || 'medium',
      };
      State.profiles.push(profile);
      const num = parseInt(String(profile.id).replace('s', ''), 10);
      if (!isNaN(num)) State.nextSpeakerNum = Math.max(State.nextSpeakerNum, num + 1);
      ensureLane(profile);
      updateLaneLanguage(profile, profile.languageTag, false);
    }

    profile.count += 1;
    profile.lastSpokenAt = card.endedAt || profile.lastSpokenAt;

    const normalized = {
      text: card.text,
      speakerId: profile.id,
      speakerLabel: profile.label,
      speakerColor: profile.color,
      tone: card.tone || 'mid',
      confidence: card.confidence ?? 1,
      timestamp: card.timestamp || new Date().toISOString(),
      startedAt: card.startedAt || Date.now(),
      endedAt: card.endedAt || Date.now(),
      pitch: card.pitch || profile.avgPitch,
      languageTag: card.languageTag || profile.languageTag || State.recognitionLang,
      profileMatchRatio: card.profileMatchRatio ?? 0,
      profileMatchLevel: card.profileMatchLevel || profile.matchLevel || 'medium',
      stereoBalance: card.stereoBalance ?? 0,
      stereoLeftEnergy: card.stereoLeftEnergy ?? 0,
      stereoRightEnergy: card.stereoRightEnergy ?? 0,
    };

    await postCard(normalized);
    await postChatMsg(normalized);
  }

  updateCardCount();
  updateEmptyStage();
}

function initControls() {
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnClear = document.getElementById('btn-clear');
  const btnExport = document.getElementById('btn-export');
  const btnDebug = document.getElementById('btn-debug');
  const btnStereo = document.getElementById('btn-stereo');
  const langSelect = document.getElementById('lang-select');

  btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    btnStop.disabled = false;
    await SpeechEngine.start();
  });

  btnStop.addEventListener('click', () => {
    btnStop.disabled = true;
    btnStart.disabled = false;
    SpeechEngine.stop();
  });

  btnClear.addEventListener('click', () => {
    const confirmed = window.confirm('Clear locally saved discussion from this browser? This cannot be undone.');
    if (!confirmed) return;

    document.getElementById('lanes-container').innerHTML = '';
    const chatFeed = document.getElementById('chat-feed');
    if (chatFeed) chatFeed.innerHTML = '';
    document.getElementById('speaker-indicator').textContent = '';
    TranscriptCtrl.clearInterim();
    Storage.clear();
    State.profiles = [];
    State.activeSpeakerId = null;
    State.nextSpeakerNum = 1;
    State.debugPoints = [];
    updateStereoInfoText();
    renderDebugOverlay();
    updateCardCount();
    updateEmptyStage();
  });

  btnExport.addEventListener('click', () => {
    const cards = Storage.allCards();
    const vtt = toVtt(cards);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadTextFile(`echolocate-${stamp}.vtt`, vtt, 'text/vtt;charset=utf-8');
  });

  btnDebug.addEventListener('click', () => {
    State.debugEnabled = !State.debugEnabled;
    updateDebugUI();
  });

  btnStereo.addEventListener('click', () => {
    if (btnStereo.disabled) return;
    State.stereoEnabled = !State.stereoEnabled;
    btnStereo.setAttribute('aria-pressed', State.stereoEnabled ? 'true' : 'false');
    btnStereo.textContent = State.stereoEnabled ? 'Stereo On' : 'Stereo';
    updateStereoInfoText();
  });

  if (langSelect) {
    langSelect.addEventListener('change', () => {
      applyRecognitionLanguage(langSelect.value, { fromUser: true });
      showLanguageHint('');
    });
  }

  const btnTheme = document.getElementById('theme-toggle');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  const btnPrivacyDismiss = document.getElementById('btn-privacy-dismiss');
  if (btnPrivacyDismiss) {
    btnPrivacyDismiss.addEventListener('click', () => {
      const notice = document.getElementById('privacy-notice');
      if (notice) notice.classList.add('hidden');
      localStorage.setItem('echolocate-privacy-dismissed', '1');
    });
  }
}

async function boot() {
  checkSecureContext();
  const hasSpeech = checkBrowserSupport();

  initTheme();

  if (localStorage.getItem('echolocate-privacy-dismissed')) {
    const notice = document.getElementById('privacy-notice');
    if (notice) notice.classList.add('hidden');
  }

  await initLanguageSelector();
  await initLanguageDetection();
  initViewToggle();

  await registerServiceWorker();
  TranscriptCtrl.init();
  if (hasSpeech) SpeechEngine.init();
  initControls();
  updateMicInfoText();
  updateDebugUI();
  renderDebugOverlay();
  updateEmptyStage();

  restoreSession().catch((err) => console.warn('[EchoLocate] Restore failed:', err));
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function avgByte(arr, start, end) {
  let total = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    total += arr[i];
    count += 1;
  }
  return count ? total / count : 0;
}

function channelEnergy(analyser) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const centered = (data[i] - 128) / 128;
    sumSquares += centered * centered;
  }
  return Math.sqrt(sumSquares / data.length) * 100;
}

function refreshStereoControlState() {
  const btn = document.getElementById('btn-stereo');
  if (!btn) return;
  const available = !!State.micDiagnostics && (State.micDiagnostics.channelCount || 1) > 1;
  btn.disabled = !available;
  if (!available) {
    State.stereoEnabled = false;
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = 'Stereo';
    updateStereoInfoText();
  }
}

function drawBandMeter(ctx, x, width, h, value, color) {
  const v = Math.max(0, Math.min(255, value));
  const barH = (v / 255) * 18;
  const y = h - barH - 2;
  ctx.fillStyle = hexToRgba(color, 0.24 + (v / 255) * 0.36);
  ctx.fillRect(x + 3, y, Math.max(0, width - 6), barH);
}

function hexToRgba(hex, alpha) {
  const safe = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(safe)) return `rgba(77, 171, 247, ${alpha})`;
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

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
  WATCHDOG_MS:        10_000,
  CARD_LIMIT:         500,
  RESTART_DELAY:      150,
  SIGNATURE_MATCH_SIMILARITY: 0.85,
  SIGNATURE_HIGH_SIMILARITY:  0.93,
  SIGNATURE_MED_SIMILARITY:   0.88,
  HYSTERESIS_LOCK_MS:         400,
  HYSTERESIS_MARGIN:          0.06,
  MATCH_HISTORY_SIZE:         3,
  ROOM_PROFILE_MS:          10_000,
  MFCC_COEFFS:              13,
  MAX_SPEAKERS:       6,
  DEBUG_POINTS_MAX:   120,
  NETWORK_MAX_RETRIES:        5,
  NETWORK_ONLINE_MAX_RETRIES: 3,
  NETWORK_BACKOFF_INIT_MS:    1_000,
  NETWORK_BACKOFF_MAX_MS:     30_000,
  // Minimum ratio of system-audio energy to mic energy required to attribute
  // a card to the computer source rather than the microphone.  A value of 1.5
  // means the computer audio must be 50 % louder than the mic before we call
  // it "remote/computer" — empirically robust against mic-pickup of speakers.
  SYSTEM_AUDIO_ENERGY_RATIO:  1.5,
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
  speakerLock:               null,
  matchHistory:              [],
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
  // Audio source detection
  audioInputDeviceId:        localStorage.getItem('echolocate-audio-device') ?? '',
  systemAudioEnabled:        false,
  systemAudioStream:         null,
  systemAudioAnalyser:       null,
  systemAudioSamples:        [], // RMS energy samples during current utterance
  micEnergySamples:          [], // mic RMS samples for source comparison
  speechSupported:           true, // set to false by checkBrowserSupport() when API is absent
};

const PALETTE = ['#4dabf7', '#cc5de8', '#f59f00', '#20c997', '#ff8787', '#74c0fc', '#ffd43b', '#b197fc'];

function checkSecureContext() {
  if (!window.isSecureContext) {
    document.getElementById('secure-warning').classList.remove('hidden');
  }
}

function isEdgeBrowser() {
  // Detect Chromium-based Edge (not legacy EdgeHTML / "Edge" 18 and earlier).
  return /Edg\//.test(navigator.userAgent);
}

function checkBrowserSupport() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    // Web Speech API is present.  For Edge users who have not yet seen the
    // setup guide, show a proactive info modal so they know what to configure
    // before pressing Start.
    if (isEdgeBrowser() && !localStorage.getItem(EDGE_MODAL_DISMISSED_KEY)) {
      // Defer to next microtask so the rest of boot() finishes first.
      Promise.resolve().then(() => {
        showSpeechHelpModal(
          '⚠ Edge: enable online speech recognition',
          EDGE_SETUP_HTML,
          'info',
        );
      });
    }
    return true;
  }

  State.speechSupported = false;

  // Switch the welcome screen to the "unsupported" message so the user is
  // not told to press Start in a browser where it will never work.
  const welcomeContent = document.getElementById('empty-stage-welcome');
  const unsupportedContent = document.getElementById('empty-stage-unsupported');
  if (welcomeContent) welcomeContent.classList.add('hidden');
  if (unsupportedContent) unsupportedContent.classList.remove('hidden');
  const stage = document.getElementById('empty-stage');
  if (stage) stage.classList.remove('hidden');

  const start = document.getElementById('btn-start');
  const stop = document.getElementById('btn-stop');
  if (start) start.disabled = true;
  if (stop) stop.disabled = true;

  setStatus('error', 'Web Speech API not supported');

  // Show the inline banner as well as the modal so there is always a visible
  // persistent reminder even after the modal is closed.
  const warning = document.getElementById('speech-warning');
  if (warning) warning.classList.remove('hidden');

  Promise.resolve().then(() => {
    const browserName = isEdgeBrowser() ? 'Microsoft Edge' : 'this browser';
    showSpeechHelpModal(
      '⚠ Speech recognition not available',
      `<p><strong>${escapeHTML(browserName)}</strong> does not support the
      Web Speech API required for live transcription.</p>
      <p>For best results, use <strong>Google Chrome</strong> in a regular
      (non-incognito) window.</p>
      <p>Microsoft Edge also supports it, but requires
      <strong>Use online speech recognition</strong> to be enabled in
      <strong>Edge Settings → Privacy, search, and services → Services</strong>
      (<code>edge://settings/privacy</code>).</p>`,
    );
  });
  return false;
}

// ── Speech Help Modal ─────────────────────────────────────────────────────────

const EDGE_SETUP_HTML = `
  <p>You are using <strong>Microsoft Edge</strong>, which requires
  <strong>Use online speech recognition</strong> to be enabled before
  EchoLocate can transcribe speech.</p>
  <p><strong>To enable it in Edge:</strong></p>
  <ol>
    <li>Copy this address and paste it into a new Edge tab:<br>
        <code>edge://settings/privacy</code></li>
    <li>Scroll down to the <strong>Services</strong> section</li>
    <li>Turn on <strong>Use online speech recognition</strong></li>
    <li>Return here and press <strong>Start</strong></li>
  </ol>
  <p>If that option is missing, a browser or organization policy may be
  blocking it — contact your IT administrator, or switch to
  <strong>Google Chrome</strong>.</p>
  <p>Speech recognition is also blocked in <strong>InPrivate</strong>
  windows — open a regular Edge window instead.</p>
`;

const SPEECH_BLOCKED_HTML = `
  <p>Speech recognition is blocked. This can happen in:</p>
  <ol>
    <li><strong>Private / Incognito windows</strong> — try a regular browser window</li>
    <li><strong>Browsers with restricted settings</strong> — check that microphone
        access is permitted for this site</li>
  </ol>
  <p>For the best experience, use <strong>Google Chrome</strong> in a
  regular (non-incognito) window.</p>
`;

const EDGE_MODAL_DISMISSED_KEY = 'echolocate-edge-modal-dismissed';

// All callers must pass only trusted, pre-defined HTML strings — never user-
// controlled content.  The bodyHTML parameter is always sourced from the
// module-level constants (EDGE_SETUP_HTML, SPEECH_BLOCKED_HTML) or inline
// literals built with escapeHTML() for any dynamic parts.
function showSpeechHelpModal(title, bodyHTML, level = 'error') {
  const modal = document.getElementById('speech-help-modal');
  if (!modal) return;

  const titleEl = document.getElementById('speech-modal-title');
  const bodyEl  = document.getElementById('speech-modal-body');
  if (titleEl) {
    titleEl.textContent = title;
    titleEl.className = level === 'info'
      ? 'speech-modal-title info'
      : 'speech-modal-title';
  }
  if (bodyEl) bodyEl.innerHTML = bodyHTML;

  if (!modal.open) modal.showModal();
}

function initSpeechHelpModal() {
  const modal    = document.getElementById('speech-help-modal');
  const closeBtn = document.getElementById('speech-modal-close');
  const okBtn    = document.getElementById('speech-modal-ok');
  if (!modal) return;

  const handleClose = () => {
    modal.close();
    // Remember that the user has seen the Edge info so we don't show it every load.
    if (isEdgeBrowser()) {
      localStorage.setItem(EDGE_MODAL_DISMISSED_KEY, '1');
    }
  };

  if (closeBtn) closeBtn.addEventListener('click', handleClose);
  if (okBtn)    okBtn.addEventListener('click', handleClose);

  // Close on backdrop click (click on the <dialog> element itself, not its contents).
  // Registered once here; initSpeechHelpModal() must only be called once (from boot()).
  modal.addEventListener('click', (e) => {
    if (e.target === modal) handleClose();
  });
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
  if (!('serviceWorker' in navigator)) {
    console.warn('[EchoLocate] Service workers not supported in this browser — HTMX card fragments will not work.');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    console.log('[EchoLocate] Service worker registered (scope:', reg.scope, ')');
    await navigator.serviceWorker.ready;
    console.log('[EchoLocate] Service worker active and controlling page.');
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
  State.micEnergySamples = [];
  State.systemAudioSamples = [];
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

    // Update the debug overlay summary in real-time even before the first card
    if (State.debugEnabled && !State.debugPoints.length) updateDebugLiveStatus(c);

    if (State.stereoEnabled && State.stereoAnalyserL && State.stereoAnalyserR) {
      const left = channelEnergy(State.stereoAnalyserL);
      const right = channelEnergy(State.stereoAnalyserR);
      State.stereoSamplesL.push(left);
      State.stereoSamplesR.push(right);
      updateStereoInfoText(left, right);
    }

    // Sample mic and system audio energy for source attribution
    if (State.analyser) {
      State.micEnergySamples.push(channelEnergy(State.analyser));
    }
    if (State.systemAudioEnabled && State.systemAudioAnalyser) {
      State.systemAudioSamples.push(channelEnergy(State.systemAudioAnalyser));
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

function cosineSimilarity(a, b) {
  if (!a || !b || !a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function buildSignatureVector(frame, fallbackCentroid) {
  if (!frame) return null;

  const mfcc = Array.isArray(frame.mfcc) ? frame.mfcc.slice(0, 13) : [];
  const mfccScaled = mfcc.map((v) => (v || 0) / 100);
  const flatness = Number.isFinite(frame.spectralFlatness) ? frame.spectralFlatness : 0;
  const slope = Number.isFinite(frame.spectralSlope) ? frame.spectralSlope : 0;

  return [
    ...mfccScaled,
    Math.min(1, Math.max(0, flatness * 10)),
    Math.max(-1, Math.min(1, slope * 1000)),
  ];
}

function signatureDescriptor(features) {
  if (!features) return 'Profile warming up';

  const attack = features.zcr > 0.065 ? 'Sharp attack' : 'Smooth attack';
  const resonance = features.spectralSlope < 0 ? 'Chest resonance' : 'Nasal resonance';
  const texture = features.spectralFlatness > 0.16 ? 'Breathy texture' : 'Voiced texture';
  return `${attack}, ${resonance}, ${texture}`;
}

function clusterLabelFromIndex(n) {
  return `Guest ${n}`;
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
  refreshMergeControls();
}

function refreshMergeControls() {
  const fromSel = document.getElementById('merge-from');
  const intoSel = document.getElementById('merge-into');
  const btn = document.getElementById('btn-merge');
  const wrapper = document.getElementById('merge-tools-wrapper');
  if (!fromSel || !intoSel || !btn) return;

  const options = State.profiles.map((p) => ({ id: p.id, label: p.label }));
  fromSel.innerHTML = options.map((o) => `<option value="${escapeHTML(o.id)}">${escapeHTML(o.label)}</option>`).join('');
  intoSel.innerHTML = options.map((o) => `<option value="${escapeHTML(o.id)}">${escapeHTML(o.label)}</option>`).join('');

  if (options.length >= 2) {
    fromSel.value = options[1]?.id || options[0].id;
    intoSel.value = options[0].id;
  }
  btn.disabled = options.length < 2;

  // Reveal merge controls only once two or more speaker profiles exist.
  if (wrapper) {
    if (options.length >= 2) {
      wrapper.removeAttribute('hidden');
    } else {
      wrapper.setAttribute('hidden', '');
    }
  }
}

async function mergeProfiles(fromId, intoId) {
  if (!fromId || !intoId || fromId === intoId) return;
  const source = profileById(fromId);
  const target = profileById(intoId);
  if (!source || !target) return;

  const cards = Storage.allCards().map((card) => {
    if (card.speakerId !== fromId) return card;
    return {
      ...card,
      speakerId: target.id,
      speakerLabel: target.label,
      speakerColor: target.color,
    };
  });
  Storage.replaceAll(cards);

  document.getElementById('lanes-container').innerHTML = '';
  const chatFeed = document.getElementById('chat-feed');
  if (chatFeed) chatFeed.innerHTML = '';
  State.profiles = [];
  State.matchHistory = [];
  State.speakerLock = null;
  State.activeSpeakerId = null;
  State.nextSpeakerNum = 1;
  await restoreSession();
}

function updateEmptyStage() {
  const panel = document.getElementById('empty-stage');
  if (!panel) return;
  // When speech recognition is unavailable, keep the panel visible so the
  // "not supported" message remains visible even if there are stored cards.
  if (!State.speechSupported) {
    panel.classList.remove('hidden');
    return;
  }
  const count = Storage.allCards().length;
  panel.classList.toggle('hidden', State.isRunning || count > 0);
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
  const deviceLabel = d.label ? ` · ${d.label}` : '';
  if (channels > 1) {
    el.textContent = isSignatureModeEnabled()
      ? `🎤 Mic channels: ${channels} (Meyda timbre clusters + pitch fallback)${deviceLabel}`
      : `🎤 Mic channels: ${channels} (transcript still mixed; separation is mainly tone-based)${deviceLabel}`;
  } else {
    el.textContent = isSignatureModeEnabled()
      ? `🎤 Mic channels: 1 (Meyda timbre clusters + pitch fallback)${deviceLabel}`
      : `🎤 Mic channels: 1 (speaker split is tone-based)${deviceLabel}`;
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

  const inChat = normalized === 'chat';
  const label = inChat ? 'Layout: Chat' : 'Layout: Lanes';
  const ariaLabel = inChat ? 'Switch layout (currently chat)' : 'Switch layout (currently lanes)';

  // Keep both the primary toolbar toggle and the options-panel alt toggle in sync.
  for (const id of ['btn-view-toggle', 'btn-view-toggle-alt']) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.textContent = label;
    btn.setAttribute('aria-pressed', inChat ? 'true' : 'false');
    btn.setAttribute('aria-label', ariaLabel);
    btn.title = 'Switch between chat and lanes layouts';
  }
}

function initViewToggle() {
  const saved = localStorage.getItem('echolocate-view');
  const mobileDefault = window.matchMedia('(max-width: 700px)').matches ? 'chat' : 'lanes';
  applyView(saved || mobileDefault);

  for (const id of ['btn-view-toggle', 'btn-view-toggle-alt']) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.addEventListener('click', () => {
      const next = document.body.classList.contains('view-chat') ? 'lanes' : 'chat';
      applyView(next);
    });
  }
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

/**
 * Updates the debug summary with real-time audio/SR status while listening
 * but before any card has been committed (i.e. debugPoints is still empty).
 */
function updateDebugLiveStatus(latestCentroid) {
  const summary = document.getElementById('debug-summary');
  if (!summary) return;

  const audioState = State.audioCtx ? State.audioCtx.state : 'no AudioContext';
  const sampleCount = State.pitchHistory.length;
  const centroidStr = latestCentroid > 0 ? `${latestCentroid.toFixed(1)} Hz` : 'silent (0 Hz)';
  const meydaStr = State.meydaAnalyzer ? 'Meyda active' : (window.Meyda ? 'Meyda loaded' : 'Meyda unavailable');
  const srActive = State.isRunning ? 'SR listening' : 'SR stopped';

  summary.textContent = `${srActive} | Audio: ${audioState} | ${sampleCount} pitch samples | Latest centroid: ${centroidStr} | ${meydaStr}`;
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

class VoiceProfile {
  constructor({ id, label, color, pitch, tone }) {
    this.id = id;
    this.label = label;
    this.color = color;
    this.lastSpokenAt = Date.now();
    this.avgPitch = pitch;
    this.tone = tone;
    this.el = null;
    this.cardsEl = null;
    this.count = 0;
    this.matchLevel = 'medium';
    this.signature = null;
    this.signatureStats = null;
  }
}

function newProfile(pitch, tone) {
  const n = State.nextSpeakerNum;
  State.nextSpeakerNum += 1;
  return new VoiceProfile({
    id: `s${n}`,
    label: clusterLabelFromIndex(n),
    color: PALETTE[(n - 1) % PALETTE.length],
    pitch,
    tone,
  });
}

function confidenceFromSimilarity(similarity) {
  if (similarity >= CFG.SIGNATURE_HIGH_SIMILARITY) return 'high';
  if (similarity >= CFG.SIGNATURE_MED_SIMILARITY) return 'medium';
  return 'low';
}

function smoothMatch(candidates) {
  if (!candidates.length) return null;
  const recent = candidates.slice(-CFG.MATCH_HISTORY_SIZE);
  const idCounts = new Map();
  for (const item of recent) {
    idCounts.set(item.profile.id, (idCounts.get(item.profile.id) || 0) + 1);
  }
  let bestId = null;
  let bestCount = -1;
  for (const [id, count] of idCounts.entries()) {
    if (count > bestCount) {
      bestId = id;
      bestCount = count;
    }
  }
  if (bestCount >= 2) return recent.find((r) => r.profile.id === bestId) || recent[recent.length - 1];

  const ranked = [...recent].sort((a, b) => a.similarity - b.similarity);
  return ranked[Math.floor(ranked.length / 2)] || recent[recent.length - 1];
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
    return { profile: first, matchRatio: 1, confidenceLevel: first.matchLevel, createdNew: true };
  }

  const scored = [];
  for (const p of State.profiles) {
    const similarity = (signature && p.signature)
      ? cosineSimilarity(p.signature, signature)
      : 0;
    scored.push({ profile: p, similarity });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  let best = scored[0]?.profile || null;
  let bestSimilarity = scored[0]?.similarity || 0;

  // Hysteresis lock to prevent lane flicker between adjacent similarities.
  const lock = State.speakerLock;
  if (lock && lock.until > Date.now()) {
    const locked = scored.find((s) => s.profile.id === lock.id);
    if (locked && (bestSimilarity - locked.similarity) < CFG.HYSTERESIS_MARGIN) {
      best = locked.profile;
      bestSimilarity = locked.similarity;
    }
  }

  State.matchHistory.push({ profile: best, similarity: bestSimilarity });
  if (State.matchHistory.length > CFG.MATCH_HISTORY_SIZE) State.matchHistory.shift();
  const smoothed = smoothMatch(State.matchHistory);
  if (smoothed) {
    best = smoothed.profile;
    bestSimilarity = smoothed.similarity;
  }

  const shouldAttach = best && (bestSimilarity >= CFG.SIGNATURE_MATCH_SIMILARITY || State.profiles.length >= CFG.MAX_SPEAKERS);
  if (shouldAttach) {
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
    best.matchLevel = confidenceFromSimilarity(bestSimilarity);
    State.speakerLock = { id: best.id, until: Date.now() + CFG.HYSTERESIS_LOCK_MS };

    if (best.el) {
      const hint = best.el.querySelector('.lane-hint');
      if (hint) {
        hint.textContent = best.signatureStats
          ? signatureDescriptor(best.signatureStats)
          : laneHintFromTone(tone);
      }
    }
    return { profile: best, matchRatio: bestSimilarity, confidenceLevel: best.matchLevel, createdNew: false };
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
  State.speakerLock = { id: next.id, until: Date.now() + CFG.HYSTERESIS_LOCK_MS };
  return { profile: next, matchRatio: bestSimilarity, confidenceLevel: next.matchLevel, createdNew: true };
}

function flushUtteranceMetrics() {
  const samples = State.utteranceSamples;
  const signatureFrames = State.utteranceSignatureSamples;
  const stereoL = State.stereoSamplesL;
  const stereoR = State.stereoSamplesR;
  const micSamples = State.micEnergySamples;
  const sysSamples = State.systemAudioSamples;
  stopPitchSampling();
  State.utteranceSamples = [];
  State.utteranceSignatureSamples = [];
  State.stereoSamplesL = [];
  State.stereoSamplesR = [];
  State.micEnergySamples = [];
  State.systemAudioSamples = [];

  const centroid = samples.length ? mean(samples) : (State.pitchHistory.length ? mean(State.pitchHistory) : 200);
  const tone = classifyTone(centroid);
  const signatureStats = signatureFrames.length
    ? {
        spectralCentroid: mean(signatureFrames.map((f) => f.spectralCentroid || centroid)),
        spectralRolloff: mean(signatureFrames.map((f) => f.spectralRolloff || centroid)),
        spectralFlatness: mean(signatureFrames.map((f) => f.spectralFlatness || 0)),
        spectralSlope: mean(signatureFrames.map((f) => f.spectralSlope || 0)),
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

  // Source attribution: compare mic vs system audio energy
  const micEnergy = micSamples.length ? mean(micSamples) : 0;
  const sysEnergy = sysSamples.length ? mean(sysSamples) : 0;
  // Mark as 'computer' when system audio is clearly louder than mic (1.5× threshold)
  const audioSource = (State.systemAudioEnabled && sysEnergy > 0 && sysEnergy > micEnergy * CFG.SYSTEM_AUDIO_ENERGY_RATIO)
    ? 'computer' : 'mic';

  return { centroid, tone, signature, signatureStats, leftEnergy, rightEnergy, balance, micEnergy, sysEnergy, audioSource };
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

  replaceAll(cards) {
    const normalized = Array.isArray(cards) ? cards.slice(-CFG.CARD_LIMIT) : [];
    try {
      localStorage.setItem(CFG.STORAGE_KEY, JSON.stringify({ cards: normalized }));
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
  if (!profile) {
    console.warn('[EchoLocate] postCard: no profile found for speakerId', cardData.speakerId, '— card not rendered');
    return;
  }
  ensureLane(profile);

  const target = `#lane-${profile.id}-cards`;
  console.log('[EchoLocate] Posting card to', target, '— text:', cardData.text.slice(0, 60));

  try {
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
        audioSource: cardData.audioSource || 'mic',
      },
    });
    console.log('[EchoLocate] Card rendered in', target);
  } catch (err) {
    console.error('[EchoLocate] postCard htmx.ajax failed:', err);
  }

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
      audioSource:       cardData.audioSource || 'mic',
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

    const { centroid, tone, signature, signatureStats, leftEnergy, rightEnergy, balance, micEnergy, sysEnergy, audioSource } = flushUtteranceMetrics();
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
      audioSource,
      micEnergy,
      sysEnergy,
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
  _networkRetryCount: 0,
  _networkRetryDelay: CFG.NETWORK_BACKOFF_INIT_MS,
  _offlineHandler: null,

  init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();

    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = State.recognitionLang || DEFAULT_RECOGNITION_LANG;
    rec.maxAlternatives = 1;

    console.log('[EchoLocate] SpeechRecognition initialized — lang:', rec.lang || '(auto/browser default)', '| continuous:', rec.continuous, '| interimResults:', rec.interimResults);

    rec.onstart = () => {
      console.log('[EchoLocate] SpeechRecognition started — lang:', this._rec?.lang || '(auto)');
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
      this._networkRetryCount = 0;
      this._networkRetryDelay = CFG.NETWORK_BACKOFF_INIT_MS;
      State.lastResultAt = Date.now();
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        const confidence = result[0].confidence ?? 1;

        console.log(`[EchoLocate] SpeechRecognition result [${result.isFinal ? 'FINAL' : 'interim'}]: "${transcript}" (confidence: ${(confidence * 100).toFixed(0)}%)`);

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
      console.error('[EchoLocate] SpeechRecognition error — type:', event.error, '| message:', event.message || '(none)');
      if (event.error === 'no-speech') return;
      if (event.error === 'not-allowed') {
        setStatus('error', 'Mic access blocked');
        State.isRunning = false;
        return;
      }
      if (event.error === 'network') {
        if (!navigator.onLine) {
          console.warn('[EchoLocate] Network error while offline — suspending recognition until connection returns');
          setStatus('error', 'Offline — will resume when connection returns');
          State.isRunning = false;
          if (!this._offlineHandler) {
            this._offlineHandler = () => {
              // Clear handler reference before starting to prevent duplicate registration
              // if another network error fires during the start sequence.
              this._offlineHandler = null;
              console.log('[EchoLocate] Connection restored — resuming recognition');
              this._networkRetryCount = 0;
              this._networkRetryDelay = CFG.NETWORK_BACKOFF_INIT_MS;
              if (!State.isRunning) {
                SpeechEngine.start();
              }
            };
            window.addEventListener('online', this._offlineHandler, { once: true });
          }
          return;
        }
        this._networkRetryCount++;
        // When online, Chrome's speech API failure is likely a browser restriction
        // (e.g. private/incognito mode) — stop sooner and give a clearer message.
        const maxRetries = navigator.onLine ? CFG.NETWORK_ONLINE_MAX_RETRIES : CFG.NETWORK_MAX_RETRIES;
        if (this._networkRetryCount > maxRetries) {
          console.error('[EchoLocate] Network errors exceeded retry limit — stopping');
          let msg;
          if (navigator.onLine) {
            if (isEdgeBrowser()) {
              showSpeechHelpModal(
                '⚠ Edge speech recognition blocked',
                EDGE_SETUP_HTML,
              );
              msg = 'Edge speech recognition blocked — see the help dialog';
            } else {
              showSpeechHelpModal(
                '⚠ Speech recognition blocked',
                SPEECH_BLOCKED_HTML,
              );
              msg = 'Speech recognition blocked — see the help dialog';
            }
          } else {
            msg = 'Network unavailable — press Start to retry';
          }
          setStatus('error', msg);
          State.isRunning = false;
          return;
        }
        this._networkRetryDelay = Math.min(
          this._networkRetryDelay * 2,
          CFG.NETWORK_BACKOFF_MAX_MS,
        );
        setStatus('restarting', `Network error — retrying (${this._networkRetryCount}/${maxRetries})…`);
        return;
      }
      setStatus('restarting', `Error: ${event.error}`);
    };

    rec.onend = () => {
      console.log('[EchoLocate] SpeechRecognition ended — isRunning:', State.isRunning);
      clearTimeout(this._watchdogTimer);
      if (State.isRunning) {
        const delay = this._networkRetryCount > 0 ? this._networkRetryDelay : CFG.RESTART_DELAY;
        console.log(`[EchoLocate] Scheduling restart in ${delay}ms (networkRetries: ${this._networkRetryCount})`);
        if (this._networkRetryCount === 0) {
          setStatus('restarting', 'Reconnecting...');
        }
        // When networkRetryCount > 0 the "Network error — retrying (N/M)…" status from
        // onerror is preserved so the user can see progress during the backoff delay.
        setTimeout(() => {
          if (State.isRunning) this._rawStart();
        }, delay);
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
        updateEmptyStage();
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
    // Re-create the SpeechRecognition object before each retry after a network
    // error.  Edge (and some other Chromium builds) can enter a broken state
    // after a failed network connection; a fresh instance recovers it.
    if (this._networkRetryCount > 0) {
      this.init();
    }
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
    if (!navigator.onLine) {
      setStatus('error', 'Offline — check your connection and try again');
      return;
    }
    State.isRunning = true;

    // Default to English when no language is explicitly chosen.
    if (!State.recognitionLang) {
      applyRecognitionLanguage('en-US');
    }

    setStatus('active', 'Starting…');
    updateEmptyStage();

    try {
      await setupAudio();
    } catch {
      setStatus('error', 'Mic access denied');
      State.isRunning = false;
      updateEmptyStage();
      return;
    }

    this._rawStart();
  },

  stop() {
    State.isRunning = false;
    this._networkRetryCount = 0;
    this._networkRetryDelay = CFG.NETWORK_BACKOFF_INIT_MS;
    if (this._offlineHandler) {
      window.removeEventListener('online', this._offlineHandler);
      this._offlineHandler = null;
    }
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
      featureExtractors: ['mfcc', 'spectralCentroid', 'spectralRolloff', 'spectralFlatness', 'spectralSlope', 'zcr', 'rms'],
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

/**
 * Populates the audio-device dropdown from enumerateDevices().
 * Selecting a device updates State.audioInputDeviceId and localStorage,
 * but only takes effect on the next Start (AudioContext re-init).
 * Note: enumerateDevices() only returns labelled devices after mic permission
 * has been granted; labels are empty strings before that.
 */
async function initAudioDeviceSelector() {
  const sel = document.getElementById('audio-source-select');
  if (!sel) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    sel.closest('.source-picker-wrapper')?.classList.add('hidden');
    return;
  }

  async function populateDevices() {
    let devices;
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      return;
    }

    const inputs = devices.filter((d) => d.kind === 'audioinput');

    // Build option list
    sel.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Default microphone';
    sel.appendChild(defaultOpt);

    for (const dev of inputs) {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      opt.textContent = dev.label || `Microphone ${sel.options.length}`;
      sel.appendChild(opt);
    }

    // Re-select stored device if it still exists in the refreshed list
    const storedId = State.audioInputDeviceId;
    sel.value = (storedId && [...sel.options].some((o) => o.value === storedId)) ? storedId : '';
  }

  await populateDevices();

  sel.addEventListener('change', () => {
    const id = sel.value;
    State.audioInputDeviceId = id;
    if (id) {
      localStorage.setItem('echolocate-audio-device', id);
    } else {
      localStorage.removeItem('echolocate-audio-device');
    }
    if (State.isRunning) {
      // Show a hint that the change takes effect after restart
      setStatus('active', 'Audio device changed — Stop and Start to apply');
    }
  });

  // Re-populate when a new device is plugged in / unplugged
  navigator.mediaDevices.addEventListener('devicechange', populateDevices);
}

async function setupAudio() {
  if (State.audioCtx) {
    if (State.audioCtx.state === 'suspended') {
      console.log('[EchoLocate] AudioContext was suspended — resuming.');
      await State.audioCtx.resume();
    }
    if (State.visualizer) State.visualizer.start();
    updateMicInfoText();
    return;
  }

  // Build audio constraints — use selected device if one is saved
  const audioConstraints = State.audioInputDeviceId
    ? { deviceId: { exact: State.audioInputDeviceId } }
    : true;

  console.log('[EchoLocate] Requesting microphone access...');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
  const track = stream.getAudioTracks()[0];
  const settings = track && track.getSettings ? track.getSettings() : {};
  console.log('[EchoLocate] Microphone granted — label:', track?.label || '(unknown)',
    '| channels:', settings.channelCount ?? '(unknown)', '| sampleRate:', settings.sampleRate ?? '(unknown)',
    '| echoCancellation:', settings.echoCancellation ?? '(unknown)');
  State.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  console.log('[EchoLocate] AudioContext created — state:', State.audioCtx.state, '| sampleRate:', State.audioCtx.sampleRate);
  const source = State.audioCtx.createMediaStreamSource(stream);
  State.mediaSource = source;

  State.micDiagnostics = {
    channelCount: settings.channelCount || 1,
    sampleRate: settings.sampleRate || State.audioCtx.sampleRate,
    echoCancellation: settings.echoCancellation,
    label: track?.label || '',
  };
  updateMicInfoText();
  // Re-enumerate devices now that permission is granted (labels become available)
  initAudioDeviceSelector().catch(() => {});

  State.analyser = State.audioCtx.createAnalyser();
  State.analyser.fftSize = 2048;
  State.analyser.smoothingTimeConstant = 0.8;
  source.connect(State.analyser);
  initMeyda(source);
  console.log('[EchoLocate] Meyda analyzer:', State.meydaAnalyzer ? 'initialized' : 'not available (pitch fallback only)');

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

/**
 * Captures system/tab audio via getDisplayMedia for source attribution.
 * The captured stream is analysed for energy levels only — the Web Speech
 * API still reads from the microphone and cannot be redirected here.
 */
async function setupSystemAudio() {
  if (State.systemAudioEnabled) {
    teardownSystemAudio();
    return false;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    console.warn('[EchoLocate] getDisplayMedia not available in this browser.');
    return false;
  }

  try {
    let stream;
    try {
      // Chrome 119+ supports video:false for audio-only capture
      stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false });
    } catch (firstErr) {
      // Older browsers require video:true — stop the video track immediately
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        stream.getVideoTracks().forEach((t) => t.stop());
      } catch (secondErr) {
        console.warn('[EchoLocate] System audio capture failed on both attempts.',
          'audio-only error:', firstErr.message,
          '| video+audio error:', secondErr.message);
        throw secondErr;
      }
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach((t) => t.stop());
      console.warn('[EchoLocate] getDisplayMedia returned no audio track — user may not have enabled audio sharing.');
      return false;
    }

    // AudioContext must already exist (user must Start transcription first)
    if (!State.audioCtx) {
      console.warn('[EchoLocate] setupSystemAudio: AudioContext not ready — start transcription first.');
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    if (State.audioCtx.state === 'suspended') {
      await State.audioCtx.resume();
    }

    const audioStream = new MediaStream(audioTracks);
    State.systemAudioStream = audioStream;

    const sysSource = State.audioCtx.createMediaStreamSource(audioStream);
    State.systemAudioAnalyser = State.audioCtx.createAnalyser();
    State.systemAudioAnalyser.fftSize = 2048;
    State.systemAudioAnalyser.smoothingTimeConstant = 0.8;
    sysSource.connect(State.systemAudioAnalyser);

    State.systemAudioEnabled = true;
    console.log('[EchoLocate] System audio capture active — track:', audioTracks[0].label || '(unlabeled)');

    // Clean up when the user stops sharing via the browser's built-in UI
    audioTracks[0].addEventListener('ended', () => {
      teardownSystemAudio();
      updateSystemAudioUI();
    });

    return true;
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      console.warn('[EchoLocate] System audio capture failed:', err.message);
    }
    return false;
  }
}

function teardownSystemAudio() {
  if (State.systemAudioStream) {
    State.systemAudioStream.getTracks().forEach((t) => t.stop());
    State.systemAudioStream = null;
  }
  if (State.systemAudioAnalyser) {
    try { State.systemAudioAnalyser.disconnect(); } catch { /* ignore */ }
    State.systemAudioAnalyser = null;
  }
  State.systemAudioEnabled = false;
  State.systemAudioSamples = [];
  console.log('[EchoLocate] System audio capture stopped.');
}

function updateSystemAudioUI() {
  const btn = document.getElementById('btn-system-audio');
  if (btn) {
    btn.setAttribute('aria-pressed', State.systemAudioEnabled ? 'true' : 'false');
    btn.textContent = State.systemAudioEnabled ? 'Sys Audio On' : 'Sys Audio';
  }
  const info = document.getElementById('system-audio-info');
  if (info) {
    if (State.systemAudioEnabled) {
      info.textContent = '💻 Computer audio: active';
      info.classList.remove('hidden');
    } else {
      info.classList.add('hidden');
    }
  }
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
    const speaker = String(cur.speakerLabel || 'Speaker').replace(/[<>]/g, '');
    const text = String(cur.text || '').replace(/\n/g, ' ').trim();
    out += `<v ${speaker}>${text}</v>\n\n`;
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
      audioSource: card.audioSource || 'mic',
    };

    await postCard(normalized);
    await postChatMsg(normalized);
  }

  updateCardCount();
  updateEmptyStage();
}

function initNavOptions() {
  const toggleBtn = document.getElementById('nav-options-toggle');
  const panel = document.getElementById('nav-options-panel');
  if (!toggleBtn || !panel) return;

  function openPanel() {
    panel.removeAttribute('hidden');
    toggleBtn.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    panel.setAttribute('hidden', '');
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (toggleBtn.getAttribute('aria-expanded') === 'true') {
      closePanel();
    } else {
      openPanel();
    }
  });

  // Close the panel when the user clicks anywhere outside the header.
  document.addEventListener('click', (e) => {
    const header = panel.closest('header');
    if (!panel.hidden && (!header || !header.contains(e.target))) {
      closePanel();
    }
  });

  // Close on Escape and return focus to the toggle button.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      closePanel();
      toggleBtn.focus();
    }
  });
}

function initControls() {
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnClear = document.getElementById('btn-clear');
  const btnExport = document.getElementById('btn-export');
  const btnDebug = document.getElementById('btn-debug');
  const btnStereo = document.getElementById('btn-stereo');
  const btnSystemAudio = document.getElementById('btn-system-audio');
  const btnMerge = document.getElementById('btn-merge');
  const mergeFrom = document.getElementById('merge-from');
  const mergeInto = document.getElementById('merge-into');
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
    State.speakerLock = null;
    State.matchHistory = [];
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

  if (btnSystemAudio) {
    btnSystemAudio.addEventListener('click', async () => {
      if (State.systemAudioEnabled) {
        teardownSystemAudio();
        updateSystemAudioUI();
      } else {
        if (!State.audioCtx) {
          setStatus('active', 'Start transcription first, then enable system audio.');
          return;
        }
        const ok = await setupSystemAudio();
        updateSystemAudioUI();
        if (!ok) {
          setStatus('active', 'System audio not captured — share a tab or screen with audio enabled.');
        }
      }
    });
  }

  if (langSelect) {
    langSelect.addEventListener('change', () => {
      applyRecognitionLanguage(langSelect.value, { fromUser: true });
      showLanguageHint('');
    });
  }

  if (btnMerge && mergeFrom && mergeInto) {
    btnMerge.addEventListener('click', () => {
      mergeProfiles(mergeFrom.value, mergeInto.value).catch((err) => {
        console.warn('[EchoLocate] Merge failed:', err.message);
      });
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
  initSpeechHelpModal();

  if (localStorage.getItem('echolocate-privacy-dismissed')) {
    const notice = document.getElementById('privacy-notice');
    if (notice) notice.classList.add('hidden');
  }

  await initLanguageSelector();
  await initLanguageDetection();
  initViewToggle();
  initNavOptions();
  await initAudioDeviceSelector();

  await registerServiceWorker();
  TranscriptCtrl.init();
  if (hasSpeech) SpeechEngine.init();
  initControls();
  refreshMergeControls();
  updateMicInfoText();
  updateSystemAudioUI();
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

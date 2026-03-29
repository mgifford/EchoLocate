/**
 * EchoLocate Phase 1 — app.js
 *
 * Architecture (HTMX + Service Worker "local ghost"):
 *   SpeechEngine   → raw transcript events (Web Speech API, watchdog restart)
 *   FreqAnalyzer   → pitch centroid per utterance (Web Audio API)
 *   TranscriptCtrl → decides speaker lane, calls htmx.ajax() → SW → HTML card
 *   Visualizer     → canvas waveform so the user sees the mic is alive
 *   Storage        → localStorage persistence + session restore
 */

'use strict';

// ── Config ────────────────────────────────────────────────────────────────────

const CFG = Object.freeze({
  STORAGE_KEY:    'echolocate_v1',
  PITCH_WINDOW:   6,       // rolling sentence window for baseline calculation
  PITCH_THRESH:   1.22,    // ratio above median → Speaker B (high voice)
  CONF_WARN:      0.7,     // confidence below this → yellow underline
  PITCH_HZ:       8,       // frequency samples per second
  WATCHDOG_MS:    12_000,  // restart if no speech event in this many ms
  CARD_LIMIT:     200,     // max cards kept in localStorage
  RESTART_DELAY:  150,     // ms to wait before watchdog restart
});

// Build API URLs that work whether the page is at / or /echolocate/ on GitHub Pages
function apiUrl(path) {
  return new URL(`./api/${path}`, location.href).href;
}

const API = Object.freeze({
  ADD_CARD: apiUrl('add-card'),
  CLEAR:    apiUrl('clear'),
});

// ── Application state ─────────────────────────────────────────────────────────

const State = {
  isRunning:        false,
  currentSpeaker:   'a',
  pitchHistory:     [],   // rolling array of per-sentence mean centroids
  utteranceSamples: [],   // pitch samples for the current in-flight utterance
  audioCtx:         null,
  analyser:         null,
  sampleTimer:      null,
  visualizer:       null,
};

// ── Secure-context + browser-support checks ───────────────────────────────────

function checkSecureContext() {
  if (!window.isSecureContext) {
    document.getElementById('secure-warning').classList.remove('hidden');
  }
}

function checkBrowserSupport() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) return true;

  document.body.innerHTML = `
    <div class="no-support-msg" role="alert">
      <h2>Browser Not Supported</h2>
      <p>
        EchoLocate requires the Web Speech API, available in
        <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
        Please open this page in one of those browsers.
      </p>
    </div>`;
  return false;
}

// ── Service Worker registration ───────────────────────────────────────────────

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready; // wait before first htmx.ajax() call
  } catch (err) {
    // Expected on file:// — silently degrade
    console.warn('[EchoLocate] SW registration skipped:', err.message);
  }
}

// ── Visualizer ────────────────────────────────────────────────────────────────

class Visualizer {
  constructor(canvasEl, analyserNode) {
    this._canvas   = canvasEl;
    this._analyser = analyserNode;
    this._ctx      = canvasEl.getContext('2d');
    this._rafId    = null;
    this._w        = 0;
    this._h        = 0;
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
  }

  _resize() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = this._canvas.getBoundingClientRect();
    this._canvas.width  = rect.width  * dpr;
    this._canvas.height = rect.height * dpr;
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
    const { _ctx: ctx, _w: W, _h: H } = this;
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
  }

  _draw() {
    const { _ctx: ctx, _analyser: analyser, _w: W, _h: H } = this;
    const bufLen = analyser.frequencyBinCount;
    const data   = new Uint8Array(bufLen);
    analyser.getByteTimeDomainData(data);

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = '#1e3a5f';
    ctx.beginPath();

    const sliceW = W / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const y = ((data[i] / 128.0) * H) / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      x += sliceW;
    }
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }
}

// ── Frequency / pitch analysis ────────────────────────────────────────────────

function spectralCentroid() {
  if (!State.analyser || !State.audioCtx) return 0;
  const freqData = new Float32Array(State.analyser.frequencyBinCount);
  State.analyser.getFloatFrequencyData(freqData);

  const nyquist      = State.audioCtx.sampleRate / 2;
  const binCount     = freqData.length;
  let   weightedSum  = 0;
  let   totalPower   = 0;

  for (let i = 0; i < binCount; i++) {
    const power = Math.pow(10, freqData[i] / 20); // dB → linear
    const freq  = (i / binCount) * nyquist;
    weightedSum += freq * power;
    totalPower  += power;
  }
  return totalPower > 0 ? weightedSum / totalPower : 0;
}

function median(arr) {
  if (!arr.length) return 0;
  const s   = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function assignSpeaker(sentenceCentroid) {
  const hist = State.pitchHistory;
  if (hist.length < 2) return State.currentSpeaker; // not enough data yet
  const base = median(hist);
  return sentenceCentroid > base * CFG.PITCH_THRESH ? 'b' : 'a';
}

function startPitchSampling() {
  State.utteranceSamples = [];
  State.sampleTimer = setInterval(() => {
    const c = spectralCentroid();
    if (c > 0) State.utteranceSamples.push(c);
  }, 1000 / CFG.PITCH_HZ);
}

function stopPitchSampling() {
  clearInterval(State.sampleTimer);
  State.sampleTimer = null;
}

/**
 * Called when a final result arrives.
 * Computes mean pitch for the finished utterance, updates the rolling history,
 * and returns the detected speaker ('a' | 'b').
 */
function flushUtterancePitch() {
  const samples = State.utteranceSamples;
  stopPitchSampling();
  if (!samples.length) return State.currentSpeaker;

  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;

  State.pitchHistory.push(mean);
  if (State.pitchHistory.length > CFG.PITCH_WINDOW) {
    State.pitchHistory.shift();
  }
  return assignSpeaker(mean);
}

// ── Audio context + mic setup ─────────────────────────────────────────────────

async function setupAudio() {
  if (State.audioCtx) return; // already initialised

  const stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  State.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source   = State.audioCtx.createMediaStreamSource(stream);

  State.analyser                    = State.audioCtx.createAnalyser();
  State.analyser.fftSize            = 2048;
  State.analyser.smoothingTimeConstant = 0.8;
  source.connect(State.analyser);
  // Do NOT connect analyser → destination (avoids mic feedback loop)

  const canvas = document.getElementById('visualizer');
  State.visualizer = new Visualizer(canvas, State.analyser);
  State.visualizer.start();
}

// ── localStorage persistence ──────────────────────────────────────────────────

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
    } catch { /* quota exceeded — gracefully ignore */ }
  },

  clear() {
    localStorage.removeItem(CFG.STORAGE_KEY);
  },

  allCards() {
    return this._load().cards;
  },
};

// ── Card posting via HTMX + Service Worker ────────────────────────────────────

async function postCard(cardData) {
  if (!window.htmx) {
    console.warn('[EchoLocate] htmx not loaded — card not rendered');
    return;
  }

  const target = cardData.speaker === 'a' ? '#lane-a-cards' : '#lane-b-cards';

  await htmx.ajax('POST', API.ADD_CARD, {
    target,
    swap: 'beforeend',
    values: {
      text:       cardData.text,
      speaker:    cardData.speaker,
      confidence: String(cardData.confidence),
      timestamp:  cardData.timestamp,
    },
  });

  // Auto-scroll new card into view
  const lane = document.querySelector(target);
  if (lane) lane.scrollTop = lane.scrollHeight;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function setStatus(state, label) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;
  dot.className    = `status-dot ${state}`;
  text.textContent = label;
}

function updateCardCount() {
  const total = document.querySelectorAll('.card').length;
  const el    = document.getElementById('card-count');
  if (el) el.textContent = `${total} card${total !== 1 ? 's' : ''}`;
}

function updateSpeakerIndicator(speaker) {
  const el = document.getElementById('speaker-indicator');
  if (!el) return;
  el.textContent = `Active: Speaker ${speaker.toUpperCase()}`;
  el.style.color = speaker === 'a' ? '#4dabf7' : '#cc5de8';
}

// ── TranscriptController ──────────────────────────────────────────────────────
//
// Owns the interim-strip and the "commit a finished utterance → card" flow.
// Phase 2 note: swap postCard() here for a WebRTC-aware send to keep the
// same controller interface.

const TranscriptCtrl = {
  _liveEl: null,

  init() {
    this._liveEl = document.getElementById('live-transcript');
  },

  showInterim(text) {
    if (!this._liveEl) return;
    this._liveEl.textContent = text;
    this._liveEl.classList.toggle('speaking', text.length > 0);
  },

  clearInterim() {
    this.showInterim('');
  },

  async commitCard(text, confidence) {
    const speaker        = flushUtterancePitch();
    State.currentSpeaker = speaker;

    const cardData = {
      text,
      speaker,
      confidence,
      timestamp: new Date().toISOString(),
    };

    this.clearInterim();
    updateSpeakerIndicator(speaker);

    await postCard(cardData);
    Storage.save(cardData);
    updateCardCount();

    // Begin sampling pitch for the next utterance immediately
    startPitchSampling();
  },
};

// ── SpeechEngine (Web Speech API + watchdog) ──────────────────────────────────

const SpeechEngine = {
  _rec:           null,
  _watchdogTimer: null,

  init() {
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();

    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang           = 'en-US';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setStatus('active', 'Listening…');
      startPitchSampling();
      this._resetWatchdog();
    };

    rec.onresult = (event) => {
      this._resetWatchdog();
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result     = event.results[i];
        const transcript = result[0].transcript.trim();
        const confidence = result[0].confidence ?? 1;

        if (result.isFinal) {
          TranscriptCtrl.commitCard(transcript, confidence);
        } else {
          interim += transcript + ' ';
        }
      }

      TranscriptCtrl.showInterim(interim.trim());
    };

    rec.onerror = (event) => {
      if (event.error === 'no-speech')   return; // routine timeout — watchdog handles it
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
        // Watchdog: schedule an immediate restart
        setStatus('restarting', 'Reconnecting…');
        setTimeout(() => {
          if (State.isRunning) this._rawStart();
        }, CFG.RESTART_DELAY);
      } else {
        setStatus('idle', 'Ready');
        if (State.visualizer) State.visualizer.stop();
        stopPitchSampling();
        TranscriptCtrl.clearInterim();
      }
    };

    this._rec = rec;
  },

  _resetWatchdog() {
    clearTimeout(this._watchdogTimer);
    this._watchdogTimer = setTimeout(() => {
      if (State.isRunning) {
        try { this._rec.stop(); } catch { /* ignore */ }
      }
    }, CFG.WATCHDOG_MS);
  },

  _rawStart() {
    try {
      this._rec.start();
    } catch (err) {
      // InvalidStateError means recognition is already running — ignore it
      if (err.name !== 'InvalidStateError') {
        setStatus('error', err.message);
      }
    }
  },

  async start() {
    if (State.isRunning) return;
    State.isRunning = true;

    try {
      await setupAudio();
    } catch (err) {
      setStatus('error', 'Mic access denied');
      State.isRunning = false;
      return;
    }

    this._rawStart();
  },

  stop() {
    State.isRunning = false;
    clearTimeout(this._watchdogTimer);
    stopPitchSampling();
    try { this._rec.stop(); } catch { /* ignore */ }
  },
};

// ── Session restore ───────────────────────────────────────────────────────────

async function restoreSession() {
  const cards = Storage.allCards();
  if (!cards.length) return;

  for (const card of cards) {
    await postCard(card);
  }
  updateCardCount();
}

// ── Button wiring ─────────────────────────────────────────────────────────────

function initControls() {
  const btnStart = document.getElementById('btn-start');
  const btnStop  = document.getElementById('btn-stop');
  const btnClear = document.getElementById('btn-clear');

  btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    btnStop.disabled  = false;
    await SpeechEngine.start();
  });

  btnStop.addEventListener('click', () => {
    btnStop.disabled  = true;
    btnStart.disabled = false;
    SpeechEngine.stop();
  });

  btnClear.addEventListener('click', () => {
    document.getElementById('lane-a-cards').innerHTML = '';
    document.getElementById('lane-b-cards').innerHTML = '';
    document.getElementById('speaker-indicator').textContent = '';
    TranscriptCtrl.clearInterim();
    Storage.clear();
    updateCardCount();
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  checkSecureContext();
  if (!checkBrowserSupport()) return;

  await registerServiceWorker();
  TranscriptCtrl.init();
  SpeechEngine.init();
  initControls();

  // Restore previous session asynchronously so the UI is interactive first
  restoreSession().catch((err) => console.warn('[EchoLocate] Restore failed:', err));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

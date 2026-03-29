/**
 * EchoLocate Phase 1 — app.js
 *
 * Dynamic speaker lanes with inactivity minimization and VTT export.
 * Uses Web Speech API + Web Audio API + HTMX + Service Worker local routes.
 */

'use strict';

const CFG = Object.freeze({
  STORAGE_KEY:        'echolocate_v1',
  PITCH_WINDOW:       24,
  PITCH_HZ:           8,
  WATCHDOG_MS:        12_000,
  CARD_LIMIT:         500,
  RESTART_DELAY:      150,
  INACTIVE_AFTER_MS:  30_000,
  MINIMIZE_SWEEP_MS:  5_000,
  VOICE_MATCH_RATIO:  0.18,
  MAX_SPEAKERS:       8,
});

function apiUrl(path) {
  return new URL(`./api/${path}`, location.href).href;
}

const API = Object.freeze({
  ADD_CARD: apiUrl('add-card'),
});

const State = {
  isRunning:                 false,
  pitchHistory:              [],
  utteranceSamples:          [],
  currentUtteranceStartedAt: null,
  audioCtx:                  null,
  analyser:                  null,
  sampleTimer:               null,
  visualizer:                null,
  laneSweepTimer:            null,
  profiles:                  [], // [{id,label,color,lastSpokenAt,avgPitch,tone,el,cardsEl,count}]
  activeSpeakerId:           null,
  nextSpeakerNum:            1,
  micDiagnostics:            null,
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

  document.body.innerHTML = `
    <div class="no-support-msg" role="alert">
      <h2>Browser Not Supported</h2>
      <p>
        EchoLocate requires the Web Speech API, available in
        <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
      </p>
    </div>`;
  return false;
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
  State.sampleTimer = setInterval(() => {
    const c = spectralCentroid();
    if (c > 0) {
      State.utteranceSamples.push(c);
      State.pitchHistory.push(c);
      if (State.pitchHistory.length > CFG.PITCH_WINDOW) State.pitchHistory.shift();
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

function updateSpeakerIndicator(profile) {
  const el = document.getElementById('speaker-indicator');
  if (!el) return;
  if (!profile) {
    el.textContent = '';
    return;
  }
  el.textContent = `Active: ${profile.label}`;
  el.style.color = profile.color;
}

function updateMicInfoText() {
  const el = document.getElementById('mic-info');
  if (!el) return;

  if (!State.micDiagnostics) {
    el.textContent = 'Voice split: tone profile only';
    return;
  }

  const d = State.micDiagnostics;
  const channels = d.channelCount || 1;
  if (channels > 1) {
    el.textContent = `Mic channels: ${channels} (transcript still mixed; separation is mainly tone-based)`;
  } else {
    el.textContent = 'Mic channels: 1 (speaker split is tone-based)';
  }
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
    p.el.classList.remove('minimized');
  }

  updateSpeakerIndicator(profile);
}

function sweepInactiveLanes() {
  const now = Date.now();
  for (const p of State.profiles) {
    if (!p.el) continue;
    const inactiveMs = now - p.lastSpokenAt;
    const shouldMinimize = inactiveMs > CFG.INACTIVE_AFTER_MS && p.id !== State.activeSpeakerId;
    p.el.classList.toggle('minimized', shouldMinimize);
  }
}

function startLaneMinimizer() {
  clearInterval(State.laneSweepTimer);
  State.laneSweepTimer = setInterval(sweepInactiveLanes, CFG.MINIMIZE_SWEEP_MS);
}

function stopLaneMinimizer() {
  clearInterval(State.laneSweepTimer);
  State.laneSweepTimer = null;
}

function newProfile(pitch, tone) {
  const n = State.nextSpeakerNum;
  State.nextSpeakerNum += 1;
  const label = `Speaker ${String.fromCharCode(64 + Math.min(n, 26))}`;

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
  };
}

function resolveSpeakerProfile(pitch) {
  const tone = classifyTone(pitch);
  if (!State.profiles.length) {
    const first = newProfile(pitch, tone);
    State.profiles.push(first);
    ensureLane(first);
    return first;
  }

  let best = null;
  let bestRatio = Number.POSITIVE_INFINITY;
  for (const p of State.profiles) {
    const ratio = Math.abs(p.avgPitch - pitch) / Math.max(p.avgPitch, pitch, 1);
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = p;
    }
  }

  if (best && (bestRatio <= CFG.VOICE_MATCH_RATIO || State.profiles.length >= CFG.MAX_SPEAKERS)) {
    best.avgPitch = best.avgPitch * 0.7 + pitch * 0.3;
    best.tone = tone;
    if (best.el) {
      const hint = best.el.querySelector('.lane-hint');
      if (hint) hint.textContent = laneHintFromTone(tone);
    }
    return best;
  }

  const next = newProfile(pitch, tone);
  State.profiles.push(next);
  ensureLane(next);
  return next;
}

function flushUtteranceMetrics() {
  const samples = State.utteranceSamples;
  stopPitchSampling();
  State.utteranceSamples = [];

  const centroid = samples.length ? mean(samples) : (State.pitchHistory.length ? mean(State.pitchHistory) : 200);
  const tone = classifyTone(centroid);
  return { centroid, tone };
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
    },
  });

  if (profile.cardsEl) {
    profile.cardsEl.scrollTop = profile.cardsEl.scrollHeight;
  }
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

    const { centroid, tone } = flushUtteranceMetrics();
    const profile = resolveSpeakerProfile(centroid);
    profile.count += 1;

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
    };

    this.clearInterim();

    await postCard(cardData);
    Storage.save(cardData);
    updateCardCount();

    startPitchSampling();
    sweepInactiveLanes();
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
    rec.lang = 'en-US';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setStatus('active', 'Listening...');
      startPitchSampling();
      startLaneMinimizer();
      this._resetWatchdog();
    };

    rec.onresult = (event) => {
      this._resetWatchdog();
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        const confidence = result[0].confidence ?? 1;

        if (result.isFinal && transcript) {
          TranscriptCtrl.commitCard(transcript, confidence);
        } else if (transcript) {
          interim += transcript + ' ';
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
        if (State.visualizer) State.visualizer.stop();
        stopPitchSampling();
        stopLaneMinimizer();
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
    clearTimeout(this._watchdogTimer);
    stopPitchSampling();
    stopLaneMinimizer();
    try {
      this._rec.stop();
    } catch {
      // Ignore stop race.
    }
  },
};

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
    out += `${cur.speakerLabel || 'Speaker'}: ${cur.text}\n\n`;
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
  if (!cards.length) return;

  for (const card of cards) {
    let profile = profileById(card.speakerId);
    if (!profile) {
      profile = {
        id: card.speakerId || `s${State.nextSpeakerNum}`,
        label: card.speakerLabel || `Speaker ${String.fromCharCode(64 + State.nextSpeakerNum)}`,
        color: card.speakerColor || PALETTE[(State.nextSpeakerNum - 1) % PALETTE.length],
        lastSpokenAt: card.endedAt || Date.now(),
        avgPitch: card.pitch || 200,
        tone: card.tone || 'mid',
        el: null,
        cardsEl: null,
        count: 0,
      };
      State.profiles.push(profile);
      const num = parseInt(String(profile.id).replace('s', ''), 10);
      if (!isNaN(num)) State.nextSpeakerNum = Math.max(State.nextSpeakerNum, num + 1);
      ensureLane(profile);
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
    };

    await postCard(normalized);
  }

  sweepInactiveLanes();
  updateCardCount();
}

function initControls() {
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnClear = document.getElementById('btn-clear');
  const btnExport = document.getElementById('btn-export');

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
    document.getElementById('lanes-container').innerHTML = '';
    document.getElementById('speaker-indicator').textContent = '';
    TranscriptCtrl.clearInterim();
    Storage.clear();
    State.profiles = [];
    State.activeSpeakerId = null;
    State.nextSpeakerNum = 1;
    updateCardCount();
  });

  btnExport.addEventListener('click', () => {
    const cards = Storage.allCards();
    const vtt = toVtt(cards);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadTextFile(`echolocate-${stamp}.vtt`, vtt, 'text/vtt;charset=utf-8');
  });
}

async function boot() {
  checkSecureContext();
  if (!checkBrowserSupport()) return;

  await registerServiceWorker();
  TranscriptCtrl.init();
  SpeechEngine.init();
  initControls();
  updateMicInfoText();

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

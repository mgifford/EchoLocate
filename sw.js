/**
 * EchoLocate Phase 1 — sw.js
 * Service Worker: intercepts fake "/api/*" routes and returns
 * server-rendered HTML fragments that HTMX swaps into the DOM.
 *
 * Routes handled:
 *   POST …/api/add-card   → <article class="card card-{a|b}"> … </article>
 *   POST …/api/clear      → 200 empty (HTMX will handle the DOM clear)
 *
 * All other requests pass through to the network with a cache fallback.
 */

'use strict';

const CACHE_NAME = 'echolocate-v1';

// ── Sea creature avatars (indexed by speaker number − 1, wraps at 6) ─────────
const CREATURE_SVGS = [
  // 0: Starfish
  '<svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16 3 L19.1 11.5 L28.4 12 L21.2 17.7 L23.6 26.5 L16 21.5 L8.4 26.5 L10.8 17.7 L3.6 12 L12.9 11.5Z"/></svg>',
  // 1: Shark
  '<svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 22 Q7 13 14 15 L15 6 L18 15 Q25 13 30 22Z"/><circle cx="9" cy="19" r="1.5" fill="rgba(0,0,0,0.35)"/></svg>',
  // 2: Jellyfish
  '<svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 16 Q6 5 16 5 Q26 5 26 16Z"/><path d="M9 16 Q8 22 9 28M13 16 Q12 24 13 30M19 16 Q20 24 19 30M23 16 Q24 22 23 28" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  // 3: Octopus
  '<svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="16" cy="13" r="8"/><path d="M9 19 Q7 24 8 29M13 21 Q12 26 12 31M19 21 Q20 26 20 31M23 19 Q25 24 24 29" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="13" cy="11" r="1.5" fill="rgba(0,0,0,0.3)"/><circle cx="19" cy="11" r="1.5" fill="rgba(0,0,0,0.3)"/></svg>',
  // 4: Whale
  '<svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 19 Q3 12 12 12 Q22 12 27 17 L30 11 L30 18 Q28 21 23 22 Q16 25 9 23 Q4 22 3 19Z"/><circle cx="10" cy="17" r="1.5" fill="rgba(0,0,0,0.3)"/></svg>',
  // 5: Crab
  '<svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="16" cy="17" rx="7" ry="5"/><path d="M9 15 Q5 12 3 9 Q6 8 8 12M23 15 Q27 12 29 9 Q26 8 24 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M11 21 Q9 26 9 29M14 22 Q13 27 13 29M18 22 Q19 27 19 29M21 21 Q23 26 23 29" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="13" cy="15" r="1" fill="rgba(0,0,0,0.3)"/><circle cx="19" cy="15" r="1" fill="rgba(0,0,0,0.3)"/></svg>',
];

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  // Take control immediately — don't wait for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all open clients so the very first page load is intercepted.
  event.waitUntil(self.clients.claim());
});

// ── Fetch interception ────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Route: add a new card
  if (url.pathname.endsWith('/api/add-card') && event.request.method === 'POST') {
    event.respondWith(handleAddCard(event.request));
    return;
  }

  // Route: clear (app.js clears the DOM directly; this just returns 200)
  if (url.pathname.endsWith('/api/clear') && event.request.method === 'POST') {
    event.respondWith(new Response('', { status: 200 }));
    return;
  }

  // Route: add a chat message (unified chat view)
  if (url.pathname.endsWith('/api/add-chat-msg') && event.request.method === 'POST') {
    event.respondWith(handleAddChatMsg(event.request));
    return;
  }

  // All other requests: network first, cache fallback (for offline resilience)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses for same-origin static assets
        if (
          event.request.method === 'GET' &&
          response.ok &&
          new URL(event.request.url).origin === self.location.origin
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Route handler ─────────────────────────────────────────────────────────────

async function handleAddCard(request) {
  let text, speakerId, speakerLabel, tone, speakerColor, confidence, timestamp, profileMatchLevel, audioSource, translatedText, translationLang, translationsJson;

  try {
    const body = await request.formData();
    text              = body.get('text')              ?? '';
    speakerId         = body.get('speakerId')         ?? 's1';
    speakerLabel      = body.get('speakerLabel')      ?? 'Speaker A';
    tone              = body.get('tone')              ?? 'mid';
    speakerColor      = body.get('speakerColor')      ?? '#4dabf7';
    confidence        = parseFloat(body.get('confidence') ?? '1');
    timestamp         = body.get('timestamp')         ?? new Date().toISOString();
    profileMatchLevel = body.get('profileMatchLevel') ?? 'high';
    audioSource       = body.get('audioSource')       ?? 'mic';
    translatedText    = body.get('translatedText')    ?? '';
    translationLang   = body.get('translationLang')   ?? '';
    translationsJson  = body.get('translationsJson')  ?? '[]';
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Sanitise inputs before embedding in HTML
  if (!/^s\d+$/.test(String(speakerId))) speakerId = 's1';
  if (!['low', 'mid', 'high'].includes(String(tone))) tone = 'mid';
  if (isNaN(confidence) || confidence < 0 || confidence > 1) confidence = 1;
  if (!/^#[0-9a-fA-F]{6}$/.test(String(speakerColor))) speakerColor = '#4dabf7';
  if (!['high', 'medium', 'low'].includes(String(profileMatchLevel))) profileMatchLevel = 'high';
  if (!['mic', 'computer'].includes(String(audioSource))) audioSource = 'mic';
  if (!/^[a-z]{0,8}$/.test(String(translationLang))) translationLang = '';

  let translations = parseTranslationsJson(translationsJson);
  if (!translations.length && translatedText) {
    translations = [{ lang: translationLang, text: translatedText }];
  }

  const html = buildCardHTML({ text, speakerId, speakerLabel, tone, speakerColor, confidence, timestamp, profileMatchLevel, audioSource, translations });
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ── HTML builder ──────────────────────────────────────────────────────────────

/**
 * Returns an <article> card fragment.
 * Low-confidence text (< 0.7) is wrapped in a span with a yellow underline.
 * Opacity is driven by confidence so the user sees a visual "certainty" cue.
 * All user-supplied strings are HTML-escaped to prevent XSS.
 */
function buildCardHTML({ text, speakerId, speakerLabel, tone, speakerColor, confidence, timestamp, profileMatchLevel = 'high', audioSource = 'mic', translations = [] }) {
  const timeLabel    = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const safeText = escapeHTML(text);
  const confidencePct = Math.max(0, Math.min(100, Math.round(confidence * 100)));

  // Confidence < 0.7 → yellow-underlined text with tooltip
  const displayText =
    confidence < 0.7
      ? `<span class="low-confidence" title="Low confidence (${Math.round(confidence * 100)}%)">${safeText}</span>`
      : safeText;

  // Opacity floor at 0.6 — text must always be readable
  const opacity = Math.max(0.6, confidence).toFixed(2);

  // Source badge — shown only when system audio capture is active (computer source)
  const sourceBadge = audioSource === 'computer'
    ? '<span class="source-badge source-badge--computer" title="Computer audio (e.g. Zoom remote speaker)" aria-label="Computer audio">💻</span>'
    : '';

  // Translation block — only rendered when a translated string was provided
  const translationBlock = renderTranslationBlocks(translations);

  return `<article
  class="card card-tone-${escapeAttr(tone)}${audioSource === 'computer' ? ' card-source-computer' : ''}"
  role="article"
  aria-label="${escapeAttr(speakerLabel)} at ${escapeAttr(timeLabel)}"
  data-speaker-id="${escapeAttr(speakerId)}"
  data-audio-source="${escapeAttr(audioSource)}"
  style="opacity:${opacity};--speaker-color:${escapeAttr(speakerColor)}"
>
  ${displayText}
  ${sourceBadge}
  ${translationBlock}
  <span class="confidence-meter" aria-hidden="true"><span class="confidence-fill" style="width:${confidencePct}%"></span><span class="confidence-value">${confidencePct}%</span></span>
  <span class="card-meta" aria-hidden="true">${escapeHTML(speakerLabel)} · ${escapeHTML(timeLabel)}${profileMatchLevel === 'low' ? ' · new cluster?' : profileMatchLevel === 'medium' ? ' · match uncertain' : ''}</span>
</article>`;
}

// ── Security helpers ──────────────────────────────────────────────────────────

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Attribute-safe: same escaping is sufficient for quoted HTML attributes
const escapeAttr = escapeHTML;

// ── Chat route handler ────────────────────────────────────────────────────────

async function handleAddChatMsg(request) {
  let text, speakerId, speakerLabel, speakerColor, confidence, timestamp, profileMatchLevel, audioSource, translatedText, translationLang, translationsJson;
  try {
    const body = await request.formData();
    text              = body.get('text')              ?? '';
    speakerId         = body.get('speakerId')         ?? 's1';
    speakerLabel      = body.get('speakerLabel')      ?? 'Speaker A';
    speakerColor      = body.get('speakerColor')      ?? '#4dabf7';
    confidence        = parseFloat(body.get('confidence') ?? '1');
    timestamp         = body.get('timestamp')         ?? new Date().toISOString();
    profileMatchLevel = body.get('profileMatchLevel') ?? 'high';
    audioSource       = body.get('audioSource')       ?? 'mic';
    translatedText    = body.get('translatedText')    ?? '';
    translationLang   = body.get('translationLang')   ?? '';
    translationsJson  = body.get('translationsJson')  ?? '[]';
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (!/^s\d+$/.test(String(speakerId))) speakerId = 's1';
  if (isNaN(confidence) || confidence < 0 || confidence > 1) confidence = 1;
  if (!/^#[0-9a-fA-F]{6}$/.test(String(speakerColor))) speakerColor = '#4dabf7';
  if (!['high', 'medium', 'low'].includes(String(profileMatchLevel))) profileMatchLevel = 'high';
  if (!['mic', 'computer'].includes(String(audioSource))) audioSource = 'mic';
  if (!/^[a-z]{0,8}$/.test(String(translationLang))) translationLang = '';

  let translations = parseTranslationsJson(translationsJson);
  if (!translations.length && translatedText) {
    translations = [{ lang: translationLang, text: translatedText }];
  }

  const creatureIndex = Math.max(0, (parseInt(String(speakerId).replace('s', ''), 10) || 1) - 1) % CREATURE_SVGS.length;
  const html = buildChatMsgHTML({ text, speakerId, speakerLabel, speakerColor, confidence, timestamp, profileMatchLevel, creatureIndex, audioSource, translations });
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ── Chat HTML builder ─────────────────────────────────────────────────────────

function buildChatMsgHTML({ text, speakerId, speakerLabel, speakerColor, confidence, timestamp, profileMatchLevel, creatureIndex, audioSource = 'mic', translations = [] }) {
  const timeLabel = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const safeText = escapeHTML(text);
  const confidencePct = Math.max(0, Math.min(100, Math.round(confidence * 100)));
  const displayText = confidence < 0.7
    ? `<span class="low-confidence" title="Low confidence (${Math.round(confidence * 100)}%)">${safeText}</span>`
    : safeText;

  const svg = CREATURE_SVGS[creatureIndex] || CREATURE_SVGS[0];

  // Tint the bubble background from the hex speaker colour
  const { r, g, b } = hexToRgb(speakerColor);
  const bgColor    = `rgba(${r},${g},${b},0.13)`;
  const bordColor  = `rgba(${r},${g},${b},0.28)`;

  const matchNote = profileMatchLevel === 'low'
    ? ' · new voice?'
    : profileMatchLevel === 'medium' ? ' · match uncertain' : '';

  // Source badge for chat view
  const sourceBadge = audioSource === 'computer'
    ? '<span class="source-badge source-badge--computer" title="Computer audio (e.g. Zoom remote speaker)" aria-label="Computer audio">💻</span>'
    : '';

  return `<div
  class="chat-msg${audioSource === 'computer' ? ' chat-msg-source-computer' : ''}"
  role="article"
  aria-label="${escapeAttr(speakerLabel)} at ${escapeAttr(timeLabel)}"
  data-speaker-id="${escapeAttr(speakerId)}"
  data-audio-source="${escapeAttr(audioSource)}"
  style="--speaker-color:${escapeAttr(speakerColor)}">
  <div class="chat-avatar" aria-hidden="true">${svg}</div>
  <div class="chat-content">
    <span class="chat-speaker">${escapeHTML(speakerLabel)}${sourceBadge}</span>
    <div class="chat-bubble" style="background:${bgColor};border:1px solid ${bordColor}">${displayText}</div>
    ${renderTranslationBlocks(translations)}
    <span class="confidence-meter" aria-hidden="true"><span class="confidence-fill" style="width:${confidencePct}%"></span><span class="confidence-value">${confidencePct}%</span></span>
    <span class="chat-time">${escapeHTML(timeLabel)}${escapeHTML(matchNote)}</span>
  </div>
</div>`;
}

function parseTranslationsJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 2)
      .map((item) => ({
        lang: String(item?.lang || '').toLowerCase(),
        text: String(item?.text || '').trim(),
      }))
      .filter((item) => item.text && /^[a-z]{0,8}$/.test(item.lang));
  } catch {
    return [];
  }
}

function renderTranslationBlocks(translations) {
  if (!Array.isArray(translations) || !translations.length) return '';
  return translations
    .map(({ lang, text }) => {
      const langTag = lang ? `<span class="translation-lang-tag" aria-hidden="true">${escapeHTML(lang.toUpperCase())}</span>` : '';
      const langAttr = lang ? ` lang="${escapeAttr(lang)}"` : '';
      return `<span class="translation-text"${langAttr} aria-label="Translation">${langTag}${escapeHTML(text)}</span>`;
    })
    .join('');
}

// ── Colour helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 77, g: 171, b: 247 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

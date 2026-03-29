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
  let text, speaker, confidence, timestamp;

  try {
    const body = await request.formData();
    text       = body.get('text')       ?? '';
    speaker    = body.get('speaker')    ?? 'a';
    confidence = parseFloat(body.get('confidence') ?? '1');
    timestamp  = body.get('timestamp')  ?? new Date().toISOString();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Sanitise inputs before embedding in HTML
  if (!['a', 'b'].includes(speaker)) speaker = 'a';
  if (isNaN(confidence) || confidence < 0 || confidence > 1) confidence = 1;

  const html = buildCardHTML({ text, speaker, confidence, timestamp });
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
function buildCardHTML({ text, speaker, confidence, timestamp }) {
  const speakerLabel = speaker === 'a' ? 'Speaker A' : 'Speaker B';
  const timeLabel    = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const safeText = escapeHTML(text);

  // Confidence < 0.7 → yellow-underlined text with tooltip
  const displayText =
    confidence < 0.7
      ? `<span class="low-confidence" title="Low confidence (${Math.round(confidence * 100)}%)">${safeText}</span>`
      : safeText;

  // Opacity floor at 0.6 — text must always be readable
  const opacity = Math.max(0.6, confidence).toFixed(2);

  return `<article
  class="card card-${escapeAttr(speaker)}"
  role="article"
  aria-label="${escapeAttr(speakerLabel)} at ${escapeAttr(timeLabel)}"
  style="opacity:${opacity}"
>
  ${displayText}
  <span class="card-meta" aria-hidden="true">${escapeHTML(speakerLabel)} · ${escapeHTML(timeLabel)}</span>
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

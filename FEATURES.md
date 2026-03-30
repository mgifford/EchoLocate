# EchoLocate Technical Features

This document describes EchoLocate from an implementation perspective: what each feature does, how it works under the hood, and why it matters for real-time accessibility.

## 1. Runtime Architecture

EchoLocate is a browser-only application deployed as static files.

Core runtime files:

1. `index.html` — semantic UI structure, controls, accessibility landmarks
2. `style.css` — adaptive layout, dark/light theming, responsive behavior, confidence visuals
3. `app.js` — speech recognition, audio analysis, speaker lane logic, persistence, export
4. `sw.js` — local fragment rendering API for HTMX (`/api/add-card`, `/api/add-chat-msg`)

Design principle:

- No backend is required for standard operation.
- Transcript and analysis remain in-browser.

## 2. Caption Pipeline

Speech recognition path:

1. Browser mic capture via `getUserMedia`
2. `SpeechRecognition` / `webkitSpeechRecognition` receives audio stream
3. Interim and final transcript events are produced
4. Final transcript is combined with speaker profile metadata
5. Card payload is posted to local route intercepted by Service Worker
6. Returned HTML fragment is inserted into lane/chat containers

Reliability behavior:

- A watchdog timer restarts recognition when no results are received for a configured interval.
- Warm restart logic handles unexpected `onend` while the app is still running.

## 3. Audio Feature Extraction

Audio analysis path uses Web Audio API + Meyda.

Per-frame extracted features include:

1. MFCC (13 coefficients)
2. Spectral flatness
3. Spectral slope
4. Spectral centroid
5. Spectral rolloff
6. Zero crossing rate (ZCR)
7. RMS energy

Feature vectors are collected during utterance windows and aggregated to represent voice texture rather than a single pitch scalar.

## 4. Voice Fingerprint + Lane Matching

### 4.1 Vector fingerprint

For each utterance, EchoLocate constructs a voice fingerprint vector from timbral and spectral features.

### 4.2 Similarity scoring

Each active lane profile is compared with the incoming fingerprint using cosine similarity:

$$
\text{similarity} = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\|\|\mathbf{B}\|}
$$

### 4.3 Assignment behavior

1. If similarity clears threshold, assign utterance to the best matching lane
2. If not, create a new guest lane (up to max speaker limit)
3. Lane profiles update incrementally with each new utterance

Why this matters:

- Timbral vectors are more robust than pitch-only matching when a speaker changes intonation.

## 5. Anti-Flicker Stability

To reduce lane hopping:

1. Hysteresis lock: keep recent lane preference for a minimum duration unless a meaningfully better candidate appears
2. Temporal smoothing: evaluate recent match history (median/majority over last N decisions)

Result:

- Better sentence continuity and fewer rapid lane switches.

## 6. Language Handling

Language features include:

1. Selectable recognition language list, including `None (Auto)` mode
2. Optional text-based language detection fallback using `franc-min`
3. Visual feedback when detected text language and selected recognition language diverge

Purpose:

- Make multilingual conversation behavior visible and debuggable for users.

## 7. Accessibility-Centered UI Features

### 7.1 Lane and chat views

- Lanes view: parallel speaker columns for at-a-glance differentiation
- Chat view: single stream useful on mobile and constrained screens

### 7.2 Active lane indicator

- Current lane receives an energy ring / active state styling to show where focus is landing.

### 7.3 Confidence visibility

- Confidence meter (0-100%) is attached to transcript cards/messages
- Low-confidence text is visually marked

### 7.4 Human-in-the-loop correction

- Merge controls allow users to merge two speaker lanes when automatic grouping splits one person into multiple lanes.

## 8. Service Worker Local Rendering API

`sw.js` behaves as a local fragment server:

1. `/api/add-card` (POST): returns lane card fragment
2. `/api/add-chat-msg` (POST): returns chat message fragment
3. `/api/clear` (POST): local clear acknowledgment

Security behavior:

- Inputs are escaped/sanitized before HTML output
- Attribute-safe escaping is applied for user-provided content

Operational advantages:

- No remote templating required
- HTMX interactions stay local
- Offline resilience with cache fallback for same-origin assets

## 9. Persistence Model

Storage:

- Session cards are stored in `localStorage` (`echolocate_v1`)
- Startup restore rebuilds lanes and chat view from stored cards
- Clear operation wipes stored conversation state

Tradeoff:

- Fast and private, but scoped to browser/device profile.

## 10. Export Model (VTT)

Exported transcript format:

- WebVTT with speaker metadata tags, e.g. `<v Speaker 1>...</v>`
- Time windows are normalized relative to first utterance

Benefit:

- Better interoperability with subtitle tools and downstream review workflows.

## 11. Privacy and Offline Operation

Privacy posture:

1. Audio remains local in browser
2. Transcript content is not sent to external cloud APIs by default
3. Processing and rendering happen on device

Offline posture:

1. Key dependencies are vendored in `vendor/`
2. Local server (`server.py`) supports localhost operation
3. Service Worker provides local route handling and cache fallback

## 12. Dependency and Platform Constraints

Required browser capabilities:

1. Web Speech API (best support: Chromium-based desktop browsers)
2. Web Audio API
3. Service Worker support

Known constraint:

- Browsers without Web Speech API support cannot provide live transcription in this architecture.

## 13. Why This Stack Is Useful for Accessibility

EchoLocate is optimized for practical meeting use where reliability and transparency matter:

1. Voice texture matching improves speaker grouping stability
2. Watchdog recovery reduces silent transcript dropouts
3. Confidence and mismatch indicators expose uncertainty instead of hiding it
4. Merge controls let users correct AI mistakes quickly
5. Fully local execution supports privacy-sensitive environments

---

For implementation details, see:

- [README.md](README.md)
- [INSTALL.txt](INSTALL.txt)
- [AGENTS.md](AGENTS.md)

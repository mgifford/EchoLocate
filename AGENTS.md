# AGENTS.md

## Project Snapshot
EchoLocate is a client-side live captioning web app with simulated speaker grouping.
It is deployed via GitHub Pages and has no backend service.

Primary runtime pieces:
- index.html: structure, controls, ARIA semantics, privacy notice
- style.css: dark/light themes, high-contrast card styles, responsive layout
- app.js: speech recognition, pitch analysis, lane management, storage, export
- sw.js: local fragment rendering route for HTMX card insertion

## Current Product Behavior
- Real-time transcription uses local Whisper (recommended) or the browser Web Speech API (explicit cloud choice); Chrome's on-device recognizer is a third option
- Speech engine is selectable: local Whisper (WASM, recommended; English-only, ~5s chunks), browser speech service (explicit cloud choice), or Chrome's experimental on-device recognizer
- Local Whisper is recommended on first run; the browser speech service is an explicit, labelled cloud choice and is remembered only after the user picks it. Browsers without a usable browser speech service (notably Firefox) are local-only, disable the unavailable service engines, show the model-setup panel and open install consent from Start; do not silently fall back to a broken service
- Simulated speaker grouping uses pitch centroid heuristics (not true diarization)
- Dynamic speaker lanes are created on demand and do not auto-hide
- Maximum speaker profiles is capped at 6
- Confidence context is attached per card in metadata (high/medium/low wording)
- Session cards persist in localStorage and can be exported as VTT; write failures and the 500-card trim are surfaced in the footer
- Privacy notice separates local storage from browser speech services (Chrome/Edge may send audio to vendor servers)
- Capability probing (Web Speech, on-device status, WebGPU adapter, WASM, storage) is local-only and shown in Debug
- Model installs require exact-revision consent and SHA-256 verification; `models/manifest.json` pins `whisper-tiny-en` for the WASM engine
- A meta CSP allows scripts only from self plus the hashed import map; no eval or arbitrary inline scripts. `connect-src` allows the pinned Hugging Face model host and its redirects
- Translation asks for per-language-pair consent before Chrome downloads its model; refusing leaves captions and the rest of the app working
- Light/dark theme toggle is persisted in localStorage

## Working Agreements For Agents And Contributors
- Keep architecture fully client-side unless explicitly requested otherwise
- Preserve privacy-first behavior: do not add network transmission of transcript/audio
- Keep generated HTML safe: sanitize/escape all user-controlled strings in sw.js
- Prefer incremental patches; avoid broad rewrites without clear necessity
- Preserve accessibility semantics and keyboard usability when adding controls
- Preserve theme parity: any new component must work in both dark and light modes
- Do not reintroduce lane minimization or hidden historical cards
- Keep speaker limit at 6 unless a deliberate requirement changes it

## Branching
- One short-lived branch per PR; keep `main` the only long-lived branch.
- Merge through a PR and delete the branch; `delete_branch_on_merge` is on.

## Code Change Checklist
Before committing, verify:
1. `npm test` and `node --check app.js && node --check sw.js` pass (CI runs both)
2. Start/Stop/Export/Clear/Theme controls still work
3. New cards render in correct lane and include card-level match note
4. Existing cards remain visible while new speakers are added
5. Privacy notice text remains accurate and visible until dismissed
6. All engines show an accurate local/cloud status; choosing an unavailable engine must not disable Start
7. Light and dark themes both remain readable
8. Storage failures and the 500-card trim are visible and announced
9. Local Whisper: install consent, SHA-256 verification, transcription and model removal still work; no audio leaves the browser
10. Local Whisper audio queue: no silent drops; missing/pending intervals are visible, and Stop clears pending audio explicitly

## Local Development

Run the app without an internet connection using the bundled server:

```bash
python3 server.py          # http://localhost:8080/
python3 server.py 9000     # alternate port
```

All JavaScript dependencies are vendored in `vendor/` and committed to the
repository, so cloning the repo is sufficient for fully offline use.

To refresh vendored files (e.g., after a version bump in download-deps.sh):

```bash
./download-deps.sh
```

Optional on-device language-id model assets (staged, not wired into the app yet):

```bash
./download-models.sh       # stages vendor/transformers, vendor/onnx-runtime, models/language-id
```

`app.js` does **not** load these files yet — language detection currently uses the vendored
`franc-min` module with a small heuristic fallback. Wire the ONNX model in (with consent and
integrity checks) before claiming it is used.

### Local dev notes for agents
- `vendor/` files are checked into git — do not gitignore them
- `models/` houses the tracked `manifest.json`; downloaded artifacts are ignored and must never be committed
- Mic access and service workers require a secure context; localhost qualifies without HTTPS
- Use `python3 server.py` (not `open index.html`) because the service worker needs HTTP(S)

## Deployment Notes
- Branch: main
- Host: GitHub Pages
- Service worker version string/cache key should be updated only when needed

## Out Of Scope Unless Requested
- Server-side storage
- Cloud speech APIs
- User account systems
- Streaming transcript to external systems

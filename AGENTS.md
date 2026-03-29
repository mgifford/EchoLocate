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
- Real-time transcription uses Web Speech API (Chrome/Edge family support)
- Simulated speaker grouping uses pitch centroid heuristics (not true diarization)
- Dynamic speaker lanes are created on demand and do not auto-hide
- Maximum speaker profiles is capped at 6
- Confidence context is attached per card in metadata (high/medium/low wording)
- Session cards persist in localStorage and can be exported as VTT
- Privacy notice explicitly states all processing remains in browser
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

## Code Change Checklist
Before committing, verify:
1. node --check app.js and node --check sw.js pass
2. Start/Stop/Export/Clear/Theme controls still work
3. New cards render in correct lane and include card-level match note
4. Existing cards remain visible while new speakers are added
5. Privacy notice text remains accurate and visible until dismissed
6. Light and dark themes both remain readable

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

Optional on-device language-id model (~14 MB, improves lang detection):

```bash
./download-models.sh       # downloads to vendor/transformers, vendor/onnx-runtime, models/language-id
```

EchoLocate detects model files at startup; no code change required.

### Local dev notes for agents
- `vendor/` files are checked into git — do not gitignore them
- `models/` directory houses optional on-device model files; only `.gitkeep` is committed
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

# Standalone demos

Status: **planned**. These pages do not exist yet; this file fixes the contract
so modules are built as demonstrable pieces rather than only as part of
`app.js`.

Each lab is a small static page that loads only the module(s) it demonstrates.
No microphone, model download or network access is required unless the page
says so in visible text.

## Planned labs

| Page | Module | What it proves | Default input |
|---|---|---|---|
| `capture.html` | Audio capture | Mic/system frames without the app | Mock frames |
| `asr.html` | ASR adapters | audio → interim/final text; local/cloud labels | Mock transcript |
| `vad.html` | VAD/turns | speech segments and boundaries | Synthetic envelope |
| `diarization.html` | Diarization | speaker turns and confidence | Synthetic/short WAV |
| `events.html` | Caption events | interim/final/revision → lanes, chat, VTT | Synthetic events |
| `translation.html` | Translation adapters | text + pair → local/optional remote | Sample sentences |
| `viewer.html` | Transcript views | accessible history, pause-scroll, preferences | Synthetic events |
| `audience.html` | Audience view | two windows over `BroadcastChannel` | Synthetic events |
| `overlay.html` | Overlay view | OBS-style caption rendering, no public room | Synthetic events |
| `preferences.html` | Display/a11y | font, contrast, RTL, forced colours, zoom | Synthetic events |
| `models.html` | Model registry | consent, hashes, cache, removal | Manifest only |
| `transport.html` | Transport adapter | local bus; optional self-hosted relay | Mock transport |
| `pipeline.html` | Composition | toggle modules on/off and show degradation | Synthetic events |

## Rules

1. **Standalone first.** A module must work without `app.js` and without the
   other modules.
2. **Show the truth.** Every page states `local`, `browser-managed`, `cloud` or
   `self-hosted`, and whether a network/model download is required.
3. **Synthetic by default.** No private recordings, transcripts or voice
   embeddings in the repository. Fixtures are generated or clearly licensed.
4. **Accessible.** Keyboard, screen reader, zoom/reflow, forced colours and
   reduced motion apply to demos too.
5. **Composition is separate.** `pipeline.html` is the only page allowed to
   depend on several modules.
6. **Test the contract.** Pure modules get Node tests; demos get a smoke test
   where practical.
7. **No new framework.** Classic scripts and the existing test style, unless a
   documented decision changes that.

## First lab

`events.html` is the first target: a pure caption-event model with synthetic
interim, final, revision and speaker updates, rendered to the existing lane,
chat and VTT shapes. It demonstrates the core of the app without a microphone,
model, relay or network.

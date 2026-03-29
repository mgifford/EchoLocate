# EchoLocate

**Live, private, in-browser captioning with simulated speaker grouping.**

> **Try it now → [mgifford.github.io/EchoLocate](https://mgifford.github.io/EchoLocate/)**
>
> Works in Chrome and Edge.  No sign-up.  No data ever leaves your device.

---

## What it does

EchoLocate turns your browser into a real-time caption board.  As people speak,
transcribed text appears in colour-coded lanes—one per detected voice—so you can
follow who said what at a glance.

| Feature | Detail |
|---------|--------|
| Live captions | Web Speech API, starts in under a second |
| Speaker lanes | Up to 6 simultaneous voices, colour-coded |
| Voice clustering | Meyda audio-feature analysis + pitch heuristics |
| Language detection | 35 languages; quick-switch EN / ES / FR buttons |
| Export | Download the session as a WebVTT subtitle file |
| Themes | Dark and light mode, persisted across sessions |
| Offline-capable | All JS dependencies are vendored; no CDN required |
| Privacy-first | Zero network calls; everything runs in your browser |

---

## Who it's for

- **Deaf and hard-of-hearing users** who need real-time captions in meetings,
  classrooms, or public spaces
- **Interpreters and note-takers** who want a lightweight second screen
- **Remote and hybrid teams** who want a quick, no-install caption overlay
- **Accessibility researchers and educators** exploring browser-based captioning

---

## Quick start

1. Open [mgifford.github.io/EchoLocate](https://mgifford.github.io/EchoLocate/)
   in **Chrome or Edge** (desktop)
2. Click **Start** and allow microphone access
3. Speak — captions appear immediately in speaker lanes
4. Click **Stop** when done; **Export VTT** to download the transcript

Language buttons across the top bar let you tell the speech engine which
language to expect.  EchoLocate also watches for language shifts within a session.

---

## Run locally (fully offline)

Clone the repo and start the bundled Python server — no npm, no build step:

```bash
git clone https://github.com/mgifford/EchoLocate.git
cd EchoLocate
python3 server.py
```

Then open **http://localhost:8080/** in Chrome or Edge.

All JavaScript dependencies (HTMX, Meyda, franc-min) are committed in `vendor/`
so the app works without an internet connection.

### Optional: on-device language model (~14 MB one-time download)

```bash
chmod +x download-models.sh
./download-models.sh   # downloads Transformers.js + ONNX language-id model
```

After the download, restart the server.  EchoLocate detects the model files
automatically and switches to neural language detection (97 languages, ~40 ms
per card, fully offline).

See [INSTALL.txt](INSTALL.txt) for the full setup guide and troubleshooting tips.

---

## How it works

```
Microphone
    │
    ▼
Web Audio API  ──►  Meyda (MFCC, spectral features)
                         │
                         ▼
                  Voice profile store  ──►  Speaker lane
    │
    ▼
Web Speech API  ──►  Transcript text  ──►  franc-min lang detection
                         │
                         ▼
                   HTMX card insert  ──►  Service Worker renders HTML
```

- **No diarization API** — speaker grouping is simulated using pitch centroid
  and Mel-frequency cepstral coefficients so everything stays client-side.
- **Service worker** intercepts `POST ./api/add-card` and renders the caption
  card HTML locally, so HTMX can swap it into the DOM without a server round-trip.
- **localStorage** persists cards across page reloads; Clear wipes the slate.

---

## Privacy

All audio processing and transcript storage happens entirely in your browser.
No microphone data, speech text, or session content is sent to any external
service.  The full privacy notice is visible in the app until you dismiss it.

---

## Browser support

| Browser | Captions | Voice clustering |
|---------|----------|-----------------|
| Chrome (desktop) | ✅ | ✅ |
| Edge (desktop) | ✅ | ✅ |
| Firefox | ❌ Web Speech API not supported | — |
| Safari | ❌ Web Speech API not supported | — |
| Chrome (Android) | ⚠️ Limited | ⚠️ Limited |

---

## Contributing

Bug reports and pull requests are welcome.  Please read [AGENTS.md](AGENTS.md)
before contributing — it documents the working agreements, architecture
constraints, and code-change checklist.

```bash
# Validate JS before committing
node --check app.js && node --check sw.js
```

---

## License

[MIT](LICENSE)


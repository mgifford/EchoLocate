# EchoLocate

Live, in-browser captioning with local transcripts and simulated speaker grouping.

Try it now: [mgifford.github.io/EchoLocate](https://mgifford.github.io/EchoLocate/)

## Purpose

EchoLocate is designed as an accessibility-first captioning tool, especially for deaf and hard-of-hearing users who need live, glanceable transcripts in meetings and conversations.

EchoLocate runs entirely in the browser: there is no backend service and no EchoLocate server. Speech recognition is supplied by your browser — in Chrome and Edge the browser may send audio to its vendor's speech service. Captions, speaker labels and saved cards are stored only in this browser.

## High-level architecture

EchoLocate combines two browser pipelines in parallel:

1. Speech-to-text pipeline
- Input: browser microphone stream
- Engine: local Whisper (WASM, recommended) or the Web Speech API (explicit cloud option)
- Output: transcript chunks with confidence values

2. Voice differentiation pipeline
- Input: same microphone stream via Web Audio API
- Engine: Meyda feature extraction
- Output: per-utterance voice fingerprint used to choose a speaker lane

Rendering and persistence stack:

1. HTMX posts caption payloads to local routes
2. Service Worker intercepts `/api/add-card` and `/api/add-chat-msg`
3. Service Worker returns HTML fragments (cards/chat messages)
4. Frontend inserts fragments without server round-trips
5. Session data is stored in `localStorage`

## Voice fingerprinting model (Phase 1 reliability)

EchoLocate uses vector comparison instead of a single scalar pitch comparison.

Per-frame feature vector includes:

1. 13 MFCC coefficients
2. Spectral flatness
3. Spectral slope

For lane assignment, the current vector is compared with each existing profile using cosine similarity:

$$
	ext{similarity} = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\|\,\|\mathbf{B}\|}
$$

Behavior:

1. If best similarity is high enough, append to that lane
2. Otherwise, create a new guest lane (up to configured maximum)
3. Profiles are updated incrementally over time to adapt to natural voice variation

Why this matters: when a person raises or lowers pitch, timbre features (MFCC texture + slope/flatness) are often more stable than pitch alone.

## Anti-flicker stability

To reduce lane hopping during continuous speech:

1. Hysteresis lock: once a lane is selected, it is temporarily favored for 400ms unless another lane is significantly stronger
2. Temporal smoothing: recent match results are buffered and smoothed over the last 3 decisions

This keeps one sentence from bouncing between two lanes.

## Watchdog and warm restart

Web Speech can silently stall in real browsers. EchoLocate adds a watchdog to recover automatically.

1. If the app is running and no result is received for 10 seconds, recognition is restarted
2. If `onend` fires while app state is still running, recognition warm-restarts automatically
3. If user intentionally stops, watchdog is cleared and no restart occurs

This is critical for accessibility reliability: silent failure is a communication failure.

## Accessibility-focused UI behaviors

1. Per-card confidence meter (0-100%) so users can quickly gauge transcript trust
2. Active lane energy ring so users can see which speaker lane is currently focused
3. Merge lanes controls to combine mistaken duplicate lanes in long sessions
4. Language selector with `None (Auto)` mode and mismatch hints during low-recognition scenarios
5. Chat or lane layout toggle for small screens and varied reading preferences

## Export model

Export uses WebVTT and includes speaker metadata tags:

```vtt
00:00:01.000 --> 00:00:04.000
<v Speaker 1>Hello world</v>
```

This makes the transcript more useful in subtitle-capable tools that understand speaker cues.

## Privacy model

1. Transcripts, speaker labels and settings are stored in this browser only; EchoLocate never uploads them
2. There is no EchoLocate backend — the Service Worker only renders local page fragments
3. Local Whisper runs on this device and is the recommended default. If you explicitly choose the
   browser speech service, Chrome and Edge can send audio to the browser vendor's speech servers
   under that vendor's terms. EchoLocate does not control that path
4. The experimental **On-device** engine asks Chrome to recognise speech locally; Chrome downloads and
   manages the language pack itself (see below)
5. Optional translation uses Chrome's built-in Translator API on device. EchoLocate asks for consent
   per language pair before Chrome downloads its small translation model; refusing leaves captions
   working
6. Local Whisper downloads only its pinned model files from Hugging Face after consent; audio and
   transcripts never leave the browser, and the model is stored in this browser's Cache Storage
7. The interface, transcript, export and language detection work offline. The browser speech service
   requires a network connection in Chrome and Edge; the on-device engine and installed local
   Whisper model are designed to work offline

## Speech engines (experimental)

**Options → Engine** selects how speech is transcribed:

- **Browser speech service** (explicit cloud option) — the Web Speech API. Chrome and Edge may process audio on
  vendor servers.
- **On-device (experimental)** — Chrome's `processLocally` recognizer. Chrome downloads a language
  pack the first time; press **Download language pack** in Options. EchoLocate never downloads that
  language pack itself.
- **Local Whisper (WASM, experimental)** — installs `whisper-tiny.en` (~43 MB, Apache-2.0) from a
  pinned Hugging Face revision after explicit consent, then runs Whisper on this device with WASM.
  Audio is not uploaded. English only; captions are produced in ~5 s chunks. Remove the model from
  Options at any time.

Local Whisper is the recommended default on first run, including Chrome, Edge and Safari. The
empty state explains the ~43 MB model and offers an explicit **Use browser cloud service** choice;
that choice is labelled cloud and remembered. Browsers without a usable browser speech service —
**Firefox**, and any browser that does not expose Web Speech — are local-only and do not offer the
cloud path. Pressing Start without the model opens the install consent.

On-device availability depends on the Chrome version, platform and language. If it is not available,
the app says so and leaves the browser service usable. This path has not yet been tested across
browsers, devices and languages — treat it as experimental.

Local Whisper needs WebAssembly and SIMD (available in current Chrome/Edge/Firefox/Safari) and enough
space for the ~43 MB model. The first caption arrives after a 5-second audio chunk, so it is not
word-by-word streaming. It is English-only in this build; model files are verified against pinned
SHA-256 before use.

## Run locally (offline-friendly)

```bash
git clone https://github.com/mgifford/EchoLocate.git
cd EchoLocate
python3 server.py
```

Then open `http://localhost:8080/` in Chrome, Edge, or Firefox.

Optional model/dependency refresh scripts:

1. `./download-deps.sh`
2. `./download-models.sh`

See [INSTALL.txt](INSTALL.txt) for installation and troubleshooting details.

## Browser support

EchoLocate recommends **local Whisper** and offers the **Web Speech API** as an explicit cloud
option. The browser API is only available in a narrow set of browsers; local Whisper needs
WebAssembly and enough space for its model.

### Desktop

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Supported | Local Whisper recommended. The cloud browser service is an explicit choice and sends audio to Google's servers. |
| Edge | ✅ Supported | Local Whisper recommended. The cloud option requires **Online speech recognition** and does not work in InPrivate windows. |
| Firefox | ✅ Supported with local Whisper | Firefox has no usable browser speech service, so EchoLocate defaults to Local Whisper. Install the ~43 MB English-only model once; transcription then runs on this device. |
| Safari | ⚠️ Local Whisper untested | Safari's Web Speech API is inconsistent. The local Whisper path may work; it has not been tested on Safari. |

### Mobile

| Browser / Platform | Status | Notes |
|--------------------|--------|-------|
| Chrome on Android | ⚠️ Limited | Local Whisper may work but is not tested on mobile; the cloud option requires internet and sends audio to Google. Grant microphone permission when prompted. |
| Edge on Android | ⚠️ Limited | Reports the API as available but may fail silently. Not recommended. |
| Firefox on Android | ⚠️ Local Whisper only | No browser speech service. The local model may run, but CPU/memory and speed vary by device. |
| Samsung Internet | ❌ Not supported | No Web Speech API support. |
| Kiwi Browser (Android) | ⚠️ Experimental | Chromium-based; may work, but not tested. |
| Safari on iOS | ⚠️ Very limited | `webkitSpeechRecognition` is present but behaves inconsistently. Short sessions only. Requires internet. |
| Chrome / Edge / Firefox on iOS | ⚠️ Very limited | All iOS browsers are required by Apple to use Safari's WebKit engine, so they share Safari's limitations. |

> **Summary:** On Android, try **Google Chrome** for service speech, or Firefox/Chrome with the local Whisper model for on-device captioning.
> On iOS, there is no reliably supported browser at this time; a desktop or laptop computer running Chrome or Edge is strongly recommended.

### Why Chrome and Edge on Android often fail

Chrome on Android sends audio to Google's speech recognition servers.
Anything that blocks that connection will silently produce no transcript:

- No internet connection or a restricted network (e.g., corporate Wi-Fi, VPN)
- Microphone permission denied for the site
- Site accessed over `http://` rather than `https://` (a secure context is required)
- Battery saver or data-saver modes stopping background network access
- Google app or Google Play Services restricted by device management policy

### Mobile troubleshooting checklist

1. Use **Google Chrome** (not Samsung Internet, Edge, or Firefox).
2. Open the site over **HTTPS** — the GitHub Pages URL (`https://mgifford.github.io/EchoLocate/`) works. A plain `http://` URL will not.
3. When Chrome asks for microphone permission, tap **Allow**.
4. Make sure you have a working **internet connection** (cellular data or Wi-Fi). Airplane mode will prevent transcription even if the page loads from cache.
5. If Chrome previously denied microphone access, go to **Chrome Settings → Site Settings → Microphone**, find the site, and change the permission to Allow.
6. Disable any **VPN or firewall** that might block connections to Google's speech API.
7. If the screen stays blank after pressing Start, try closing all Chrome tabs and reopening the site.

The app will display a warning banner the first time it detects you are on a mobile browser, summarising these limitations.

## Contributing

Contributions are welcome, especially feedback from deaf and hard-of-hearing users on real-world conversation quality.

Project repo: [github.com/mgifford/EchoLocate](https://github.com/mgifford/EchoLocate)

Before committing:

```bash
node --check app.js && node --check sw.js
```

## Related projects
Check out [Airtime2](https://github.com/mgifford/airtime2) to highlight who spoke and how much time that took. Note that this works much better working directly with a .vtt file from a tool like Zoom. 

## License

[AGPL-3.0](LICENSE)


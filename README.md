# EchoLocate

Live, private, in-browser captioning with simulated speaker grouping.

Try it now: [mgifford.github.io/EchoLocate](https://mgifford.github.io/EchoLocate/)

## Purpose

EchoLocate is designed as an accessibility-first captioning tool, especially for deaf and hard-of-hearing users who need live, glanceable transcripts in meetings and conversations.

The app runs fully client-side. Audio stays on-device. There is no backend speech pipeline.

## High-level architecture

EchoLocate combines two browser pipelines in parallel:

1. Speech-to-text pipeline
- Input: browser microphone stream
- Engine: Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
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

1. Audio processing happens in-browser
2. Transcript data is stored locally in browser storage
3. No transcript/audio is sent to external cloud services by default
4. Offline operation is supported because vendor assets are committed in-repo

## Run locally (offline-friendly)

```bash
git clone https://github.com/mgifford/EchoLocate.git
cd EchoLocate
python3 server.py
```

Then open `http://localhost:8080/` in Chrome or Edge.

Optional model/dependency refresh scripts:

1. `./download-deps.sh`
2. `./download-models.sh`

See [INSTALL.txt](INSTALL.txt) for installation and troubleshooting details.

## Browser support

EchoLocate relies on the **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`).
This API is only available in a narrow set of browsers, which determines what works and what does not.

### Desktop

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Supported | Recommended. Speech is processed by Google's servers (requires internet). |
| Edge | ✅ Supported | Requires **Online speech recognition** to be enabled in Windows Settings → Privacy & security → Speech. Does not work in InPrivate windows. |
| Firefox | ❌ Not supported | Firefox does not implement the Web Speech API. |
| Safari | ❌ Not supported | Safari does not implement Web Speech API on macOS in a compatible way. |

### Mobile

| Browser / Platform | Status | Notes |
|--------------------|--------|-------|
| Chrome on Android | ⚠️ Limited | Most likely to work. Requires an active internet connection (speech is sent to Google's servers). Grant microphone permission when prompted. |
| Edge on Android | ⚠️ Limited | Reports the API as available but may fail silently. Not recommended. |
| Firefox on Android | ❌ Not supported | No Web Speech API support. |
| Samsung Internet | ❌ Not supported | No Web Speech API support. |
| Kiwi Browser (Android) | ⚠️ Experimental | Chromium-based; may work, but not tested. |
| Safari on iOS | ⚠️ Very limited | `webkitSpeechRecognition` is present but behaves inconsistently. Short sessions only. Requires internet. |
| Chrome / Edge / Firefox on iOS | ⚠️ Very limited | All iOS browsers are required by Apple to use Safari's WebKit engine, so they share Safari's limitations. |

> **Summary:** On Android, try **Google Chrome** (the standard version, not Samsung Internet or Firefox).
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

[MIT](LICENSE)


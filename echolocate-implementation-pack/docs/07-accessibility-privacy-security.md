# Accessibility, privacy, security and sustainability guardrails

## Accessibility

EchoLocate is an accessibility service; silent failure is high severity. Keep caption rendering responsive, support plain-text statuses for model download/initialization/error states, use accessible buttons and focus placement, never rely solely on colored speaker lanes, provide editable or reversible speaker labeling, avoid aggressive live-region announcements for every corrected token, and respect reduced-motion preferences. Test with keyboard and screen readers, including network interruption, permission denial and multiple speakers. Do not destroy the last caption or auto-scroll unexpectedly when reconciliation changes attribution.

## Privacy and consent

- Browser Web Speech may send audio to Google or other service. State this prominently and do not describe all modes as fully local.
- In explicit local-only mode, verify via network capture that there is **no audio/transcript/embedding upload**. Fetching versioned model artifacts from CDN/Hugging Face is a separate network event and should be disclosed.
- Voice embeddings are potentially identifying biometric data: keep session-local by default; provide 'clear speaker profiles' and 'clear transcript' separately. Avoid persistent cross-session enrollment without additional design and consent.
- No use of transcript semantics to assert real-world identity. Speaker names require direct user action.
- Protect transcript content in service-worker rendering via HTML escaping; restrict untrusted model metadata and incoming worker message shape.

## Security and supply chain

- Pin exact model revisions, runtimes, artifact hashes and licenses. Do not load arbitrary unreviewed model URLs from user settings.
- Consider model weight download limits, cache poisoning, DoS via very large files, and retry storms.
- Use a strict Content Security Policy compatible with needed workers/WASM/WebGPU; document third-party network origins.
- Sanitization, transcript export escaping and locally posted HTMX/SW fragments need regression tests.
- Minimize telemetry; never log raw audio, embeddings or private transcripts by default.

## Sustainability

- Model sizes, bandwidth and caching affect environmental impact. Never predownload unselected models.
- Test idle GPU/CPU consumption, inference duty cycle, worker termination, bounded buffer memory, reduced-quality or paused modes.
- Avoid claiming WebGPU always consumes less energy; measure per device. Document representative power proxies and their uncertainty.

# Automated and manual test plan

These are **proposed tests**, not test results. Fixtures in `fixtures/` describe
expected event behavior only; they are synthetic metadata, not labeled audio or
numerical benchmarks. The five fixtures currently bundled cover download
consent, late diarization revision, overlap/interruption, returning speakers and
the speaker cap. The repository tests (`tests/*.test.js`) cover pure helpers,
fragment builders, contrast, project copy and accessibility semantics; the
event-level cases below still need implementation.

## Unit/contract tests

| ID | Condition | Expected |
|---|---|---|
| CAP-01 | Secure context missing | Clear failure; no mic attempt |
| CAP-02 | `navigator.gpu` unavailable | Offer applicable WASM/local or disclosed browser option |
| CAP-03 | GPU adapter exists, model fails to initialize | Do not claim model support; recover with no transcript loss |
| CAP-04 | Web Speech API absent | Browser mode disabled; local option remains |
| MODEL-01 | First launch, no consent | Zero model-weight requests |
| MODEL-02 | Select advanced speaker but decline download | Continue with Off/Basic; no advanced weight request |
| MODEL-03 | Cancel partial download | No falsely ready model; safe retry |
| MODEL-04 | Cache revision change | Explicit revision-size disclosure; no stale cache confusion |
| MODEL-05 | Delete speaker weights | Preserve transcript; subsequent advanced mode asks again |
| MODEL-06 | Cache evicted between sessions | No silent download; recover with user approval |
| MODEL-07 | Invalid hash or origin | Reject load and explain |
| ASR-01 | Interim then final segment | One final card, no duplicate; interim replaced |
| ASR-02 | Worker returns late interim | Final caption not overwritten |
| ASR-03 | Local model GPU device loss | Transcript preserved and approved fallback offered |
| ASR-04 | Local-only mode | Network has no audio/transcript/embedding upload |
| SPK-01 | Returning speaker | Original speaker ID reused after intervening voices |
| SPK-02 | Two similar voices | No auto merge without calibrated evidence |
| SPK-03 | Very short interjection | Unknown allowed; no poisoning of profile |
| SPK-04 | Overlapping speech | Multi/unknown state; no mixed-speech enrollment |
| SPK-05 | Speaker limit reached | Unknown rather than forced attribution |
| SPK-06 | Profile update after false guess | Quality gate rejects; no drift |
| SPK-07 | User corrected segment | Automatic later update cannot override correction |
| TIME-01 | Different ASR/diarization window boundaries | Corrected segment IDs and no text loss |
| TIME-02 | Two reconciliations out of order | Revision rule prevents stale overwrite |
| STORE-01 | Clear session profiles | Embeddings removed independently of cached weights |
| STORE-02 | Export after reconciliation | Correct stable speaker labels and valid escaped VTT |

## Integration / accessibility / device checks

- Chrome/Edge desktop, Firefox desktop with/without WebGPU, mobile Chrome and at least one constrained device; record precise versions/OS/GPU.
- Mic permission denied/revoked, no network before download, offline cached inference, network interruption during artifact download.
- Keyboard only: engine choice, consent, progress cancellation, speaker rename/merge/split, clearing models and transcript.
- Screen reader: statuses are exposed without incessant re-announcement of every caption revision; correct focus after download error/dialog closure.
- 200%/400% zoom, high contrast/forced colors, reduced motion, mobile viewport.
- Energy: idle and active worker, model-initialization spikes, sustained long-panel recording; note measurement uncertainty.

## Performance and accuracy gates

Write baseline target values **after collecting measurements**. At a minimum publish error rates and confidence intervals or uncertainty description with sample counts. Never set arbitrary thresholds as if statistically validated.

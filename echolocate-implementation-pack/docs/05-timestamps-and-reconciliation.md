# Timeline, transcript alignment and reconciliation

- Use the recording's monotonic sample clock (`sampleOffset` / `sampleRate`) as the source of truth; store segment `startMs`/`endMs` relative to capture start.
- STT and diarization run at different latencies and may have different segment boundaries. Do not infer that Google `onresult` events are exact speech turns or provide word-level timestamps.
- Present interim captions immediately, then final text with a provisional speaker label; allow later, visible correction without text loss.
- Use immutable `segmentId` and increasing `revision` to avoid duplicate cards and stale-worker rewrites.
- Maintain source metadata: STT engine, model revision, diarization engine, timing uncertainty, attribution state, manual-correction flag.
- Separate the ASR confidence (if available), speech activity confidence, speaker match evidence, and user-confirmed decisions. Never produce an unsupported global '93% speaker identity' number.
- For overlap, allow `speakerIds` (potentially 2+) or Unknown; do not require exactly one speaker for every interval.
- Guard against race conditions: stale partial output cannot overwrite final output; late diarization cannot undo manual corrections.
- Maintain provenance/revision history sufficient to audit speaker edits, but avoid retaining raw biometric audio unless separately consented.
- Deletion, export, and restoration must retain coherent speaker labels; export to WebVTT may be approximate where transcript timing is coarse.

## Example event

```json
{
  "segmentId": "seg-104",
  "startMs": 12500,
  "endMs": 15300,
  "text": "I agree with that approach.",
  "transcriptStatus": "final",
  "speakerIds": ["speaker-002"],
  "speakerStatus": "provisional",
  "transcriptionEngine": "webgpu-local",
  "speakerEngine": "advanced-local",
  "revision": 1,
  "correctedByUser": false
}
```

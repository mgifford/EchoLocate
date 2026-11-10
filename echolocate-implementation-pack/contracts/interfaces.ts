/**
 * ILLUSTRATIVE TYPES ONLY — not source to merge.
 *
 * The repository is a classic-script JavaScript app (`app.js` loaded with
 * `<script>`, tested with Node's `vm`), not a TypeScript/ESM project. Adapt
 * these shapes to JS/JSDoc. In particular, PR 1 must state how adapters are
 * loaded and how they are tested (the current tests execute app.js in a VM
 * context, so ES-module adapters would need a separate loading strategy).
 */
export type RecognitionEngine = 'browser-service' | 'browser-local' | 'webgpu-local' | 'wasm-local';
export type SpeakerEngine = 'off' | 'basic' | 'advanced';
export type ModelState = 'not-supported' | 'available-not-installed' | 'awaiting-consent' | 'downloading' | 'cancelled' | 'verifying' | 'initializing' | 'ready' | 'running' | 'degraded' | 'failed' | 'deleting';
export type AttributionState = 'unknown' | 'provisional' | 'established' | 'overlapping' | 'user-confirmed';

export interface TimedTextSegment {
  segmentId: string;
  startMs: number;
  endMs: number;
  text: string;
  final: boolean;
  source: RecognitionEngine;
  revision: number;
}
export interface SpeakerTurn {
  startMs: number;
  endMs: number;
  speakerIds: string[];
  state: AttributionState;
  evidence?: { modelRevision: string; quality: string; similarity?: number; margin?: number };
}
export interface ReconciledCaption extends TimedTextSegment {
  speakerIds: string[];
  attribution: AttributionState;
  correctedByUser: boolean;
}
export interface SpeechAdapter {
  readonly engine: RecognitionEngine;
  init(config: Record<string, unknown>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  setLanguage(tag: string): Promise<void>;
  dispose(): Promise<void>;
  onInterim(callback: (s: TimedTextSegment) => void): void;
  onFinal(callback: (s: TimedTextSegment) => void): void;
  onError(callback: (e: Error) => void): void;
}
export interface SpeakerAdapter {
  readonly engine: SpeakerEngine;
  init(config: Record<string, unknown>): Promise<void>;
  consumeAudio(samples: Float32Array, sampleStart: number, sampleRate: number): Promise<void>;
  onSpeakerTurns(callback: (turns: SpeakerTurn[]) => void): void;
  resetSession(): Promise<void>;
  dispose(): Promise<void>;
}
export interface ModelEntry {
  id: string;
  revision: string;
  license: string;
  sourceUrl: string;
  declaredBytes: number;
  artifacts: { path: string; sha256: string; bytes: number }[];
  backends: ('webgpu' | 'wasm')[];
}

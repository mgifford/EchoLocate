/**
 * Bounded FIFO queue for captured audio chunks.
 *
 * The queue is deliberately small and measurable. When inference cannot keep
 * up, the oldest queued chunk is dropped, its interval is recorded as missing,
 * and coverage falls. It never pretends that dropped audio was transcribed.
 *
 * Browser: window.AudioChunkQueue
 * Node:    require('./modules/audio-chunk-queue.js')
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    // Browser callers construct the class directly; keep the helpers on a
    // namespace object for tests and debugging.
    root.AudioChunkQueue = api.AudioChunkQueue;
    root.AudioChunkQueueModule = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function addInterval(intervals, startMs, endMs) {
    const start = Math.max(0, Math.min(startMs, endMs));
    const end = Math.max(start, Math.max(startMs, endMs));
    if (end <= start) return intervals;
    const next = [...intervals, [start, end]].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const interval of next) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1]) {
        last[1] = Math.max(last[1], interval[1]);
      } else {
        merged.push([interval[0], interval[1]]);
      }
    }
    return merged;
  }

  function intervalDuration(intervals) {
    return intervals.reduce((total, [start, end]) => total + Math.max(0, end - start), 0);
  }

  function validateChunk(chunk) {
    if (!chunk || typeof chunk !== 'object') return 'Chunk must be an object';
    if (!String(chunk.id || '').trim()) return 'Chunk needs an id';
    if (!Number.isInteger(chunk.sequence) || chunk.sequence < 1) return 'Chunk sequence must be >= 1';
    if (!Number.isFinite(chunk.startOffsetMs) || chunk.startOffsetMs < 0) return 'startOffsetMs must be >= 0';
    if (!Number.isFinite(chunk.endOffsetMs) || chunk.endOffsetMs <= chunk.startOffsetMs) return 'endOffsetMs must be greater than startOffsetMs';
    if (!chunk.samples || typeof chunk.samples.length !== 'number' || chunk.samples.length === 0) return 'Chunk needs samples';
    if (!Number.isFinite(chunk.sampleRate) || chunk.sampleRate <= 0) return 'Chunk needs a sampleRate';
    return null;
  }

  class AudioChunkQueue {
    constructor({ maxChunks = 6, maxPendingMs = 30000 } = {}) {
      this.maxChunks = Math.max(1, Math.floor(maxChunks));
      this.maxPendingMs = Math.max(1000, Number(maxPendingMs) || 30000);
      this._queue = [];
      this._inFlight = null;
      this._captured = [];
      this._processed = [];
      this._missing = [];
      this._droppedChunks = 0;
      this._lastCapturedEndMs = 0;
      this._lastDropped = [];
    }

    enqueue(chunk) {
      const error = validateChunk(chunk);
      if (error) return { accepted: false, dropped: [], reason: error };

      // Capture order is monotonic. A chunk that starts before the previous
      // captured chunk ends would make coverage and transcript order ambiguous.
      if (chunk.startOffsetMs < this._lastCapturedEndMs) {
        return { accepted: false, dropped: [], reason: 'Chunk overlaps or precedes captured audio' };
      }

      this._captured = addInterval(this._captured, chunk.startOffsetMs, chunk.endOffsetMs);
      this._lastCapturedEndMs = chunk.endOffsetMs;
      this._lastDropped = [];

      // Make room by dropping the oldest queued chunk. The in-flight chunk
      // cannot be dropped; if that alone is at the memory limit, reject the new
      // chunk and record it as missing rather than growing without bound.
      while (this._needsRoomFor(chunk)) {
        if (this._queue.length) {
          const dropped = this._queue.shift();
          this._recordMissing(dropped);
          this._droppedChunks += 1;
          this._lastDropped.push(dropped);
        } else {
          this._recordMissing(chunk);
          return {
            accepted: false,
            dropped: this._lastDropped.slice(),
            reason: 'Queue is full with in-flight audio',
          };
        }
      }

      this._queue.push(chunk);
      return { accepted: true, dropped: this._lastDropped.slice(), reason: null };
    }

    _needsRoomFor(chunk) {
      const pendingChunks = this._queue.length + (this._inFlight ? 1 : 0);
      const pendingMs = intervalDuration(this._pendingIntervals()) + (chunk.endOffsetMs - chunk.startOffsetMs);
      return pendingChunks + 1 > this.maxChunks || pendingMs > this.maxPendingMs;
    }

    _pendingIntervals() {
      const intervals = this._queue.map((chunk) => [chunk.startOffsetMs, chunk.endOffsetMs]);
      if (this._inFlight) intervals.push([this._inFlight.startOffsetMs, this._inFlight.endOffsetMs]);
      return intervals;
    }

    _recordMissing(chunk) {
      this._missing = addInterval(this._missing, chunk.startOffsetMs, chunk.endOffsetMs);
    }

    dequeue() {
      if (this._inFlight || !this._queue.length) return null;
      this._inFlight = this._queue.shift();
      return this._inFlight;
    }

    complete(chunk) {
      if (!chunk) return this.stats();
      this._processed = addInterval(this._processed, chunk.startOffsetMs, chunk.endOffsetMs);
      if (this._inFlight && this._inFlight.id === chunk.id) this._inFlight = null;
      return this.stats();
    }

    fail(chunk) {
      if (!chunk) return this.stats();
      this._recordMissing(chunk);
      if (this._inFlight && this._inFlight.id === chunk.id) this._inFlight = null;
      return this.stats();
    }

    /** Stop/worker failure: every queued and in-flight chunk is missing. */
    abandonPending(reason = 'stopped') {
      const abandoned = [];
      if (this._inFlight) {
        abandoned.push(this._inFlight);
        this._recordMissing(this._inFlight);
        this._inFlight = null;
      }
      for (const chunk of this._queue.splice(0)) {
        abandoned.push(chunk);
        this._recordMissing(chunk);
      }
      return { abandoned, reason, stats: this.stats() };
    }

    clear() {
      this._queue = [];
      this._inFlight = null;
      this._captured = [];
      this._processed = [];
      this._missing = [];
      this._droppedChunks = 0;
      this._lastCapturedEndMs = 0;
      this._lastDropped = [];
    }

    get inFlight() {
      return this._inFlight;
    }

    get queueDepth() {
      return this._queue.length;
    }

    stats() {
      const capturedMs = intervalDuration(this._captured);
      const processedMs = intervalDuration(this._processed);
      const missingMs = intervalDuration(this._missing);
      const pendingMs = intervalDuration(this._pendingIntervals());
      return {
        capturedMs,
        processedMs,
        missingMs,
        pendingMs,
        coverage: capturedMs > 0 ? processedMs / capturedMs : 1,
        queueDepth: this._queue.length,
        pendingChunks: this._queue.length + (this._inFlight ? 1 : 0),
        inFlight: !!this._inFlight,
        droppedChunks: this._droppedChunks,
        missingIntervals: this._missing.map(([start, end]) => ({ startMs: start, endMs: end })),
        pendingIntervals: this._pendingIntervals().map(([start, end]) => ({ startMs: start, endMs: end })),
      };
    }
  }

  return {
    AudioChunkQueue,
    addInterval,
    intervalDuration,
    validateChunk,
  };
});

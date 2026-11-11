'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  AudioChunkQueue,
  addInterval,
  intervalDuration,
  validateChunk,
} = require('../modules/audio-chunk-queue.js');

function chunk(sequence, startOffsetMs, durationMs = 5000) {
  const samples = new Float32Array(16000 * (durationMs / 1000));
  return {
    id: `chunk-${sequence}`,
    sequence,
    startOffsetMs,
    endOffsetMs: startOffsetMs + durationMs,
    samples,
    sampleRate: 16000,
    capturedAt: 1_700_000_000_000 + startOffsetMs,
    sourceId: 'mic',
  };
}

describe('AudioChunkQueue', () => {
  it('dequeues in capture order with stable ids', () => {
    const q = new AudioChunkQueue({ maxChunks: 6, maxPendingMs: 30000 });
    assert.equal(q.enqueue(chunk(1, 0)).accepted, true);
    assert.equal(q.enqueue(chunk(2, 5000)).accepted, true);
    assert.equal(q.queueDepth, 2);
    const first = q.dequeue();
    assert.equal(first.id, 'chunk-1');
    q.complete(first);
    const second = q.dequeue();
    assert.equal(second.id, 'chunk-2');
    q.complete(second);
    assert.equal(q.dequeue(), null);
  });

  it('drops the oldest queued chunk when capacity is full and records missing audio', () => {
    const q = new AudioChunkQueue({ maxChunks: 3, maxPendingMs: 15000 });
    q.enqueue(chunk(1, 0));
    q.enqueue(chunk(2, 5000));
    q.enqueue(chunk(3, 10000));
    const result = q.enqueue(chunk(4, 15000));
    assert.equal(result.accepted, true);
    assert.equal(result.dropped.length, 1);
    assert.equal(result.dropped[0].id, 'chunk-1');
    const stats = q.stats();
    assert.equal(stats.capturedMs, 20000);
    assert.equal(stats.missingMs, 5000);
    assert.equal(stats.pendingMs, 15000);
    assert.equal(stats.coverage, 0);
    assert.equal(stats.queueDepth, 3);
  });

  it('rejects an oversized chunk with in-flight audio and marks it missing', () => {
    const q = new AudioChunkQueue({ maxChunks: 1, maxPendingMs: 5000 });
    const inFlight = chunk(1, 0);
    q.enqueue(inFlight);
    assert.equal(q.dequeue().id, inFlight.id);
    const result = q.enqueue(chunk(2, 5000));
    assert.equal(result.accepted, false);
    const stats = q.stats();
    assert.equal(stats.missingMs, 5000);
    assert.equal(stats.pendingMs, 5000);
  });

  it('rejects overlapping or out-of-order chunks', () => {
    const q = new AudioChunkQueue();
    assert.equal(q.enqueue(chunk(1, 0)).accepted, true);
    const overlap = q.enqueue(chunk(2, 4000));
    assert.equal(overlap.accepted, false);
    assert.match(overlap.reason, /overlaps|precedes/);
    assert.equal(q.stats().capturedMs, 5000);
  });

  it('tracks complete, failed and abandoned chunks as distinct states', () => {
    const q = new AudioChunkQueue({ maxChunks: 4, maxPendingMs: 20000 });
    q.enqueue(chunk(1, 0));
    const first = q.dequeue();
    q.complete(first);
    q.enqueue(chunk(2, 5000));
    const second = q.dequeue();
    q.fail(second);
    q.enqueue(chunk(3, 10000));
    q.enqueue(chunk(4, 15000));
    const abandoned = q.abandonPending('stop');
    assert.equal(abandoned.abandoned.length, 2);
    const stats = q.stats();
    assert.equal(stats.capturedMs, 20000);
    assert.equal(stats.processedMs, 5000);
    assert.equal(stats.missingMs, 15000);
    assert.equal(stats.pendingMs, 0);
    assert.equal(stats.coverage, 0.25);
  });

  it('never silently loses a 15-minute capture under slow inference', () => {
    const q = new AudioChunkQueue({ maxChunks: 6, maxPendingMs: 30000 });
    const minutes = 15;
    const chunks = (minutes * 60) / 5;
    let processed = 0;
    let dropped = 0;

    for (let i = 1; i <= chunks; i++) {
      const start = (i - 1) * 5000;
      q.enqueue(chunk(i, start));
      // Inference takes ~8s per 5s chunk: slower than real time.
      if (i % 2 === 0) {
        const next = q.dequeue();
        if (next) {
          q.complete(next);
          processed++;
        }
      }
      dropped += q.stats().droppedChunks;
    }

    // Drain what is still queued; then confirm every second is accounted for.
    let next;
    while ((next = q.dequeue())) q.complete(next);
    q.abandonPending('test-end');

    const stats = q.stats();
    assert.equal(stats.capturedMs, minutes * 60 * 1000);
    assert.equal(stats.processedMs + stats.missingMs + stats.pendingMs, stats.capturedMs);
    assert.ok(stats.missingMs > 0, 'slow inference must report missing audio');
    assert.ok(stats.coverage < 1);
    assert.ok(stats.droppedChunks > 0);
    assert.equal(processed > 0, true);
    assert.equal(dropped > 0, true);
  });

  it('reaches full coverage when inference keeps up', () => {
    const q = new AudioChunkQueue({ maxChunks: 6, maxPendingMs: 30000 });
    for (let i = 1; i <= 12; i++) {
      q.enqueue(chunk(i, (i - 1) * 5000));
      const next = q.dequeue();
      q.complete(next);
    }
    const stats = q.stats();
    assert.equal(stats.capturedMs, 60000);
    assert.equal(stats.processedMs, 60000);
    assert.equal(stats.missingMs, 0);
    assert.equal(stats.pendingMs, 0);
    assert.equal(stats.coverage, 1);
  });

  it('does not count an uncaptured gap as captured or missing', () => {
    const q = new AudioChunkQueue({ maxChunks: 4, maxPendingMs: 20000 });
    q.enqueue(chunk(1, 0));
    q.enqueue(chunk(2, 120000)); // device suspension/background gap
    const first = q.dequeue();
    q.complete(first);
    const second = q.dequeue();
    q.complete(second);
    const stats = q.stats();
    assert.equal(stats.capturedMs, 10000);
    assert.equal(stats.processedMs, 10000);
    assert.equal(stats.missingMs, 0);
    assert.equal(stats.coverage, 1);
  });

  it('resets cleanly for a restarted session', () => {
    const q = new AudioChunkQueue({ maxChunks: 4, maxPendingMs: 20000 });
    q.enqueue(chunk(1, 0));
    q.abandonPending('stop');
    assert.equal(q.stats().missingMs, 5000);
    q.clear();
    assert.deepEqual(q.stats(), {
      capturedMs: 0,
      processedMs: 0,
      missingMs: 0,
      pendingMs: 0,
      coverage: 1,
      queueDepth: 0,
      pendingChunks: 0,
      inFlight: false,
      droppedChunks: 0,
      missingIntervals: [],
      pendingIntervals: [],
    });
    q.enqueue(chunk(1, 0));
    q.complete(q.dequeue());
    assert.equal(q.stats().coverage, 1);
  });

  it('validates chunk contracts', () => {
    assert.equal(validateChunk(chunk(1, 0)), null);
    assert.match(validateChunk({ ...chunk(1, 0), samples: null }), /samples/);
    assert.match(validateChunk({ ...chunk(1, 0), endOffsetMs: 0 }), /endOffsetMs/);
  });

  it('unions intervals so duplicate processing is not double-counted', () => {
    const intervals = addInterval(addInterval([], 0, 5000), 2500, 7500);
    assert.deepEqual(intervals, [[0, 7500]]);
    assert.equal(intervalDuration(intervals), 7500);
  });
});

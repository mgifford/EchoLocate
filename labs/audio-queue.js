'use strict';

(function () {
  const MAX_CHUNKS = 4;
  const MAX_PENDING_MS = 20000;
  let queue = new AudioChunkQueue({ maxChunks: MAX_CHUNKS, maxPendingMs: MAX_PENDING_MS });
  let sequence = 0;
  let capturedSamples = 0;
  let lastDropped = 0;

  const status = document.getElementById('status');
  const statsHost = document.getElementById('stats');
  const missing = document.getElementById('missing');

  function chunk() {
    sequence += 1;
    const start = Math.round((capturedSamples / 16000) * 1000);
    const samples = new Float32Array(16000 * 5);
    capturedSamples += samples.length;
    return {
      id: `chunk-${sequence}`,
      sequence,
      startOffsetMs: start,
      endOffsetMs: start + 5000,
      sampleRate: 16000,
      samples,
      capturedAt: Date.now(),
      sourceId: 'lab',
    };
  }

  function announce(text) {
    status.textContent = text;
  }

  function add() {
    const result = queue.enqueue(chunk());
    if (result.dropped.length) {
      lastDropped += result.dropped.length;
      announce(`Queue full: dropped ${result.dropped.length} oldest chunk(s).`);
    } else if (!result.accepted) {
      announce(`Chunk rejected: ${result.reason}`);
    } else {
      announce('Captured 5 seconds.');
    }
    render();
  }

  function processNext() {
    const next = queue.dequeue();
    if (!next) {
      announce('Nothing queued to process.');
      render();
      return;
    }
    queue.complete(next);
    announce(`Processed ${next.id}.`);
    render();
  }

  function slow() {
    for (let i = 0; i < 6; i++) add();
    announce(`Inference is slower than capture; ${lastDropped} chunk(s) dropped.`);
    render();
  }

  function fail() {
    const next = queue.inFlight || queue.dequeue();
    if (!next) {
      announce('No in-flight chunk; enqueue one first.');
      render();
      return;
    }
    queue.fail(next);
    announce(`Marked ${next.id} as failed/missing.`);
    render();
  }

  function stop() {
    const result = queue.abandonPending('lab stop');
    announce(`Stopped: ${result.abandoned.length} pending chunk(s) marked missing.`);
    render();
  }

  function reset() {
    queue = new AudioChunkQueue({ maxChunks: MAX_CHUNKS, maxPendingMs: MAX_PENDING_MS });
    sequence = 0;
    capturedSamples = 0;
    lastDropped = 0;
    announce('Reset.');
    render();
  }

  function render() {
    const s = queue.stats();
    statsHost.textContent = '';
    const rows = [
      ['Coverage', `${Math.round(s.coverage * 100)}%`],
      ['Captured', `${(s.capturedMs / 1000).toFixed(1)} s`],
      ['Processed', `${(s.processedMs / 1000).toFixed(1)} s`],
      ['Pending', `${(s.pendingMs / 1000).toFixed(1)} s`],
      ['Missing', `${(s.missingMs / 1000).toFixed(1)} s`],
      ['Queue depth', String(s.queueDepth)],
      ['Pending chunks', String(s.pendingChunks)],
      ['Dropped chunks', String(s.droppedChunks)],
    ];
    for (const [label, value] of rows) {
      const card = document.createElement('article');
      card.className = 'lab-lane';
      const term = document.createElement('h3');
      term.textContent = label;
      const detail = document.createElement('p');
      detail.textContent = value;
      card.append(term, detail);
      statsHost.appendChild(card);
    }
    missing.textContent = s.missingIntervals.length
      ? s.missingIntervals.map((i) => `${i.startMs}–${i.endMs} ms`).join(', ')
      : 'None.';
  }

  document.getElementById('add').addEventListener('click', add);
  document.getElementById('process').addEventListener('click', processNext);
  document.getElementById('slow').addEventListener('click', slow);
  document.getElementById('fail').addEventListener('click', fail);
  document.getElementById('stop').addEventListener('click', stop);
  document.getElementById('reset').addEventListener('click', reset);

  announce('Ready. Capture synthetic audio or simulate slow inference.');
  render();
})();

/**
 * Caption event model — a pure, transport-neutral seam.
 *
 * The app, the labs and future audience/overlay views can share this contract
 * without importing the DOM, storage or speech engine. Events are immutable
 * snapshots; revisions are new events that point at the same segment.
 *
 * Browser: window.CaptionEvents
 * Node:    require('./modules/caption-events.js')
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CaptionEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const EVENT_TYPES = new Set(['caption.interim', 'caption.final', 'caption.revised']);
  const SPEAKER_STATUSES = new Set(['provisional', 'established', 'unknown']);

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function normalizeSpeaker(speaker) {
    if (!speaker || typeof speaker !== 'object') return null;
    const id = String(speaker.id || '').trim();
    const label = String(speaker.label || '').trim();
    if (!id && !label) return null;
    const status = SPEAKER_STATUSES.has(speaker.status) ? speaker.status : 'provisional';
    return {
      id: id || 'unknown',
      label: label || (status === 'unknown' ? 'Unknown' : 'Speaker'),
      status,
      color: typeof speaker.color === 'string' ? speaker.color : '',
    };
  }

  function normalizeConfidence(confidence) {
    if (!isFiniteNumber(confidence)) return null;
    return Math.max(0, Math.min(1, confidence));
  }

  function makeEvent(input = {}) {
    const type = EVENT_TYPES.has(input.type) ? input.type : 'caption.final';
    const segmentId = String(input.segmentId || '').trim();
    if (!segmentId) throw new Error('Caption event needs a segmentId');

    const sequence = Math.max(1, Math.floor(input.sequence || 1));
    const revision = Math.max(0, Math.floor(input.revision || 0));
    const startMs = isFiniteNumber(input.startMs) ? Math.max(0, input.startMs) : 0;
    const endMs = isFiniteNumber(input.endMs) ? Math.max(startMs, input.endMs) : startMs;
    const text = String(input.text == null ? '' : input.text);

    return {
      version: VERSION,
      eventId: `evt-${sequence}`,
      type,
      segmentId,
      sequence,
      revision,
      text,
      language: String(input.language || '').trim(),
      startMs,
      endMs,
      confidence: normalizeConfidence(input.confidence),
      speaker: normalizeSpeaker(input.speaker),
    };
  }

  function validateEvent(event) {
    const errors = [];
    if (!event || typeof event !== 'object') return { ok: false, errors: ['Event must be an object'] };
    if (event.version !== VERSION) errors.push(`Unsupported version: ${event.version}`);
    if (!EVENT_TYPES.has(event.type)) errors.push(`Unknown type: ${event.type}`);
    if (!String(event.segmentId || '').trim()) errors.push('Missing segmentId');
    if (!Number.isInteger(event.sequence) || event.sequence < 1) errors.push('sequence must be >= 1');
    if (!Number.isInteger(event.revision) || event.revision < 0) errors.push('revision must be >= 0');
    if (typeof event.text !== 'string') errors.push('text must be a string');
    if (!isFiniteNumber(event.startMs) || event.startMs < 0) errors.push('startMs must be >= 0');
    if (!isFiniteNumber(event.endMs) || event.endMs < event.startMs) errors.push('endMs must be >= startMs');
    if (event.confidence !== null && !isFiniteNumber(event.confidence)) errors.push('confidence must be null or a number');
    if (event.confidence !== null && (event.confidence < 0 || event.confidence > 1)) errors.push('confidence must be 0..1');
    if (event.speaker !== null && (typeof event.speaker !== 'object' || !event.speaker.id)) errors.push('speaker must be null or have an id');
    return { ok: errors.length === 0, errors };
  }

  function eventToCard(event) {
    const valid = validateEvent(event);
    if (!valid.ok) throw new Error(`Invalid caption event: ${valid.errors.join('; ')}`);
    const speaker = event.speaker || {};
    return {
      segmentId: event.segmentId,
      text: event.text,
      speakerId: speaker.id || '',
      speakerLabel: speaker.label || 'Speaker',
      speakerColor: speaker.color || '',
      confidence: event.confidence == null ? 0 : event.confidence,
      languageTag: event.language || '',
      startedAt: event.startMs,
      endedAt: event.endMs,
      timestamp: new Date(event.endMs).toISOString(),
      captionEventId: event.eventId,
      captionSequence: event.sequence,
      captionRevision: event.revision,
    };
  }

  function formatVttTime(ms) {
    const clamped = Math.max(0, Math.floor(ms));
    const h = Math.floor(clamped / 3_600_000);
    const m = Math.floor((clamped % 3_600_000) / 60_000);
    const s = Math.floor((clamped % 60_000) / 1000);
    const msPart = clamped % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(msPart).padStart(3, '0')}`;
  }

  function escapeVtt(text) {
    return String(text || '')
      .replace(/\n/g, ' ')
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/--&gt;/g, '- &gt;');
  }

  function latestFinals(events) {
    const latest = new Map();
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || event.type === 'caption.interim') continue;
      const current = latest.get(event.segmentId);
      if (!current || event.revision > current.revision || (
        event.revision === current.revision && event.sequence > current.sequence
      )) {
        latest.set(event.segmentId, event);
      }
    }
    return [...latest.values()].sort((a, b) => (
      a.startMs - b.startMs || a.sequence - b.sequence
    ));
  }

  function eventsToVtt(events, { generatedAt = new Date().toISOString() } = {}) {
    const finals = latestFinals(events);
    let out = `WEBVTT - EchoLocate transcript\n\nNOTE\nGenerated: ${generatedAt}\n\n`;
    if (!finals.length) return out;

    const base = finals[0].startMs;
    let cueIndex = 1;
    for (const event of finals) {
      const text = escapeVtt(event.text);
      if (!text) continue;
      const speaker = String((event.speaker && event.speaker.label) || 'Speaker')
        .replace(/[\n\r]/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim() || 'Speaker';
      const start = event.startMs - base;
      const end = Math.max(event.endMs - base, start + 300);
      out += `${cueIndex}\n${formatVttTime(start)} --> ${formatVttTime(end)}\n<v ${speaker}>${text}</v>\n\n`;
      cueIndex++;
    }
    return out;
  }

  class CaptionEventStore {
    constructor({ startSequence = 0, segmentPrefix = 'seg' } = {}) {
      this._events = new Map();
      this._sequence = Math.max(0, Math.floor(startSequence));
      this._segmentNumber = 1;
      this._segmentPrefix = segmentPrefix;
    }

    nextSegmentId() {
      const id = `${this._segmentPrefix}-${this._segmentNumber}`;
      this._segmentNumber += 1;
      return id;
    }

    _nextSequence() {
      this._sequence += 1;
      return this._sequence;
    }

    finalize(input = {}) {
      const segmentId = String(input.segmentId || this.nextSegmentId());
      const existing = this._events.get(segmentId);
      if (existing && (existing.type === 'caption.final' || existing.type === 'caption.revised')) {
        throw new Error(`Segment already finalized: ${segmentId}`);
      }
      const event = makeEvent({
        ...input,
        type: 'caption.final',
        segmentId,
        sequence: this._nextSequence(),
        revision: existing ? existing.revision : 0,
      });
      this._events.set(segmentId, event);
      return event;
    }

    interim(input = {}) {
      const segmentId = String(input.segmentId || this.nextSegmentId());
      const existing = this._events.get(segmentId);
      const event = makeEvent({
        ...input,
        type: 'caption.interim',
        segmentId,
        sequence: this._nextSequence(),
        revision: existing ? existing.revision : 0,
      });
      this._events.set(segmentId, event);
      return event;
    }

    revise(segmentId, patch = {}) {
      const base = this._events.get(String(segmentId));
      if (!base) throw new Error(`Unknown segment: ${segmentId}`);
      const event = makeEvent({
        ...base,
        ...patch,
        type: 'caption.revised',
        segmentId: base.segmentId,
        sequence: this._nextSequence(),
        revision: base.revision + 1,
      });
      this._events.set(base.segmentId, event);
      return event;
    }

    get(segmentId) {
      return this._events.get(String(segmentId)) || null;
    }

    list() {
      return [...this._events.values()].sort((a, b) => a.sequence - b.sequence);
    }

    finals() {
      return latestFinals(this.list());
    }

    toVtt(options) {
      return eventsToVtt(this.list(), options);
    }

    reset() {
      this._events.clear();
      this._sequence = 0;
      this._segmentNumber = 1;
    }
  }

  return {
    VERSION,
    CaptionEventStore,
    makeEvent,
    validateEvent,
    eventToCard,
    eventsToVtt,
    formatVttTime,
  };
});

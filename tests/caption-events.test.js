'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  CaptionEventStore,
  makeEvent,
  validateEvent,
  eventToCard,
  eventsToVtt,
  formatVttTime,
} = require('../modules/caption-events.js');

function finalInput(overrides = {}) {
  return {
    segmentId: 'seg-1',
    text: 'Hello world',
    language: 'en',
    startMs: 1000,
    endMs: 2500,
    confidence: 0.8,
    speaker: { id: 's1', label: 'Speaker 1', status: 'provisional', color: '#4dabf7' },
    ...overrides,
  };
}

describe('caption events', () => {
  it('creates a versioned final event with stable ids', () => {
    const store = new CaptionEventStore();
    const event = store.finalize(finalInput());
    assert.equal(event.version, 1);
    assert.equal(event.type, 'caption.final');
    assert.equal(event.segmentId, 'seg-1');
    assert.equal(event.sequence, 1);
    assert.equal(event.revision, 0);
    assert.equal(event.eventId, 'evt-1');
    assert.equal(event.speaker.label, 'Speaker 1');
    assert.equal(validateEvent(event).ok, true);
  });

  it('increments sequence for interim/final/revision without changing the segment', () => {
    const store = new CaptionEventStore();
    store.interim(finalInput({ segmentId: 'seg-1', text: 'Hel' }));
    const final = store.finalize(finalInput({ segmentId: 'seg-1', text: 'Hello' }));
    const revised = store.revise('seg-1', {
      text: 'Hello, corrected',
      speaker: { id: 's2', label: 'Speaker 2', status: 'established' },
    });

    assert.equal(final.sequence, 2);
    assert.equal(revised.sequence, 3);
    assert.equal(revised.revision, 1);
    assert.equal(revised.type, 'caption.revised');
    assert.equal(store.finals().length, 1);
    assert.equal(store.finals()[0].text, 'Hello, corrected');
    assert.equal(store.finals()[0].speaker.id, 's2');
  });

  it('rejects duplicate finals and unknown revisions', () => {
    const store = new CaptionEventStore();
    store.finalize(finalInput());
    assert.throws(() => store.finalize(finalInput()), /already finalized/);
    assert.throws(() => store.revise('missing', { text: 'no' }), /Unknown segment/);
  });

  it('validates malformed events', () => {
    const bad = { ...makeEvent(finalInput()), endMs: 10, startMs: 20 };
    const result = validateEvent(bad);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /endMs/);
    assert.equal(validateEvent({ ...makeEvent(finalInput()), confidence: 2 }).ok, false);
  });

  it('maps an event to the existing card shape', () => {
    const card = eventToCard(makeEvent(finalInput()));
    assert.equal(card.segmentId, 'seg-1');
    assert.equal(card.text, 'Hello world');
    assert.equal(card.speakerId, 's1');
    assert.equal(card.startedAt, 1000);
    assert.equal(card.endedAt, 2500);
    assert.equal(card.captionRevision, 0);
    assert.equal(card.captionSequence, 1);
  });

  it('renders only the latest revision in WebVTT and escapes payloads', () => {
    const store = new CaptionEventStore();
    store.finalize(finalInput({ text: 'first' }));
    store.revise('seg-1', { text: 'second <script> & -->' });
    const vtt = store.toVtt({ generatedAt: '2026-11-11T00:00:00.000Z' });
    assert.match(vtt, /second &lt;script&gt; &amp; - &gt;/);
    assert.doesNotMatch(vtt, /first/);
    assert.match(vtt, /<v Speaker 1>/);
    assert.match(vtt, /00:00:00\.000 --> 00:00:01\.500/);
  });

  it('returns a valid empty WebVTT file', () => {
    const vtt = eventsToVtt([]);
    assert.match(vtt, /^WEBVTT - EchoLocate transcript/);
    assert.doesNotMatch(vtt, /\d\d:\d\d:\d\d\.\d\d\d -->/);
  });

  it('formats cue times', () => {
    assert.equal(formatVttTime(0), '00:00:00.000');
    assert.equal(formatVttTime(3723456), '01:02:03.456');
  });
});

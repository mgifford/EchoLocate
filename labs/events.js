'use strict';

(function () {
  const samples = [
    'Hello, this is a synthetic caption.',
    'I can take the first point.',
    'Could you repeat the question?',
    'The panel will return after the break.',
  ];
  const speakers = [
    { id: 's1', label: 'Speaker 1', status: 'provisional', color: '#4dabf7' },
    { id: 's2', label: 'Speaker 2', status: 'provisional', color: '#cc5de8' },
  ];

  let store = new CaptionEvents.CaptionEventStore();
  let sampleIndex = 0;
  let interimIndex = 0;
  let startMs = 0;

  const lanes = document.getElementById('lanes');
  const chat = document.getElementById('chat');
  const vtt = document.getElementById('vtt');
  const status = document.getElementById('status');

  function announce(text) {
    status.textContent = text;
  }

  function addFinal() {
    const speaker = speakers[sampleIndex % speakers.length];
    const text = samples[sampleIndex % samples.length];
    const begin = startMs;
    const end = begin + 2400 + (sampleIndex % 3) * 300;
    store.finalize({
      segmentId: `seg-${sampleIndex + 1}`,
      text,
      language: 'en',
      startMs: begin,
      endMs: end,
      confidence: 0.82,
      speaker,
    });
    sampleIndex += 1;
    startMs = end + 200;
    announce(`Added final for ${speaker.label}.`);
    render();
  }

  function addInterim() {
    interimIndex += 1;
    const speaker = speakers[sampleIndex % speakers.length];
    const event = store.interim({
      segmentId: `interim-${interimIndex}`,
      text: 'This is in-progress text…',
      language: 'en',
      startMs,
      endMs: startMs + 600,
      confidence: 0.4,
      speaker,
    });
    announce(`Interim text for ${event.speaker.label}. Not exported to WebVTT.`);
    render();
  }

  function reviseLast() {
    const finals = store.finals();
    if (!finals.length) {
      announce('Add a final caption before revising.');
      return;
    }
    const last = finals[finals.length - 1];
    const nextSpeaker = last.speaker && last.speaker.id === 's1' ? speakers[1] : speakers[0];
    const revised = store.revise(last.segmentId, {
      text: `${last.text} (corrected)`,
      speaker: { ...nextSpeaker, status: 'established' },
    });
    announce(`Revised ${revised.segmentId} to revision ${revised.revision}.`);
    render();
  }

  function reset() {
    store = new CaptionEvents.CaptionEventStore();
    sampleIndex = 0;
    interimIndex = 0;
    startMs = 0;
    announce('Reset. Add a final to start again.');
    render();
  }

  function renderLanes(finals) {
    lanes.textContent = '';
    const groups = new Map();
    for (const event of finals) {
      const id = event.speaker ? event.speaker.id : 'unknown';
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(event);
    }
    if (!groups.size) {
      const empty = document.createElement('p');
      empty.className = 'lab-status';
      empty.textContent = 'No final captions yet.';
      lanes.appendChild(empty);
      return;
    }
    for (const events of groups.values()) {
      const lane = document.createElement('section');
      lane.className = 'lab-lane';
      const heading = document.createElement('h3');
      const speaker = events[0].speaker;
      heading.textContent = speaker ? `${speaker.label} (${speaker.status})` : 'Unknown';
      lane.appendChild(heading);
      const cards = document.createElement('div');
      cards.className = 'lab-cards';
      for (const event of events) {
        const card = document.createElement('article');
        card.className = 'lab-card';
        if (event.speaker && event.speaker.color) card.style.borderLeftColor = event.speaker.color;
        const text = document.createElement('p');
        text.textContent = event.text;
        const meta = document.createElement('p');
        meta.className = 'meta';
        meta.textContent = `${event.segmentId} · revision ${event.revision} · ${event.language || 'und'}`;
        card.append(text, meta);
        cards.appendChild(card);
      }
      lane.appendChild(cards);
      lanes.appendChild(lane);
    }
  }

  function renderChat(finals) {
    chat.textContent = '';
    if (!finals.length) {
      const item = document.createElement('li');
      item.textContent = 'No final captions yet.';
      chat.appendChild(item);
      return;
    }
    for (const event of finals) {
      const item = document.createElement('li');
      const speaker = document.createElement('span');
      speaker.className = 'speaker';
      speaker.textContent = `${event.speaker ? event.speaker.label : 'Unknown'}: `;
      item.append(speaker, document.createTextNode(event.text));
      chat.appendChild(item);
    }
  }

  function render() {
    const finals = store.finals();
    renderLanes(finals);
    renderChat(finals);
    vtt.textContent = store.toVtt({ generatedAt: new Date().toISOString() });
  }

  document.getElementById('add-final').addEventListener('click', addFinal);
  document.getElementById('add-interim').addEventListener('click', addInterim);
  document.getElementById('revise-last').addEventListener('click', reviseLast);
  document.getElementById('reset').addEventListener('click', reset);

  addFinal();
  addFinal();
  addInterim();
  announce('Loaded synthetic events. No network or model was used.');
})();

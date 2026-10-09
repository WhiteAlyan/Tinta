// Historical context: see docs/CODEBASE_NOTES.md#jsambience-js-1-13

export const TRACKS = [
  { id: 'off', label: 'Off' },
  { id: 'rain', label: 'Rain' },
  { id: 'brown-noise', label: 'Brown Noise' },
  { id: 'hum', label: 'Low Hum' },
];

let ctx = null;
// Historical context: see docs/CODEBASE_NOTES.md#jsambience-js-23-27
let graph = null;
let currentTrack = 'off';

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsambience-js-39-43
function makeNoiseBuffer(audioCtx, seconds, colorize) {
  const length = Math.floor(audioCtx.sampleRate * seconds);
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (colorize) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5; // compensate for the integration's volume loss
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

function buildGraph(audioCtx, trackId) {
  const source = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  if (trackId === 'rain') {
    source.buffer = makeNoiseBuffer(audioCtx, 4, false);
    filter.type = 'bandpass';
    filter.frequency.value = 3500;
    filter.Q.value = 0.6;
  } else if (trackId === 'brown-noise') {
    source.buffer = makeNoiseBuffer(audioCtx, 4, true);
    filter.type = 'lowpass';
    filter.frequency.value = 900;
  } else if (trackId === 'hum') {
    source.buffer = makeNoiseBuffer(audioCtx, 4, true);
    filter.type = 'lowpass';
    filter.frequency.value = 220;
  } else {
    return null;
  }

  source.loop = true;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  return { source, filter, gain };
}

// Returns true if it actually started (false if Web Audio isn't available,
// or the browser is blocking autoplay until a user gesture — callers
// should only invoke this from a click handler, which counts as one).
export function start(trackId, volume = 0.4) {
  stop();
  if (trackId === 'off') return false;
  const audioCtx = ensureContext();
  if (!audioCtx) return false;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const built = buildGraph(audioCtx, trackId);
  if (!built) return false;
  built.gain.gain.value = clampVolume(volume);
  built.source.start();
  graph = built;
  currentTrack = trackId;
  return true;
}

export function stop() {
  if (graph) {
    if (graph.filter) {
      // Synthesized track — an AudioBufferSourceNode feeding a filter.
      try {
        graph.source.stop();
      } catch {
        // already stopped — fine
      }
      graph.source.disconnect();
      graph.filter.disconnect();
    } else if (graph.el) {
// Historical context: see docs/CODEBASE_NOTES.md#jsambience-js-121-125
      graph.el.pause();
      graph.el.src = '';
      graph.source.disconnect();
      if (graph.objectUrl) URL.revokeObjectURL(graph.objectUrl);
    }
    graph.gain.disconnect();
    graph = null;
  }
  currentTrack = 'off';
}

// Historical context: see docs/CODEBASE_NOTES.md#jsambience-js-137-142
export async function playCustomTrack(blob, volume = 0.4) {
  stop();
  const audioCtx = ensureContext();
  if (!audioCtx) return false;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const objectUrl = URL.createObjectURL(blob);
  const el = new Audio(objectUrl);
  el.loop = true;

  try {
// Historical context: see docs/CODEBASE_NOTES.md#jsambience-js-154-158
    const source = audioCtx.createMediaElementSource(el);
    const gain = audioCtx.createGain();
    gain.gain.value = clampVolume(volume);
    source.connect(gain).connect(audioCtx.destination);
    await el.play();
    graph = { source, gain, el, objectUrl };
    currentTrack = 'custom';
    return true;
  } catch {
    URL.revokeObjectURL(objectUrl);
    return false;
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsambience-js-173-181
export async function playFromUrl(url, volume = 0.4) {
  stop();
  const audioCtx = ensureContext();
  if (!audioCtx) return false;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const el = new Audio(url);
  el.loop = true;
  el.crossOrigin = 'anonymous'; // needed for createMediaElementSource on a cross-origin URL when the host sends CORS headers; if it doesn't, play() below will reject and this reports false

  try {
    const source = audioCtx.createMediaElementSource(el);
    const gain = audioCtx.createGain();
    gain.gain.value = clampVolume(volume);
    source.connect(gain).connect(audioCtx.destination);
    await el.play();
    graph = { source, gain, el };
    currentTrack = 'custom';
    return true;
  } catch {
    return false;
  }
}

function clampVolume(v) {
  return Math.max(0, Math.min(1, v));
}

export function setVolume(volume) {
  if (graph) graph.gain.gain.value = clampVolume(volume);
}

export function isPlaying() {
  return graph !== null;
}

export function getCurrentTrack() {
  return currentTrack;
}

export function isSupported() {
  return !!(window.AudioContext || window.webkitAudioContext);
}

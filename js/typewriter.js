// Historical context: see docs/CODEBASE_NOTES.md#jstypewriter-js-1-12

export const STYLES = [
  { id: 'classic', label: 'Classic' },
  { id: 'soft', label: 'Soft' },
  { id: 'mechanical', label: 'Mechanical' },
  { id: 'digital', label: 'Digital' },
];

let ctx = null;

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

function clampVolume(v) {
  return Math.max(0, Math.min(1, v));
}

function noiseBurst(audioCtx, duration) {
  const length = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  return source;
}

// Historical context: see docs/CODEBASE_NOTES.md#jstypewriter-js-45-48
export function playClick(volume = 0.5, style = 'classic') {
  const audioCtx = ensureContext();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const v = clampVolume(volume);
  const now = audioCtx.currentTime;

  if (style === 'digital') {
    // A short, dry square-wave blip rather than filtered noise — reads as
    // a keyboard beep, not a mechanical clack.
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1800;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(v * 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.02);
    return;
  }

  const duration = style === 'soft' ? 0.05 : 0.03;
  const source = noiseBurst(audioCtx, duration);
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  if (style === 'soft') {
    // Lowpassed rather than highpassed — a muffled, felt-covered-key
    // sound instead of a sharp click.
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    gain.gain.setValueAtTime(v * 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  } else if (style === 'mechanical') {
    // Bandpassed noise (the "clack") layered with a very short, low sine
    // underneath (the "thunk" of a real typebar/carriage) — two sources
    // through one gain, giving it more heft than a single filtered burst.
    filter.type = 'bandpass';
    filter.frequency.value = 2200;
    filter.Q.value = 1.2;
    gain.gain.setValueAtTime(v * 0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const thunkOsc = audioCtx.createOscillator();
    thunkOsc.type = 'sine';
    thunkOsc.frequency.value = 140;
    const thunkGain = audioCtx.createGain();
    thunkGain.gain.setValueAtTime(v * 0.3, now);
    thunkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    thunkOsc.connect(thunkGain);
    thunkGain.connect(audioCtx.destination);
    thunkOsc.start(now);
    thunkOsc.stop(now + 0.04);
  } else {
    // 'classic' — the original Session 21 sound, unchanged.
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    gain.gain.setValueAtTime(v * 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  }

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  source.start(now);
  source.stop(now + duration);
}

// The "bell" for Enter/new-paragraph — the one place a typewriter sound is
// expected to be a tone rather than a click.
export function playBell(volume = 0.5, style = 'classic') {
  const audioCtx = ensureContext();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const v = clampVolume(volume);
  const now = audioCtx.currentTime;

  if (style === 'soft') {
    // A quieter, lower, longer-decaying tone — no "ding," just a gentle
    // acknowledgment.
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 700;
    const gain = audioCtx.createGain();
    const duration = 0.25;
    gain.gain.setValueAtTime(v * 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
    return;
  }

  if (style === 'mechanical') {
    // The classic typewriter carriage-return "ding" — two close, bright
    // tones in quick succession rather than one sustained sine.
    [1600, 2000].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = audioCtx.createGain();
      const start = now + i * 0.03;
      gain.gain.setValueAtTime(v * 0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
    return;
  }

  if (style === 'digital') {
    // A short two-step upward chirp — a notification-style blip.
    [900, 1400].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const gain = audioCtx.createGain();
      const start = now + i * 0.045;
      gain.gain.setValueAtTime(v * 0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.04);
    });
    return;
  }

  // 'classic' — the original Session 21 bell, unchanged.
  const duration = 0.15;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 1400;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(v * 0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export function isSupported() {
  return !!(window.AudioContext || window.webkitAudioContext);
}

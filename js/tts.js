// Historical context: see docs/CODEBASE_NOTES.md#jstts-js-1-10

let cachedVoices = null;
let currentUtterance = null;

export function isSupported() {
  // P1-6 (companion) — guard `window` itself, not just
  // 'speechSynthesis' in window. modal.js's closeModal() calls
  // isSpeaking() / isPaused() unconditionally on every modal close
  // (including backdrop dismiss, after the P1-6 fix routed that path
  // through closeModal). The Node smoketest environment for
  // modal.smoketest.mjs has no window object, so the original
  // `'speechSynthesis' in window` threw a ReferenceError. In the
  // browser this is a no-op (window always exists); in non-browser
  // contexts it now correctly reports "unsupported" instead of
  // crashing the caller.
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getVoices() {
  if (!isSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length > 0) {
    cachedVoices = existing;
    return Promise.resolve(existing);
  }
  return new Promise((resolve) => {
    const handler = () => {
      const voices = synth.getVoices();
      cachedVoices = voices;
      synth.removeEventListener('voiceschanged', handler);
      resolve(voices);
    };
    synth.addEventListener('voiceschanged', handler);
    // Some browsers never fire the event if there's genuinely nothing to
    // report — don't hang the caller forever waiting on it.
    setTimeout(() => resolve(synth.getVoices()), 1000);
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jstts-js-41-44
export function speak(text, { voiceURI = '', rate = 1, onEnd, onStart } = {}) {
  if (!isSupported()) return false;
  stop();
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  if (voiceURI && cachedVoices) {
    const match = cachedVoices.find((v) => v.voiceURI === voiceURI);
    if (match) utterance.voice = match;
  }
  utterance.onstart = () => onStart?.();
  utterance.onend = () => {
    currentUtterance = null;
    onEnd?.();
  };
  utterance.onerror = () => {
    currentUtterance = null;
    onEnd?.();
  };
  currentUtterance = utterance;
  synth.speak(utterance);
  return true;
}

export function pause() {
  if (isSupported()) window.speechSynthesis.pause();
}

export function resume() {
  if (isSupported()) window.speechSynthesis.resume();
}

export function stop() {
  if (isSupported()) window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function isSpeaking() {
  return isSupported() && window.speechSynthesis.speaking;
}

export function isPaused() {
  return isSupported() && window.speechSynthesis.paused;
}

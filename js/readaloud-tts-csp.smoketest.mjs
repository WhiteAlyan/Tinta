// Tinta — CR-46 / CR-47 / CR-17 quick-wins smoketest.
//
// Pins the three quick wins from the second review session's queue:
//
//   CR-46 — Read Aloud no longer speaks the manuscript's raw syntax.
//           format.js gains stripFormattingTokens() (the one stripper,
//           next to stripImageTokens(), because format.js centralizes the
//           token patterns) and readAloud.js routes TTS text through it
//           before the pronunciation dictionary pass.
//   CR-47 — tts.js getVoices() cleans up BOTH of its exit paths: the old
//           fallback timer resolved the promise but left the
//           voiceschanged handler registered forever (one leaked listener
//           per call that hit the fallback).
//   CR-17 — index.html's CSP now allows https media sources
//           (media-src 'self' blob: https:) — the settings modal has
//           always offered direct https audio URLs that ambience.js
//           played via new Audio(url); the old policy silently blocked
//           them. Plain http stays out, matching connect-src's trust line.
//
// Run with: node readaloud-tts-csp.smoketest.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── tiny test harness (same convention as every other *.smoketest.mjs) ──
let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(title) { console.log(`\n${title}`); }

// ── CR-47 environment: a speechSynthesis stub where voices arrive ONLY
// via the fallback timer (the leak path). Every getVoices() call here
// registers one listener; if the fix regresses, listeners accumulate.
{
  const listeners = new Set();
  globalThis.window = {
    speechSynthesis: {
      getVoices: () => [], // never populates — exercises the fallback path
      addEventListener: (_t, fn) => listeners.add(fn),
      removeEventListener: (_t, fn) => listeners.delete(fn),
      // speak/pause/resume/cancel no-ops — not under test here
      cancel() {}, pause() {}, resume() {},
      get speaking() { return false; }, get paused() { return false; },
    },
    SpeechSynthesisUtterance: class { constructor() {} },
  };
  globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;

  const TTS = await import('./tts.js');
  await TTS.getVoices();
  await TTS.getVoices();
  await TTS.getVoices();
  section('CR-47 — getVoices fallback path leaves no voiceschanged listeners behind');
  assertEqual(listeners.size, 0, 'after three fallback-path getVoices() calls, zero listeners remain registered');

  // Second shape: the event DOES fire — handler must remove itself and
  // clear the timer (no late resolve / no stray timer work). The stub
  // starts with zero voices (forcing the listener path) and populates
  // only when the test fires the event.
  section('CR-47 — event path removes its own handler');
  {
    let fired = false;
    const listeners2 = new Set();
    const synth2 = {
      getVoices: () => (fired ? [{ voiceURI: 'v1', name: 'Voice One' }] : []),
      addEventListener: (_t, fn) => listeners2.add(fn),
      removeEventListener: (_t, fn) => listeners2.delete(fn),
    };
    const savedWindow = globalThis.window;
    globalThis.window = { speechSynthesis: synth2 };
    const pending = TTS.getVoices();
    fired = true; // browser populates voices and fires voiceschanged
    assertEqual(listeners2.size, 1, 'sanity — a handler was registered');
    for (const fn of [...listeners2]) fn();
    const result = await pending;
    globalThis.window = savedWindow;
    assertEqual(result.length, 1, 'event-path resolves with the voices');
    assertEqual(listeners2.size, 0, 'event-path handler removed itself');
  }
}

// ── CR-46 — the stripper itself ──────────────────────────────────────────
{
  const { stripFormattingTokens } = await import('./format.js');
  section('CR-46 — stripFormattingTokens reduces manuscript syntax to speakable text');
  assertEqual(
    stripFormattingTokens('She said **wait** and *then* left.'),
    'She said wait and then left.',
    'bold + italic markers are removed'
  );
  assertEqual(
    stripFormattingTokens('The {{u:sacred}} {{red:blood}} pact.'),
    'The sacred blood pact.',
    'underline + color tokens unwrap to their inner text (color syntax is {{<color>:text}}, matching renderFormattedHtml)'
  );
  assertEqual(
    stripFormattingTokens('First line.\n\n{{img:img_123|right}}\n\nSecond line.'),
    'First line.\n\n\n\nSecond line.',
    'image tokens are deleted outright (nothing to speak)'
  );
  assertEqual(
    stripFormattingTokens('[[Archesmedeus]] entered with [[Nyx]].'),
    'Archesmedeus entered with Nyx.',
    'mention brackets unwrap, entity names remain speakable'
  );
  assertEqual(
    stripFormattingTokens('The {{u:**bold** underline}} case.'),
    'The bold underline case.',
    'nested tokens: brace tokens unwrap first, inner markdown still strips'
  );
  assertEqual(
    stripFormattingTokens('The {{blue:*italic* name}} case.'),
    'The italic name case.',
    'nested tokens: color before italic also composes'
  );
  assertEqual(
    stripFormattingTokens('{{u:unclosed and **unclosed'),
    '{{u:unclosed and **unclosed',
    'unclosed tokens stay literal (same parity as the renderer) — nothing silently disappears mid-edit'
  );
  assertEqual(stripFormattingTokens(''), '', 'empty input stays empty');
  assertEqual(stripFormattingTokens(null), '', 'null-ish input is tolerated');
  assertEqual(
    stripFormattingTokens('Plain prose with 3 words.'),
    'Plain prose with 3 words.',
    'plain prose passes through untouched'
  );

  // Order regression pin: bold-first ordering means * inside ** is never
  // shredded into fragments.
  assertEqual(
    stripFormattingTokens('**strong** then *soft*'),
    'strong then soft',
    'bold-then-italic ordering (matches renderFormattedHtml)'
  );

  // The pronunciation dictionary still applies AFTER stripping (readAloud
  // call order) — pin the composition through Store.applyPronunciations.
  section('CR-46 — readAloud wiring: stripper runs before applyPronunciations');
  {
    const readAloudSrc = fs.readFileSync(path.join(__dirname, 'readAloud.js'), 'utf8');
    assert(
      readAloudSrc.includes('applyPronunciations(stripFormattingTokens(chapter.content))'),
      'readAloud.js hands TTS the stripped text, then the pronunciation pass'
    );
    assert(
      !readAloudSrc.includes('applyPronunciations(chapter.content)'),
      'the old raw-content call site is gone'
    );
    assert(
      readAloudSrc.includes("from './format.js'"),
      'readAloud.js imports the stripper from format.js (single token-syntax home)'
    );
  }
}

// ── CR-17 — the CSP allows https media, still blocks plain http ──────────
{
  section('CR-17 — index.html media-src allowlist');
  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const cspMatch = indexSrc.match(/Content-Security-Policy" content="([^"]+)"/);
  assert(!!cspMatch, 'a CSP meta tag exists');
  const csp = cspMatch ? cspMatch[1] : '';
  assert(
    /media-src[^;]*'self'[^;]*blob:[^;]*https:/.test(csp),
    "media-src includes 'self', blob:, and https: (external ambience URLs can play)"
  );
  assert(
    !/media-src[^;]*\bhttp:[^s]/.test(csp) && !/media-src[^;]*\bhttp:$/.test(csp),
    'media-src does NOT allow plain http (same trust line as connect-src)'
  );
  assert(
    /script-src 'self'/.test(csp) && /object-src 'none'/.test(csp),
    'the widening is scoped to media-src — script/object policy untouched'
  );
  // ambience.playFromUrl remains the URL playback path (the thing the old
  // policy blocked).
  const ambienceSrc = fs.readFileSync(path.join(__dirname, 'ambience.js'), 'utf8');
  assert(
    ambienceSrc.includes('export async function playFromUrl'),
    'ambience.js still exposes playFromUrl (now actually usable under the CSP)'
  );
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('FAILURES:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

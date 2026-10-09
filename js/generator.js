// Historical context: see docs/CODEBASE_NOTES.md#jsgenerator-js-1-50

// ── seeded RNG ───────────────────────────────────────────────────────────

// Historical context: see docs/CODEBASE_NOTES.md#jsgenerator-js-54-57
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsgenerator-js-67-71
function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic `() => number` in [0,1) from any seed value (coerced
 * to a string). The same seed always returns a function that produces
 * the same sequence of draws — that's the entire reproducibility
 * contract this pass adds. */
export function createRng(seed) {
  const seedStr = seed === null || seed === undefined ? '' : String(seed);
  return mulberry32(hashSeed(seedStr));
}

/** A fresh, human-shareable seed string — used when a caller doesn't
 * supply their own. Not itself deterministic (it's seeding the seed),
 * which is correct: "give me something new" and "reproduce what I had"
 * are different requests, and only the second one needs determinism. */
export function randomSeed() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsgenerator-js-100-105
export const CLASSIC_FANTASY_POOL = {
  starts: [
    'Ar','Bel','Cor','Dar','El','Fen','Gal','Hal','Is','Jor','Kel','Lor','Mir','Nor','Or','Pel',
    'Quen','Ral','Sel','Tor','Ul','Vor','Wyn','Yor','Zan','Bri','Cal','Dre','Ery','Fael',
  ],
  mids: ['a','an','en','in','on','ar','or','el','ir','ur','ya','wen','ith','ath','oth','eth','ael'],
  ends: ['th','n','r','s','d','l','k','x','wyn','ric','mir','dor','las','ven','wen','ion','ara','ora'],
};

function pickFrom(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

/** One name from a start/mid/end syllable pool — the mechanism behind
 * CLASSIC_FANTASY_POOL, but generic enough for a future custom pool too
 * (a Culture template could ship its own starts/mids/ends someday and
 * reuse this same function, no engine change needed). */
export function generateFromSyllablePool({ starts, mids, ends, minSyllables = 2, maxSyllables = 3, rng = Math.random } = {}) {
  if (!starts?.length || !mids?.length || !ends?.length) return null;
  const syllables = minSyllables + Math.floor(rng() * (maxSyllables - minSyllables + 1));
  let name = pickFrom(starts, rng);
  for (let i = 1; i < syllables - 1; i++) name += pickFrom(mids, rng);
  name += pickFrom(ends, rng);
  return name;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsgenerator-js-132-145
const FRAGMENT_QUALITIES = [
  'ancient', 'insular', 'expansionist', 'secretive', 'devout', 'mercantile', 'fractured',
  'rigidly hierarchical', 'egalitarian in name only', 'nomadic', 'isolationist', 'militarized',
  'ritual-bound', 'pragmatic', 'superstitious', 'meritocratic on paper', 'deeply traditional',
  'quietly radical', 'outwardly humble', 'openly ambitious',
];
const FRAGMENT_SUBJECTS = [
  'oral traditions', 'bloodline claims', 'trade agreements', 'sacred obligations', 'old grudges',
  'a council of elders', 'a single ruling family', 'guild loyalties', 'seasonal rites',
  'unwritten law', 'a founding myth', 'shared hardship', 'a hard-won peace', 'ancestor veneration',
  'strict apprenticeship', 'communal memory', 'a disputed border', 'inherited debt',
];
const FRAGMENT_QUALIFIERS = [
  'passed down with little room for change', 'guarded more jealously than anyone admits',
  'in constant, quiet flux', 'enforced more by habit than by law', 'contested by a younger generation',
  'held together by necessity as much as belief', 'stricter in word than in practice',
  'the one thing nobody here will compromise on', 'slowly eroding under outside pressure',
  'a source of real pride', 'rarely spoken of to outsiders', 'the first thing a visitor notices',
];

/** One field-agnostic starter phrase — three fragments stitched into a
 * plausible sentence. Not meant to survive unedited; the point is giving
 * a writer something to react to (agree, argue with, or delete) instead
 * of a blank field. Takes `rng` as a plain positional arg, not an options
 * object — this function has exactly one input worth naming, so an
 * object wrapper would be ceremony rather than clarity. */
export function generateDescriptor(rng = Math.random) {
  return `${capitalizeFirst(pickFrom(FRAGMENT_QUALITIES, rng))}, built on ${pickFrom(FRAGMENT_SUBJECTS, rng)}, ${pickFrom(FRAGMENT_QUALIFIERS, rng)}.`;
}

function capitalizeFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}


const DEFAULT_CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
const DEFAULT_VOWELS = 'aeiou';
const DEFAULT_PATTERNS = ['CVCVC', 'CVCCV', 'CVCV', 'VCVCV', 'CVCVCV', 'CVVC'];

function randomChar(str, rng = Math.random) {
  return str[Math.floor(rng() * str.length)];
}

// A single name from a template like "CVCVC" — C → random consonant,
// V → random vowel, anything else (an apostrophe, a hyphen) passes
// through literally, so "CV'CVC" is a valid pattern too.
export function generateFromPattern({ pattern, consonants = DEFAULT_CONSONANTS, vowels = DEFAULT_VOWELS, capitalize = true, rng = Math.random } = {}) {
  if (!pattern) return null;
  const chars = pattern.split('').map((ch) => {
    if (ch === 'C') return randomChar(consonants, rng);
    if (ch === 'V') return randomChar(vowels, rng);
    return ch;
  });
  let name = chars.join('');
  if (capitalize && name) name = name.charAt(0).toUpperCase() + name.slice(1);
  return name;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsgenerator-js-204-215
export function buildMarkovModel(seedWords, order = 2) {
  const START = '\u0000';
  const END = '\u0001';
  const model = new Map();
  (seedWords || []).filter(Boolean).forEach((word) => {
    const w = START.repeat(order) + word.toLowerCase() + END;
    for (let i = order; i < w.length; i++) {
      const context = w.slice(i - order, i);
      const next = w[i];
      if (!model.has(context)) model.set(context, []);
      model.get(context).push(next);
    }
  });
  return { model, order, START, END };
}

// Historical context: see docs/CODEBASE_NOTES.md#jsgenerator-js-232-239
export function generateFromMarkov(markov, { minLength = 3, maxLength = 10, capitalize = true, rng = Math.random } = {}) {
  const { model, order, START, END } = markov;
  let context = START.repeat(order);
  let out = '';
  let guard = 60;
  while (guard-- > 0) {
    const options = model.get(context);
    if (!options || !options.length) break;
    const next = options[Math.floor(rng() * options.length)];
    if (next === END) {
      if (out.length >= minLength) break;
      continue;
    }
    out += next;
    context = (context + next).slice(-order);
    if (out.length >= maxLength) break;
  }
  if (!out) return null;
  return capitalize ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsgenerator-js-261-272
export function generateNames({
  seedWords = [],
  count = 8,
  mode = 'auto',
  pattern = null,
  patterns = DEFAULT_PATTERNS,
  consonants = DEFAULT_CONSONANTS,
  vowels = DEFAULT_VOWELS,
  minLength = 3,
  maxLength = 10,
  capitalize = true,
  exclude = [],
  rng = Math.random,
} = {}) {
  const cleanSeed = (seedWords || []).filter(Boolean);
  const useMarkov = mode === 'markov' || (mode === 'auto' && cleanSeed.length >= 3);
  const excludeSet = new Set((exclude || []).map((n) => (n || '').toLowerCase()));

  let markov = null;
  if (useMarkov) markov = buildMarkovModel(cleanSeed, cleanSeed.length >= 6 ? 2 : 1);

  const patternPool = pattern ? [pattern] : patterns;
  const results = [];
  const seen = new Set();
  let guard = count * 40;
  while (results.length < count && guard-- > 0) {
    const candidate = useMarkov
      ? generateFromMarkov(markov, { minLength, maxLength, capitalize, rng })
      : generateFromPattern({ pattern: patternPool[Math.floor(rng() * patternPool.length)], consonants, vowels, capitalize, rng });
    if (!candidate) continue;
    if (candidate.length < minLength || candidate.length > maxLength) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key) || excludeSet.has(key)) continue;
    seen.add(key);
    results.push(candidate);
  }
  return { names: results, modeUsed: useMarkov ? 'markov' : 'pattern' };
}

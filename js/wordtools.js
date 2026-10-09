// Historical context: see docs/CODEBASE_NOTES.md#jswordtools-js-1-5

// Historical context: see docs/CODEBASE_NOTES.md#jswordtools-js-7-15
import * as Generator from './generator.js';

// Historical context: see docs/CODEBASE_NOTES.md#jswordtools-js-18-21
const STOPWORDS = new Set([
  'a','an','the','and','or','but','so','yet','nor','for','of','in','on','at','to','from','by',
  'with','without','into','onto','over','under','up','down','out','off','about','as','than',
  'that','this','these','those','it','its','it\'s','he','him','his','she','her','hers','they',
  'them','their','theirs','we','us','our','ours','you','your','yours','i','me','my','mine',
  'is','was','were','are','be','been','being','am','do','did','does','doing','have','has','had',
  'having','will','would','shall','should','can','could','may','might','must','not','no','if',
  'then','than','when','while','where','which','who','whom','whose','what','why','how','there',
  'here','all','any','both','each','few','more','most','other','some','such','only','own','same',
  'too','one','also','after','before','again','further','once','because','through',
  'above','below','between','against','during','around'
]);

// Historical context: see docs/CODEBASE_NOTES.md#jswordtools-js-35-38
const CRUTCH_WORDS = new Set([
  'just','really','very','suddenly','somehow','actually','literally','basically','honestly',
  'definitely','absolutely','totally','simply','quite','rather','somewhat','seemed','felt',
  'looked','started','began','almost','nearly','instantly','immediately'
]);

function tokenizeWords(text = '') {
  return (text.toLowerCase().match(/[a-z']+/g) || []).filter((w) => w.length > 1 || w === 'a' || w === 'i');
}

/**
 * Computes word frequency for a chapter's text.
 * Returns { total, entries } where total is the full word count (including
 * stopwords, so the count matches what a writer expects "word count" to
 * mean) and entries is the top `limit` non-stopword words by frequency
 * (default 20), each flagged for whether it's worth a second look.
 */
export function computeWordFrequency(text = '', { limit = 20 } = {}) {
  const words = tokenizeWords(text);
  const total = words.length;

  const counts = new Map();
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }

  const entries = Array.from(counts.entries())
    .map(([word, count]) => {
      const share = total > 0 ? count / total : 0;
      const crutch = CRUTCH_WORDS.has(word);
// Historical context: see docs/CODEBASE_NOTES.md#jswordtools-js-70-73
      const overused = crutch ? count >= 4 && share > 0.003 : count >= 5 && share > 0.012;
      return { word, count, share, crutch, overused };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return { total, entries };
}

// ── name generator ──────────────────────────────────────────────────────
// Simple syllable-recombination generator — not tied to any one culture or
// genre on purpose, so it's equally useful for a fantasy character name or
/** Generates a single name. Exported on its own so a "reroll this one"
 * UI action doesn't need to regenerate (and re-dedupe) a whole batch.
 * Delegates to generator.js's CLASSIC_FANTASY_POOL + generateFromSyllablePool
 * — same pool, same syllable-count range (2 or 3) as before this moved. */
export function generateName() {
  return Generator.generateFromSyllablePool({ ...Generator.CLASSIC_FANTASY_POOL, minSyllables: 2, maxSyllables: 3 });
}

/** Generates `n` names, deduplicated, capped at a sane retry budget. */
export function generateNames(n = 8) {
  const names = new Set();
  let attempts = 0;
  while (names.size < n && attempts < n * 10) {
    names.add(generateName());
    attempts++;
  }
  return Array.from(names);
}

// Historical context: see docs/CODEBASE_NOTES.md#jswordtools-js-105-108
const THESAURUS = {
  said: ['stated', 'replied', 'murmured', 'answered', 'remarked', 'noted'],
  looked: ['gazed', 'glanced', 'stared', 'peered', 'eyed', 'studied'],
  walked: ['strode', 'ambled', 'paced', 'wandered', 'trudged', 'marched'],
  big: ['massive', 'immense', 'sizable', 'vast', 'substantial', 'imposing'],
  small: ['tiny', 'compact', 'slight', 'modest', 'diminutive', 'petite'],
  good: ['fine', 'admirable', 'solid', 'commendable', 'worthy', 'pleasing'],
  bad: ['poor', 'flawed', 'dismal', 'troubling', 'unpleasant', 'grim'],
  happy: ['glad', 'content', 'joyful', 'buoyant', 'elated', 'cheerful'],
  sad: ['sorrowful', 'downcast', 'mournful', 'dejected', 'melancholy', 'forlorn'],
  angry: ['furious', 'irate', 'incensed', 'seething', 'indignant', 'livid'],
  scared: ['afraid', 'frightened', 'terrified', 'uneasy', 'apprehensive', 'shaken'],
  suddenly: ['abruptly', 'without warning', 'in an instant', 'unexpectedly', '(often better cut entirely)'],
  very: ['deeply', 'remarkably', 'notably', 'exceptionally', '(often better cut entirely)'],
  really: ['genuinely', 'truly', 'thoroughly', '(often better cut entirely)'],
  just: ['simply', 'merely', 'only', '(often better cut entirely)'],
  nice: ['pleasant', 'agreeable', 'gracious', 'amiable'],
  beautiful: ['lovely', 'striking', 'radiant', 'exquisite', 'stunning'],
  smiled: ['grinned', 'beamed', 'smirked', 'grinned'],
  felt: ['sensed', 'experienced', 'registered'],
  started: ['began', 'launched into', 'set about'],
};

/** Returns the sorted list of words the thesaurus has entries for —
 * built-in curated words plus any reader-added ones. `customEntries`
 * (word → synonyms[]) is optional and passed in by the caller rather than
 * read from Store directly, keeping this module Store-free like
 * search.js/format.js/diff.js. */
export function thesaurusEntries(customEntries = {}) {
  return Array.from(new Set([...Object.keys(THESAURUS), ...Object.keys(customEntries)])).sort();
}

/** Case-insensitive lookup. `customEntries` (word → synonyms[]), if given,
 * is checked first and shadows a same-named built-in entry entirely rather
 * than merging with it — see Store.addThesaurusEntry's comment for why.
 * Returns an array of synonyms, or null if none. */
export function lookupSynonyms(word = '', customEntries = {}) {
  const key = word.trim().toLowerCase();
  return customEntries[key] || THESAURUS[key] || null;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsvocabulary-js-1-17

// Chapter revision status → display label. Same map, new home; the
// write sidebar's status dots and the drawer's labels both read it.
export const STATUS_LABEL = { draft: 'Draft', revised: 'Revised', final: 'Final' };

// Canonical display order for the chapter status vocabulary — the order
// the status picker cycles and the sidebar legend lists.
export const STATUS_ORDER = ['draft', 'revised', 'final'];

// Historical context: see docs/CODEBASE_NOTES.md#jsvocabulary-js-27-43

import * as Store from './store.js';
import {
  SCENE_REVISION_STATUSES,
  SCENE_INTENSITY_LEVELS,
  SCENE_RELATIONSHIP_TYPES,
  ANNOTATION_TYPES,
} from './store.js';

// 'needs-work' → 'Needs work' — kebab-case values get readable labels.
// First word capitalized only, matching the codebase's stored-label style
// ('Pays off', 'To-do') rather than Title-Casing Every Word.
function humanize(value) {
  const s = String(value || '')
    .split(/[-_ ]+/)
    .filter(Boolean)
    .join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsvocabulary-js-64-68
const DOMAINS = {
  chapterStatus: {
    entries: STATUS_ORDER,
    labels: STATUS_LABEL,
    terminal: ['final'],
    note: 'chapter revision status — draft/revised/final',
  },
  sceneStatus: {
    entries: SCENE_REVISION_STATUSES,
    humanizeLabels: true,
    terminal: ['polished'],
    note: 'scene revision status — needs-work/drafted/revised/polished',
  },
  sceneIntensity: {
    entries: SCENE_INTENSITY_LEVELS,
    humanizeLabels: true,
    note: 'scene intensity — low/building/high/peak',
  },
  canonStatus: {
    entries: Store.getCanonStatuses(),
    labels: { canon: 'Canon', draft: 'Draft', proposed: 'Proposed', alternate: 'Alternate', deprecated: 'Deprecated', 'non-canon': 'Non-canon' },
    terminal: ['deprecated', 'non-canon'],
    note: 'canon authority — canon/draft/proposed/alternate/deprecated/non-canon',
  },
  mapType: {
    entries: Store.getMapTypes(),
    displayReady: true,
    note: 'map scope — World/Regional/City/Dungeon/Interior',
  },
  referenceType: {
    entries: Store.getReferenceTypes(),
    displayReady: true,
    note: 'reference kinds — Note/URL/Quote/Book-Source/Image/Screenshot',
  },
  annotationType: {
    entries: ANNOTATION_TYPES,
    labeled: true,
    note: 'annotation kinds — todo/check/research/rewrite/canon/foreshadow/payoff/continuity',
  },
  sceneRelationshipType: {
    entries: SCENE_RELATIONSHIP_TYPES,
    labeled: true,
    note: 'timeline event relationship kinds',
  },
};

function domainEntry(domain) {
  const d = DOMAINS[domain];
  if (!d) throw new Error(`vocabulary: unknown domain "${domain}"`);
  return d;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsvocabulary-js-121-124
export function vocabularyValues(domain) {
  const d = domainEntry(domain);
  return [...(d.labeled ? d.entries.map((t) => t.key) : d.entries)];
}

// Historical context: see docs/CODEBASE_NOTES.md#jsvocabulary-js-130-135
export function vocabularyLabel(domain, value) {
  const d = domainEntry(domain);
  if (d.labels && d.labels[value]) return d.labels[value];
  if (d.labeled) return d.entries.find((t) => t.key === value)?.label || value;
  if (d.displayReady) return value;
  if (d.humanizeLabels) return humanize(value);
  return value;
}

// Canonical order — same array as values(); named separately so call
// sites read honestly ("give me the ORDER" vs "give me the set"), and so
// a domain could later decouple the two.
export function vocabularyOrder(domain) {
  return vocabularyValues(domain);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsvocabulary-js-152-156
export function vocabularyIsValid(domain, value) {
  return domainEntry(domain).entries.includes(value);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsvocabulary-js-161-165
export function vocabularyIsTerminal(domain, value) {
  const d = domainEntry(domain);
  return Array.isArray(d.terminal) && d.terminal.includes(value);
}

// Introspection for tests/debugging — the domain list with their notes.
export function vocabularyDomains() {
  return Object.keys(DOMAINS).map((k) => ({ key: k, note: DOMAINS[k].note }));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsvocabulary-js-176-189

// Escape for HTML text/attribute interpolation — local copy so this
// module stays import-light (dom-utils re-exports the same logic, but a
// vocabulary module shouldn't drag the render helpers along).
function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function StatusBadgeRender({ domain, value, variant = 'chip', extraClass = '' } = {}) {
  const label = esc(vocabularyLabel(domain, value));
  const safeValue = esc(String(value ?? ''));
  const base = variant === 'dot'
    ? `status-dot dot-${safeValue}`
    : `status-badge badge-${domain}-${safeValue}`;
  const cls = `${base}${extraClass ? ' ' + extraClass : ''}`.replace(/"/g, '');
  return `<span class="${cls}" data-domain="${esc(domain)}" data-value="${safeValue}">${label}</span>`;
}


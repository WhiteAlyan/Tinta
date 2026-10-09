// Historical context: see docs/CODEBASE_NOTES.md#jsgrammar-js-1-26

const REQUEST_TIMEOUT_MS = 15000;

/**
 * Normalizes one LanguageTool API match into Tinta's internal shape.
 */
function normalizeLanguageToolMatch(m, index) {
  return {
    id: `lt_${m.offset}_${m.length}_${index}`,
    message: m.message || 'Possible issue.',
    shortMessage: m.shortMessage && m.shortMessage.trim() ? m.shortMessage : (m.message || 'Possible issue.'),
    offset: m.offset,
    length: m.length,
    category: (m.rule && m.rule.category && m.rule.category.name) || 'General',
    replacements: (m.replacements || []).slice(0, 5).map((r) => r.value).filter(Boolean),
  };
}

/**
 * Normalizes one match from a 'raw' custom backend — tolerant of partial
 * data, since a hand-rolled backend won't necessarily match LT's schema.
 */
function normalizeRawMatch(m, index) {
  return {
    id: m.id || `raw_${m.offset ?? 0}_${m.length ?? 0}_${index}`,
    message: m.message || 'Possible issue.',
    shortMessage: m.shortMessage || m.message || 'Possible issue.',
    offset: typeof m.offset === 'number' ? m.offset : 0,
    length: typeof m.length === 'number' ? m.length : 0,
    category: m.category || 'General',
    replacements: Array.isArray(m.replacements) ? m.replacements.slice(0, 5).map(String) : [],
  };
}

function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { promise: promise(controller.signal), cleanup: () => clearTimeout(timer) };
}

/**
 * Runs a grammar/style check against the configured backend.
 * Always resolves (never rejects) with either:
 *   { ok: true, matches: [...] }
 *   { ok: false, error: 'human-readable message' }
 */
export async function checkText(text = '', settings = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { ok: true, matches: [] };

  if (!settings.enabled) {
    return { ok: false, error: 'Grammar check is turned off in settings.' };
  }
  if (!settings.endpointUrl || !settings.endpointUrl.trim()) {
    return { ok: false, error: 'No grammar check endpoint configured.' };
  }

  const format = settings.responseFormat === 'raw' ? 'raw' : 'languagetool';

  let fetchPromise;
  if (format === 'languagetool') {
    const body = new URLSearchParams();
    body.set('text', text);
    body.set('language', settings.language || 'en-US');
    if (settings.apiKey) body.set('apiKey', settings.apiKey);
    if (settings.username) body.set('username', settings.username);

    fetchPromise = (signal) =>
      fetch(settings.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal,
      });
  } else {
    fetchPromise = (signal) =>
      fetch(settings.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: settings.language || 'en-US' }),
        signal,
      });
  }

  const { promise, cleanup } = withTimeout(fetchPromise, REQUEST_TIMEOUT_MS);

  try {
    const res = await promise;
    cleanup();

    if (!res.ok) {
      return { ok: false, error: `Grammar service responded with an error (HTTP ${res.status}).` };
    }

    const json = await res.json();
    const rawMatches = Array.isArray(json.matches) ? json.matches : [];
    const matches =
      format === 'languagetool'
        ? rawMatches.map(normalizeLanguageToolMatch)
        : rawMatches.map(normalizeRawMatch);

    return { ok: true, matches };
  } catch (err) {
    cleanup();
    if (err && err.name === 'AbortError') {
      return { ok: false, error: 'Grammar check timed out; the service may be unreachable.' };
    }
    return { ok: false, error: 'Could not reach the grammar service. Check your connection or endpoint settings.' };
  }
}

/** Default settings shape, used when nothing has been configured yet. */
export const DEFAULT_GRAMMAR_SETTINGS = {
  enabled: false,
  endpointUrl: 'https://api.languagetool.org/v2/check',
  language: 'en-US',
  apiKey: '',
  username: '',
  responseFormat: 'languagetool',
};

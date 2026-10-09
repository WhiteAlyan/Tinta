// Historical context: see docs/CODEBASE_NOTES.md#jsstore-generators-js-1-25

import * as Generator from './generator.js';
import { now } from './store-core.js';
import {
  createEntity,
  getEntity,
  getEntityList,
  getEntityType,
  getEntityTypes,
  updateEntity,
} from './store-entities.js';
import {
  createRuleSystem,
  createSystemNode,
  getSystemNodeList,
  updateRuleSystem,
} from './store-systems.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-generators-js-44-67
export function generateEntityNames({ mode = 'classic', type = null, count = 8, pattern = null, seed = null, rng = null } = {}) {
  const usedSeed = seed !== null && seed !== undefined ? seed : Generator.randomSeed();
  const actualRng = rng || Generator.createRng(usedSeed);
  const existingNames = getEntityList()
    .filter((e) => !type || e.type === type)
    .flatMap((e) => [e.name, ...(e.aliases || [])])
    .map((n) => (n || '').trim())
    .filter(Boolean);

  if (mode === 'learn') {
    if (existingNames.length < 3) {
      return { names: classicBatch(count, existingNames, actualRng), modeUsed: 'classic', fellBack: true, seed: usedSeed };
    }
    const { names } = Generator.generateNames({ seedWords: existingNames, mode: 'markov', count, exclude: existingNames, rng: actualRng });
    return { names, modeUsed: 'markov', fellBack: false, seed: usedSeed };
  }

  if (mode === 'pattern') {
    const { names } = Generator.generateNames({ mode: 'pattern', pattern, count, exclude: existingNames, rng: actualRng });
    return { names, modeUsed: 'pattern', fellBack: false, seed: usedSeed };
  }

  return { names: classicBatch(count, existingNames, actualRng), modeUsed: 'classic', fellBack: false, seed: usedSeed };
}

function classicBatch(count, exclude, rng = Math.random) {
  const excludeSet = new Set(exclude.map((n) => n.toLowerCase()));
  const names = [];
  const seen = new Set();
  let guard = count * 30;
  while (names.length < count && guard-- > 0) {
    const candidate = Generator.generateFromSyllablePool({ ...Generator.CLASSIC_FANTASY_POOL, minSyllables: 2, maxSyllables: 3, rng });
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key) || excludeSet.has(key)) continue;
    seen.add(key);
    names.push(candidate);
  }
  return names;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-generators-js-109-114
const SEED_WORD_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'with', 'that', 'this', 'from', 'have', 'has',
  'not', 'but', 'was', 'were', 'will', 'can', 'its', 'his', 'her', 'their',
  'they', 'them', 'who', 'what', 'when', 'where', 'how', 'into', 'onto',
  'used', 'use', 'often', 'usually', 'also', 'more', 'most', 'some', 'any',
  'each', 'per', 'these', 'those', 'than', 'then', 'such', 'like', 'being',
]);

export function extractSeedWordsFromEntity(entityId) {
  const entity = getEntity(entityId);
  if (!entity) return [];
  const text = [entity.description, ...Object.values(entity.customFields || {})].filter(Boolean).join(' ');
  const tokens = (text.match(/[A-Za-z][A-Za-z'-]{2,}/g) || [])
    .map((t) => t.toLowerCase())
    .filter((t) => !SEED_WORD_STOPWORDS.has(t));
  return [...new Set(tokens)];
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-generators-js-133-136
export function getLanguageEntities() {
  const languageTypeKeys = new Set(getEntityTypes().filter((t) => /language/i.test(t.label)).map((t) => t.key));
  if (!languageTypeKeys.size) return [];
  return getEntityList().filter((e) => languageTypeKeys.has(e.type));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-generators-js-143-162
export function draftWorldbuildingEntity({ typeKey, languageEntityId = null, seed = null } = {}) {
  const type = getEntityType(typeKey);
  if (!type) return null;
  const usedSeed = seed !== null && seed !== undefined ? seed : Generator.randomSeed();
  const rng = Generator.createRng(usedSeed);
  let names;
  let nameSource = 'project';
  if (languageEntityId) {
    const seedWords = extractSeedWordsFromEntity(languageEntityId);
    if (seedWords.length >= 3) {
      names = Generator.generateNames({ seedWords, mode: 'markov', count: 1, rng }).names;
      nameSource = 'language';
    }
  }
  if (!names || !names.length) {
    const existingOfType = getEntityList().filter((e) => e.type === typeKey);
    const nameMode = existingOfType.length >= 3 ? 'learn' : 'classic';
    names = generateEntityNames({ mode: nameMode, type: typeKey, count: 1, rng }).names;
  }
  const customFields = {};
  (type.fields || []).forEach((f) => {
    customFields[f.key] = Generator.generateDescriptor(rng);
  });
  return { typeKey, typeLabel: type.label, name: names[0] || 'Unnamed', customFields, fields: type.fields || [], nameSource, seed: usedSeed };
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-generators-js-189-193
const GENERATOR_VERSION = 1;

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-generators-js-196-205
function buildGenerationRecord(generatorName, inputs, seed = null) {
  return {
    generatorName,
    generatorVersion: GENERATOR_VERSION,
    inputs,
    seed,
    timestamp: now(),
    parentGenerationId: null, // no "regenerate from a prior generation" feature exists yet to populate this; the field exists so one could without a schema change
    edited: false, // flips true via markGenerationEdited() — see there for why this isn't wired to fire automatically on every store update
  };
}

export function commitWorldbuildingDraft({ typeKey, name, customFields, seed = null }) {
  if (!getEntityType(typeKey)) return null;
  const entity = createEntity({ name, type: typeKey });
  updateEntity(entity.id, {
    customFields,
    canonStatus: 'draft',
    authoritySource: 'Generated proposal',
    generation: buildGenerationRecord('draftWorldbuildingEntity', { typeKey }, seed),
  });
  return getEntity(entity.id);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-generators-js-230-249
export function generateStarterSystem({ name = '', domain = '', tierCount = 3, perTier = 2, seed = null } = {}) {
  const usedSeed = seed !== null && seed !== undefined ? seed : Generator.randomSeed();
  const rng = Generator.createRng(usedSeed);
  const system = createRuleSystem({ name: name || (domain ? `${domain} System` : 'New System'), source: domain });
  updateRuleSystem(system.id, {
    canonStatus: 'draft',
    authoritySource: 'Generated proposal',
    generation: buildGenerationRecord('generateStarterSystem', { domain, tierCount, perTier }, usedSeed),
  });
  const usedNames = [];
  let previousTierIds = [];
  for (let tier = 0; tier < tierCount; tier++) {
    const { names } = Generator.generateNames({ mode: 'pattern', count: perTier, exclude: usedNames, rng });
    const tierIds = [];
    names.forEach((nodeName) => {
      usedNames.push(nodeName);
      const requirement = tier === 0 || !previousTierIds.length
        ? []
        : [previousTierIds[Math.floor(rng() * previousTierIds.length)]];
      const node = createSystemNode({
        systemId: system.id,
        name: nodeName,
        rank: String(tier + 1),
        category: domain,
        effect: Generator.generateDescriptor(rng),
        requirement,
      });
      tierIds.push(node.id);
    });
    previousTierIds = tierIds;
  }
  return { system, nodes: getSystemNodeList(system.id), seed: usedSeed };
}

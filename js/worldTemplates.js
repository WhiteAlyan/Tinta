// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-1-5


// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-8-31
export const WORLDBUILDING_TEMPLATES = [
  {
    label: 'Culture', color: '#8B6F47',
    fields: [
      { key: 'environment', label: 'Environment' },
      { key: 'socialHierarchy', label: 'Social hierarchy' },
      { key: 'customsTaboos', label: 'Customs & taboos' },
      { key: 'artsCuisine', label: 'Arts, dress & cuisine' },
      { key: 'namingConventions', label: 'Naming conventions' },
// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-41-46
      { key: 'festivals', label: 'Festivals & holidays' },
    ],
  },
  {
    label: 'Species', color: '#5B7B5A',
    fields: [
      { key: 'anatomyPhysiology', label: 'Anatomy & physiology' },
      { key: 'lifespanReproduction', label: 'Lifespan & reproduction' },
      { key: 'abilitiesWeaknesses', label: 'Abilities & weaknesses' },
// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-56-62
      { key: 'habitat', label: 'Habitat' },
      { key: 'diet', label: 'Diet' },
// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-65-71
      { key: 'senses', label: 'Senses' },
      { key: 'culturalImplications', label: 'Cultural implications' },
    ],
  },
  {
    label: 'Language', color: '#6B7A8F',
    fields: [
      { key: 'phonologyScript', label: 'Phonology & writing system' },
// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-80-90
      { key: 'phonotactics', label: 'Phonotactics' },
      { key: 'grammarSyntax', label: 'Grammar & syntax' },
// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-93-98
      { key: 'morphology', label: 'Morphology' },
      { key: 'vocabularyNaming', label: 'Vocabulary & naming rules' },
      { key: 'dialects', label: 'Dialects' },
      { key: 'origin', label: 'Origin / proto-language' },
    ],
  },
  {
    label: 'Religion', color: '#9C6B8F',
    fields: [
      { key: 'creationMythDeities', label: 'Creation myth & deities' },
      { key: 'practicesRituals', label: 'Practices & rituals' },
      { key: 'clergyTexts', label: 'Clergy & sacred texts' },
      { key: 'afterlife', label: 'Afterlife' },
      { key: 'taboosVirtues', label: 'Taboos, virtues & sins' },
      // Quick-wins pass (worldbuilding) — same Festivals split as Culture
      // above, same reasoning.
      { key: 'festivals', label: 'Festivals & holy days' },
    ],
  },
// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-118-121
  {
    label: 'Philosophy', color: '#6B5B7A',
    fields: [
      { key: 'axiomsPrinciples', label: 'Core axioms & principles' },
      { key: 'schoolsFactions', label: 'Schools of thought' },
      { key: 'keyThinkers', label: 'Key thinkers / philosophers' },
      { key: 'contradictions', label: 'Internal contradictions & debates' },
      { key: 'culturalEffects', label: 'Cultural & political effects' },
    ],
  },
  {
    label: 'Faction / Government', color: '#8F6B4A',
    fields: [
      { key: 'governmentType', label: 'Government type' },
      { key: 'leadershipSuccession', label: 'Leadership & succession' },
      { key: 'lawsInstitutions', label: 'Laws & institutions' },
      { key: 'territoryAlliances', label: 'Territory & alliances' },
      { key: 'legitimacy', label: 'Legitimacy' },
    ],
  },
  {
    label: 'Economy', color: '#4A7A6B',
    fields: [
      { key: 'resourcesProduction', label: 'Resources & production' },
      { key: 'currencyTrade', label: 'Currency & trade' },
      { key: 'laborScarcity', label: 'Labor & scarcity' },
      { key: 'tradeRoutes', label: 'Trade routes' },
      { key: 'dependencies', label: 'Resource dependencies' },
    ],
  },
// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-152-157
  {
    label: 'Settlement', color: '#B08552',
    fields: [
      { key: 'populationScale', label: 'Population & scale' },
      { key: 'governanceLaw', label: 'Governance & law' },
      { key: 'industryTrade', label: 'Industry & trade' },
      { key: 'defensesThreats', label: 'Defenses & threats' },
      { key: 'notableDistricts', label: 'Notable districts / landmarks' },
    ],
  },
// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-168-181
  {
    label: 'Cosmology', color: '#5A5B8F',
    fields: [
      { key: 'creationModel', label: 'Creation model / cosmic origin' },
      { key: 'planesRealms', label: 'Planes, realms & domains' },
      { key: 'deitiesCosmicBeings', label: 'Gods & cosmic entities' },
      { key: 'soulsAfterlife', label: 'Souls & afterlife' },
      { key: 'timeCausality', label: 'Time & causality' },
      { key: 'cosmicLawsNote', label: 'Fundamental forces & reality laws (summary; model the actual rules in Systems)' },
    ],
  },
];

// Historical context: see docs/CODEBASE_NOTES.md#jsworldtemplates-js-195-198

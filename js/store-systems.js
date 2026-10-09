// Historical context: see docs/CODEBASE_NOTES.md#jsstore-systems-js-1-20

import * as RuleSystem from './ruleSystem.js';
import { backupBeforeDelete, getActiveProject, now, ownGet, save, uid } from './store-core.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-systems-js-25-36

export function getRuleSystemList() {
  const project = getActiveProject();
  return Object.values(project.ruleSystems).sort((a, b) => a.name.localeCompare(b.name));
}

export function getRuleSystem(id) {
  const project = getActiveProject();
  return ownGet(project.ruleSystems, id) || null;
}

export function createRuleSystem({ name, source = '', resource = '', channel = '', restrictions = '', description = '' } = {}) {
  const project = getActiveProject();
  const system = {
    id: uid('rsys'),
    name: (name || 'Untitled system').trim(),
    source, // §23 spec — where the power/mechanic comes from (freeform: "The Ley Lines", "Cybernetic augmentation")
    resource, // what's spent to use it ("Mana", "Stamina", "Nanite reserves")
    channel, // how it's expressed/invoked ("Somatic gestures + incantation")
    restrictions, // freeform global constraints on the whole system
    description,
    // Foundational pass (§31) — same defaults/reasoning as createEntity's
    // canonStatus/generation fields above; generateStarterSystem
    // overwrites both immediately after calling this.
    canonStatus: 'canon',
    // §45 foundational pass — see the AUTHORITY_SOURCES comment above.
    authoritySource: 'Author decision',
    generation: null,
    createdAt: now(),
    updatedAt: now(),
  };
  project.ruleSystems[system.id] = system;
  project.updatedAt = now();
  save();
  return system;
}

export function updateRuleSystem(id, patch) {
  const system = getRuleSystem(id);
  if (!system) return;
  const safePatch = { ...patch };
  delete safePatch.id;
  delete safePatch.createdAt;
  Object.assign(system, safePatch, { updatedAt: now() });
  save();
}

export function deleteRuleSystem(id) {
  const project = getActiveProject();
  const system = ownGet(project.ruleSystems, id);
  if (system) backupBeforeDelete('ruleSystem', id, system, system.name);
  delete project.ruleSystems[id];
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-systems-js-89-93
  Object.values(project.systemNodes)
    .filter((n) => n.systemId === id)
    .forEach((n) => delete project.systemNodes[n.id]);
  save();
}

export function getSystemNodeList(systemId) {
  const project = getActiveProject();
  const nodes = Object.values(project.systemNodes).filter((n) => n.systemId === systemId);
  return RuleSystem.orderByPrerequisite(nodes);
}

export function getSystemNode(id) {
  const project = getActiveProject();
  return ownGet(project.systemNodes, id) || null;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-systems-js-111-118
export function getDependentNodes(nodeId) {
  const project = getActiveProject();
  const node = project.systemNodes[nodeId];
  if (!node) return [];
  return Object.values(project.systemNodes).filter(
    (n) => n.systemId === node.systemId && n.id !== nodeId && Array.isArray(n.requirement) && n.requirement.includes(nodeId)
  );
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-systems-js-128-134
export function createSystemNode({
  systemId,
  name,
  category = '',
  rank = '',
  requirement = [],
  cost = '',
  cooldown = '',
  range = '',
  duration = '',
  effect = '',
  limitation = '',
  counters = '',
  synergy = [],
  evolvesInto = null,
} = {}) {
  if (!systemId || !getRuleSystem(systemId)) return null;
  const project = getActiveProject();
  const node = {
    id: uid('snode'),
    systemId,
    name: (name || 'Untitled').trim(),
    category,
    rank,
    requirement: (requirement || []).filter(Boolean),
    cost,
    cooldown,
    range,
    duration,
    effect,
    limitation,
    counters, // freeform per §23's spec ("what beats this"), not node-id refs — a counter is often a tactic/condition, not always another named ability
    synergy: (synergy || []).filter(Boolean),
    evolvesInto: evolvesInto || null,
    createdAt: now(),
    updatedAt: now(),
  };
  project.systemNodes[node.id] = node;
  project.updatedAt = now();
  save();
  return node;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-systems-js-178-182
export function updateSystemNode(id, patch) {
  const node = getSystemNode(id);
  if (!node) return null;
  const safePatch = { ...patch };
  delete safePatch.id;
  delete safePatch.systemId; // a node doesn't change systems — deleteSystemNode + createSystemNode if that's really the intent
  delete safePatch.createdAt;

  if (safePatch.requirement) {
    const candidate = safePatch.requirement.filter((reqId) => reqId !== id); // silently drop a self-reference rather than rejecting the whole patch over it
    const project = getActiveProject();
    const siblingNodes = Object.values(project.systemNodes).filter((n) => n.systemId === node.systemId);
    if (RuleSystem.wouldCreateCycle(siblingNodes, id, candidate)) return null;
    safePatch.requirement = candidate;
  }
  if (safePatch.synergy) safePatch.synergy = safePatch.synergy.filter(Boolean);
  if (safePatch.evolvesInto === id) return null; // can't evolve into itself

  Object.assign(node, safePatch, { updatedAt: now() });
  save();
  return node;
}

export function deleteSystemNode(id) {
  const project = getActiveProject();
  delete project.systemNodes[id];
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-systems-js-209-212
  Object.values(project.systemNodes).forEach((n) => {
    let touched = false;
    if (n.requirement && n.requirement.includes(id)) {
      n.requirement = n.requirement.filter((r) => r !== id);
      touched = true;
    }
    if (n.synergy && n.synergy.includes(id)) {
      n.synergy = n.synergy.filter((s) => s !== id);
      touched = true;
    }
    if (n.evolvesInto === id) {
      n.evolvesInto = null;
      touched = true;
    }
    if (touched) n.updatedAt = now();
  });
  save();
}

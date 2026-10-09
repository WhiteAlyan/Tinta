// Historical context: see docs/CODEBASE_NOTES.md#jssystemsview-js-1-23

import * as Store from './store.js';
import * as ModalShell from './modal.js';
import { html, raw, toBridge, q, escapeAttr, escapeHtml, capitalize } from './dom-utils.js';
import { activeSystemId, setActiveSystemId } from './context.js';
import { openStarterSystemModal, activeSystemIdFromGenerator, clearActiveSystemIdFromGenerator } from './generatorModal.js';

// 0.2.6 Pass 1 — activeSystemId moved to context.js (import below).

// 0.2.6 Pass 1 — setActiveSystemId moved to context.js (import below).

export function renderSystemsView(project) {
  const panel = document.querySelector('.view-panel[data-view="systems"]');
  const systems = Store.getRuleSystemList();

  // Generator engine, domains pass — same pickup pattern as Notes'
  // activeEntityIdFromGenerator hook.
  if (activeSystemIdFromGenerator) {
    setActiveSystemId(activeSystemIdFromGenerator);
    clearActiveSystemIdFromGenerator();
  }

  if (activeSystemId && !Store.getRuleSystem(activeSystemId)) setActiveSystemId(null); // the active one got deleted elsewhere — fall back to the list rather than rendering a detail view for nothing
  if (activeSystemId) { renderSystemDetail(activeSystemId); return; }

  panel.innerHTML = toBridge(html`
    <div class="health-header">
      <h2>Systems</h2>
      <span class="health-total-note">Magic, skill trees, tech trees, martial arts: anything with rules and prerequisites.</span>
    </div>
    <div class="health-section">
      <div class="entity-type-new-row">
        <input type="text" id="new-system-name" placeholder="New system name (e.g. Elemental Magic, Cyberware)…" />
        <button id="new-system-add-btn" class="add-scene-btn">+ Add system</button>
        <button id="generate-system-btn" class="add-scene-btn generate-entity-btn" title="Generate a starter tiered node tree">🎲 Generate</button>
      </div>
      ${
        systems.length
          ? html`<div class="health-list">${systems.map((s) => {
              const nodeCount = Store.getSystemNodeList(s.id).length;
              return html`
              <button class="health-row systems-row" data-open-system="${s.id}">
                <span class="health-row-label">${s.name}</span>
                <span class="health-row-sub">${nodeCount} node${nodeCount === 1 ? '' : 's'}${s.resource ? html` · ${s.resource}` : ''}</span>
              </button>`;
            })}</div>`
          : html`<p class="empty-state-sm">No systems yet. Add one to start building a magic system, skill tree, or tech tree with real prerequisite chains.</p>`
      }
    </div>
  `);

  q('new-system-add-btn').addEventListener('click', () => {
    const input = q('new-system-name');
    const name = input.value.trim();
    if (!name) return;
    const system = Store.createRuleSystem({ name });
    setActiveSystemId(system.id);
    renderSystemsView(Store.getActiveProject());
  });
  q('new-system-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') q('new-system-add-btn').click(); });

  q('generate-system-btn').addEventListener('click', () => openStarterSystemModal());

  panel.querySelectorAll('[data-open-system]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveSystemId(btn.dataset.openSystem);
      renderSystemsView(Store.getActiveProject());
    });
  });
}

function renderSystemDetail(systemId) {
  const panel = document.querySelector('.view-panel[data-view="systems"]');
  const system = Store.getRuleSystem(systemId);
  if (!system) { setActiveSystemId(null); renderSystemsView(Store.getActiveProject()); return; }
  const nodes = Store.getSystemNodeList(systemId);
  const nodeName = (id) => nodes.find((n) => n.id === id)?.name || null;

  panel.innerHTML = toBridge(html`
    <div class="health-header">
      <button class="wt-menu-item systems-back-btn" id="systems-back-btn">← All systems</button>
    </div>
    <div class="health-section">
      <div class="system-framing-row">
        <input type="text" id="system-name-input" class="chapter-title-input systems-name-input" value="${system.name}" />
        <button id="system-delete-btn" class="library-menu-item library-menu-danger">✕ Delete system</button>
      </div>
      <div class="wt-popover-field system-framing-fields">
        <label>Source<input type="text" id="system-source-input" value="${system.source}" placeholder="Where the power comes from…" /></label>
        <label>Resource<input type="text" id="system-resource-input" value="${system.resource}" placeholder="What's spent to use it…" /></label>
        <label>Channel<input type="text" id="system-channel-input" value="${system.channel}" placeholder="How it's invoked…" /></label>
        <label>Restrictions<input type="text" id="system-restrictions-input" value="${system.restrictions}" placeholder="Global constraints on the whole system…" /></label>
        <label>Canon status
          <select id="system-canon-select">
            ${Store.getCanonStatuses().map((s) => html`<option value="${s}" ${s === system.canonStatus ? raw('selected') : ''}>${capitalize(s)}</option>`)}
          </select>
        </label>
        <label>Authority source
          <select id="system-authority-select">
            ${Store.getAuthoritySources().map((s) => html`<option value="${s}" ${s === system.authoritySource ? raw('selected') : ''}>${s}</option>`)}
          </select>
        </label>
      </div>
      ${
        system.generation
          ? html`<p class="settings-note entity-generation-badge">🎲 Generated by ${system.generation.generatorName}${system.generation.edited ? ' · edited since' : ' · not yet reviewed'}</p>`
          : ''
      }

      <div class="annotations-add-row systems-add-row">
        <button id="add-node-btn" class="toolbar-btn">+ Add node</button>
        <span class="settings-note">A node is a skill, spell, technology, ability: whatever this system's own vocabulary calls it. Ordered by prerequisite below, not creation order.</span>
      </div>

      ${
        nodes.length
          ? html`<div class="annotations-list">${nodes.map(
              (n) => html`
        <div class="annotation-row system-node-row" data-node="${n.id}">
          <label class="annotation-resolve-row system-node-label">
            <span class="annotation-type-tag anno-type-canon">${n.category || 'Node'}</span>
            <span class="annotation-note-text"><strong>${n.name}</strong>${n.rank ? html` <span class="health-row-sub">(${n.rank})</span>` : ''}</span>
          </label>
          ${n.requirement.length ? html`<span class="annotation-scene-tag">requires ${n.requirement.map((id) => nodeName(id) || '?').join(', ')}</span>` : ''}
          <button class="wt-menu-item system-node-edit-btn">Edit</button>
          <button class="annotation-delete-btn" title="Delete">✕</button>
        </div>`
            )}</div>`
          : html`<p class="empty-state-sm">No nodes yet. Add the first skill/spell/technology in this system.</p>`
      }
    </div>
  `);

  q('systems-back-btn').addEventListener('click', () => { setActiveSystemId(null); renderSystemsView(Store.getActiveProject()); });

  q('system-delete-btn').addEventListener('click', async () => {
    if (!(await ModalShell.confirmDialog({ title: 'Delete this system?', message: `Delete "${system.name}" and all ${nodes.length} of its nodes? This can't be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    Store.deleteRuleSystem(system.id);
    setActiveSystemId(null);
    renderSystemsView(Store.getActiveProject());
  });

  const framingField = (inputId, key) => {
    q(inputId).addEventListener('change', (e) => {
      Store.updateRuleSystem(system.id, { [key]: e.target.value });
      Store.markGenerationEdited('ruleSystem', system.id);
    });
  };
  q('system-name-input').addEventListener('change', (e) => {
    const name = e.target.value.trim();
    if (!name) { e.target.value = system.name; return; }
    Store.updateRuleSystem(system.id, { name });
    Store.markGenerationEdited('ruleSystem', system.id);
  });
  framingField('system-source-input', 'source');
  framingField('system-resource-input', 'resource');
  framingField('system-channel-input', 'channel');
  framingField('system-restrictions-input', 'restrictions');
  q('system-canon-select').addEventListener('change', (e) => {
    Store.setCanonStatus('ruleSystem', system.id, e.target.value);
  });
  q('system-authority-select').addEventListener('change', (e) => {
    Store.setAuthoritySource('ruleSystem', system.id, e.target.value);
  });

  q('add-node-btn').addEventListener('click', () => openSystemNodeModal(system.id, null));

  panel.querySelectorAll('.system-node-row').forEach((row) => {
    const nodeId = row.dataset.node;
    row.querySelector('.system-node-edit-btn').addEventListener('click', () => openSystemNodeModal(system.id, nodeId));
    row.querySelector('.annotation-delete-btn').addEventListener('click', async () => {
      const node = Store.getSystemNode(nodeId);
      if (!(await ModalShell.confirmDialog({ title: 'Delete this node?', message: `Delete "${node.name}"? Any node that requires or synergizes with it will have that reference cleared, not broken.`, confirmLabel: 'Delete', danger: true }))) return;
      Store.deleteSystemNode(nodeId);
      renderSystemsView(Store.getActiveProject());
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jssystemsview-js-203-207
function openSystemNodeModal(systemId, nodeId) {
  const node = nodeId ? Store.getSystemNode(nodeId) : null;
  const allOtherNodes = Store.getSystemNodeList(systemId).filter((n) => n.id !== nodeId);

  ModalShell.openModal({
    title: node ? 'Edit node' : 'New node',
    className: 'annotations-modal system-node-modal',
    body: `
        <div class="wt-popover-field system-node-fields">
          <label>Name<input type="text" id="node-name" value="${escapeAttr(node?.name || '')}" placeholder="Firebolt, Optic Implant, Iron Body Technique…" /></label>
          <label>Category<input type="text" id="node-category" value="${escapeAttr(node?.category || '')}" placeholder="Elemental, Cybernetic, Internal…" /></label>
          <label>Rank<input type="text" id="node-rank" value="${escapeAttr(node?.rank || '')}" placeholder="1, Novice, Tier III…" /></label>
          <label>Requires (prerequisites)
            <select id="node-requirement" multiple size="4">
              ${allOtherNodes.map((n) => `<option value="${escapeAttr(n.id)}" ${node?.requirement?.includes(n.id) ? 'selected' : ''}>${escapeHtml(n.name)}</option>`).join('')}
            </select>
          </label>
          <label>Cost<input type="text" id="node-cost" value="${escapeAttr(node?.cost || '')}" placeholder="10 Mana…" /></label>
          <label>Cooldown<input type="text" id="node-cooldown" value="${escapeAttr(node?.cooldown || '')}" /></label>
          <label>Range<input type="text" id="node-range" value="${escapeAttr(node?.range || '')}" /></label>
          <label>Duration<input type="text" id="node-duration" value="${escapeAttr(node?.duration || '')}" /></label>
          <label>Effect<textarea id="node-effect" rows="2">${escapeHtml(node?.effect || '')}</textarea></label>
          <label>Limitation<textarea id="node-limitation" rows="2">${escapeHtml(node?.limitation || '')}</textarea></label>
          <label>Counter (what beats this)<input type="text" id="node-counters" value="${escapeAttr(node?.counters || '')}" /></label>
          <label>Synergizes with
            <select id="node-synergy" multiple size="4">
              ${allOtherNodes.map((n) => `<option value="${escapeAttr(n.id)}" ${node?.synergy?.includes(n.id) ? 'selected' : ''}>${escapeHtml(n.name)}</option>`).join('')}
            </select>
          </label>
          <label>Evolves into
            <select id="node-evolves">
              <option value="">None</option>
              ${allOtherNodes.map((n) => `<option value="${escapeAttr(n.id)}" ${node?.evolvesInto === n.id ? 'selected' : ''}>${escapeHtml(n.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <p class="settings-note system-node-error hidden" id="node-cycle-error">That prerequisite would create a circular dependency (this node would end up requiring itself, indirectly); not saved.</p>
        <div class="annotations-add-row">
          <button id="node-save-btn" class="toolbar-btn">${node ? 'Save' : '+ Create'}</button>
        </div>
    `,
// Historical context: see docs/CODEBASE_NOTES.md#jssystemsview-js-249-252
    onClose: () => renderSystemsView(Store.getActiveProject()),
  });

  q('node-save-btn').addEventListener('click', () => {
    const name = q('node-name').value.trim();
    if (!name) return;
    const selectedIds = (select) => Array.from(select.selectedOptions).map((o) => o.value);
    const payload = {
      name,
      category: q('node-category').value,
      rank: q('node-rank').value,
      requirement: selectedIds(q('node-requirement')),
      cost: q('node-cost').value,
      cooldown: q('node-cooldown').value,
      range: q('node-range').value,
      duration: q('node-duration').value,
      effect: q('node-effect').value,
      limitation: q('node-limitation').value,
      counters: q('node-counters').value,
      synergy: selectedIds(q('node-synergy')),
      evolvesInto: q('node-evolves').value || null,
    };
    if (node) {
      const result = Store.updateSystemNode(node.id, payload);
      if (!result) { q('node-cycle-error').classList.remove('hidden'); return; }
      Store.markGenerationEdited('ruleSystem', systemId);
    } else {
      Store.createSystemNode({ systemId, ...payload });
      Store.markGenerationEdited('ruleSystem', systemId);
    }
    ModalShell.teardown();
  });
}

// Project-switch reset — clears per-view transient state.
import { registerViewReset } from "./viewLifecycle.js";
export function resetSystemsViewState() {
  setActiveSystemId(null);
}
registerViewReset("systems", resetSystemsViewState);


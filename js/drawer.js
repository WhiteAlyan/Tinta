// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-1-21
//
// P2-10 documentation — drawer.js and modal.js implement parallel
// open/close logic for two different overlay concepts. See the
// equivalent header comment at modal.js:1-19 for the full note.
// Briefly: modal.js handles blocking overlays that dim the manuscript
// (Library, Settings, etc.); drawer.js (this file) handles the
// non-blocking inspector that doesn't dim. Both files implement
// outside-click + teardown-with-innerHTML-clear + class-toggle-for-
// "open" patterns independently. A shared DismissableOverlay helper
// would unify them; deferred because both files are large and the
// semantic differences (modal blocks via backdrop; drawer doesn't)
// would need to be preserved, not just dedup'd.

import * as Store from './store.js';
import * as ImageStore from './imagestore.js';
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-25-31
import { html, raw, toBridge, q, escapeHtml, escapeAttr, safeExternalUrl, bindOutsideClick, capitalize } from './dom-utils.js';
import { STATUS_LABEL } from './vocabulary.js';
import { requestRender } from './renderBus.js';
import { setActiveView, setActiveChapterId } from './context.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-37-42
let drawerUrls = [];
function releaseDrawerUrls() {
  drawerUrls.forEach((url) => URL.revokeObjectURL(url));
  drawerUrls = [];
}

let closeTimer = null;

export function closeDrawer() {
  const root = q('drawer-root');
  if (!root) return;
  root.classList.remove('open');
  clearTimeout(closeTimer);
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-56-59
  closeTimer = setTimeout(() => {
    if (!root.classList.contains('open')) root.innerHTML = '';
  }, 250);
  releaseDrawerUrls();
}

function openDrawerShell(bodyHtml) {
  const root = q('drawer-root');
  if (!root) return null;
  clearTimeout(closeTimer);
  releaseDrawerUrls();
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-71-75
  root.innerHTML = toBridge(html`
    <div class="drawer-panel">
      <button id="drawer-close" class="drawer-close" title="Close">✕</button>
      ${bodyHtml}
    </div>
  `);
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-82-85
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  q('drawer-close').addEventListener('click', closeDrawer);
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-88-98
  bindOutsideClick(handleOutsideClick, { capture: true });
  return root;
}

function handleOutsideClick(e) {
  const root = q('drawer-root');
  if (!root || !root.classList.contains('open')) {
    document.removeEventListener('click', handleOutsideClick, { capture: true });
    return;
  }
  if (root.contains(e.target)) return;
  closeDrawer();
  document.removeEventListener('click', handleOutsideClick, { capture: true });
}

// ── entity drawer ───────────────────────────────────────────────────────

export function openEntityDrawer(entityId) {
  const entity = Store.getEntity(entityId);
  if (!entity) return;

  const relationships = Store.getRelationshipsForEntity(entity.id);
  const backlinks = Store.getBacklinksFor(entity.id);
  const portraitId = Store.getEntityPortraitId(entity);

  const type = Store.getEntityType(entity.type);
  const dotClass = type && !type.builtin ? 'canvas-dot-custom' : `canvas-dot-${entity.type}`;
  const colorStyle = type && !type.builtin && type.color ? ` style="--type-color:${escapeAttr(type.color)}"` : '';

  const root = openDrawerShell(html`
    <div class="drawer-header">
      <span class="entity-portrait is-dot ${dotClass}"${raw(colorStyle)} id="drawer-portrait"></span>
      <div>
        <h3 class="drawer-title">${entity.name}</h3>
        <span class="drawer-subtitle">${type ? type.label : capitalize(entity.type)}</span>
      </div>
    </div>

    ${entity.description ? html`<p class="drawer-description">${entity.description}</p>` : html`<p class="empty-note">No description yet.</p>`}

    <div class="drawer-section">
      <h4>Relationships (${relationships.length})</h4>
      ${
        relationships.length
          ? html`<ul class="drawer-list">${relationships.map((r) => {
              const otherId = r.fromId === entity.id ? r.toId : r.fromId;
              const other = Store.getEntity(otherId);
              const label = Store.getRelationshipLabel(r) || 'related to';
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-147-151
              return html`<li class="drawer-list-item drawer-relationship" data-entity-id="${otherId}"><span class="drawer-relationship-text">${label} <strong>${other?.name || 'Unknown'}</strong></span><button type="button" class="drawer-relationship-peek" data-rel-peek="${r.id}">details</button></li>`;
            })}</ul>`
          : html`<p class="empty-note">No relationships recorded yet.</p>`
      }
    </div>

    <div class="drawer-section">
      <h4>Appears in (${backlinks.length})</h4>
      ${
        backlinks.length
          ? html`<ul class="drawer-list">${backlinks.map((bl) => {
              const label = bl.eventId ? html`Timeline → ${bl.eventTitle}` : bl.sceneTitle ? html`${bl.chapterTitle} → ${bl.sceneTitle}` : bl.chapterTitle;
              return html`<li class="drawer-list-item drawer-backlink" data-chapter-id="${bl.chapterId || ''}" data-is-event="${bl.eventId ? '1' : ''}">
                <span class="drawer-backlink-loc">${label}</span>
                <span class="drawer-backlink-snippet">${bl.snippet}</span>
              </li>`;
            })}</ul>`
          : html`<p class="empty-note">Not mentioned anywhere yet. Use <code>[[${entity.name}]]</code> in a chapter to link it here.</p>`
      }
    </div>

    ${entity.imageIds.length ? html`<div class="drawer-section"><h4>Images</h4><div class="drawer-image-grid" id="drawer-image-grid"></div></div>` : ''}

    <button id="drawer-edit-link" class="drawer-edit-link">Open full entry in World →</button>
  `);
  if (!root) return;

  if (portraitId) {
    ImageStore.getObjectUrl(portraitId).then((url) => {
      if (!url || !root.isConnected) return;
      drawerUrls.push(url);
      const el = q('drawer-portrait');
      // .tinta pass — url is an Object URL from ImageStore (same-origin
      // blob:), not user-controlled text, but routing it through html``
      // keeps the assignment consistent with the rest of the file.
      if (el) el.outerHTML = toBridge(html`<img src="${url}" class="entity-portrait" alt="" />`);
    });
  }

  if (entity.imageIds.length) {
    const grid = q('drawer-image-grid');
    // Capped at 6 — this is a quick-reference glance, not the full
    // gallery manager (that's what "Open full entry in World" is for).
    entity.imageIds.slice(0, 6).forEach(async (imageId) => {
      const url = await ImageStore.getObjectUrl(imageId);
      if (!url || !grid?.isConnected) return;
      drawerUrls.push(url);
      const img = document.createElement('img');
      img.src = url;
      img.className = 'drawer-image-thumb';
      img.alt = '';
      grid.appendChild(img);
    });
  }

  root.querySelectorAll('.drawer-relationship').forEach((li) => {
    li.addEventListener('click', () => openEntityDrawer(li.dataset.entityId));
  });
  // Registry pass — peek buttons inside relationship rows; stopPropagation
  // keeps the row's own jump-to-other-entity handler out of the way.
  root.querySelectorAll('[data-rel-peek]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRelationshipDrawer(btn.dataset.relPeek);
    });
  });
  root.querySelectorAll('.drawer-backlink').forEach((li) => {
    li.addEventListener('click', () => {
      closeDrawer();
      if (li.dataset.isEvent) {
        setActiveView('timeline');
      } else {
        setActiveChapterId(li.dataset.chapterId);
        setActiveView('write');
      }
      requestRender();
    });
  });
  q('drawer-edit-link').addEventListener('click', () => {
    closeDrawer();
    setActiveView('notes');
    requestRender();
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-234-238
    q(`.notes-entity-item[data-entity-id="${entity.id}"]`)?.click();
  });
}

// ── scene inspector ─────────────────────────────────────────────────────

export function openSceneInspector(chapterId, sceneId) {
  const chapter = Store.getChapter(chapterId);
  const scene = chapter?.scenes.find((s) => s.id === sceneId);
  if (!chapter || !scene) return;

  const root = openDrawerShell(html`
    <div class="drawer-header">
      <div>
        <h3 class="drawer-title">${scene.title}</h3>
        <span class="drawer-subtitle">${chapter.title}</span>
      </div>
    </div>

    <div class="drawer-scene-fields">
      <label class="drawer-field-label">POV
        <input type="text" id="scene-pov" value="${scene.pov}" placeholder="Whose eyes is this scene through?" />
      </label>
      <label class="drawer-field-label">Location
        <input type="text" id="scene-location" value="${scene.location}" placeholder="Where does this happen?" />
      </label>
      <label class="drawer-field-label">Time
        <input type="text" id="scene-time" value="${scene.time}" placeholder="When: time of day, how long since the last scene…" />
      </label>
      <label class="drawer-field-label">Mood
        <input type="text" id="scene-mood" value="${scene.mood}" placeholder="The emotional temperature of the scene" />
      </label>
      <label class="drawer-field-label">Status
        <select id="scene-status">
          ${Object.entries(STATUS_LABEL).map(([val, lbl]) => html`<option value="${val}" ${scene.status === val ? raw('selected') : ''}>${lbl}</option>`)}
        </select>
      </label>
    </div>

    <div class="drawer-section">
      <h4>Craft details</h4>
      <div class="drawer-scene-fields">
        <label class="drawer-field-label">Obstacle
          <input type="text" id="scene-obstacle" value="${scene.obstacle}" placeholder="What's standing in the way of the goal?" />
        </label>
        <label class="drawer-field-label">Information revealed
          <input type="text" id="scene-info-revealed" value="${scene.infoRevealed}" placeholder="What does the reader learn here?" />
        </label>
        <label class="drawer-field-label">Secrets introduced
          <input type="text" id="scene-secrets" value="${scene.secretsIntroduced}" placeholder="What's kept from other characters, or the reader?" />
        </label>
        <label class="drawer-field-label">Character changes
          <input type="text" id="scene-char-changes" value="${scene.characterChanges}" placeholder="How does someone leave this scene different?" />
        </label>
        <label class="drawer-field-label">Theme / motif
          <input type="text" id="scene-theme" value="${scene.themeMotif}" placeholder="What recurring idea does this scene touch?" />
        </label>
        <label class="drawer-field-label">Symbolism
          <input type="text" id="scene-symbolism" value="${scene.symbolism}" placeholder="Any objects/images doing double duty?" />
        </label>
        <label class="drawer-field-label">Scene intensity
          <select id="scene-intensity">
            <option value="">Unset</option>
            ${Store.SCENE_INTENSITY_LEVELS.map((v) => html`<option value="${v}" ${scene.intensity === v ? raw('selected') : ''}>${capitalize(v)}</option>`)}
          </select>
        </label>
        <label class="drawer-field-label">Revision status
          <select id="scene-revision-status">
            <option value="">Unset</option>
            ${Store.SCENE_REVISION_STATUSES.map((v) => html`<option value="${v}" ${scene.revisionStatus === v ? raw('selected') : ''}>${capitalize(v.replace('-', ' '))}</option>`)}
          </select>
        </label>
        <label class="drawer-field-label">Narrative purpose
          <input type="text" id="scene-narrative-purpose" value="${scene.narrativePurpose}" placeholder="Why does this scene need to exist in the book?" />
        </label>
      </div>
    </div>

    <p class="settings-note">Goal, conflict, and outcome stay on the scene's Corkboard card; this covers what the card doesn't have room for.</p>

    <div class="drawer-section">
      <h4>Scene relationships</h4>
      <div class="drawer-list" id="scene-rel-list"></div>
      <div class="scene-rel-add-row">
        <select id="scene-rel-type">
          ${Store.SCENE_RELATIONSHIP_TYPES.map((t) => html`<option value="${t.key}">${t.label}</option>`)}
        </select>
        <select id="scene-rel-target"></select>
        <button id="scene-rel-add" class="toolbar-btn">+ Add</button>
      </div>
    </div>

    <div class="drawer-section">
      <h4>Story questions</h4>
      <p class="settings-note">What this scene sets up or answers: same collection as the Questions tab, just scoped to here.</p>
      <div class="drawer-list-label">Sets up</div>
      <div class="drawer-list" id="scene-sq-introduced-list"></div>
      <div class="scene-sq-add-row">
        <input type="text" id="scene-sq-new-question" placeholder="A new question this scene raises…" />
        <button id="scene-sq-new-add" class="toolbar-btn">+ Add</button>
      </div>
      <div class="drawer-list-label">Pays off</div>
      <div class="drawer-list" id="scene-sq-payoff-list"></div>
      <div class="scene-sq-add-row">
        <select id="scene-sq-link-select"></select>
        <button id="scene-sq-link-add" class="toolbar-btn">Link as payoff</button>
      </div>
    </div>

    <div class="drawer-section">
      <h4>Annotations</h4>
      <div class="drawer-list" id="scene-anno-list"></div>
      <div class="scene-anno-add-row">
        <select id="scene-anno-type">
          ${Store.ANNOTATION_TYPES.map((t) => html`<option value="${t.key}">${t.label}</option>`)}
        </select>
        <input type="text" id="scene-anno-note" placeholder="What needs attention in this scene?" />
        <button id="scene-anno-add" class="toolbar-btn">+ Add</button>
      </div>
    </div>

    <button id="drawer-open-corkboard" class="drawer-edit-link">Open on Corkboard →</button>
  `);
  if (!root) return;

  renderSceneRelationships(chapterId, sceneId);
  renderSceneStoryQuestions(sceneId);
  renderSceneAnnotations(sceneId);

  const bindField = (id, field) => {
    q(id).addEventListener('input', (e) => {
      Store.updateScene(chapterId, sceneId, { [field]: e.target.value });
    });
  };
  bindField('scene-pov', 'pov');
  bindField('scene-location', 'location');
  bindField('scene-time', 'time');
  bindField('scene-mood', 'mood');
  q('scene-status').addEventListener('change', (e) => {
    Store.updateScene(chapterId, sceneId, { status: e.target.value });
  });
  bindField('scene-obstacle', 'obstacle');
  bindField('scene-info-revealed', 'infoRevealed');
  bindField('scene-secrets', 'secretsIntroduced');
  bindField('scene-char-changes', 'characterChanges');
  bindField('scene-theme', 'themeMotif');
  bindField('scene-symbolism', 'symbolism');
  bindField('scene-narrative-purpose', 'narrativePurpose');
  q('scene-intensity').addEventListener('change', (e) => {
    Store.updateScene(chapterId, sceneId, { intensity: e.target.value });
  });
  q('scene-revision-status').addEventListener('change', (e) => {
    Store.updateScene(chapterId, sceneId, { revisionStatus: e.target.value });
  });

  q('scene-rel-add').addEventListener('click', () => {
    const toSceneId = q('scene-rel-target').value;
    if (!toSceneId) return;
    Store.createSceneRelationship({ fromSceneId: sceneId, toSceneId, type: q('scene-rel-type').value });
    renderSceneRelationships(chapterId, sceneId);
  });

  q('scene-anno-add').addEventListener('click', () => {
    const note = q('scene-anno-note').value;
    if (!note.trim()) return;
    Store.createAnnotation({ chapterId, sceneId, type: q('scene-anno-type').value, note });
    q('scene-anno-note').value = '';
    renderSceneAnnotations(sceneId);
  });
  q('scene-anno-note').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') q('scene-anno-add').click();
  });

  q('scene-sq-new-add').addEventListener('click', () => {
    const text = q('scene-sq-new-question').value;
    if (!text.trim()) return;
    Store.createStoryQuestion({ question: text, introducedSceneId: sceneId });
    q('scene-sq-new-question').value = '';
    renderSceneStoryQuestions(sceneId);
  });
  q('scene-sq-new-question').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') q('scene-sq-new-add').click();
  });
  q('scene-sq-link-add').addEventListener('click', () => {
    const id = q('scene-sq-link-select').value;
    if (!id) return;
    Store.setStoryQuestionScene(id, 'payoffSceneId', sceneId);
    renderSceneStoryQuestions(sceneId);
  });

  q('drawer-open-corkboard').addEventListener('click', () => {
    closeDrawer();
    setActiveChapterId(chapterId);
    setActiveView('corkboard');
    requestRender();
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-437-440
function renderSceneRelationships(chapterId, sceneId) {
  const listEl = q('scene-rel-list');
  const targetSelect = q('scene-rel-target');
  if (!listEl || !targetSelect) return;

  const rels = Store.getSceneRelationshipsForScene(sceneId);
  const allScenes = Store.getAllScenesFlat();
  const sceneLabel = (sid) => {
    const s = allScenes.find((sc) => sc.id === sid);
    return s ? `${s.chapterTitle} → ${s.title}` : 'Unknown scene';
  };

  listEl.innerHTML = toBridge(
    rels.length
      ? html`<div>${rels.map((r) => {
          const isFrom = r.fromSceneId === sceneId;
          const otherId = isFrom ? r.toSceneId : r.fromSceneId;
          const verb = isFrom ? Store.getSceneRelationshipTypeLabel(r.type) : `${Store.getSceneRelationshipTypeLabel(r.type)} (reverse)`;
          return html`<div class="drawer-list-item scene-rel-item" data-rel="${r.id}">
            <span>${verb} <strong>${sceneLabel(otherId)}</strong></span>
            <button class="scene-rel-remove" title="Remove">✕</button>
          </div>`;
        })}</div>`
      : html`<p class="empty-note">No scene relationships yet.</p>`
  );

  listEl.querySelectorAll('.scene-rel-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      Store.deleteSceneRelationship(btn.closest('.scene-rel-item').dataset.rel);
      renderSceneRelationships(chapterId, sceneId);
    });
  });

  const otherScenes = allScenes.filter((s) => s.id !== sceneId);
  targetSelect.innerHTML = toBridge(
    otherScenes.length
      ? html`<option>${otherScenes.map((s) => html`<option value="${s.id}">${s.chapterTitle} → ${s.title}</option>`)}</option>`
      : html`<option value="">No other scenes yet</option>`
  );
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-482-485
function renderSceneAnnotations(sceneId) {
  const list = q('scene-anno-list');
  if (!list) return;
  const items = Store.getAnnotationsForScene(sceneId);

  list.innerHTML = toBridge(
    items.length
      ? html`<div>${items.map((a) => html`<div class="drawer-list-item scene-anno-item" data-anno="${a.id}">
            <label class="scene-anno-resolve-row">
              <input type="checkbox" class="scene-anno-resolve-check" ${a.resolved ? raw('checked') : ''} />
              <span class="annotation-type-tag anno-type-${a.type}">${Store.getAnnotationTypeLabel(a.type)}</span>
              <span>${a.note || html`<span class="empty-state-sm">(no note)</span>`}</span>
            </label>
            <button class="scene-anno-remove" title="Remove">✕</button>
          </div>`)}</div>`
      : html`<p class="empty-note">Nothing flagged in this scene yet.</p>`
  );

  list.querySelectorAll('.scene-anno-item').forEach((el) => {
    const id = el.dataset.anno;
    el.querySelector('.scene-anno-resolve-check').addEventListener('change', (e) => {
      Store.updateAnnotation(id, { resolved: e.target.checked });
      renderSceneAnnotations(sceneId);
    });
    el.querySelector('.scene-anno-remove').addEventListener('click', () => {
      Store.deleteAnnotation(id);
      renderSceneAnnotations(sceneId);
    });
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-517-523
function renderSceneStoryQuestions(sceneId) {
  const introducedList = q('scene-sq-introduced-list');
  const payoffList = q('scene-sq-payoff-list');
  const linkSelect = q('scene-sq-link-select');
  if (!introducedList || !payoffList || !linkSelect) return;

  const { introduced, payoffs } = Store.getStoryQuestionsForScene(sceneId);

  const renderRow = (question, role) => html`<div class="drawer-list-item scene-sq-item" data-question="${question.id}" data-role="${role}">
    <span>${question.question}${question.resolved ? html` <span class="entity-status-item-badge">resolved</span>` : ''}</span>
    <button class="scene-sq-unlink" title="Unlink from this scene">✕</button>
  </div>`;

  introducedList.innerHTML = toBridge(
    introduced.length
      ? html`<div>${introduced.map((qq) => renderRow(qq, 'introducedSceneId'))}</div>`
      : html`<p class="empty-note">Nothing set up in this scene yet.</p>`
  );
  payoffList.innerHTML = toBridge(
    payoffs.length
      ? html`<div>${payoffs.map((qq) => renderRow(qq, 'payoffSceneId'))}</div>`
      : html`<p class="empty-note">Nothing paid off in this scene yet.</p>`
  );

  [introducedList, payoffList].forEach((listEl) => {
    listEl.querySelectorAll('.scene-sq-unlink').forEach((btn) => {
      const row = btn.closest('.scene-sq-item');
      btn.addEventListener('click', () => {
        Store.setStoryQuestionScene(row.dataset.question, row.dataset.role, null);
        renderSceneStoryQuestions(sceneId);
      });
    });
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-558-562
  const linkable = Store.getStoryQuestionList().filter((qq) => qq.payoffSceneId !== sceneId);
  linkSelect.innerHTML = toBridge(
    linkable.length
      ? html`<option>${linkable.map((qq) => html`<option value="${qq.id}">${qq.question}</option>`)}</option>`
      : html`<option value="">No open questions to link yet</option>`
  );
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-571-600

// Renders one label/value row in a drawer's meta block.
//
// SECURITY: this used to funnel every value through raw(), which meant any
// ordinary string handed to it became live markup. Rule-node metadata
// (Category/Rank/Cost/…) is plain project data, and project data arrives
// from .tinta imports — so a stored value like `<img src=x onerror=…>`
// executed the moment the drawer opened. The fix is to interpolate the
// value through html`` and let the tagged template decide: SafeHtml (built
// by a caller's own html`` literal) passes through verbatim, arrays of
// SafeHtml are joined, and anything else is escaped as text. raw() is now
// only ever called at audited trust boundaries, never here.
//
// Interpolating instead of hand-joining also fixes the Tags row: an array
// of SafeHtml chips used to stringify to "[object Object],[object Object]"
// because the old `'value' in valueHtml` check didn't match arrays.
//
// Callers must therefore pass RAW values, not escapeHtml()'d ones —
// pre-escaping now double-escapes ("&" would render as "&amp;").
function metaRow(label, value) {
  if (!value) return '';
  return html`<div class="drawer-meta-row"><span class="drawer-meta-label">${label}</span><span class="drawer-meta-value">${value}</span></div>`;
}

function renderClickableMentions(text = '') {
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-620-625
  const escaped = escapeHtml(text);
  const withMentions = escaped.replace(Store.MENTION_RE, (whole, name) => {
    const trimmed = name.trim();
    // The button's data-entity-name is an attribute, so escapeAttr the
    // trimmed name. The button's inner text is the trimmed name too,
    // already escaped by the surrounding escapeHtml call.
    return `<button type="button" class="drawer-mention" data-entity-name="${escapeAttr(trimmed)}">${escapeHtml(trimmed)}</button>`;
  });
  return raw(withMentions);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-637-640
function resolveEntityByName(name) {
  return Store.findEntityByName(name);
}

// ── reference drawer ────────────────────────────────────────────────────

export function openReferenceDrawer(referenceId) {
  const ref = Store.getReference(referenceId);
  if (!ref) return;

  const linkedEntity = ref.entityId ? Store.getEntity(ref.entityId) : null;
  const linkedChapter = ref.chapterId ? Store.getChapter(ref.chapterId) : null;
  const linkedScene = (() => {
    if (!ref.sceneId) return null;
    for (const ch of Store.getActiveProject().chapters) {
      const s = ch.scenes.find((sc) => sc.id === ref.sceneId);
      if (s) return { scene: s, chapter: ch };
    }
    return null;
  })();

  const tags = (ref.tags || []).filter(Boolean);
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-663-670
  const safeUrl = safeExternalUrl(ref.url);
  const urlAsLink = ref.url
    ? (safeUrl
      ? html`<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="drawer-link-out">${safeUrl}</a>`
      : html`<span class="drawer-url-plain">${ref.url}</span>`)
    : '';

  const root = openDrawerShell(html`
    <div class="drawer-header">
      <div>
        <h3 class="drawer-title">${ref.title}</h3>
        <span class="drawer-subtitle"><span class="reference-type-tag">${ref.refType}</span></span>
      </div>
    </div>

    ${ref.content ? html`<p class="drawer-description">${ref.content}</p>` : html`<p class="empty-note">No content captured, just a link or reference pointer.</p>`}

    ${ref.annotation ? html`<p class="drawer-annotation-note">${ref.annotation}</p>` : ''}

    <div class="drawer-meta-block">
      ${metaRow('Source', ref.source)}
      ${metaRow('URL', urlAsLink)}
      ${tags.length ? metaRow('Tags', tags.map((t) => html`<span class="drawer-tag-chip">${t}</span>`)) : ''}
    </div>

    <div class="drawer-section">
      <h4>Linked to</h4>
      ${
        linkedEntity || linkedChapter || linkedScene
          ? html`<ul class="drawer-list">
              ${linkedEntity ? html`<li class="drawer-list-item drawer-link-row" data-link-kind="entity" data-link-id="${linkedEntity.id}"><strong>${linkedEntity.name}</strong> <span class="drawer-link-sub">${capitalize(linkedEntity.type)}</span></li>` : ''}
              ${linkedChapter ? html`<li class="drawer-list-item drawer-link-row" data-link-kind="chapter" data-link-id="${linkedChapter.id}"><strong>${linkedChapter.title}</strong> <span class="drawer-link-sub">Chapter</span></li>` : ''}
              ${linkedScene ? html`<li class="drawer-list-item drawer-link-row" data-link-kind="scene" data-link-chapter="${linkedScene.chapter.id}" data-link-id="${linkedScene.scene.id}"><strong>${linkedScene.scene.title}</strong> <span class="drawer-link-sub">${linkedScene.chapter.title} → Scene</span></li>` : ''}
            </ul>`
          : html`<p class="empty-note">Not linked to an entity, chapter, or scene yet.</p>`
      }
    </div>

    <button id="drawer-open-full" class="drawer-edit-link">Open in References view →</button>
  `);
  if (!root) return;

  root.querySelectorAll('.drawer-link-row').forEach((li) => {
    li.addEventListener('click', () => {
      const kind = li.dataset.linkKind;
      const id = li.dataset.linkId;
      if (kind === 'entity') {
        openEntityDrawer(id);
      } else if (kind === 'chapter') {
        closeDrawer();
        setActiveChapterId(id);
        setActiveView('write');
        requestRender();
      } else if (kind === 'scene') {
        openSceneInspector(li.dataset.linkChapter, id);
      }
    });
  });

  q('drawer-open-full').addEventListener('click', () => {
    closeDrawer();
    setActiveView('references');
    requestRender();
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-734-738
    const row = document.querySelector(`.view-panel[data-view="references"] [data-reference-id="${ref.id}"]`);
    if (row) row.click();
  });
}

// ── rule-system node drawer ────────────────────────────────────────────

export function openRuleNodeDrawer(systemId, nodeId) {
  const system = Store.getRuleSystem(systemId);
  const node = Store.getSystemNode(nodeId);
  if (!system || !node || node.systemId !== systemId) return;

  const allNodes = Store.getSystemNodeList(systemId);
  const nodeNameById = (id) => allNodes.find((n) => n.id === id)?.name || null;
  const requirementNodes = (node.requirement || []).map((id) => ({ id, name: nodeNameById(id) })).filter((n) => n.name);
  const dependentNodes = Store.getDependentNodes(nodeId);
  const synergyNodes = (node.synergy || []).map((id) => ({ id, name: nodeNameById(id) })).filter((n) => n.name);
  const evolvesIntoNode = node.evolvesInto ? { id: node.evolvesInto, name: nodeNameById(node.evolvesInto) } : null;

  const metaItems = [
    ['Category', node.category],
    ['Rank', node.rank],
    ['Cost', node.cost],
    ['Cooldown', node.cooldown],
    ['Range', node.range],
    ['Duration', node.duration],
    ['Limitation', node.limitation],
    ['Counters', node.counters],
  ].filter(([, v]) => v);

  const root = openDrawerShell(html`
    <div class="drawer-header">
      <div>
        <h3 class="drawer-title">${node.name}</h3>
        <span class="drawer-subtitle">${system.name}${node.rank ? ` · ${node.rank}` : ''}</span>
      </div>
    </div>

    ${system.canonStatus ? html`<span class="annotation-type-tag anno-type-canon drawer-canon-badge">canon: ${system.canonStatus}</span>` : ''}
    ${system.generation ? html`<p class="settings-note entity-generation-badge">🎲 Generated${system.generation.edited ? ' · edited since' : ' · not yet reviewed'}</p>` : ''}

    ${node.effect ? html`<p class="drawer-description">${node.effect}</p>` : html`<p class="empty-note">No effect description yet.</p>`}

    ${metaItems.length ? html`<div class="drawer-meta-block">${metaItems.map(([label, value]) => metaRow(label, value))}</div>` : ''}

    <div class="drawer-section">
      <h4>Requires (${requirementNodes.length})</h4>
      ${
        requirementNodes.length
          ? html`<ul class="drawer-list">${requirementNodes.map((n) => html`<li class="drawer-list-item drawer-node-link" data-node-id="${n.id}">${n.name}</li>`)}</ul>`
          : html`<p class="empty-note">No prerequisites; this is a root node.</p>`
      }
    </div>

    <div class="drawer-section">
      <h4>Required by (${dependentNodes.length})</h4>
      ${
        dependentNodes.length
          ? html`<ul class="drawer-list">${dependentNodes.map((n) => html`<li class="drawer-list-item drawer-node-link" data-node-id="${n.id}">${n.name}</li>`)}</ul>`
          : html`<p class="empty-note">Nothing depends on this node yet.</p>`
      }
    </div>

    ${synergyNodes.length ? html`<div class="drawer-section"><h4>Synergy</h4><ul class="drawer-list">${synergyNodes.map((n) => html`<li class="drawer-list-item drawer-node-link" data-node-id="${n.id}">${n.name}</li>`)}</ul></div>` : ''}

    ${evolvesIntoNode ? html`<div class="drawer-section"><h4>Evolves into</h4><ul class="drawer-list"><li class="drawer-list-item drawer-node-link" data-node-id="${evolvesIntoNode.id}">${evolvesIntoNode.name}</li></ul></div>` : ''}

    <button id="drawer-open-full" class="drawer-edit-link">Open in Systems view →</button>
  `);
  if (!root) return;

  root.querySelectorAll('.drawer-node-link').forEach((li) => {
    li.addEventListener('click', () => {
      const targetId = li.dataset.nodeId;
      const target = Store.getSystemNode(targetId);
      if (target) openRuleNodeDrawer(target.systemId, target.id);
    });
  });

  q('drawer-open-full').addEventListener('click', () => {
    closeDrawer();
// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-820-824
    setActiveView('systems');
    requestRender();
    const row = document.querySelector(`.view-panel[data-view="systems"] [data-open-system="${systemId}"]`);
    if (row) row.click();
  });
}

// ── map marker drawer ───────────────────────────────────────────────────

export function openMapMarkerDrawer(mapId, markerId) {
  const map = Store.getMap(mapId);
  const marker = Store.getMarker(mapId, markerId);
  if (!map || !marker) return;

  const linkedEntity = marker.entityId ? Store.getEntity(marker.entityId) : null;
  const linkedMap = marker.linkedMapId ? Store.getMap(marker.linkedMapId) : null;

  const root = openDrawerShell(html`
    <div class="drawer-header">
      <div>
        <h3 class="drawer-title">${marker.label}</h3>
        <span class="drawer-subtitle">${map.name} · ${map.mapType}</span>
      </div>
    </div>

    <div class="drawer-meta-block">
      ${metaRow('Position', `${Math.round(marker.x * 100)}%, ${Math.round(marker.y * 100)}%`)}
      ${metaRow('Linked entity', linkedEntity ? html`<button type="button" class="drawer-link-button" data-entity-id="${linkedEntity.id}">${linkedEntity.name}</button>` : '')}
      ${metaRow('Drills into', linkedMap ? html`<button type="button" class="drawer-link-button" data-map-id="${linkedMap.id}">${linkedMap.name}</button>` : '')}
    </div>

    ${marker.note ? html`<p class="drawer-description">${marker.note}</p>` : html`<p class="empty-note">No notes on this marker yet.</p>`}

    <button id="drawer-open-full" class="drawer-edit-link">Open in Map view →</button>
  `);
  if (!root) return;

  root.querySelectorAll('[data-entity-id]').forEach((btn) => {
    btn.addEventListener('click', () => openEntityDrawer(btn.dataset.entityId));
  });
  root.querySelectorAll('[data-map-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetMapId = btn.dataset.mapId;
      closeDrawer();
      setActiveView('map');
      requestRender();
      const row = document.querySelector(`.view-panel[data-view="map"] [data-map-id="${targetMapId}"]`);
      if (row) row.click();
    });
  });

  q('drawer-open-full').addEventListener('click', () => {
    closeDrawer();
    setActiveView('map');
    requestRender();
    // Map view's list rows carry data-map-id (wired in the Navigation/
    // Context pass — see renderMapView). Clicking it sets activeMapId.
    const row = document.querySelector(`.view-panel[data-view="map"] [data-map-id="${mapId}"]`);
    if (row) row.click();
    // Marker selection — the pin is the click target once the map renders.
    // The pin's title attribute is the marker.label.
    setTimeout(() => {
      const pin = document.querySelector(`.view-panel[data-view="map"] .map-pin[title="${CSS.escape(marker.label)}"]`);
      if (pin) pin.click();
    }, 200);
  });
}

// ── timeline event drawer ──────────────────────────────────────────────

export function openTimelineEventDrawer(eventId) {
  const event = Store.getTimelineEvent(eventId);
  if (!event) return;

  const linkedChapter = event.chapterId ? Store.getChapter(event.chapterId) : null;
  const mentionedNames = Store.extractMentions(event.description || '').map((m) => m.name.trim()).filter(Boolean);
  // De-dupe by lowercased name — extractMentions returns one entry per
  // occurrence, and the same name mentioned twice in a description
  // shouldn't list twice in the drawer.
  const seen = new Set();
  const mentionedEntities = mentionedNames
    .map((name) => ({ name, entity: resolveEntityByName(name) }))
    .filter((m) => {
      const k = m.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const root = openDrawerShell(html`
    <div class="drawer-header">
      <div>
        <h3 class="drawer-title">${event.title}</h3>
        <span class="drawer-subtitle">${event.storyDate ? event.storyDate : 'No story date set'}</span>
      </div>
    </div>

    ${event.description ? html`<p class="drawer-description">${renderClickableMentions(event.description)}</p>` : html`<p class="empty-note">No description written yet.</p>`}

    <div class="drawer-meta-block">
      ${metaRow('Linked chapter', linkedChapter ? html`<button type="button" class="drawer-link-button" data-chapter-id="${linkedChapter.id}">${linkedChapter.title}</button>` : '')}
    </div>

    ${mentionedEntities.length ? html`<div class="drawer-section"><h4>Mentioned (${mentionedEntities.length})</h4><ul class="drawer-list">${mentionedEntities.map((m) => html`<li class="drawer-list-item drawer-mention-row ${m.entity ? 'is-resolved' : 'is-unresolved'}" data-entity-name="${m.name}">${m.name}${m.entity ? html` <span class="drawer-link-sub">${capitalize(m.entity.type)}</span>` : html` <span class="drawer-link-sub">not created yet</span>`}</li>`)}</ul></div>` : ''}

    <button id="drawer-open-full" class="drawer-edit-link">Open in Timeline view →</button>
  `);
  if (!root) return;

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-934-937
  root.querySelectorAll('.drawer-mention').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entity = resolveEntityByName(btn.dataset.entityName);
      if (entity) openEntityDrawer(entity.id);
    });
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-945-948
  root.querySelectorAll('.drawer-mention-row.is-resolved').forEach((li) => {
    li.addEventListener('click', () => {
      const entity = resolveEntityByName(li.dataset.entityName);
      if (entity) openEntityDrawer(entity.id);
    });
  });

  root.querySelectorAll('[data-chapter-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeDrawer();
      setActiveChapterId(btn.dataset.chapterId);
      setActiveView('write');
      requestRender();
    });
  });

  q('drawer-open-full').addEventListener('click', () => {
    closeDrawer();
    setActiveView('timeline');
    requestRender();
    // Timeline events render with data-event="<id>" — flash-and-scroll
    // is what the search-result jump used to do, reuse the same path.
    const card = document.querySelector(`.view-panel[data-view="timeline"] .timeline-event[data-event="${eventId}"] .timeline-event-card`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('flash-highlight');
      setTimeout(() => card.classList.remove('flash-highlight'), 1600);
    }
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-980-987
export function openAnnotationDrawer(annotationId) {
  const annotation = Store.getAnnotation(annotationId);
  if (!annotation) return;

  const linkedChapter = annotation.chapterId ? Store.getChapter(annotation.chapterId) : null;
  const linkedScene = linkedChapter && annotation.sceneId
    ? (linkedChapter.scenes || []).find((s) => s.id === annotation.sceneId)
    : null;

  const root = openDrawerShell(html`
    <div class="drawer-header">
      <div>
        <h3 class="drawer-title">${Store.getAnnotationTypeLabel(annotation.type)}</h3>
        <span class="drawer-subtitle">${annotation.resolved ? 'Resolved' : 'Open'}</span>
      </div>
    </div>

    ${annotation.note ? html`<p class="drawer-description">${annotation.note}</p>` : html`<p class="empty-note">No note written yet.</p>`}

    <div class="drawer-meta-block">
      ${metaRow('Linked chapter', linkedChapter ? html`<button type="button" class="drawer-link-button" data-chapter-id="${linkedChapter.id}">${linkedChapter.title}</button>` : 'None')}
      ${linkedScene ? metaRow('Linked scene', linkedScene.title || 'Untitled scene') : ''}
    </div>

    <label class="drawer-resolve-toggle">
      <input type="checkbox" id="drawer-annotation-resolve" ${annotation.resolved ? 'checked' : ''} />
      Mark resolved
    </label>

    <button id="drawer-open-full" class="drawer-edit-link">Open in Annotations view →</button>
  `);
  if (!root) return;

  root.querySelectorAll('[data-chapter-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeDrawer();
      setActiveChapterId(btn.dataset.chapterId);
      setActiveView('write');
      requestRender();
    });
  });

  q('drawer-annotation-resolve').addEventListener('change', (e) => {
    Store.updateAnnotation(annotationId, { resolved: e.target.checked });
  });

  q('drawer-open-full').addEventListener('click', () => {
    closeDrawer();
    setActiveView('annotations');
    requestRender();
    // Same flash-and-scroll convention openTimelineEventDrawer's own
    // "open full" link uses — .annotation-row[data-anno] is the
    // Annotations dashboard's existing per-row anchor.
    const rowEl = document.querySelector(`.view-panel[data-view="annotations"] .annotation-row[data-anno="${annotationId}"]`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      rowEl.classList.add('flash-highlight');
      setTimeout(() => rowEl.classList.remove('flash-highlight'), 1600);
    }
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-1050-1058
export function openRelationshipDrawer(relationshipId) {
  const rel = Store.getRelationship(relationshipId);
  if (!rel) return;
  const from = Store.getEntity(rel.fromId);
  const to = Store.getEntity(rel.toId);
  const label = Store.getRelationshipLabel(rel) || 'Relationship';
  const history = rel.history || [];

  const root = openDrawerShell(html`
    <div class="drawer-header">
      <div>
        <h3 class="drawer-title">${label}</h3>
        <span class="drawer-subtitle">${rel.status || 'No status set'}</span>
      </div>
    </div>

    <div class="drawer-meta-block">
      ${metaRow('Between', html`<button type="button" class="drawer-link-button" data-rel-entity="${rel.fromId}">${from?.name || 'Unknown'}</button> · <button type="button" class="drawer-link-button" data-rel-entity="${rel.toId}">${to?.name || 'Unknown'}</button>`)}
      ${metaRow('Strength', rel.strength || 'Not set')}
      ${metaRow('Story time', rel.startDate || rel.endDate ? html`<span>${rel.startDate || '?'} → ${rel.endDate || '?'}</span>` : 'Not set')}
    </div>

    ${rel.notes ? html`<p class="drawer-description">${rel.notes}</p>` : html`<p class="empty-note">No notes on this relationship yet.</p>`}

    <div class="drawer-section">
      <h4>History (${history.length})</h4>
      ${
        history.length
          ? html`<ul class="drawer-list">${history.map((h) => html`
              <li class="drawer-list-item">
                <strong>${h.label}</strong>
                ${(h.status || h.strength) ? html`<span class="drawer-subtitle">${[h.status, h.strength].filter(Boolean).join(' · ')}</span>` : ''}
                ${h.note ? html`<span class="drawer-subtitle">${h.note}</span>` : ''}
                <span class="drawer-subtitle">${new Date(h.createdAt).toLocaleString()}</span>
              </li>`)}
            </ul>`
          : html`<p class="empty-note">No past states logged yet. Log them from the relationship editor on the Canvas.</p>`
      }
    </div>

    <button id="drawer-open-canvas" class="drawer-edit-link">Open the Relationship Canvas →</button>
  `);
  if (!root) return;

  root.querySelectorAll('[data-rel-entity]').forEach((btn) => {
    btn.addEventListener('click', () => openEntityDrawer(btn.dataset.relEntity));
  });

  q('drawer-open-canvas').addEventListener('click', () => {
    closeDrawer();
    setActiveView('canvas');
    requestRender();
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsdrawer-js-1114-1127

export function openContextDrawer(kind, payload = {}) {
  switch (kind) {
    case 'entity':
      return openEntityDrawer(payload.entityId);
    case 'scene':
      return openSceneInspector(payload.chapterId, payload.sceneId);
    case 'reference':
      return openReferenceDrawer(payload.referenceId);
    case 'ruleNode':
      return openRuleNodeDrawer(payload.systemId, payload.nodeId);
    case 'mapMarker':
      return openMapMarkerDrawer(payload.mapId, payload.markerId);
    case 'timelineEvent':
      return openTimelineEventDrawer(payload.eventId);
    case 'annotation':
      return openAnnotationDrawer(payload.annotationId);
    case 'relationship':
      return openRelationshipDrawer(payload.relationshipId);
    default:
      return null;
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-1-4
import * as Ambience from './ambience.js';
import * as AssetStore from './assetstore.js';
import * as Commands from './commands.js';
import * as ModalShell from './modal.js';
import * as Store from './store.js';
import * as Theme from './theme.js';
import * as Typewriter from './typewriter.js';
import { TINTA_CREATOR, TINTA_PHASE, TINTA_VERSION } from './appMeta.js';
import { openBackupModal } from './backup.js';
import { activeView, navHandle, setActiveView } from './context.js';
import { escapeAttr, escapeHtml, q } from './dom-utils.js';
import { closeModal } from './modal.js';
import { DENSITY_FALLBACK_VIEW, isViewVisibleAtDensity } from './nav.js';
import { requestRender } from './renderBus.js';
import { applyMotionSpeed } from './theme.js';
import { showStorageWarning } from './toast.js';

export function openSettingsModal() {
  const theme = Theme.currentTheme();
  const font = Store.getManuscriptFont();
  const navStyle = Store.getNavStyle();
  const motionSettings = Store.getMotionSettings();
  const autosaveMs = Store.getAutosaveDelayMs();
  const ambienceSettings = Store.getAmbienceSettings();
  const ambienceSupported = Ambience.isSupported();
  const ambiencePlaying = Ambience.isPlaying();
  const bg = Store.getBackgroundSettings();
  const customFont = Store.getCustomFont();
  const typewriterSettings = Store.getTypewriterSettings();
  const typewriterSupported = Typewriter.isSupported();
// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-34-37
  const navPaintedStyle = navHandle && typeof navHandle.paintedStyle === 'function'
    ? navHandle.paintedStyle()
    : null;
  const navDowngraded = navStyle === 'grouped' && navPaintedStyle === 'compact';

  const THEMES = [
    { id: 'paper', label: 'Paper' },
    { id: 'void', label: 'Void' },
    { id: 'sepia', label: 'Sepia' },
  ];
  const AUTOSAVE_OPTIONS = [
    { value: 0, label: 'Off · save on exit only' },
    { value: 600, label: 'Fast (600ms)' },
  { value: 1500, label: 'Default (1.5s)' },
    { value: 2000, label: 'Normal (2s)' },
    { value: 5000, label: 'Relaxed (5s)' },
  ];

// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-55-68
  const root = ModalShell.openModal({
    title: 'Settings',
    className: 'settings-modal',
    body: `
        <!-- Session pass — jump-links, the middle option between the
             existing single-scroll modal and a full nav-rail redesign
             (deliberately not built — see docs/ROADMAP.md). Anchors to
             each section's id below; smooth-scrolls within the modal's own
             scroll container rather than the page, since the modal panel
             (not <body>) is what actually scrolls here. -->
        <div class="settings-jumplinks" role="tablist" aria-label="Jump to settings section">
          <button class="settings-jumplink" data-jump="settings-sec-identity">Identity</button>
          <button class="settings-jumplink" data-jump="settings-sec-appearance">Appearance</button>
          <button class="settings-jumplink" data-jump="settings-sec-background">Background</button>
          <button class="settings-jumplink" data-jump="settings-sec-autosave">Autosave</button>
          <button class="settings-jumplink" data-jump="settings-sec-ambient-sound">Sound</button>
          <button class="settings-jumplink" data-jump="settings-sec-typewriter-sound">Typewriter</button>
          <button class="settings-jumplink" data-jump="settings-sec-backup-sync">Backup</button>
          <button class="settings-jumplink" data-jump="settings-sec-shortcuts">Shortcuts</button>
          <button class="settings-jumplink" data-jump="settings-sec-about">About</button>
        </div>

        <section class="settings-section" id="settings-sec-identity">
          <h3>Identity</h3>
          <div class="settings-row">
            <span>Your name</span>
            <input type="text" id="settings-writer-name" class="settings-input" value="${escapeHtml(Store.getWriterName())}" placeholder="Your name or pen name" style="flex: 1; max-width: 240px; padding: 6px 10px; border: 1px solid var(--rule); border-radius: 6px; font-family: inherit; color: var(--ink); background: var(--paper);" />
          </div>
          <p class="settings-note">Shown on the "Welcome back" screen when you open Tinta. You can clear it anytime to go back to a generic greeting.</p>
          <div class="settings-row">
            <span>Workspace density</span>
            <div class="nav-style-toggle">
              <button class="nav-style-btn${Store.getWorkspaceDensity() === 'simple' ? ' active' : ''}" data-density="simple">Simple</button>
              <button class="nav-style-btn${Store.getWorkspaceDensity() === 'normal' ? ' active' : ''}" data-density="normal">Normal</button>
              <button class="nav-style-btn${Store.getWorkspaceDensity() === 'maximum' ? ' active' : ''}" data-density="maximum">Maximum</button>
            </div>
          </div>
          <p class="settings-note">Simple hides advanced views (Canvas, Systems, References, Timeline, Sketch, Stats, Health, Checklist, Decisions). Normal shows everything. Maximum currently shows the same set as Normal — it is reserved for diagnostic surfaces as they land. Nothing is locked — switch anytime, and if your current view gets hidden Tinta moves you back to Write.</p>
          <div class="settings-row">
            <span>Sidebar</span>
            <div class="nav-style-toggle">
              <button class="nav-style-btn${Store.getSidebarCollapsed() ? '' : ' active'}" data-sidebar="expanded">Expanded</button>
              <button class="nav-style-btn${Store.getSidebarCollapsed() ? ' active' : ''}" data-sidebar="collapsed">Collapsed</button>
            </div>
          </div>
          <p class="settings-note">Collapsed narrows the sidebar to a thin icon rail, giving you more room for prose. Hover or click the ☰ button to expand.</p>
          <div class="settings-row">
            <span>Passive entity recognition</span>
            <div class="nav-style-toggle">
              <button class="nav-style-btn${Store.getPassiveRecognition() ? ' active' : ''}" data-recognition="on">On</button>
              <button class="nav-style-btn${!Store.getPassiveRecognition() ? ' active' : ''}" data-recognition="off">Off</button>
            </div>
          </div>
          <p class="settings-note">When on, Tinta recognizes entity names in your prose automatically (no [[brackets]] needed). The entity's backlinks view shows every place you mentioned them.</p>
          <div class="settings-row">
            <span>Recognition stopwords</span>
            <input type="text" id="settings-stopword-input" class="settings-input" placeholder="e.g. Will, May, Jack" style="flex: 1; max-width: 240px; padding: 6px 10px; border: 1px solid var(--rule); border-radius: 6px; font-family: inherit; color: var(--ink); background: var(--paper);" />
          </div>
          <p class="settings-note">Words that match entity names but shouldn't trigger recognition. Comma-separated. Case-insensitive. Current: ${(Store.getMentionStopwords() || []).join(', ') || 'none'}</p>
        </section>

        <section class="settings-section" id="settings-sec-appearance">
          <h3>Appearance</h3>
          <div class="settings-row">
            <span>Theme</span>
            <div class="theme-swatches">
              ${THEMES.map(
                (t) => `<button class="theme-swatch theme-swatch-${t.id}${t.id === theme ? ' active' : ''}" data-theme="${t.id}" title="${t.label}"></button>`
              ).join('')}
            </div>
          </div>
          <div class="settings-row">
            <span>Font</span>
            <select id="settings-font-select">
              <option value="literata" ${font === 'literata' ? 'selected' : ''}>Literata</option>
              <option value="hyperlegible" ${font === 'hyperlegible' ? 'selected' : ''}>Atkinson Hyperlegible</option>
              <option value="mono" ${font === 'mono' ? 'selected' : ''}>JetBrains Mono</option>
              ${customFont.fileName ? `<option value="custom" ${font === 'custom' ? 'selected' : ''}>${escapeHtml(customFont.family.replace(/ [a-z0-9]{4}$/, ''))} (custom)</option>` : ''}
            </select>
          </div>
          <div class="settings-row">
            <span>${customFont.fileName ? escapeHtml(customFont.fileName) : 'Custom font'}</span>
            <div style="display: flex; gap: 8px;">
              <button class="toolbar-btn" id="custom-font-pick-btn">🔤 ${customFont.fileName ? 'Replace' : 'Upload a font file'}</button>
              ${customFont.fileName ? '<button class="toolbar-btn" id="custom-font-remove-btn">✕ Remove</button>' : ''}
            </div>
          </div>
          <input type="file" id="custom-font-input" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" class="hidden" />
          <p class="settings-note">Your own .ttf/.otf/.woff file, read straight from disk, never uploaded anywhere. Stored locally so it's still there next time you open Tinta.</p>
          <p class="settings-note" id="custom-font-missing-note" style="display:none">Tinta remembers the file's name, but the font's bytes are missing from this browser's storage — re-upload it below to use it again.</p>
          <div class="settings-row">
            <span>Navigation</span>
            <div class="nav-style-toggle">
              <button class="nav-style-btn${navStyle === 'grouped' ? ' active' : ''}" data-nav-style="grouped">Grouped</button>
              <button class="nav-style-btn${navStyle === 'compact' ? ' active' : ''}" data-nav-style="compact">Compact</button>
            </div>
          </div>
          <p class="settings-note">Grouped keeps every view one click away, split into labeled clusters; on a narrow window the clusters wrap onto a second row rather than clip. Compact collapses each cluster into a single button that opens a flyout: calmer bar, one extra click for anything outside Write.${navDowngraded ? ' Right now this window is too narrow even for the two-row bar, so Compact is standing in for your Grouped choice; widen the window and Grouped comes back.' : ''}</p>
          <div class="settings-row">
            <span>Motion speed</span>
            <div class="nav-style-toggle">
              <button class="nav-style-btn motion-speed-btn${motionSettings.speed === 'subtle' ? ' active' : ''}" data-motion-speed="subtle">Subtle</button>
              <button class="nav-style-btn motion-speed-btn${motionSettings.speed === 'normal' ? ' active' : ''}" data-motion-speed="normal">Normal</button>
              <button class="nav-style-btn motion-speed-btn${motionSettings.speed === 'relaxed' ? ' active' : ''}" data-motion-speed="relaxed">Relaxed</button>
            </div>
          </div>
          <p class="settings-note">Controls the fade when you switch chapters: Subtle is quick and barely-there, Relaxed lingers. Doesn't touch hovers, modals, or anything else; if your system's set to reduce motion, this is skipped entirely.</p>
        </section>

        <section class="settings-section" id="settings-sec-background">
          <h3>Background</h3>
          <p class="settings-note" style="margin-top: 0; margin-bottom: 10px;">Independent of Theme above: Theme sets the ink/paper colors your writing actually sits on; this just paints in behind the sidebar and the editor, so it can't affect legibility.</p>
          <div class="settings-row">
            <span>Mode</span>
            <div class="nav-style-toggle bg-mode-toggle">
              <button class="nav-style-btn bg-mode-btn${bg.mode === 'none' ? ' active' : ''}" data-bg-mode="none">None</button>
              <button class="nav-style-btn bg-mode-btn${bg.mode === 'gradient' ? ' active' : ''}" data-bg-mode="gradient">Gradient</button>
              <button class="nav-style-btn bg-mode-btn${bg.mode === 'image' ? ' active' : ''}" data-bg-mode="image">Image</button>
            </div>
          </div>
          <div id="bg-gradient-controls" class="bg-mode-controls${bg.mode === 'gradient' ? '' : ' hidden'}">
            <div class="bg-gradient-row">
              <label>From <input type="color" id="bg-gradient-a" value="${escapeAttr(bg.gradient.colorA)}" /></label>
              <label>To <input type="color" id="bg-gradient-b" value="${escapeAttr(bg.gradient.colorB)}" /></label>
              <select id="bg-gradient-direction">
                ${[
                  ['to bottom right', 'Diagonal ↘'],
                  ['to bottom', 'Down ↓'],
                  ['to right', 'Across →'],
                  ['to top right', 'Diagonal ↗'],
                ]
                  .map(([v, label]) => `<option value="${v}" ${bg.gradient.direction === v ? 'selected' : ''}>${label}</option>`)
                  .join('')}
              </select>
            </div>
          </div>
          <div id="bg-image-controls" class="bg-mode-controls${bg.mode === 'image' ? '' : ' hidden'}">
            <div class="settings-row">
              <span>${bg.imageName ? escapeHtml(bg.imageName) : 'No image set'}</span>
              <div style="display: flex; gap: 8px;">
                <button class="toolbar-btn" id="bg-image-pick-btn">🖼 ${bg.imageName ? 'Replace' : 'Choose image'}</button>
                ${bg.imageName ? '<button class="toolbar-btn" id="bg-image-remove-btn">✕ Remove</button>' : ''}
              </div>
            </div>
            <input type="file" id="bg-image-input" accept="image/*" class="hidden" />
            <label class="ambience-volume-row">
              <span>Dim</span>
              <input type="range" id="bg-image-dim" min="0" max="0.9" step="0.05" value="${bg.imageDim}" />
            </label>
            <p class="settings-note">Dim layers a tint of the current theme's background color over the image; turn it up if sidebar text gets hard to read against a busy photo.</p>
          </div>
        </section>

        <section class="settings-section" id="settings-sec-autosave">
          <h3>Autosave</h3>
          <div class="settings-row">
            <span>Save interval</span>
            <select id="settings-autosave-select">
              ${AUTOSAVE_OPTIONS.map((o) => `<option value="${o.value}" ${o.value === autosaveMs ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>
          <p class="settings-note">Regardless of this setting, everything is also saved the moment you leave a chapter, switch novels, or close the tab.</p>
        </section>

        <section class="settings-section" id="settings-sec-ambient-sound">
          <h3>Ambient Sound</h3>
          ${
            !ambienceSupported
              ? '<p class="empty-note">Your browser doesn\'t support the Web Audio API, so ambient sound isn\'t available here.</p>'
              : `
          <div class="ambience-tracks">
            ${Ambience.TRACKS.map(
              (t) => `<button class="ambience-track-btn${(ambiencePlaying ? Ambience.getCurrentTrack() : ambienceSettings.track) === t.id ? ' active' : ''}" data-track="${t.id}">${escapeHtml(t.label)}</button>`
            ).join('')}
            <button class="ambience-track-btn${(ambiencePlaying ? Ambience.getCurrentTrack() : ambienceSettings.track) === 'custom' && ambienceSettings.customTrackSource === 'file' ? ' active' : ''}" id="ambience-custom-track-btn">🎵 ${ambienceSettings.customTrackSource === 'file' && ambienceSettings.customTrackName ? escapeHtml(ambienceSettings.customTrackName) : 'Custom file…'}</button>
          </div>
          ${
            ambienceSettings.customTrackSource === 'file' && ambienceSettings.customTrackName
              ? `<p class="settings-note" style="margin-top: 6px;">Playing your own file. Click the track button above to play/pause it, or <button class="inline-text-btn" id="ambience-custom-track-remove">remove it</button> and go back to the synthesized tracks.</p>`
              : ''
          }
          <input type="file" id="ambience-custom-track-input" accept="audio/*" class="hidden" />

          <div class="settings-row" style="margin-top: 12px;">
            <span>Or a direct audio URL</span>
          </div>
          ${
            navigator.onLine === false
              ? '<p class="empty-note">You look offline right now, so a URL track won\'t load; the file and synthesized options above still work fine offline.</p>'
              : `
          <div class="ambience-url-row">
            <input type="text" id="ambience-url-input" placeholder="https://example.com/track.mp3" value="${ambienceSettings.customTrackSource === 'url' ? escapeAttr(ambienceSettings.customTrackUrl) : ''}" />
            <button class="toolbar-btn" id="ambience-url-play-btn">${ambiencePlaying && Ambience.getCurrentTrack() === 'custom' && ambienceSettings.customTrackSource === 'url' ? '⏸ Pause' : '▶ Play'}</button>
          </div>
          <p class="settings-note" style="margin-top: 4px;">A direct link to an audio file (not a YouTube/Spotify page); the site has to allow this kind of playback, so not every link will work.</p>
          `
          }

          <label class="ambience-volume-row">
            <span>Volume</span>
            <input type="range" id="ambience-volume" min="0" max="1" step="0.05" value="${ambienceSettings.volume}" />
          </label>
          <p class="settings-note">The four built-in tracks are synthesized on the fly, not sound files; they loop forever with no seam. A custom file or URL is real audio instead, looped the same way. Playback stops if you leave the app or reload; your pick is remembered for next time.</p>
          `
          }
        </section>

        <section class="settings-section" id="settings-sec-typewriter-sound">
          <h3>Typewriter Sound</h3>
          ${
            !typewriterSupported
              ? '<p class="empty-note">Your browser doesn\'t support the Web Audio API, so typewriter sound isn\'t available here.</p>'
              : `
          <label class="ambience-volume-row">
            <span>Enabled</span>
            <input type="checkbox" id="typewriter-enabled" ${typewriterSettings.enabled ? 'checked' : ''} />
          </label>
          <div class="settings-row">
            <span>Style</span>
            <select id="typewriter-style-select">
              ${Typewriter.STYLES.map((s) => `<option value="${s.id}" ${typewriterSettings.style === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <label class="ambience-volume-row">
            <span>Volume</span>
            <input type="range" id="typewriter-volume" min="0" max="1" step="0.05" value="${typewriterSettings.volume}" />
          </label>
          <button class="toolbar-btn" id="typewriter-test-btn">▶ Test "the quick brown fox"</button>
          <p class="settings-note">All four styles are synthesized on the fly, not sound files, same approach as Ambience.</p>
          `
          }
        </section>

        <section class="settings-section" id="settings-sec-backup-sync">
          <h3>Backup &amp; Sync</h3>
          <p class="settings-note">Export or restore your full library as a JSON file.</p>
          <button id="settings-backup-btn" class="toolbar-btn">⇅ Open Backup &amp; Restore</button>
        </section>

        <section class="settings-section" id="settings-sec-shortcuts">
          <h3>Keyboard Shortcuts</h3>
          ${Commands.SHORTCUT_GROUP_ORDER.map((group) => {
            const rows = Commands.COMMANDS.filter((s) => s.group === group);
            if (!rows.length) return '';
            return `
            <div class="shortcuts-group">
              <h4 class="shortcuts-group-label">${escapeHtml(group)}</h4>
              <div class="shortcuts-list">
                ${rows.map(
                  (s) => `
                  <div class="shortcuts-row">
                    <span class="shortcuts-keys">${s.keys.map((k) => `<kbd>${escapeHtml(Commands.shortcutKeyLabel(k))}</kbd>`).join('<span class="shortcuts-plus">+</span>')}</span>
                    <span class="shortcuts-desc">${escapeHtml(s.desc)}</span>
                  </div>`
                ).join('')}
              </div>
            </div>`;
          }).join('')}
          <p class="settings-note">${Commands.isMacPlatform() ? '⌘' : 'Ctrl'} shown for your platform; the other key works too either way.</p>
        </section>

        <section class="settings-section" id="settings-sec-about">
          <h3>About</h3>
          <p class="settings-note">Tinta <strong>v${escapeHtml(TINTA_VERSION)}</strong> · ${escapeHtml(TINTA_PHASE)}</p>
          <p class="settings-note">Created by ${escapeHtml(TINTA_CREATOR)}.</p>
          <p class="settings-note">Tinta began as the tool one story needed. Every feature here started as a wish my own writing software couldn't grant.</p>
          <p class="settings-note"><em>May it hold your world as carefully as it has held mine.</em></p>
        </section>
    `,
  });

  q('modal-close').addEventListener('click', closeModal);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });

// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-305-309
  const panelEl = root.querySelector('.settings-modal');
  const jumplinks = [...root.querySelectorAll('.settings-jumplink')];
  jumplinks.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = q(btn.dataset.jump);
      if (!target) return;
      panelEl.scrollTo({ top: target.offsetTop - panelEl.querySelector('.modal-header').offsetHeight - 12, behavior: 'smooth' });
    });
  });
  const sectionEls = jumplinks.map((btn) => q(btn.dataset.jump)).filter(Boolean);
// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-320-328
  const settingsHeaderH = panelEl.querySelector('.modal-header')?.offsetHeight || 0;
  const syncActiveJumplink = () => {
    const spy = panelEl.scrollTop + settingsHeaderH + 20;
    let current = sectionEls[0];
    for (const sec of sectionEls) {
      if (sec.offsetTop <= spy) current = sec;
    }
    if (panelEl.scrollTop + panelEl.clientHeight >= panelEl.scrollHeight - 4) {
      current = sectionEls[sectionEls.length - 1];
    }
    jumplinks.forEach((btn) => btn.classList.toggle('active', btn.dataset.jump === current?.id));
  };
  panelEl.addEventListener('scroll', syncActiveJumplink);
  syncActiveJumplink();

  // Appearance — theme swatches apply immediately (Theme.applyTheme already
  // updates the document attribute + persists via Store.setTheme), no need
  // for a separate "Apply" step or to close the modal to see it take effect.
  root.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.theme;
      Theme.applyTheme(next);
      root.querySelectorAll('.theme-swatch').forEach((b) => b.classList.toggle('active', b.dataset.theme === next));
    });
  });

  // v0.2.9 — Identity section: writer name, workspace density, sidebar state.
  q('settings-writer-name')?.addEventListener('input', (e) => {
    Store.setWriterName(e.target.value);
  });

  root.querySelectorAll('[data-density]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.density;
      Store.setWorkspaceDensity(next);
      root.querySelectorAll('[data-density]').forEach((b) => b.classList.toggle('active', b.dataset.density === next));
      // Density now actually filters the nav, which means the view the
      // writer is currently sitting in can disappear out from under them
      // (Normal → Simple while in Canvas). Move them somewhere reachable
      // first, then repaint — otherwise they're stranded on a panel with
      // no tab that leads back to it.
      if (!isViewVisibleAtDensity(activeView, next)) {
        setActiveView(DENSITY_FALLBACK_VIEW);
        requestRender();
      }
      navHandle.closeFlyout();
      navHandle.render();
    });
  });

  root.querySelectorAll('[data-sidebar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const collapsed = btn.dataset.sidebar === 'collapsed';
      Store.setSidebarCollapsed(collapsed);
      document.getElementById('app-shell')?.classList.toggle('sidebar-collapsed', collapsed);
      root.querySelectorAll('[data-sidebar]').forEach((b) => b.classList.toggle('active', b.dataset.sidebar === btn.dataset.sidebar));
      // Also update the burger toggle button's visual state
      const toggleBtn = document.getElementById('sidebar-toggle-btn');
      if (toggleBtn) {
        toggleBtn.textContent = collapsed ? '☰' : '☜';
        toggleBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
      }
    });
  });

  // v0.2.9 — Passive recognition toggle + stopword editor
  root.querySelectorAll('[data-recognition]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const on = btn.dataset.recognition === 'on';
      Store.setPassiveRecognition(on);
      root.querySelectorAll('[data-recognition]').forEach((b) => b.classList.toggle('active', b.dataset.recognition === btn.dataset.recognition));
    });
  });

  q('settings-stopword-input')?.addEventListener('change', (e) => {
    const words = e.target.value.split(',').map((w) => w.trim()).filter(Boolean);
    // Clear existing stopwords, then add each new one
    const existing = Store.getMentionStopwords();
    existing.forEach((w) => Store.removeMentionStopword(w));
    words.forEach((w) => Store.addMentionStopword(w));
  });

  q('settings-font-select').addEventListener('change', (e) => {
    Store.setManuscriptFont(e.target.value);
    // P2-11 — route through Theme.applyFont() so the missing-blob
    // fallback for 'custom' is owned in one place.
    Theme.applyFont(e.target.value);
  });

  // Custom fonts pass — picking a file registers it immediately (so it's
  // visible without waiting for a reload) and switches Font to "custom" in
  // the same action, rather than requiring a separate select afterward.
  q('custom-font-pick-btn').addEventListener('click', () => q('custom-font-input').click());
  q('custom-font-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const family = Theme.deriveFontFamilyName(file.name);
    try {
      await Theme.registerCustomFont(file, family);
    } catch (err) {
      showStorageWarning(`Couldn't load "${file.name}" as a font: ${err.message || 'unrecognized font file'}.`);
      return;
    }
    await AssetStore.putBlob(AssetStore.KEYS.CUSTOM_FONT, file);
    Store.setCustomFont({ family, fileName: file.name });
    Store.setManuscriptFont('custom');
    // P2-11 — route through Theme.applyFont().
    Theme.applyFont('custom');
    openSettingsModal();
  });
  const customFontRemoveBtn = q('custom-font-remove-btn');
  if (customFontRemoveBtn) {
    customFontRemoveBtn.addEventListener('click', async () => {
      await AssetStore.deleteBlob(AssetStore.KEYS.CUSTOM_FONT);
      Store.setCustomFont({ family: '', fileName: '' });
      // Falls back to Literata rather than leaving Font pointed at a
      // now-empty "custom" option with nothing registered to show.
      if (Store.getManuscriptFont() === 'custom') {
        Store.setManuscriptFont('literata');
        // P2-11 — route through Theme.applyFont().
        Theme.applyFont('literata');
      }
      openSettingsModal();
    });
  }

// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-395-402
  if (customFont.fileName) {
    AssetStore.getBlob(AssetStore.KEYS.CUSTOM_FONT)
      .then((blob) => { if (!blob) q('custom-font-missing-note').style.display = ''; })
      .catch(() => {});
  }

// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-409-412
  root.querySelectorAll('[data-nav-style]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.navStyle;
      Store.setNavStyle(next);
      navHandle.closeFlyout();
      root.querySelectorAll('[data-nav-style]').forEach((b) => b.classList.toggle('active', b.dataset.navStyle === next));
      // nav.js's handle exposes render(), not requestRender() — this line
      // used to call a method that has never existed, so it threw a
      // TypeError and the nav silently kept its old style until some
      // unrelated render came along. Not in the audit; found while wiring
      // workspace density into the same handle.
      navHandle.render();
    });
  });

// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-423-426
  root.querySelectorAll('[data-motion-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.motionSpeed;
      Store.setMotionSettings({ speed: next });
      applyMotionSpeed(next);
      root.querySelectorAll('[data-motion-speed]').forEach((b) => b.classList.toggle('active', b.dataset.motionSpeed === next));
    });
  });

  q('settings-autosave-select').addEventListener('change', (e) => {
    Store.setAutosaveDelayMs(Number(e.target.value));
  });

  if (ambienceSupported) {
// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-441-444
    root.querySelectorAll('.ambience-track-btn[data-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const trackId = btn.dataset.track;
        const currentSettings = Store.getAmbienceSettings();
        if (trackId === 'off') {
          Ambience.stop();
        } else {
          Ambience.start(trackId, currentSettings.volume);
        }
        Store.setAmbienceSettings({ track: trackId });
        openSettingsModal(); // refresh so the active highlight (built-in vs custom) stays correct
      });
    });
    q('ambience-volume').addEventListener('input', (e) => {
      const volume = Number(e.target.value);
      Ambience.setVolume(volume);
      Store.setAmbienceSettings({ volume });
    });

// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-464-468
    q('ambience-custom-track-btn').addEventListener('click', async () => {
      const settings = Store.getAmbienceSettings();
      if (settings.customTrackSource !== 'file' || !settings.customTrackName) {
        q('ambience-custom-track-input').click();
        return;
      }
      if (Ambience.isPlaying() && Ambience.getCurrentTrack() === 'custom' && settings.customTrackSource === 'file') {
        Ambience.stop();
        Store.setAmbienceSettings({ track: 'off' });
      } else {
        const blob = await AssetStore.getBlob(AssetStore.KEYS.AMBIENCE_TRACK);
        if (blob) {
          const ok = await Ambience.playCustomTrack(blob, settings.volume);
          Store.setAmbienceSettings({ track: ok ? 'custom' : 'off', customTrackSource: 'file' });
        }
      }
      openSettingsModal();
    });

    q('ambience-custom-track-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await AssetStore.putBlob(AssetStore.KEYS.AMBIENCE_TRACK, file);
      const settings = Store.getAmbienceSettings();
      const ok = await Ambience.playCustomTrack(file, settings.volume);
      Store.setAmbienceSettings({ track: ok ? 'custom' : 'off', customTrackName: file.name, customTrackSource: 'file' });
      openSettingsModal();
    });

    const removeCustomTrackBtn = q('ambience-custom-track-remove');
    if (removeCustomTrackBtn) {
      removeCustomTrackBtn.addEventListener('click', async () => {
        if (Ambience.getCurrentTrack() === 'custom') Ambience.stop();
        await AssetStore.deleteBlob(AssetStore.KEYS.AMBIENCE_TRACK);
        Store.setAmbienceSettings({ track: 'off', customTrackName: '' });
        openSettingsModal();
      });
    }

    // Local music pass, cont'd — direct-URL playback. Only rendered when
    // navigator.onLine isn't explicitly false (see the markup above), so
    // this element won't always exist.
    const urlPlayBtn = q('ambience-url-play-btn');
    if (urlPlayBtn) {
      urlPlayBtn.addEventListener('click', async () => {
        const settings = Store.getAmbienceSettings();
        if (Ambience.isPlaying() && Ambience.getCurrentTrack() === 'custom' && settings.customTrackSource === 'url') {
          Ambience.stop();
          Store.setAmbienceSettings({ track: 'off' });
          openSettingsModal();
          return;
        }
        const url = q('ambience-url-input').value.trim();
        if (!url) return;
        const ok = await Ambience.playFromUrl(url, settings.volume);
        if (!ok) {
          showStorageWarning(`Couldn't play that URL: either it's not a direct audio link, or the site doesn't allow this kind of playback.`);
        }
        Store.setAmbienceSettings({ track: ok ? 'custom' : 'off', customTrackSource: 'url', customTrackUrl: url });
        openSettingsModal();
      });
    }
  }

// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-533-537
  root.querySelectorAll('[data-bg-mode]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      Store.setBackgroundSettings({ mode: btn.dataset.bgMode });
      await Theme.applyBackground();
      openSettingsModal();
    });
  });

  const syncGradient = async () => {
    Store.setBackgroundSettings({
      gradient: {
        colorA: q('bg-gradient-a').value,
        colorB: q('bg-gradient-b').value,
        direction: q('bg-gradient-direction').value,
      },
    });
    await Theme.applyBackground();
  };
  q('bg-gradient-a').addEventListener('input', syncGradient);
  q('bg-gradient-b').addEventListener('input', syncGradient);
  q('bg-gradient-direction').addEventListener('change', syncGradient);

  q('bg-image-pick-btn').addEventListener('click', () => q('bg-image-input').click());
  q('bg-image-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let prepared;
    try {
      prepared = await Theme.prepareBackgroundImage(file);
    } catch (err) {
      showStorageWarning(`Couldn't use "${file.name}" as a background: ${err.message || 'unrecognized image file'}.`);
      return;
    }
    await AssetStore.putBlob(AssetStore.KEYS.BACKGROUND_IMAGE, prepared);
    Store.setBackgroundSettings({ mode: 'image', imageName: file.name });
    await Theme.applyBackground();
    openSettingsModal();
  });
  q('bg-image-dim').addEventListener('input', async (e) => {
    Store.setBackgroundSettings({ imageDim: Number(e.target.value) });
    await Theme.applyBackground();
  });
  const bgImageRemoveBtn = q('bg-image-remove-btn');
  if (bgImageRemoveBtn) {
    bgImageRemoveBtn.addEventListener('click', async () => {
      await AssetStore.deleteBlob(AssetStore.KEYS.BACKGROUND_IMAGE);
      Store.setBackgroundSettings({ mode: 'none', imageName: '' });
      await Theme.applyBackground();
      openSettingsModal();
    });
  }

  if (typewriterSupported) {
    q('typewriter-enabled').addEventListener('change', (e) => {
      const enabled = e.target.checked;
      Store.setTypewriterSettings({ enabled });
      if (enabled) Typewriter.playClick(Store.getTypewriterSettings().volume, Store.getTypewriterSettings().style);
    });
    q('typewriter-volume').addEventListener('input', (e) => {
      const volume = Number(e.target.value);
      Store.setTypewriterSettings({ volume });
      Typewriter.playClick(volume, Store.getTypewriterSettings().style);
    });
    q('typewriter-style-select').addEventListener('change', (e) => {
      const style = e.target.value;
      Store.setTypewriterSettings({ style });
      Typewriter.playClick(Store.getTypewriterSettings().volume, style);
    });
    // Types out "the quick brown fox" (well, its clicks) at a natural
    // typing cadence with a bell at the end, so switching styles gives an
    // actual sense of the rhythm rather than one isolated click.
    q('typewriter-test-btn').addEventListener('click', () => {
      const settings = Store.getTypewriterSettings();
      const letters = 12;
      for (let i = 0; i < letters; i++) {
        setTimeout(() => Typewriter.playClick(settings.volume, settings.style), i * 90);
      }
      setTimeout(() => Typewriter.playBell(settings.volume, settings.style), letters * 90 + 120);
    });
  }

  q('settings-backup-btn').addEventListener('click', openBackupModal);
}

// Historical context: see docs/CODEBASE_NOTES.md#jssettingsmodal-js-615-626

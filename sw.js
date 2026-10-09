// Tinta — minimal offline app-shell cache.
// All actual data lives in localStorage (see js/store.js), so this only
// needs to cache the static shell, not any content.
//
// Nav refinement pass — switched from cache-first to network-first with a
// cache fallback. Cache-first meant every shell edit (this file's own
// history has three version bumps in three back-to-back responses) needed
// a manual CACHE_NAME bump *and* a hard-reload dance, or the browser would
// keep serving stale HTML/CSS/JS indefinitely. Network-first means a normal
// reload always gets the live files when there's a connection; the cache
// only kicks in once the network request actually fails (offline), which
// is the scenario this was meant to cover in the first place. The tradeoff
// is one extra round-trip per load versus true cache-first, which is a
// non-issue for a same-origin local app shell.
// P1-14 fix — bumped from v0.2.9 because SHELL_FILES changed (icons added).
// P2-9 fix — bumped from v0.2.10 because SHELL_FILES changed (makeBlobStore.js added).
// P2-7 fix — bumped from v0.2.10.p2 because SHELL_FILES changed
// (recoveryStore.js + recoveryToast.js added).
// v0.3 editor-preview fix — bumped from v0.2.10.p2.7 because the
// always-on formatted overlay changes how the editor renders (the
// overlay is now always visible, textarea text always transparent).
// No new files in SHELL_FILES (the new renderEditorParagraph lives in
// the existing format.js; the new editor-paragraph.smoketest.mjs is a
// test file, not a runtime file), but the CSS + editor.js changes are
// significant enough to warrant a cache refresh.
const CACHE_NAME = 'tinta-shell-v0.3-editor-preview';
const SHELL_FILES = [
  './',
  './index.html',
  './css/fonts.css',
  './fonts/atkinson-hyperlegible-400.woff2',
  './fonts/atkinson-hyperlegible-700.woff2',
  './fonts/fraunces-300.woff2',
  './fonts/inter-400.woff2',
  './fonts/jetbrains-mono-400.woff2',
  './fonts/literata-400.woff2',
  './css/base.css',
  './css/shell.css',
  './css/editor-view.css',
  './css/views.css',
  './css/modals.css',
  './css/dashboards.css',
  './css/tools.css',
  './css/media.css',
  './css/polish.css',
  './js/app.js',
  './js/renderBus.js',
  './js/appMeta.js',
  './js/portraits.js',
  './js/tagFilter.js',
  './js/worldTemplates.js',
  './js/sidebar.js',
  './js/outlineView.js',
  './js/sketchView.js',
  './js/bookView.js',
  './js/resumeView.js',
  './js/questionsView.js',
  './js/checklistView.js',
  './js/annotationsView.js',
  './js/historyModals.js',
  './js/typeManagers.js',
  './js/exportMenu.js',
  './js/templatePicker.js',
  './js/organizeModal.js',
  './js/library.js',
  './js/projectSwitch.js',
  './js/viewLifecycle.js',
  './js/welcomeScreen.js',
  './js/onboarding.js',
  './js/commandPalette.js',
  './js/imageLibrary.js',
  './js/settingsModal.js',
  './js/nav.js',
  './js/commands.js',
  './js/dom-utils.js',
  './js/els.js',
  './js/context.js',
  './js/emptyState.js',
  './js/targets.js',
  './js/vocabulary.js',
  './js/toast.js',
  './js/file-utils.js',
  './js/tintaPackage.js',
  './js/autoBackup.js',
  './js/sprintPanel.js',
  './js/readAloud.js',
  './js/grammarModal.js',
  './js/backup.js',
  './js/wordCheckModal.js',
  './js/drawer.js',
  './js/modal.js',
  './js/annotationsModal.js',
  './js/manuscriptExport.js',
  './js/zip.js',
  './js/generator.js',
  './js/generatorModal.js',
  './js/ruleSystem.js',
  './js/store-core.js',
  './js/store-settings.js',
  './js/store-backup.js',
  './js/store-projects.js',
  './js/store-manuscript.js',
  './js/store-entities.js',
  './js/store-relationships.js',
  './js/store-world.js',
  './js/store-systems.js',
  './js/store-craft.js',
  './js/store-generators.js',
  './js/store-reports.js',
  './js/store.js',
  './js/search.js',
  './js/searchView.js',
  './js/notesView.js',
  './js/writeView.js',
  './js/palette.js',
  './js/format.js',
  './js/imagestore.js',
  './js/makeBlobStore.js',
  './js/assetstore.js',
  './js/recoveryStore.js',
  './js/recoveryToast.js',
  './js/theme.js',
  './js/editor.js',
  './js/mentions.js',
  './js/canvas.js',
  './js/canvasView.js',
  './js/sketchpad.js',
  './js/diff.js',
  './js/wordtools.js',
  './js/grammar.js',
  './js/ambience.js',
  './js/tts.js',
  './js/sprint.js',
  './js/typewriter.js',
  './js/corkboardView.js',
  './js/decisionsView.js',
  './js/mapView.js',
  './js/referencesView.js',
  './js/systemsView.js',
  './js/statsView.js',
  './js/snippetsView.js',
  './js/timelineView.js',
  './js/healthView.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
// P1-14 fix note: manifest references these two icons but they used to
// not be in SHELL_FILES, so installing Tinta as a PWA and then going
// offline would fail to fetch the icons (network-only path with no
// cache fallback). Now precached with everything else. The comment
// lives BELOW the array literal (not inside it) because the
// sw-precache.smoketest.mjs parser uses a naive regex to extract the
// array contents, and apostrophes inside comment text inside the
// array would be picked up as bogus entries.

self.addEventListener('install', (event) => {
  // Best-effort precache so there's an offline fallback from first launch
  // onward — the fetch handler below keeps this fresh afterward, so this
  // no longer needs to be "the" source of truth the way it was under
  // cache-first.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // v0.2.9 — now that CACHE_NAME is versioned (tinta-shell-v0.2.9), this
  // handler actually has real work to do on each release: it deletes every
  // cache that isn't the current version, including the old un-versioned
  // 'tinta-shell' cache and any prior versioned caches. This is the
  // standard SW update pattern — bump the version, old caches get cleaned
  // up automatically on activate. Combined with skipWaiting() in install
  // and clients.claim() below, this means a new Tinta release takes over
  // immediately on next load; the running page gets notified via
  // controllerchange (see app.js's SW-update toast) and the writer reloads
  // to pick up the new JS/CSS.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Cross-origin requests always go straight to the network, same as
  // before — never cached, never part of the offline fallback. This used
  // to matter for Google Fonts; since the canvas-and-trio pass the fonts
  // are same-origin files in fonts/ and precache with the shell, so the
  // app shell + webfonts all work offline together. The guard stays as
  // cheap insurance for anything external a module might fetch (the
  // opt-in grammar endpoint being the known one).
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Refresh the cache with whatever's actually live, so the offline
        // fallback tracks reality automatically instead of needing a
        // manual version bump to stop being stale.
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Historical context: see docs/CODEBASE_NOTES.md#jstheme-js-1-9

import * as Store from './store.js';
import * as AssetStore from './assetstore.js';

const THEMES = ['paper', 'void', 'sepia'];

// P1-10 fix — per-theme --bg values (from css/base.css) used to sync the
// <meta name="theme-color"> tag. Before this, the meta was stuck at
// #F7F5F0 (paper/light) forever, so in void mode the OS browser chrome,
// mobile URL bar, and PWA install splash all rendered paper-light while
// the app showed near-black. Mirrored to a const here (not read from CSS
// at runtime) because reading computed CSS custom properties requires
// the document to have rendered, and applyTheme can be called before
// the first paint. If the palette ever changes in base.css, update here.
const THEME_BG_COLORS = {
  paper: '#F7F5F0',
  void:  '#0a0910',
  sepia: '#EFE6D4',
};

function syncThemeColorMeta(theme) {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = THEME_BG_COLORS[theme] || THEME_BG_COLORS.paper;
  meta.setAttribute('content', bg);
}

export function currentTheme() {
  return Store.getTheme();
}

export function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'paper';
  document.documentElement.setAttribute('data-theme', theme);
  Store.setTheme(theme);
  // P1-10 — sync the meta so mobile URL bar / PWA chrome / install splash
  // match the active theme instead of being stuck on paper-light forever.
  syncThemeColorMeta(theme);
}

export function cycleTheme() {
  const idx = THEMES.indexOf(currentTheme());
  const next = THEMES[(idx + 1) % THEMES.length];
  applyTheme(next);
  return next;
}

export function initTheme() {
  const saved = Store.getTheme();
  document.documentElement.setAttribute('data-theme', saved);
  // P1-10 — sync the meta on init too, so first load (before any
  // applyTheme call) matches the saved theme instead of staying on the
  // index.html default of #F7F5F0.
  syncThemeColorMeta(saved);

  // Respect system preference only on true first-run (no saved db yet,
  // under either the current key or the pre-rename "scriptorium:db" one).
  //
  // The try/catch is not decoration. store-core.js's load() deliberately
  // guards its own localStorage reads, so Tinta survives a private-browsing
  // lockdown or a blocked-storage privacy setting at the store layer — but
  // this read was unguarded, so the same environment got past the store
  // only to throw here during theme init, taking the whole boot with it.
  // Two boot paths, one storage assumption; now they agree.
  let hasExistingDb = false;
  try {
    hasExistingDb = Boolean(localStorage.getItem('tinta:db') || localStorage.getItem('scriptorium:db'));
  } catch {
    // Storage unreachable — treat it as "can't tell", and leave the theme
    // on whatever Store resolved rather than overriding it from a system
    // preference we can't tell is a first run.
    return;
  }
  if (!hasExistingDb && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    applyTheme('void');
  }
}

function buildGradientCss({ colorA, colorB, direction }) {
  return `linear-gradient(${direction}, ${colorA}, ${colorB})`;
}

// ── background image size constraint ────────────────────────────────────
//
// A custom background used to be stored exactly as picked — a large user
// photo (a phone camera shot easily runs 4000×3000px+) sat in IndexedDB at
// full resolution and was decoded at full resolution by the browser as a
// body-level `background-image` layer present behind every view, for the
// whole session, repainted on scroll/resize. `background-size: cover`
// (css/base.css) already keeps it visually correct at any viewport, but
// it does nothing for the decode cost: the browser still has to hold the
// full decoded bitmap, however small it's ultimately drawn.
//
// MAX_BACKGROUND_IMAGE_DIMENSION is chosen relative to what the feature
// can ever actually show, not an arbitrary round number: `cover` means
// the image is cropped to fill the viewport, so nothing beyond the
// longer screen dimension is ever visible. 2560px covers a 2560×1440
// display at 1x or a 1280-wide viewport at 2x (retina) with headroom —
// comfortably past what a background layer needs, while capping a
// 4000×3000 (12MP) photo down to roughly a sixth of its original decoded
// memory footprint.
export const MAX_BACKGROUND_IMAGE_DIMENSION = 2560;
const BACKGROUND_IMAGE_JPEG_QUALITY = 0.85;

// Pure decision, deliberately separated from the DOM work below it: given
// an image's real dimensions, either null ("store it as-is") or the
// aspect-ratio-preserving target size to downscale to. Everything in
// prepareBackgroundImage that needs a browser (decoding the file, drawing
// to a canvas, re-encoding) is DOM-only and outside what this codebase's
// Node smoketest suite can exercise — see docs/ROADMAP.md's testing
// section. Pulling the actual arithmetic out into its own pure function
// means the one part most likely to hide an off-by-one or aspect-ratio
// bug is still covered by a real, automated test instead of resting on
// manual verification alone.
export function computeBackgroundImageTargetSize(width, height, maxDimension = MAX_BACKGROUND_IMAGE_DIMENSION) {
  if (width <= maxDimension && height <= maxDimension) return null;
  const scale = maxDimension / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Takes the raw File the person picked and returns what should actually
// be stored: the same file, untouched, if it's already within bounds (no
// reason to recompress an image that doesn't need it), or a downscaled
// JPEG re-encode if it isn't. Throws if the file can't be decoded as an
// image at all — the caller (settingsModal.js) catches that the same way
// it already catches a bad custom-font file, and shows it as a toast
// rather than silently storing something broken.
export async function prepareBackgroundImage(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const target = computeBackgroundImageTargetSize(bitmap.width, bitmap.height);
    if (!target) return file;

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, target.width, target.height);

    // toBlob is callback-based, not promise-based, natively.
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('could not encode the resized image'))),
        'image/jpeg',
        BACKGROUND_IMAGE_JPEG_QUALITY
      );
    });
  } finally {
    // Release the decoded pixel buffer promptly rather than waiting on
    // GC — this is exactly the memory the whole guard exists to bound.
    bitmap.close();
  }
}

// Tracks the previous custom-background object URL so switching images (or
// turning the custom background off) revokes it — same "don't leak blob
// URLs" discipline the Library cover-resolving code follows.
let currentBgObjectUrl = null;

// Historical context: see docs/CODEBASE_NOTES.md#jstheme-js-54-58
export async function applyBackground(settings = Store.getBackgroundSettings()) {
  const body = document.body;

  if (currentBgObjectUrl) {
    URL.revokeObjectURL(currentBgObjectUrl);
    currentBgObjectUrl = null;
  }

  if (settings.mode === 'gradient') {
    body.dataset.bgMode = 'gradient';
    body.style.setProperty('--custom-bg', buildGradientCss(settings.gradient));
  } else if (settings.mode === 'image') {
    const url = await AssetStore.getObjectUrl(AssetStore.KEYS.BACKGROUND_IMAGE);
    if (!url) {
      // Settings say 'image' but the blob is gone (e.g. cleared from
      // devtools, or a restored backup from before this pass) — fall back
      // to the theme's own default rather than showing nothing.
      delete body.dataset.bgMode;
      body.style.removeProperty('--custom-bg');
      body.style.removeProperty('--custom-bg-dim');
      return;
    }
    currentBgObjectUrl = url;
    body.dataset.bgMode = 'image';
    body.style.setProperty('--custom-bg', `url("${url}")`);
    body.style.setProperty('--custom-bg-dim', settings.imageDim);
  } else {
    delete body.dataset.bgMode;
    body.style.removeProperty('--custom-bg');
    body.style.removeProperty('--custom-bg-dim');
  }
}

// Called once at startup, after initTheme(). Kept separate (and async,
// unlike initTheme) since it has to await IndexedDB rather than just
// reading localStorage synchronously — see the module comment.
export async function initBackground() {
  await applyBackground();
}

// Historical context: see docs/CODEBASE_NOTES.md#jstheme-js-99-104

// P2-11 fix — central `applyFont(name)` helper. data-font used to be
// set in five separate places (app.js:462 every render, theme.js:217
// here in initCustomFont's fallback, settingsModal.js:424 on
// font-select change, :444 on custom-font upload, :456 on custom-font
// remove). The "font is set to 'custom' but the blob is missing → fall
// back to literata" branch was duplicated verbatim between
// theme.js:186-189 and settingsModal.js:454-457. Now this single
// helper owns both the setAttribute call AND the missing-blob
// fallback, so the five call sites can route through one source of
// truth. Behavior unchanged; just deduplicated.
export function applyFont(name) {
  if (typeof document === 'undefined') return;
  // If the requested font is 'custom' but the custom-font blob isn't
  // loaded (fresh session that hasn't run initCustomFont yet, blob
  // was cleared, etc.), fall back to literata — same logic the old
  // inline checks at the 5 call sites implemented.
  if (name === 'custom') {
    const { family } = Store.getCustomFont();
    if (!family) name = 'literata';
  }
  document.documentElement.setAttribute('data-font', name);
}

export async function initCustomFont() {
  const { family, fileName } = Store.getCustomFont();
  if (!family || !fileName) return;
  let blob = null;
  try {
    blob = await AssetStore.getBlob(AssetStore.KEYS.CUSTOM_FONT);
  } catch {
    blob = null; // blob store unavailable (fresh private session, transient IDB error) — same path as a missing blob
  }
  if (!blob) {
// Historical context: see docs/CODEBASE_NOTES.md#jstheme-js-116-124
    if (Store.getManuscriptFont() === 'custom') {
      Store.setManuscriptFont('literata');
      // P2-11 — route through the central helper instead of inline
      // setAttribute.
      applyFont('literata');
    }
    return;
  }
  await registerCustomFont(blob, family);
}

// Historical context: see docs/CODEBASE_NOTES.md#jstheme-js-134-140
export async function registerCustomFont(blob, family) {
  const buffer = await blob.arrayBuffer();
  const fontFace = new FontFace(family, buffer);
  await fontFace.load();
  document.fonts.add(fontFace);
  document.documentElement.style.setProperty('--custom-font-family', `"${family}"`);
}

// Historical context: see docs/CODEBASE_NOTES.md#jstheme-js-149-154
export function deriveFontFamilyName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9 \-]/g, '').trim() || 'Custom Font';
  return `${base} ${Math.random().toString(36).slice(2, 6)}`;
}

// Historical context: see docs/CODEBASE_NOTES.md#jstheme-js-160-164
export const MOTION_SPEED_SCALE = { subtle: 0.6, normal: 1, relaxed: 1.7 };
export function applyMotionSpeed(speed) {
  document.documentElement.style.setProperty('--motion-chapter-scale', String(MOTION_SPEED_SCALE[speed] ?? 1));
}

// Tinta — service worker registration.
//
// Roadmap #6 — this lived as an inline <script> at the bottom of
// index.html. The CSP meta tag that hardens the shell says
// `script-src 'self'`, which forbids inline scripts — so the registration
// moved into its own module file, which the service worker also precaches
// (sw.js's SHELL_FILES). Behavior is byte-identical to the old inline
// block: register on window load, swallow failures (the app is fully
// functional without the SW; it just loses offline precache).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

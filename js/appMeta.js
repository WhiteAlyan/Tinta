// appMeta (0.3.0 fast-beautiful-trustworthy) — the version/phase/creator triple the About section
// shows. Own module so settingsModal.js can read it without importing app.js.
//
// Roadmap #8 — this triple had drifted three releases behind the code:
// it still read 0.2.8 "Own the Vault" while the v0.2.9 "app disappears"
// onboarding release and the v0.3 editor-preview pass (Typora-style
// always-on rendering, {{u:text}} underline, the image URL cache) were
// already shipped and commented as such across editor.js / format.js /
// onboarding.js. The phase label is the project's own v0.3 charter from
// docs/TINTA-MASTER-TRUTH.md: "MAKE THE MONSTER FAST, BEAUTIFUL,
// TRUSTWORTHY, AND EXTENSIBLE".


// Historical context: see docs/CODEBASE_NOTES.md#jsappmeta-js
export const TINTA_VERSION = '0.3.0';
export const TINTA_PHASE = 'Fast, Beautiful, Trustworthy';
export const TINTA_CREATOR = 'Zyeha Light • White Alyan';

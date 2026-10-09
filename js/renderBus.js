// Historical context: see docs/CODEBASE_NOTES.md#jsrenderbus-js-1-5
let renderer = null;
export function setRenderer(fn) {
  renderer = fn;
}
export function requestRender(opts) {
  if (renderer) renderer(opts);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsportraits-js-1-5
import * as ImageStore from './imagestore.js';
import { html, toBridge } from './dom-utils.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsportraits-js-9-15
export let entityPortraitUrls = [];

// Historical context: see docs/CODEBASE_NOTES.md#jsportraits-js-18-24
export async function resolveEntityAvatar(container, imageId) {
  try {
    const url = await ImageStore.getObjectUrl(imageId);
// Historical context: see docs/CODEBASE_NOTES.md#jsportraits-js-28-33
    if (url) entityPortraitUrls.push(url);
    if (!container.isConnected) return; // view re-rendered before this resolved
    if (url) {
      container.innerHTML = toBridge(html`<img src="${url}" alt="" class="entity-avatar-img" />`);
    } else {
      container.innerHTML = toBridge(html`<span class="image-thumb-missing">✕</span>`);
    }
  } catch {
    container.innerHTML = toBridge(html`<span class="image-thumb-missing">✕</span>`);
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsportraits-js-46-53
export function revokeEntityPortraitUrls() {
  entityPortraitUrls.forEach((url) => URL.revokeObjectURL(url));
  entityPortraitUrls = [];
}
// The push-side door for the same registry — kept trivial on purpose.
export function trackEntityPortraitUrl(url) {
  entityPortraitUrls.push(url);
}

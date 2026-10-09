// Tinta — modal.js smoketest (v0.2 Pass 1, shared modal shell).
//
// Purpose-built minimal DOM shim rather than module-load.smoketest.mjs's
// no-op shim — this test needs real (if tiny) behavior: #modal-root's
// innerHTML actually holds state, document-level listeners actually
// accumulate in an array so "no stacking on repeated opens" is a real
// assertion instead of an assumption. module-load.smoketest.mjs still
// covers that modal.js's imports resolve; this covers the contract
// V0.2-UNIFICATION-PLAN.md's Pass 1 called out explicitly: teardown, one
// onClose per open, no listener stacking on repeated opens — the exact
// bug class (closeModal() as an accidental global reset, document-level
// click listeners added without remove-first) found and fixed multiple
// times elsewhere in this project before this shell existed.
//
// Run with: node modal.smoketest.mjs

// ── minimal DOM shim, purpose-built for modal.js's actual surface ──────
const backdropEl = { tagName: 'DIV', className: 'modal-backdrop' };
const panelEl = { tagName: 'DIV', className: 'modal-panel' }; // "clicked inside the panel, not the backdrop"

let rootInnerHTML = '';
let closeBtnHandlers = [];
const modalRootEl = {
  get innerHTML() { return rootInnerHTML; },
  set innerHTML(v) { rootInnerHTML = v; closeBtnHandlers = []; },
  querySelector(sel) {
    if (sel === '.modal-backdrop') return rootInnerHTML.includes('modal-backdrop') ? backdropEl : null;
    return null;
  },
};
const closeBtnEl = {
  addEventListener(type, handler) { if (type === 'click') closeBtnHandlers.push(handler); },
};

const docListeners = { click: [], keydown: [] };

// ── #confirm-root shim (registry pass — confirmDialog tests) ─────────
// confirmDialog creates its own root lazily via document.createElement and
// wires its two buttons by id; the stubs below mirror modalRootEl's
// innerHTML-keyed pattern so the contract tests can drive every close path.
let confirmInnerHTML = '';
let confirmOkHandlers = [];
let confirmCancelHandlers = [];
let noticeOkHandlers = [];
let confirmFocusTarget = '';
let promptSelected = false;
const confirmBackdropEl = { tagName: 'DIV', className: 'modal-backdrop confirm-backdrop' };
const makeConfirmBtn = (id, list) => ({
  focus() { confirmFocusTarget = id; },
  addEventListener(type, handler) { if (type === 'click') list.push(handler); },
});
const confirmOkBtn = makeConfirmBtn('ok', confirmOkHandlers);
const confirmCancelBtn = makeConfirmBtn('cancel', confirmCancelHandlers);
const noticeOkBtn = makeConfirmBtn('notice', noticeOkHandlers);
// promptDialog's input — value is plain state, select() mirrors the native
// prompt's preselected-default affordance the real dialog relies on.
const promptInputEl = {
  value: '',
  focus() { confirmFocusTarget = 'input'; },
  select() { promptSelected = true; },
  addEventListener() {},
};
const confirmRootEl = {
  id: '',
  get innerHTML() { return confirmInnerHTML; },
  set innerHTML(v) { confirmInnerHTML = v; confirmOkHandlers.length = 0; confirmCancelHandlers.length = 0; noticeOkHandlers.length = 0; promptSelected = false; },
  querySelector(sel) {
    if (sel === '.confirm-backdrop') return confirmInnerHTML.includes('confirm-backdrop') ? confirmBackdropEl : null;
    if (sel === '#confirm-ok-btn') return confirmInnerHTML.includes('id="confirm-ok-btn"') ? confirmOkBtn : null;
    if (sel === '#confirm-cancel-btn') return confirmInnerHTML.includes('id="confirm-cancel-btn"') ? confirmCancelBtn : null;
    if (sel === '#notice-ok-btn') return confirmInnerHTML.includes('id="notice-ok-btn"') ? noticeOkBtn : null;
    if (sel === '#confirm-input') return confirmInnerHTML.includes('id="confirm-input"') ? promptInputEl : null;
    return null;
  },
  appendChild() {},
};

globalThis.document = {
  getElementById(id) {
    if (id === 'modal-root') return modalRootEl;
    if (id === 'modal-close') return rootInnerHTML.includes('id="modal-close"') ? closeBtnEl : null;
    if (id === 'confirm-root') return confirmInnerHTML ? confirmRootEl : null; // lazy-create path re-reads q('confirm-root')
    return null;
  },
  // confirmDialog's lazy root creation — singleton is fine (one confirm at
  // a time is the module's own contract, asserted below).
  createElement(tag) { confirmRootEl.id = ''; return confirmRootEl; },
  body: { appendChild() {} },
  activeElement: null,
  addEventListener(type, handler) {
    docListeners[type] = docListeners[type] || [];
    docListeners[type].push(handler);
  },
  removeEventListener(type, handler) {
    docListeners[type] = (docListeners[type] || []).filter((h) => h !== handler);
  },
};

function dispatchClick(target) {
  docListeners.click.slice().forEach((h) => h({ target }));
}
function dispatchEscape() {
  // preventDefault/stopPropagation: the confirmDialog capture handler
  // calls both (it must stop a host modal's own Escape teardown); the
  // modal shell's handler ignores them.
  docListeners.keydown.slice().forEach((h) => h({ key: 'Escape', preventDefault() {}, stopPropagation() {} }));
}
function dispatchOtherKey() {
  docListeners.keydown.slice().forEach((h) => h({ key: 'Tab' }));
}
function clickCloseButton() {
  closeBtnHandlers.slice().forEach((h) => h());
}

const { openModal, teardown, confirmDialog, promptDialog, noticeDialog } = await import('./modal.js');

// ── test harness (same shape as every other smoketest) ─────────────────
let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(title) { console.log(`\n${title}`); }
function resetAll() {
  rootInnerHTML = '';
  closeBtnHandlers = [];
  docListeners.click = [];
  docListeners.keydown = [];
}

// ── 1. Basic open renders the frame ─────────────────────────────────────
section('openModal — basic render');
resetAll();
openModal({ title: 'Hello', body: '<p>body</p>' });
assert(rootInnerHTML.includes('modal-backdrop'), 'backdrop present after open');
assert(rootInnerHTML.includes('Hello'), 'title rendered');
assert(rootInnerHTML.includes('<p>body</p>'), 'body rendered as-is (caller-escaping contract, no double-escape)');
assert(rootInnerHTML.includes('id="modal-close"'), 'close button present by default');
teardown();

// ── 2. showHeader: false omits header entirely ──────────────────────────
section('openModal — showHeader:false omits header/close button');
resetAll();
openModal({ body: '<p>no header</p>', showHeader: false });
assert(!rootInnerHTML.includes('id="modal-close"'), 'no close button when showHeader is false');
assert(rootInnerHTML.includes('no header'), 'body still renders');
teardown();

// ── 3. className applied to the panel ───────────────────────────────────
section('openModal — className applied');
resetAll();
openModal({ body: 'x', className: 'annotations-modal' });
assert(rootInnerHTML.includes('modal-panel annotations-modal'), 'custom class appended to modal-panel');
teardown();

// ── 4. teardown clears root and is idempotent ───────────────────────────
section('teardown — clears root, idempotent, reports wasOpen correctly');
resetAll();
openModal({ body: 'x' });
const firstTeardown = teardown();
assertEqual(rootInnerHTML, '', 'root cleared after teardown');
assertEqual(firstTeardown, true, 'teardown() reports it actually closed something');
const secondTeardown = teardown();
assertEqual(secondTeardown, false, 'teardown() on an already-closed root reports false, not an error');

// ── 5. onClose runs exactly once per open, only when actually open ──────
section('onClose — runs once on genuine close, not on a no-op teardown');
resetAll();
let closeCount = 0;
openModal({ body: 'x', onClose: () => { closeCount++; } });
teardown();
assertEqual(closeCount, 1, 'onClose fired once on the real close');
teardown();
assertEqual(closeCount, 1, 'onClose did NOT fire again on the already-closed no-op teardown');

// ── 6. Backdrop click closes; clicking inside the panel does not ────────
section('outside-click — backdrop closes, panel click does not');
resetAll();
let onCloseFired = false;
openModal({ body: 'x', onClose: () => { onCloseFired = true; } });
dispatchClick(panelEl);
assert(rootInnerHTML !== '', 'clicking inside the panel leaves the modal open');
assert(!onCloseFired, 'onClose not fired by an inside click');
dispatchClick(backdropEl);
assertEqual(rootInnerHTML, '', 'clicking the backdrop itself closes the modal');
assert(onCloseFired, 'onClose fired by the backdrop click');

// ── 7. Escape closes; other keys do not ──────────────────────────────────
section('Escape — closes modal, other keys are no-ops');
resetAll();
openModal({ body: 'x' });
dispatchOtherKey();
assert(rootInnerHTML !== '', 'a non-Escape keydown leaves the modal open');
dispatchEscape();
assertEqual(rootInnerHTML, '', 'Escape closes the modal');

// ── 8. Close button (X) closes the modal ────────────────────────────────
section('close button — X click closes the modal');
resetAll();
openModal({ body: 'x' });
clickCloseButton();
assertEqual(rootInnerHTML, '', 'X button click closes the modal');

// ── 9. THE core regression: repeated opens never stack listeners ────────
// This is the exact bug class Pass 1 exists to retire — a document-level
// click/keydown listener added on open with no remove-before-add guard,
// found and fixed four separate times elsewhere in this project (snippet
// menu, drawer, Library grid, Resume view — see
// V0.2-UNIFICATION-PLAN.md's Pass 4 list). bindGlobalListeners() always
// unbinds before binding; this proves it holds under repeated opens,
// including re-entrant opens (a second openModal() while the first is
// still "open," e.g. one modal's flow opening another on top).
section('no listener stacking — repeated opens, including re-entrant ones');
resetAll();
for (let i = 0; i < 5; i++) {
  openModal({ body: `iteration ${i}` });
  assertEqual(docListeners.click.length, 1, `click listener count stays at 1 after open #${i + 1}`);
  assertEqual(docListeners.keydown.length, 1, `keydown listener count stays at 1 after open #${i + 1}`);
}
// Re-entrant: open a second modal WITHOUT tearing down the first first —
// openModal() itself must call teardown() internally before rebinding.
openModal({ body: 'first' });
openModal({ body: 'second, opened on top of the first without closing it' });
assertEqual(docListeners.click.length, 1, 're-entrant open still leaves exactly one click listener');
assertEqual(docListeners.keydown.length, 1, 're-entrant open still leaves exactly one keydown listener');
assert(rootInnerHTML.includes('second'), 'the second modal is the one actually showing');
teardown();
assertEqual(docListeners.click.length, 0, 'listeners fully unbound after final teardown');
assertEqual(docListeners.keydown.length, 0, 'listeners fully unbound after final teardown');

// ── 10. Re-entrant open runs the FIRST modal's onClose, not a leak ──────
section('re-entrant open — opening a second modal runs the first one\'s onClose');
resetAll();
let firstOnCloseFired = false;
let secondOnCloseFired = false;
openModal({ body: 'first', onClose: () => { firstOnCloseFired = true; } });
openModal({ body: 'second', onClose: () => { secondOnCloseFired = true; } });
assert(firstOnCloseFired, 'opening on top of an unclosed modal runs the first modal\'s onClose (no orphaned callback)');
assert(!secondOnCloseFired, 'the second modal\'s onClose has not fired yet — it\'s still open');
teardown();
assert(secondOnCloseFired, 'closing the (second, now-active) modal runs its own onClose');

// ── 11. onClose that itself opens a new modal doesn't get clobbered ─────
// The bug this guards: teardown() used to unconditionally clear
// #modal-root AFTER running onClose, with no check for whether onClose
// had itself just called openModal() (e.g. a "Details" modal's onClose
// navigating straight into another modal, openLibraryDetails →
// openLibrary()'s real shape in app.js). That left the newly-opened
// modal flashing on screen for one tick and then instantly wiped blank
// by the outer teardown() finishing its own cleanup. Caught via a live
// repro against this exact shape before the fix landed.
section('onClose opening another modal — the new modal survives, not clobbered');
resetAll();
openModal({
  title: 'Details',
  body: 'details body',
  onClose: () => { openModal({ title: 'Library', body: 'library body' }); },
});
clickCloseButton(); // closes Details, whose onClose opens Library
assert(rootInnerHTML.includes('Library'), 'the modal opened from within onClose is still showing, not blanked');
assert(rootInnerHTML.includes('library body'), 'its body content survived too');
teardown();
assertEqual(rootInnerHTML, '', 'the re-entrantly-opened modal still tears down cleanly on its own close');

// ── 12. confirmDialog (registry pass) ──────────────────────────────────
// The themed replacement for native confirm(): own root (never touches
// #modal-root), promise contract (true ONLY via the confirm action),
// danger-focus discipline, focus restoration, supersession, and escaping.
section('confirmDialog — resolves true on confirm click');
{
  let focused = '';
  document.activeElement = { focus() { focused = 'restored'; } };
  const p = confirmDialog({ title: 'Delete this map?', message: 'This can\'t be undone.', confirmLabel: 'Delete', danger: true });
  await Promise.resolve(); // let the open path finish wiring
  assert(confirmInnerHTML.includes('confirm-backdrop') && confirmInnerHTML.includes('alertdialog'), 'renders in its own root with alertdialog semantics');
  assert(confirmInnerHTML.includes('confirm-btn-danger'), 'danger=true styles the confirm button as destructive');
  assert(confirmFocusTarget === 'cancel', 'danger dialog focuses CANCEL (the least destructive action)');
  assert(focused === '', 'previously focused element not yet touched');
  confirmOkHandlers.slice().forEach((h) => h());
  const result = await p;
  assert(result === true, 'confirm click resolves true');
  assert(confirmInnerHTML === '', 'root cleared after resolve');
  assert(focused === 'restored', 'focus restored to whoever held it before the dialog');
  document.activeElement = null;
}

section('confirmDialog — Escape, backdrop, Cancel, and Enter paths');
{
  const p1 = confirmDialog({ title: 'A', message: 'a' });
  await Promise.resolve();
  dispatchEscape();
  assert(await p1 === false, 'Escape resolves false and clears the root');

  const p2 = confirmDialog({ title: 'B', message: 'b' });
  await Promise.resolve();
  dispatchClick(confirmBackdropEl);
  assert(await p2 === false, 'backdrop click resolves false');

  const p3 = confirmDialog({ title: 'C', message: 'c' });
  await Promise.resolve();
  confirmCancelHandlers.slice().forEach((h) => h());
  assert(await p3 === false, 'Cancel resolves false');

  const p4 = confirmDialog({ title: 'D', message: 'd' });
  await Promise.resolve();
  // Enter with focus NOT on a button confirms (e.target without a button
  // ancestor); the button-native Enter path never reaches this handler.
  docListeners.keydown.slice().forEach((h) => h({ key: 'Enter', target: {}, preventDefault() {}, stopPropagation() {} }));
  assert(await p4 === true, 'Enter (outside the buttons) resolves true');

  const p5 = confirmDialog({ title: 'E', message: 'e' });
  await Promise.resolve();
  dispatchOtherKey();
  dispatchClick(panelEl); // a click inside the panel — not the backdrop
  assert(confirmInnerHTML !== '', 'unrelated key and in-panel click leave the dialog open');
  confirmOkHandlers.slice().forEach((h) => h());
  assert(await p5 === true, 'dialog still resolves normally afterwards');
}

section('confirmDialog — non-danger focuses confirm; supersession; escaping');
{
  const p = confirmDialog({ title: 'Share?', message: 's', confirmLabel: 'Share' });
  await Promise.resolve();
  assert(confirmFocusTarget === 'ok', 'non-danger dialog focuses the confirm button');
  assert(!confirmInnerHTML.includes('confirm-btn-danger'), 'no danger styling without danger=true');

  const pPending = confirmDialog({ title: 'F', message: 'f' });
  await Promise.resolve();
  const pNext = confirmDialog({ title: 'G', message: 'g' }); // supersedes pPending
  assert(await pPending === false, 'a superseded confirm resolves false (cancelled)');
  confirmOkHandlers.slice().forEach((h) => h());
  assert(await pNext === true, 'the superseding dialog still works');

  const pEsc = confirmDialog({ title: '<b>evil</b>', message: '<img src=x onerror=1>' });
  await Promise.resolve();
  assert(!confirmInnerHTML.includes('<b>evil') && !confirmInnerHTML.includes('<img'), 'title and message are escaped — no injection through the text contract');
  // 0.2.5 regression pin — the dialogs pass pre-escaped title/message with
  // escapeHtml() AND rendered them through html``, which escapes again, so
  // every quote hit the screen as a literal "&quot;" (user-reported on the
  // very first delete confirm anyone opened). Quotes/apostrophes must be
  // escaped exactly ONCE: present as entities in the markup (injection
  // safety, asserted above) but never as a SECOND-escaped ampersand.
  const pQuote = confirmDialog({ title: 'Delete "Tina Arts"?', message: "Won't affect mentions." });
  await Promise.resolve();
  assert(!confirmInnerHTML.includes('&amp;'), 'plain-text quotes are escaped exactly once — no double-escaped &amp;quot; leaks to the screen');
  assert(confirmInnerHTML.includes('Delete &quot;Tina Arts&quot;?'), 'quote renders as a quote, not an entity artifact');
  dispatchEscape();
  assert(await pQuote === false, 'quote dialog tears down cleanly');
  dispatchEscape();
  assert(await pEsc === false, 'and it still tears down cleanly afterwards');
}

// ── 13. promptDialog + noticeDialog (dialogs pass) ─────────────────────
// Native prompt()/alert() replacements on the confirmDialog skeleton.
// The contracts that matter: prompt resolves the RAW input value on OK
// (callers keep their own trim/empty handling) and null on every cancel
// path; notice resolves true on OK and false everywhere else; both share
// the supersession slot with confirm.
section('promptDialog — OK and Enter resolve the raw value; default preselected');
{
  let focused = '';
  document.activeElement = { focus() { focused = 'restored'; } };
  const p = promptDialog({ title: 'Rename novel', defaultValue: 'My Novel', okLabel: 'Rename' });
  await Promise.resolve();
  assert(confirmInnerHTML.includes('id="confirm-input"'), 'renders an input in its own root');
  assert(confirmInnerHTML.includes('role="dialog"') && !confirmInnerHTML.includes('alertdialog'), 'prompt uses dialog semantics, not alertdialog');
  assert(confirmInnerHTML.includes('Rename'), 'custom okLabel rendered');
  assert(confirmFocusTarget === 'input', 'input is focused on open');
  assert(promptSelected, 'default value preselected, like native prompt');
  promptInputEl.value = '  Renamed  ';
  confirmOkHandlers.slice().forEach((h) => h());
  const result = await p;
  assert(result === '  Renamed  ', 'OK resolves the RAW input value — trimming stays the caller\u2019s job');
  assert(confirmInnerHTML === '', 'root cleared after resolve');
  assert(focused === 'restored', 'focus restored to whoever held it');

  const p2 = promptDialog({ title: 'B', message: 'b' });
  await Promise.resolve();
  promptInputEl.value = '';
  docListeners.keydown.slice().forEach((h) => h({ key: 'Enter', target: {}, preventDefault() {}, stopPropagation() {} }));
  assert(await p2 === '', 'Enter (outside the buttons) resolves the untouched empty value');
}

section('promptDialog — Escape, Cancel, backdrop all resolve null');
{
  const p1 = promptDialog({ title: 'A', defaultValue: 'a' });
  await Promise.resolve();
  dispatchEscape();
  assert(await p1 === null, 'Escape resolves null');

  const p2 = promptDialog({ title: 'B', defaultValue: 'b' });
  await Promise.resolve();
  promptInputEl.value = 'typed before cancelling';
  confirmCancelHandlers.slice().forEach((h) => h());
  assert(await p2 === null, 'Cancel resolves null (typed text discarded, not returned)');

  const p3 = promptDialog({ title: 'C', defaultValue: 'c' });
  await Promise.resolve();
  dispatchClick(confirmBackdropEl);
  assert(await p3 === null, 'backdrop click resolves null');

  const p4 = promptDialog({ title: '<img src=x>', message: '<b>evil</b>' });
  await Promise.resolve();
  assert(!confirmInnerHTML.includes('<img src=x') && !confirmInnerHTML.includes('<b>evil'), 'title and message are escaped');
  dispatchEscape();
  assert(await p4 === null, 'and it tears down cleanly afterwards');
}

section('promptDialog — message optional; cross-kind supersession');
{
  const p = promptDialog({ title: 'Bare' });
  await Promise.resolve();
  assert(!confirmInnerHTML.includes('confirm-message'), 'no message element when message is empty');
  dispatchEscape();
  assert(await p === null, 'closed');

  const pPending = promptDialog({ title: 'P1' });
  await Promise.resolve();
  const cNext = confirmDialog({ title: 'C1', message: 'c' }); // supersedes the prompt
  assert(await pPending === null, 'a confirm superseding a prompt resolves it null');
  confirmOkHandlers.slice().forEach((h) => h());
  assert(await cNext === true, 'the superseding confirm still works');

  const nPending = noticeDialog({ title: 'N1', message: 'n' });
  await Promise.resolve();
  const pNext = promptDialog({ title: 'P2' }); // supersedes the notice
  assert(await nPending === false, 'a prompt superseding a notice resolves it false');
  promptInputEl.value = 'x';
  confirmOkHandlers.slice().forEach((h) => h());
  assert(await pNext === 'x', 'the superseding prompt still works');
}

section('noticeDialog — OK and Enter resolve true; Escape and backdrop false; newlines kept');
{
  let focused = '';
  document.activeElement = { focus() { focused = 'restored'; } };
  const p = noticeDialog({ title: 'System generated', message: 'line one\n\nline two <script>', okLabel: 'Got it' });
  await Promise.resolve();
  assert(confirmInnerHTML.includes('alertdialog'), 'notice uses alertdialog semantics (it IS an alert)');
  assert(!confirmInnerHTML.includes('<script>'), 'message is escaped');
  assert(confirmInnerHTML.includes('line one\n\nline two'), 'newlines survive escaping (pre-line renders them)');
  assert(confirmFocusTarget === 'notice', 'the single OK button is focused on open');
  noticeOkHandlers.slice().forEach((h) => h());
  assert(await p === true, 'OK click resolves true');
  assert(focused === 'restored', 'focus restored');
  document.activeElement = null;

  const p2 = noticeDialog({ title: 'B', message: 'b' });
  await Promise.resolve();
  docListeners.keydown.slice().forEach((h) => h({ key: 'Enter', target: {}, preventDefault() {}, stopPropagation() {} }));
  assert(await p2 === true, 'Enter resolves true');

  const p3 = noticeDialog({ title: 'C', message: 'c' });
  await Promise.resolve();
  dispatchEscape();
  assert(await p3 === false, 'Escape resolves false');

  const p4 = noticeDialog({ title: 'D', message: 'd' });
  await Promise.resolve();
  dispatchClick(confirmBackdropEl);
  assert(await p4 === false, 'backdrop click resolves false');

  const cPending = confirmDialog({ title: 'C2', message: 'c' });
  await Promise.resolve();
  const nNext = noticeDialog({ title: 'N2', message: 'n' }); // supersedes the confirm
  assert(await cPending === false, 'a notice superseding a confirm resolves it false');
  noticeOkHandlers.slice().forEach((h) => h());
  assert(await nNext === true, 'the superseding notice still works');
}

// ── summary ────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}

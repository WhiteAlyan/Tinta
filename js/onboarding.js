// Tinta — onboarding (v0.2.9 "app disappears" release).
//
// 3-card first-boot flow. Only shows when onboardingComplete is false
// (new installs). Existing installs migrated from v4 get
// onboardingComplete = true, so they never see this.
//
// Card 1: "What should we call you?" — single text input for writerName
// Card 2: "How much do you want to see?" — 3 density chips
// Card 3: "Pick your paper" — font + theme pickers
//
// The writer should be typing their first sentence within 30 seconds
// of opening the app for the first time. Everything else can be
// discovered later — the density toggle is always in Settings.

import * as Store from './store.js';
import { html, toBridge, q } from './dom-utils.js';
import { showWelcomeScreen, resetWelcomeScreen } from './welcomeScreen.js';

let overlayEl = null;
let currentStep = 0;

const DENSITY_OPTIONS = [
  {
    value: 'simple',
    label: 'Simple',
    desc: 'Hides the advanced views — Canvas, Systems, References, Timeline, Sketch, Stats, Health, Checklist, Decisions. Bring them back in Settings anytime.',
  },
  {
    value: 'normal',
    label: 'Normal',
    desc: 'Every view visible. The default Tinta experience — nothing hidden, nothing extra.',
  },
  {
    value: 'maximum',
    label: 'Maximum',
    desc: 'Same full set as Normal today. Reserved for diagnostic surfaces as they land, so picking it now means you get them automatically.',
  },
];

const FONT_OPTIONS = [
  { value: 'literata', label: 'Literata', desc: 'Warm serif. The default.' },
  { value: 'hyperlegible', label: 'Atkinson Hyperlegible', desc: 'High-contrast sans. Designed for readability.' },
  { value: 'mono', label: 'JetBrains Mono', desc: 'Monospace. For a typewriter feel.' },
];

const THEME_OPTIONS = [
  { value: 'paper', label: 'Paper', desc: 'Warm off-white. Daytime.' },
  { value: 'void', label: 'Void', desc: 'Dark. Nighttime.' },
  { value: 'sepia', label: 'Sepia', desc: 'Faded warmth. Aged paper.' },
];

function renderCard() {
  const steps = ['Your name', 'Workspace', 'Your paper'];
  const stepLabel = `Step ${currentStep + 1} of 3 — ${steps[currentStep]}`;

  // Bug-report fix — body must stay as a SafeHtml object (from html``),
  // NOT a string (from toBridge). If we toBridge it here, the outer
  // html`` template sees a plain string and escapes it — showing raw
  // <input> tags as text on screen. Keep it as SafeHtml so the outer
  // template inserts it verbatim.
  let body;
  if (currentStep === 0) {
    body = html`
      <input id="onboarding-name-input" class="onboarding-input" type="text"
        placeholder="Your name or pen name"
        value="${Store.getWriterName()}"
        autocomplete="off" />
    `;
  } else if (currentStep === 1) {
    const current = Store.getWorkspaceDensity();
    body = html`
      <div class="onboarding-chips" role="radiogroup" aria-label="Workspace density">
        ${DENSITY_OPTIONS.map((opt) => html`
          <button type="button" role="radio" aria-checked="${opt.value === current ? 'true' : 'false'}" class="onboarding-chip${opt.value === current ? ' selected' : ''}" data-density="${opt.value}">
            <div class="onboarding-chip-dot"></div>
            <div class="onboarding-chip-text">
              <p class="onboarding-chip-label">${opt.label}</p>
              <p class="onboarding-chip-desc">${opt.desc}</p>
            </div>
          </button>
        `)}
      </div>
    `;
  } else if (currentStep === 2) {
    const currentFont = Store.getManuscriptFont();
    const currentTheme = Store.getTheme();
    body = html`
      <div class="onboarding-chips" role="radiogroup" aria-label="Manuscript font">
        ${FONT_OPTIONS.map((opt) => html`
          <button type="button" role="radio" aria-checked="${opt.value === currentFont ? 'true' : 'false'}" class="onboarding-chip${opt.value === currentFont ? ' selected' : ''}" data-font="${opt.value}">
            <div class="onboarding-chip-dot"></div>
            <div class="onboarding-chip-text">
              <p class="onboarding-chip-label">${opt.label}</p>
              <p class="onboarding-chip-desc">${opt.desc}</p>
            </div>
          </button>
        `)}
      </div>
      <div class="onboarding-chips" role="radiogroup" aria-label="Theme" style="margin-top: 16px">
        ${THEME_OPTIONS.map((opt) => html`
          <button type="button" role="radio" aria-checked="${opt.value === currentTheme ? 'true' : 'false'}" class="onboarding-chip${opt.value === currentTheme ? ' selected' : ''}" data-theme="${opt.value}">
            <div class="onboarding-chip-dot"></div>
            <div class="onboarding-chip-text">
              <p class="onboarding-chip-label">${opt.label}</p>
              <p class="onboarding-chip-desc">${opt.desc}</p>
            </div>
          </button>
        `)}
      </div>
    `;
  }

  const isLast = currentStep === 2;
  const isFirst = currentStep === 0;

  return toBridge(html`
    <div class="onboarding-card">
      <p class="onboarding-step">${stepLabel}</p>
      ${currentStep === 0 ? html`<h2 class="onboarding-title">What should we call you?</h2>` : ''}
      ${currentStep === 1 ? html`<h2 class="onboarding-title">How much do you want to see?</h2>` : ''}
      ${currentStep === 2 ? html`<h2 class="onboarding-title">Pick your paper</h2>` : ''}
      ${currentStep === 0 ? html`<p class="onboarding-subtitle">This is how Tinta will greet you when you open the app. You can change it later in Settings.</p>` : ''}
      ${currentStep === 1 ? html`<p class="onboarding-subtitle">You can always switch this later in Settings — nothing is locked.</p>` : ''}
      ${currentStep === 2 ? html`<p class="onboarding-subtitle">Choose a font and theme. Both are adjustable anytime.</p>` : ''}
      ${body}
      <div class="onboarding-actions">
        ${isFirst ? html`<button class="onboarding-skip" id="onboarding-skip-btn">Skip setup</button>` : html`<button class="onboarding-skip" id="onboarding-back-btn">← Back</button>`}
        <button class="toolbar-btn" id="onboarding-next-btn">${isLast ? 'Start writing →' : 'Next →'}</button>
      </div>
    </div>
  `);
}

// The three chip groups were three near-identical blocks that each only
// toggled a CSS class. Now that the chips are real radio-role buttons,
// aria-checked has to move with the selection too — doing that in one
// place means the three groups can't drift apart.
//
// aria-checked needs explicit "true"/"false" STRINGS; a raw boolean
// interpolates to an empty attribute value and screen readers read the
// control as unchecked.
function wireChipGroup(dataAttr, onPick) {
  const chips = [...document.querySelectorAll(`.onboarding-chip[${dataAttr}]`)];
  const key = dataAttr.replace(/^data-/, '');
  const select = (chip) => {
    onPick(chip.dataset[key]);
    chips.forEach((c) => {
      const isChosen = c === chip;
      c.classList.toggle('selected', isChosen);
      c.setAttribute('aria-checked', isChosen ? 'true' : 'false');
    });
  };
  chips.forEach((chip, index) => {
    // Click and Enter/Space come free with <button>. Arrow keys don't —
    // a radiogroup is expected to move selection with them, same as the
    // nav flyout's arrow handling.
    chip.addEventListener('click', () => select(chip));
    chip.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const step = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
      const next = chips[(index + step + chips.length) % chips.length];
      next.focus();
      select(next);
    });
  });
}

function wireCard() {
  if (currentStep === 0) {
    const input = q('onboarding-name-input');
    if (input) {
      input.focus();
      input.addEventListener('input', () => {
        Store.setWriterName(input.value);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          q('onboarding-next-btn')?.click();
        }
      });
    }
  } else if (currentStep === 1) {
    wireChipGroup('data-density', (value) => Store.setWorkspaceDensity(value));
  } else if (currentStep === 2) {
    wireChipGroup('data-font', (value) => Store.setManuscriptFont(value));
    wireChipGroup('data-theme', (value) => Store.setTheme(value));
  }

  q('onboarding-next-btn')?.addEventListener('click', () => {
    if (currentStep < 2) {
      currentStep++;
      render();
    } else {
      complete();
    }
  });

  q('onboarding-back-btn')?.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      render();
    }
  });

  q('onboarding-skip-btn')?.addEventListener('click', () => {
    complete();
  });
}

function render() {
  if (!overlayEl) return;
  overlayEl.querySelector('.onboarding-card')?.remove();
  overlayEl.innerHTML = renderCard();
  wireCard();
}

function complete() {
  Store.setOnboardingComplete(true);
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  // Now that onboarding is complete, show the welcome screen for the
  // first time (the writer just set their name, so it'll say "Welcome
  // back, [name]").
  resetWelcomeScreen();
  showWelcomeScreen();
}

export function openOnboarding() {
  if (Store.getOnboardingComplete()) return;
  if (overlayEl) return;

  currentStep = 0;
  overlayEl = document.createElement('div');
  overlayEl.className = 'onboarding-overlay';
  overlayEl.innerHTML = renderCard();
  document.body.appendChild(overlayEl);
  wireCard();
}

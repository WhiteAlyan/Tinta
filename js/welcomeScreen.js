// Tinta — welcome screen (v0.2.9 "app disappears" release).
//
// The boot overlay shown when Tinta opens. Composes three pieces:
// 1. "Welcome back, [name]" (or "Welcome to Tinta" if no name set)
// 2. A 30-day writing streak heatmap (from dailyWordCounts)
// 3. A quote — from the writer's own manuscript if they have captured
//    quotes, otherwise a curated craft quote from the fallback list.
//
// The overlay fades in on boot, stays for 2.5s (or until first
// keystroke), then fades out. Non-blocking — the editor is already
// mounted and ready behind it; the writer can start typing immediately
// and the overlay dismisses on the first keystroke.
//
// If onboardingComplete is false, this module does NOT show the welcome
// screen — it calls openOnboarding() instead (Phase 4). The welcome
// screen only fires for writers who have completed onboarding.

import * as Store from './store.js';
import { html, toBridge } from './dom-utils.js';

// Curated fallback quotes — real craft observations from writers about
// the work, not motivational poster quotes. Surfaced when the writer
// hasn't captured any quotes from their own manuscript yet.
const FALLBACK_QUOTES = [
  { text: 'The first draft of anything is shit.', source: 'Ernest Hemingway' },
  { text: 'You can\'t edit a blank page.', source: 'Jodi Picoult' },
  { text: 'Writing is rewriting.', source: 'Michael Crichton' },
  { text: 'Substitute "damn" every time you\'re inclined to write \"very\"; your editor will delete it and the writing will be just as it should be.', source: 'Mark Twain' },
  { text: 'The road to hell is paved with adverbs.', source: 'Stephen King' },
  { text: 'Don\'t tell me the moon is shining; show me the glint of light on broken glass.', source: 'Anton Chekhov' },
  { text: 'If a story is in you, it has to come out.', source: 'William Faulkner' },
  { text: 'There is no greater agony than bearing an untold story inside you.', source: 'Maya Angelou' },
  { text: 'Write hard and clear about what hurts.', source: 'Ernest Hemingway' },
  { text: 'You should write because you love the shape of stories and sentences and the creation of different words on a page.', source: 'Annie Proulx' },
  { text: 'Get it down. Take chances. It may be bad, but it\'s the only way you can do anything really good.', source: 'William Faulkner' },
  { text: 'Almost all good writing begins with terrible first efforts. You need to start somewhere.', source: 'Anne Lamott' },
];

// The overlay element, created once and reused.
let overlayEl = null;
let dismissed = false;
// P1-9 fix — hoisted to module scope so dismissWelcomeScreen() can
// remove the keydown listener on the timeout-dismiss path. Previously
// keystrokeDismiss was declared inside showWelcomeScreen and only
// removed itself from inside the keystrokeDismiss handler — so a
// 2.5s timeout dismiss left a capture-phase keydown listener on
// document for the rest of the session, firing on every keystroke
// and calling dismissWelcomeScreen() which no-op'd because overlayEl
// was null. Mirrors the pattern app.js:301-308 (showWhatsNewBanner)
// already used correctly.
let keystrokeDismissHandler = null;

function pickQuote(project) {
  // Prefer the writer's own captured quotes — it's warmer to see your
  // own protagonist's words than a famous author's advice.
  const quotes = Object.values(project.quotes || {});
  if (quotes.length > 0) {
    const q = quotes[Math.floor(Math.random() * quotes.length)];
    return {
      text: q.text,
      source: q.chapterId ? `from your manuscript` : 'your captured quote',
      isOwn: true,
    };
  }
  // Fallback to curated craft quotes.
  const q = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
  return { ...q, isOwn: false };
}

function computeStreak(dailyWordCounts) {
  // Count consecutive days (ending today or yesterday — grace for "didn't
  // write today yet") with > 0 words written.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Object.keys(dailyWordCounts).filter((d) => dailyWordCounts[d] > 0);
  if (!days.length) return { streak: 0, days: [] };

  // Build a 30-day window ending today.
  const window = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    window.push({ date: key, words: dailyWordCounts[key] || 0 });
  }

  // Streak: count backward from today. If today has 0 words, start from
  // yesterday (grace — the writer hasn't written today yet).
  let streak = 0;
  const startIdx = window[29].words > 0 ? 29 : 29 - 1;
  for (let i = startIdx; i >= 0; i--) {
    if (window[i].words > 0) streak++;
    else break;
  }

  return { streak, days: window };
}

function buildHeatmapHtml(streakData) {
  const maxWords = Math.max(1, ...streakData.days.map((d) => d.words));
  const cells = streakData.days.map((d) => {
    const intensity = d.words === 0 ? 0 : Math.max(0.2, d.words / maxWords);
    const opacity = intensity.toFixed(2);
    const label = `${d.date}: ${d.words} words`;
    return html`<div class="streak-cell" style="opacity: ${opacity}" title="${label}"></div>`;
  });
  return html`<div class="streak-heatmap">${cells}</div>`;
}

export function showWelcomeScreen() {
  // If onboarding hasn't completed, the welcome screen doesn't fire —
  // onboarding.js handles the first-boot experience instead.
  if (!Store.getOnboardingComplete()) return;

  // If the overlay is already showing or was already dismissed this
  // session, don't show it again.
  if (overlayEl || dismissed) return;

  const project = Store.getActiveProject();
  const name = Store.getWriterName();
  const streakData = computeStreak(project.dailyWordCounts || {});
  const quote = pickQuote(project);

  const greeting = name
    ? `Welcome back, ${name}`
    : 'Welcome back';

  const streakText = streakData.streak > 0
    ? `${streakData.streak} day${streakData.streak === 1 ? '' : 's'} in a row`
    : 'Ready to write today?';

  overlayEl = document.createElement('div');
  overlayEl.id = 'welcome-screen';
  overlayEl.className = 'welcome-screen';
  overlayEl.innerHTML = toBridge(html`
    <div class="welcome-content">
      <h1 class="welcome-greeting">${greeting}</h1>
      <p class="welcome-streak">${streakText}</p>
      ${buildHeatmapHtml(streakData)}
      <blockquote class="welcome-quote">
        <p class="welcome-quote-text">${quote.text}</p>
        <cite class="welcome-quote-source">${quote.source}</cite>
      </blockquote>
    </div>
  `);

  document.body.appendChild(overlayEl);

  // Fade in.
  requestAnimationFrame(() => {
    overlayEl.classList.add('visible');
  });

  // Auto-dismiss after 2.5s.
  setTimeout(() => dismissWelcomeScreen(), 2500);

  // Dismiss on first keystroke — the writer can start typing immediately.
  // P1-9 fix — assign to the module-scope keystrokeDismissHandler so
  // dismissWelcomeScreen() can remove it on the timeout-dismiss path too.
  keystrokeDismissHandler = () => {
    dismissWelcomeScreen();
  };
  document.addEventListener('keydown', keystrokeDismissHandler, { capture: true });
}

export function dismissWelcomeScreen() {
  if (!overlayEl) return;
  // P1-9 fix — remove the keydown listener here too, so the timeout-dismiss
  // path (which doesn't go through keystrokeDismissHandler itself) cleans
  // up. Before this, the listener stayed on document for the rest of the
  // session after every welcome screen that timed out.
  if (keystrokeDismissHandler) {
    document.removeEventListener('keydown', keystrokeDismissHandler, { capture: true });
    keystrokeDismissHandler = null;
  }
  dismissed = true;
  overlayEl.classList.remove('visible');
  const el = overlayEl;
  overlayEl = null;
  // Wait for the CSS transition (300ms) before removing from DOM.
  setTimeout(() => el.remove(), 300);
}

// Reset the dismissed flag — used by tests and by the onboarding flow
// (which completes and then calls showWelcomeScreen() for the first time).
export function resetWelcomeScreen() {
  dismissed = false;
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsreadaloud-js-1-7

import * as Store from './store.js';
import * as TTS from './tts.js';
import { closeModal } from './modal.js';
import { html, toBridge, q } from './dom-utils.js';

export function openReadAloudModal(chapter) {
  const root = q('modal-root');
  const settings = Store.getTtsSettings();
  const supported = TTS.isSupported();

  root.innerHTML = toBridge(html`
    <div class="modal-backdrop">
      <div class="modal-panel readaloud-modal">
        <div class="modal-header">
          <h2>Read Aloud · ${chapter.title}</h2>
          <button id="modal-close" class="modal-close">✕</button>
        </div>
        ${
          !supported
            ? html`<p class="empty-note">Your browser doesn't support speech synthesis, so read-aloud isn't available here.</p>`
            : chapter.content.trim() === ''
              ? html`<p class="empty-note">Nothing to read yet. Write something first.</p>`
              : html`
        <label class="readaloud-row">
          <span>Voice</span>
          <select id="readaloud-voice"><option value="">Loading voices…</option></select>
        </label>
        <label class="readaloud-row">
          <span>Speed</span>
          <input type="range" id="readaloud-rate" min="0.5" max="2" step="0.1" value="${settings.rate}" />
          <span id="readaloud-rate-label">${settings.rate}×</span>
        </label>
        <div class="readaloud-controls">
          <button id="readaloud-play" class="toolbar-btn">▶ Play</button>
          <button id="readaloud-pause" class="toolbar-btn" disabled>❚❚ Pause</button>
          <button id="readaloud-stop" class="toolbar-btn" disabled>■ Stop</button>
        </div>
        <details class="grammar-advanced">
          <summary>Pronunciation dictionary</summary>
          <p class="settings-note">Invented names get spoken however the browser's TTS guesses. Teach it a respelling once and it'll use that from now on, in every chapter.</p>
          <div class="pronunciation-add-row">
            <input type="text" id="pron-word" placeholder="Word, e.g. Archesmedeus" />
            <input type="text" id="pron-phonetic" placeholder="Respelling, e.g. Ar-kez-MEE-dee-us" />
            <button id="pron-add" class="toolbar-btn">+ Add</button>
          </div>
          <ul class="pronunciation-list" id="pronunciation-list"></ul>
        </details>
        `
        }
      </div>
    </div>
  `);

  q('modal-close').addEventListener('click', closeModal);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });

  if (!supported || chapter.content.trim() === '') return;

  const voiceSelect = q('readaloud-voice');
  TTS.getVoices().then((voices) => {
    if (voices.length === 0) {
      voiceSelect.innerHTML = '<option value="">System default</option>';
      return;
    }
    voiceSelect.innerHTML = toBridge(html`${voices.map((v) => html`<option value="${v.voiceURI}">${v.name}${v.lang ? ` (${v.lang})` : ''}</option>`)}`);
    if (settings.voiceURI && voices.some((v) => v.voiceURI === settings.voiceURI)) {
      voiceSelect.value = settings.voiceURI;
    }
  });

  voiceSelect.addEventListener('change', () => {
    Store.setTtsSettings({ voiceURI: voiceSelect.value });
  });

  const rateInput = q('readaloud-rate');
  const rateLabel = q('readaloud-rate-label');
  rateInput.addEventListener('input', () => {
    rateLabel.textContent = `${rateInput.value}×`;
    Store.setTtsSettings({ rate: Number(rateInput.value) });
  });

  const playBtn = q('readaloud-play');
  const pauseBtn = q('readaloud-pause');
  const stopBtn = q('readaloud-stop');

  renderPronunciationList();

  playBtn.addEventListener('click', () => {
    if (TTS.isPaused()) {
      TTS.resume();
    } else {
      // Pronunciation dictionary pass — plain word-substitution on the
      // text handed to speech synthesis, not the chapter content itself
      // (which is untouched — this only affects how it sounds read aloud).
      TTS.speak(Store.applyPronunciations(chapter.content), {
        voiceURI: voiceSelect.value,
        rate: Number(rateInput.value),
        onEnd: () => {
          playBtn.disabled = false;
          pauseBtn.disabled = true;
          stopBtn.disabled = true;
        },
      });
    }
    playBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
  });

  pauseBtn.addEventListener('click', () => {
    TTS.pause();
    playBtn.disabled = false;
    pauseBtn.disabled = true;
  });

  stopBtn.addEventListener('click', () => {
    TTS.stop();
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
  });

  q('pron-add').addEventListener('click', () => {
    const word = q('pron-word').value;
    const phonetic = q('pron-phonetic').value;
    if (!word.trim() || !phonetic.trim()) return;
    Store.setPronunciation(word, phonetic);
    q('pron-word').value = '';
    q('pron-phonetic').value = '';
    renderPronunciationList();
  });

  function renderPronunciationList() {
    const list = q('pronunciation-list');
    if (!list) return;
    const entries = Store.getPronunciationList();
    list.innerHTML = toBridge(
      entries.length
        ? html`${entries.map(
            (e) => html`
      <li class="pronunciation-item" data-word="${e.word}">
        <span><strong>${e.word}</strong> → ${e.phonetic}</span>
        <button class="pronunciation-delete-btn" title="Remove">✕</button>
      </li>`
          )}`
        : html`<li class="empty-note">No pronunciations taught yet.</li>`
    );

    list.querySelectorAll('.pronunciation-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        Store.deletePronunciation(btn.closest('.pronunciation-item').dataset.word);
        renderPronunciationList();
      });
    });
  }
}

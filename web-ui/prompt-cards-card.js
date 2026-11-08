import { el } from './pop.js';
import { t } from './i18n.js';

// One card of the prompt list: its number, the editing area (a contenteditable box like the main one) and the delete button. Nothing else: the list
// (prompt-cards-ui.js) fills it, numbers it and listens for it; the live editing of the focused card is prompt-cards-live.js.
const PLACEHOLDER = { chips: t('Nhập prompt… Gõ @ để nhắc một phần tử'), plain: t('Nhập prompt…') };

// chips: the element library is there (the "@" list works)
export function makeCard(chips) {
  const c = { node: el('div', 'cv-pc-card'), num: el('span', 'cv-pc-num'), ed: el('div', 'cv-pc-ed'), x: el('button', 'cv-pc-x', '✕'), drawn: null };
  c.node.setAttribute('role', 'listitem');
  c.ed.contentEditable = 'plaintext-only'; // a paste is plain text, Enter is a "\n" (no <div>), chips are contenteditable=false spans
  c.ed.setAttribute('role', 'textbox');
  c.ed.setAttribute('aria-multiline', 'true');
  c.ed.spellcheck = false;
  c.ed.dataset.placeholder = chips ? PLACEHOLDER.chips : PLACEHOLDER.plain;
  if (chips) {
    c.ed.setAttribute('aria-autocomplete', 'list');
    c.ed.setAttribute('aria-controls', 'prompt-sugg');
    c.ed.setAttribute('aria-expanded', 'false');
  }
  c.x.type = 'button';
  c.x.title = t('Xoá prompt này');
  c.node.append(c.num, c.ed, c.x);
  return c;
}

// Its place in the list (i, 0-based): the number it shows and the names a screen reader hears.
export function numberCard(c, i) {
  c.node.dataset.i = String(i);
  c.num.textContent = String(i + 1);
  c.ed.setAttribute('aria-label', t('Prompt {n}', { n: i + 1 }));
  c.x.setAttribute('aria-label', t('Xoá prompt {n}', { n: i + 1 }));
}

// Runs fn on the next frame, or after 60 ms when the window draws none (a minimized or covered window runs no frame, and the list must still finish).
export function nextFrame(fn) {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(run);
  setTimeout(run, 60);
}


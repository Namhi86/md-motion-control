import { MAX_IMAGES_PER_PROMPT } from './shared/elements.js';
import { tn } from './i18n.js';
import { splitPrompts } from './shared/prompt-split.js';
import { copyChipText, drawChips, promptProblems, removeChipAtCaret, selectChipOnMouseDown, serialize as serializeBox } from './prompt-chips.js';
import { caretContext, hideSuggestions, insertChip, paintSuggestions, suggestionItems } from './prompt-sugg.js';

// The prompt box with element chips, as in MD Motion Control: "@linh" shows as a chip with the picture, typing "@" offers the elements. The hidden
// <textarea id="prompt"> stays the one source of truth (its text holds the "@handle"s), so everything that reads or writes it (the counter,
// the prompt split, "Tạo lại", the .txt / .csv import, the tests) is untouched: this box only DRAWS that text, and writes back to it on every
// edit (with an `input` event for the code that listens). A text put into the textarea from outside draws again.
// The box is contenteditable="plaintext-only": a paste is plain text, Enter is a "\n" in the text (no <div>), the chips are
// contenteditable=false spans. Chrome keeps one extra "\n" at the end of a text that ends with a line break: it is not part of the prompt.
// The chip rules (text <-> chips, the glue space, Backspace on a chip) are in prompt-chips.js and the "@" list in prompt-sugg.js: the cards under the box use them too.

// root: the contenteditable box; sugg: the suggestion list; limitBar: the line under the box for prompts that mention too many pictures.
// limit(): the most images a command may use in the picked mode / Veo model ({ name, max, veo }, veo-images.js); picked(): the handles of the images
// picked with the button (they count with the mentioned elements). Both default to the 10 images of Seedance and none picked.
export function createPromptEditor({ textarea, root, sugg, limitBar, pool, limit = () => ({ name: '', max: MAX_IMAGES_PER_PROMPT, veo: false }), picked = () => [] }) {
  let syncing = false;
  let items = [];
  let active = 0;
  let ctx = null; // where the "@query" sits: { node, start, end, query }

  const serialize = (node = root, opts) => serializeBox(node, opts);
  const render = (text) => drawChips(root, text, pool.byHandle);

  // The problems that stop "Tạo video": a prompt that uses more pictures than the model takes (Dola 10, a Veo model its own number), or an element
  // whose picture is gone.
  function problems() {
    return splitPrompts(textarea.value).prompts.flatMap((p, i) => promptProblems(p, i, { library: pool.library(), picked: picked(), limit: limit() }));
  }
  function paintLimit() {
    const p = problems();
    limitBar.hidden = p.length === 0;
    limitBar.textContent = p.slice(0, 3).join(' ') + (p.length > 3 ? ` ${tn(p.length - 3, '…và {n} lỗi khác.', '…and {n} more problem.', '…and {n} more problems.')}` : '');
  }

  function commit() {
    const text = serialize();
    if (!text && root.firstChild) root.replaceChildren(); // an emptied box shows its placeholder again
    syncing = true;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    syncing = false;
    paintLimit();
  }

  // ── "@" suggestions ──
  const hideSugg = () => {
    hideSuggestions(sugg, root);
    ctx = null;
  };
  function updateSugg() {
    ctx = caretContext(root);
    if (!ctx) return hideSugg();
    items = suggestionItems(pool, ctx.query);
    active = 0;
    paintSugg();
  }
  const paintSugg = () => paintSuggestions({ sugg, anchor: root, items, active, pool, onPick: insert });
  // Replaces the typed "@query" with the chip and a space, ticks the element in the tray, and puts the caret after the space.
  function insert(e) {
    if (!ctx) return;
    insertChip(ctx, e);
    pool.select([e.id]);
    hideSugg();
    commit();
  }

  root.addEventListener('input', () => { commit(); updateSugg(); });
  root.addEventListener('mousedown', (ev) => { if (selectChipOnMouseDown(ev, root)) hideSugg(); });
  root.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && !ev.isComposing && removeChipAtCaret(root)) {
      ev.preventDefault();
      commit();
      return;
    }
    if (sugg.hidden || ev.isComposing || ev.keyCode === 229) return; // Enter or an arrow while the IME is composing belongs to the IME
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!items.length) return;
      ev.preventDefault();
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paintSugg();
    } else if ((ev.key === 'Enter' || ev.key === 'Tab') && items.length) {
      ev.preventDefault();
      insert(items[active]);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      hideSugg();
    }
  });
  root.addEventListener('copy', (ev) => copyChipText(ev, root, false));
  root.addEventListener('cut', (ev) => copyChipText(ev, root, true));
  root.addEventListener('click', updateSugg);
  root.addEventListener('keyup', (ev) => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') updateSugg(); });
  root.addEventListener('blur', () => setTimeout(() => {
    hideSugg();
    if (document.activeElement !== root) render(textarea.value); // text that was typed or pasted as "@handle" becomes a chip
  }, 150));

  // A text put into the textarea from outside ("Tạo lại", the file import, the box emptied after "Tạo video") is drawn.
  const redraw = () => {
    if (syncing || textarea.value === serialize()) return;
    render(textarea.value);
    paintLimit();
  };
  textarea.addEventListener('input', redraw);
  setInterval(() => { if (document.activeElement !== root) redraw(); }, 500); // a value set without an event
  pool.onChange(() => {
    if (document.activeElement !== root) render(textarea.value); // a renamed picture or a new element: chips follow
    paintLimit();
  });

  render(textarea.value);
  paintLimit();
  return { problems, render, repaintLimit: paintLimit };
}

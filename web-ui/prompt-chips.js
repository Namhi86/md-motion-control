import { el } from './pop.js';
import { parseMentions, resolveMentions } from './shared/elements.js';
import { t } from './i18n.js';
import { countProblemText } from './veo-images-text.js';
import { thumbUrl } from './elements-pool.js';

// The element chips of a prompt box, shared by the main box (prompt-editor.js) and the cards under it (prompt-cards-ui.js). The text ("@handle"s
// inside) is the truth; a chip is only how it is drawn. The rules are pure functions over PARTS ({ text } | { chip: entry }) so they are tested
// without a browser; serialize / drawChips are thin wrappers that walk or fill a node. Nothing here keeps state or listens to anything.
export const GLUE = /[A-Za-z0-9_@/]/; // what a mention must not touch (src/elements.js parseMentions)

// Text -> parts (only for handles that byHandle knows; anything else stays plain text). A text that ends with a line break gets ONE more "\n":
// Chrome keeps it in the box, and partsToText drops it again.
export function textToParts(text, byHandle) {
  const parts = [];
  let at = 0;
  for (const m of parseMentions(text)) {
    const e = byHandle(m.handle);
    if (!e) continue;
    if (m.start > at) parts.push({ text: text.slice(at, m.start) });
    parts.push({ chip: e });
    at = m.end;
  }
  const tail = text.slice(at) + (text.endsWith('\n') ? '\n' : '');
  if (tail) parts.push({ text: tail });
  return parts;
}

// Parts -> the text. A chip is "@handle"; when a letter, digit, "_", "@" or "/" touches it on either side a space is put between (what the person
// sees as a chip next to a word is two words, and the mention rule would not see the chip's @handle otherwise).
// strip: drop the one "\n" Chrome keeps at the end of a text that ends with a line break (not for a copied selection).
export function partsToText(parts, { strip = true } = {}) {
  let out = '';
  let afterChip = false;
  for (const p of parts) {
    if (p.chip) {
      if (out && GLUE.test(out[out.length - 1])) out += ' ';
      out += `@${p.chip.handle}`;
      afterChip = true;
    } else if (p.text) {
      if (afterChip && GLUE.test(p.text[0])) out += ' ';
      out += p.text;
      afterChip = false;
    }
  }
  out = out.replace(/\u00a0/g, ' '); // a browser may turn a typed space into a no-break space
  return strip && out.endsWith('\n') ? out.slice(0, -1) : out;
}

// The nodes of a box (text, <br>, chip spans with data-handle, wrappers) -> parts.
function treeToParts(node) {
  const parts = [];
  const walk = (parent) => {
    for (const c of parent.childNodes) {
      if (c.nodeType === 3) parts.push({ text: c.nodeValue });
      else if (c.nodeName === 'BR') parts.push({ text: '\n' });
      else if (c.dataset?.handle) parts.push({ chip: { handle: c.dataset.handle } });
      else walk(c);
    }
  };
  walk(node);
  return parts;
}
export const serialize = (node, opts) => partsToText(treeToParts(node), opts);

// What stops "Tạo video" for ONE prompt (index i, 0-based): it uses more pictures than the model takes (Dola 10, a Veo model its own number), or it
// mentions an element whose picture is gone. library: the elements; picked: handles of the images picked with the button; limit: { name, max, veo }.
export function promptProblems(prompt, i, { library, picked, limit }) {
  const out = [];
  const { elements } = resolveMentions(prompt, library);
  const tooMany = countProblemText({ index: i, picked, elements, limit });
  if (tooMany) out.push(tooMany);
  const lost = elements.filter((e) => e.missing);
  if (lost.length) out.push(t('Lệnh #{index} nhắc phần tử mất ảnh: {handles}.', { index: i + 1, handles: lost.map((e) => `@${e.handle}`).join(', ') }));
  return out;
}

export function chip(e) {
  const c = el('span', 'cv-chip-el');
  c.contentEditable = 'false';
  c.dataset.handle = e.handle;
  if (!e.missing) c.append(Object.assign(el('img'), { src: thumbUrl(e), alt: '' }));
  c.append(el('span', '', `@${e.name}`));
  return c;
}

// Fills `root` with the text: plain text and chips. No listener on a chip: a box that needs the chips to answer (the main box, the card being
// edited) takes its events on the box itself.
export function drawChips(root, text, byHandle) {
  root.replaceChildren(...textToParts(text, byHandle).map((p) => (p.chip ? chip(p.chip) : p.text)));
}

// ── editing the chips of a live box (contenteditable="plaintext-only"): each takes the box (root) it works in ──
const chipOf = (node) => (node && (node.nodeType === 3 ? node.parentElement : node).closest?.('.cv-chip-el')) || null;

// A click on a chip selects the whole chip: Chrome would otherwise put the caret INSIDE the non-editable chip, where Backspace and Delete do
// nothing. -> true when it was a chip of this box (the caller hides its suggestions).
export function selectChipOnMouseDown(ev, root) {
  const target = ev.target.closest?.('.cv-chip-el');
  if (!target || !root.contains(target)) return false;
  ev.preventDefault();
  root.focus();
  const range = document.createRange();
  range.selectNode(target);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

// Backspace / Delete with a chip selected (or the caret somehow inside one) removes it. -> true when a chip was removed (the caller stops the key and
// takes the new text).
export function removeChipAtCaret(root) {
  const sel = getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  let found = sel?.isCollapsed ? chipOf(sel.anchorNode) : null;
  // a selection that is exactly one chip (what a click makes)
  if (!found && range && range.startContainer === range.endContainer && range.endOffset - range.startOffset === 1) {
    const picked = range.startContainer.childNodes[range.startOffset];
    if (picked?.nodeType === 1 && picked.classList.contains('cv-chip-el')) found = picked;
  }
  if (!found || !root.contains(found)) return false;
  const parent = found.parentNode;
  const at = [...parent.childNodes].indexOf(found);
  found.remove();
  const caret = document.createRange();
  caret.setStart(parent, Math.min(at, parent.childNodes.length));
  caret.collapse(true);
  sel.removeAllRanges();
  sel.addRange(caret);
  return true;
}

// Copy and cut put the text behind the chips ("@handle") on the clipboard, not the chip's label.
export function copyChipText(ev, root, cut) {
  const sel = getSelection();
  if (!sel?.rangeCount || sel.isCollapsed || !root.contains(sel.anchorNode)) return;
  const holder = document.createElement('div');
  holder.append(sel.getRangeAt(0).cloneContents());
  ev.clipboardData.setData('text/plain', serialize(holder, { strip: false }));
  ev.preventDefault();
  if (cut) document.execCommand('delete'); // fires input: whoever listens follows
}

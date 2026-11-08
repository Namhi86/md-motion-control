import { el } from './pop.js';
import { t } from './i18n.js';
import { norm, thumbUrl } from './elements-pool.js';
import { chip } from './prompt-chips.js';

// The "@" suggestion list (#prompt-sugg) of a prompt box, as functions of the box (anchor) it is shown for: the main box and the card being
// edited drive the same list, one at a time. No state here: the caller keeps `items`, `active` and the context.
const SUGGEST_MAX = 8;

// Where the "@query" sits at the caret of `root`: { node, start, end, query }, or null.
export function caretContext(root) {
  const sel = getSelection();
  if (!sel?.isCollapsed || !root.contains(sel.anchorNode) || sel.anchorNode.nodeType !== 3) return null;
  const node = sel.anchorNode;
  const m = /(?<![A-Za-z0-9_@/])@([A-Za-z0-9_]*)$/.exec(node.nodeValue.slice(0, sel.anchorOffset));
  return m ? { node, start: m.index, end: sel.anchorOffset, query: m[1] } : null;
}

// The elements for a query: the ticked ones first, then by name.
export function suggestionItems(pool, query) {
  const q = norm(query);
  return pool.library()
    .filter((e) => !q || e.handle.includes(q) || norm(e.name).includes(q))
    .sort((a, b) => Number(pool.isSelected(b.id)) - Number(pool.isSelected(a.id)) || a.name.localeCompare(b.name, 'vi'))
    .slice(0, SUGGEST_MAX);
}

export function hideSuggestions(sugg, anchor) {
  sugg.hidden = true;
  anchor.setAttribute('aria-expanded', 'false');
  anchor.removeAttribute('aria-activedescendant');
}

// Draws the list under `anchor` (or above it when there is no room below). onPick(entry) runs on a click on a row.
export function paintSuggestions({ sugg, anchor, items, active, pool, onPick }) {
  sugg.replaceChildren();
  if (!items.length) {
    sugg.append(el('p', 'cv-sugg-none', pool.library().length ? t('Không có phần tử nào khớp.') : t('Chưa có phần tử nào. Bấm + ở khay Phần tử để tạo.')));
  }
  items.forEach((e, i) => {
    const row = el('div', `cv-sugg-item${i === active ? ' cv-sugg-item--on' : ''}`);
    row.setAttribute('role', 'option');
    row.id = `prompt-sugg-${i}`;
    row.setAttribute('aria-selected', String(i === active));
    row.append(e.missing ? el('span', 'cv-sugg-img cv-sugg-img--miss', '!') : Object.assign(el('img', 'cv-sugg-img'), { src: thumbUrl(e), alt: '' }));
    const text = el('span', 'cv-sugg-text');
    text.append(el('span', 'cv-sugg-name', e.name), el('span', 'cv-sugg-tag', `@${e.handle}`));
    row.append(text);
    row.addEventListener('mousedown', (ev) => ev.preventDefault()); // the box keeps the focus
    row.onclick = () => onPick(e);
    sugg.append(row);
  });
  // fixed under the box (or above it when there is no room below), so no scroll box of the form clips it
  const r = anchor.getBoundingClientRect();
  const room = window.innerHeight - r.bottom - 14;
  Object.assign(sugg.style, { left: `${r.left}px`, width: `${r.width}px` });
  if (room >= 160) Object.assign(sugg.style, { top: `${r.bottom + 6}px`, bottom: '', maxHeight: `${Math.min(280, room)}px` });
  else Object.assign(sugg.style, { top: '', bottom: `${window.innerHeight - r.top + 6}px`, maxHeight: `${Math.min(280, r.top - 14)}px` });
  sugg.hidden = false;
  anchor.setAttribute('aria-expanded', 'true');
  anchor.setAttribute('aria-activedescendant', items.length ? `prompt-sugg-${active}` : '');
}

// Replaces the typed "@query" (ctx) with the chip and a space, and puts the caret after the space. The caller ticks the element and takes the text.
export function insertChip(ctx, entry) {
  const range = document.createRange();
  range.setStart(ctx.node, ctx.start);
  range.setEnd(ctx.node, ctx.end);
  range.deleteContents();
  const space = document.createTextNode(' ');
  range.insertNode(space);
  range.insertNode(chip(entry));
  const after = document.createRange();
  after.setStart(space, 1);
  after.collapse(true);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(after);
}

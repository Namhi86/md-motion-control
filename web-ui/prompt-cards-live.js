import { copyChipText, removeChipAtCaret, selectChipOnMouseDown } from './prompt-chips.js';
import { caretContext, hideSuggestions, insertChip, paintSuggestions, suggestionItems } from './prompt-sugg.js';

// The editing of the card that has the focus: "@" suggestions (the one shared #prompt-sugg list), a chip selected by a click and removed by
// Backspace / Delete, copy and cut as "@handle". All of it hangs on the LIST (events bubble from the editors): no listener per card, no timer
// besides the one-shot that settles a card after it lost the focus. A card that has no focus is plain nodes and static chips.
// onEdit(ed): the text of editor `ed` changed; onLeave(ed): the focus left `ed` for good. pool: null = no element library (no chips, no "@" list).
export function attachLiveEditing({ list, sugg, pool, onEdit, onLeave }) {
  let owner = null; // the editor the suggestion list is shown for
  let ctx = null; // where the "@query" sits: { node, start, end, query }
  let items = [];
  let active = 0;
  const editorOf = (target) => {
    const ed = target?.closest?.('.cv-pc-ed');
    return ed && list.contains(ed) ? ed : null;
  };
  const hide = () => {
    if (owner) hideSuggestions(sugg, owner);
    owner = null;
    ctx = null;
    items = [];
  };
  const paint = () => paintSuggestions({ sugg, anchor: owner, items, active, pool, onPick: pick });
  function update(ed) {
    if (!pool) return;
    const next = caretContext(ed);
    if (!next) return hide();
    if (owner && owner !== ed) hideSuggestions(sugg, owner);
    owner = ed;
    ctx = next;
    items = suggestionItems(pool, ctx.query);
    active = 0;
    paint();
  }
  // Replaces the typed "@query" with the chip and a space, ticks the element in the tray.
  function pick(entry) {
    if (!ctx || !owner) return;
    const ed = owner;
    insertChip(ctx, entry);
    pool.select([entry.id]);
    hide();
    onEdit(ed);
  }

  list.addEventListener('input', (ev) => {
    const ed = editorOf(ev.target);
    if (!ed) return;
    onEdit(ed);
    update(ed);
  });
  list.addEventListener('mousedown', (ev) => {
    const ed = editorOf(ev.target);
    if (ed && pool && selectChipOnMouseDown(ev, ed)) hide();
  });
  list.addEventListener('keydown', (ev) => {
    const ed = editorOf(ev.target);
    if (!ed) return;
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && !ev.isComposing && removeChipAtCaret(ed)) {
      ev.preventDefault();
      onEdit(ed);
      return;
    }
    if (sugg.hidden || owner !== ed || ev.isComposing || ev.keyCode === 229) return; // a key while the IME composes belongs to the IME
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!items.length) return;
      ev.preventDefault();
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
    } else if ((ev.key === 'Enter' || ev.key === 'Tab') && items.length) {
      ev.preventDefault();
      pick(items[active]);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      hide();
    }
  });
  list.addEventListener('copy', (ev) => { const ed = editorOf(ev.target); if (ed) copyChipText(ev, ed, false); });
  list.addEventListener('cut', (ev) => { const ed = editorOf(ev.target); if (ed) copyChipText(ev, ed, true); });
  list.addEventListener('click', (ev) => { const ed = editorOf(ev.target); if (ed) update(ed); });
  list.addEventListener('keyup', (ev) => {
    const ed = editorOf(ev.target);
    if (ed && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) update(ed);
  });
  list.addEventListener('focusout', (ev) => {
    const ed = editorOf(ev.target);
    if (!ed) return;
    setTimeout(() => { // like the main box: a window that only lost the focus keeps its card
      if (document.activeElement === ed) return;
      if (owner === ed) hide();
      onLeave(ed);
    }, 150);
  });
  return { hide };
}

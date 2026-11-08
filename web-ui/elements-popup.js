import { t } from './i18n.js';
import { el, listMenu, openPop } from './pop.js';
import { CATEGORIES } from './shared/elements.js';
import { isBulkOpen, openBulkModal } from './elements-bulk.js';
import { watchDrop } from './elements-drop.js';
import { isElementModalOpen, openElementModal } from './elements-modal.js';
import { categoryLabel, norm, thumbUrl } from './elements-pool.js';

// The "Phần tử" popup, next to the form (as in MD Motion Control): a grid of cards, the first one makes a new element. A card click ticks it
// (the ticks are the form's pool); ✎ edits, the bin deletes after a second press (only the library entry goes, never the picture).
// Closes with ✕, Esc or a click outside. Filter (category), search and "Chọn tất cả" act on the cards that are shown.
const ALL = 'all';
const ALL_LABEL = t('Tất cả phần tử');
const svg = (d, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const ICON = {
  tick: svg('m5 12 5 5 9-11', 14),
  edit: svg('M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4'),
  bin: svg('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'),
  plus: svg('M12 5v14M5 12h14', 20),
  search: svg('m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z'),
};
const iconBtn = (cls, title, icon) => {
  const b = Object.assign(el('button', cls), { type: 'button', title });
  b.setAttribute('aria-label', title);
  b.insertAdjacentHTML('beforeend', icon);
  return b;
};

let open = null;
export const closeElementsPopup = () => open?.close();
// The bin asks "Xoá?" first; the question belongs to the card id, not to the button, because the grid is drawn again on every change. A second
// press within ASK_GUARD_MS is not an answer (a double click would delete without being read).
const ASK_MS = 3000;
const ASK_GUARD_MS = 500;

// anchor: the element the popup sits next to (the form's column).
export function openElementsPopup({ dola, pool, anchor }) {
  if (open) return open.close();
  let category = ALL;
  let query = '';
  let askId = '';
  let askAt = 0;
  let askTimer = 0;
  const opener = document.activeElement; // the focus goes back there when the popup closes

  const back = el('div', 'el-pop-back');
  const pop = el('div', 'el-pop');
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', t('Phần tử'));
  pop.tabIndex = -1;
  // next to the form's column; again when the window changes size
  function place() {
    const r = anchor.getBoundingClientRect();
    const left = Math.round(r.right + 8);
    const top = Math.max(8, Math.round(r.top));
    Object.assign(pop.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(280, Math.min(600, window.innerWidth - left - 12))}px`, height: `${Math.max(240, Math.min(672, window.innerHeight - top - 12))}px` });
  }
  place();

  const closeBtn = iconBtn('el-x', t('Đóng'), '✕');
  const top$ = el('div', 'el-pop-top');
  top$.append(el('span', 'el-pop-tab', t('Phần tử')), closeBtn);

  const catBtn = Object.assign(el('button', 'el-tool'), { type: 'button' });
  const allBtn = Object.assign(el('button', 'el-tool'), { type: 'button' });
  const search = Object.assign(el('input', 'el-search'), { type: 'search', placeholder: t('Tìm theo tên hoặc @tên') });
  search.setAttribute('aria-label', t('Tìm phần tử'));
  const searchWrap = el('label', 'el-search-wrap');
  searchWrap.insertAdjacentHTML('beforeend', ICON.search);
  searchWrap.append(search);
  const tools = el('div', 'el-tools');
  tools.append(catBtn, allBtn, searchWrap);
  const info = el('p', 'el-info');
  const grid = el('div', 'el-grid');
  const body = el('div', 'el-pop-body');
  body.append(tools, info, grid);
  pop.append(top$, body);
  back.append(pop);

  const visible = () => pool.library().filter((e) => (category === ALL || e.category === category) && (!query || norm(`${e.name} ${e.handle} ${e.description}`).includes(query)));
  const create = () => openElementModal({ dola, pool });

  function card(e) {
    const on = pool.isSelected(e.id);
    const c = el('div', `el-card${on ? ' el-card--on' : ''}${e.missing ? ' el-card--miss' : ''}`);
    c.dataset.id = e.id;
    c.tabIndex = 0;
    c.setAttribute('role', 'checkbox');
    c.setAttribute('aria-checked', String(on));
    const img = el('div', 'el-card-img');
    if (e.missing) img.append(el('span', 'el-card-lost', t('Mất ảnh')));
    else img.append(Object.assign(el('img'), { src: thumbUrl(e), loading: 'lazy', decoding: 'async', alt: '' }));
    const tick = el('span', 'el-card-tick');
    tick.insertAdjacentHTML('beforeend', ICON.tick);
    const acts = el('div', 'el-card-acts');
    const edit = iconBtn('el-act', t('Sửa'), ICON.edit);
    const asking = askId === e.id;
    const bin = asking ? Object.assign(el('button', 'el-act el-act--bin el-act--ask', t('Xoá?')), { type: 'button', title: t('Bấm lần nữa để xoá') }) : iconBtn('el-act el-act--bin', t('Xoá'), ICON.bin);
    edit.onclick = () => openElementModal({ dola, pool, element: e });
    bin.onclick = async () => {
      if (askId !== e.id) {
        askId = e.id;
        askAt = Date.now();
        clearTimeout(askTimer);
        askTimer = setTimeout(() => { askId = ''; paint(); }, ASK_MS);
        paint();
        return;
      }
      if (Date.now() - askAt < ASK_GUARD_MS) return;
      clearTimeout(askTimer);
      askId = '';
      await dola.elements.remove([e.id]).catch(() => {});
    };
    acts.addEventListener('click', (ev) => ev.stopPropagation()); // a press on ✎ or the bin never ticks the card
    acts.append(edit, bin);
    const cap = el('div', 'el-card-cap');
    cap.append(el('span', 'el-cap1', `${categoryLabel(e.category)} • ${e.name}`), el('span', 'el-cap2', `@${e.handle}`));
    c.append(img, tick, acts, cap);
    c.title = e.description || e.name;
    c.onclick = () => pool.toggle(e.id);
    c.onkeydown = (ev) => {
      if (ev.target === c && (ev.key === ' ' || ev.key === 'Enter')) {
        ev.preventDefault();
        pool.toggle(e.id);
      }
    };
    return c;
  }

  function paint() {
    const focused = grid.contains(document.activeElement) ? document.activeElement.closest('[data-id]')?.dataset.id : '';
    const shown = visible();
    const allOn = shown.length > 0 && shown.every((e) => pool.isSelected(e.id));
    catBtn.textContent = `${category === ALL ? ALL_LABEL : categoryLabel(category)} ▾`;
    allBtn.textContent = allOn ? t('Bỏ chọn') : t('Chọn tất cả');
    allBtn.disabled = shown.length === 0;
    const n = pool.library().length;
    info.textContent = n ? t('{shown}/{total} phần tử · {picked} đã chọn', { shown: shown.length, total: n, picked: pool.selected().length }) : '';
    const add = Object.assign(el('button', 'el-card el-card--new'), { type: 'button' });
    add.insertAdjacentHTML('beforeend', ICON.plus);
    add.append(el('span', '', t('Phần tử mới')));
    add.onclick = create;
    const cards = shown.map(card);
    const empty = n === 0 ? el('p', 'el-empty', t('Chưa có phần tử nào. Bấm “Phần tử mới” để thêm nhân vật, bối cảnh hay đạo cụ, rồi gõ @ trong mô tả để nhắc tới nó.'))
      : shown.length === 0 ? el('p', 'el-empty', t('Không có phần tử nào khớp.')) : null;
    grid.replaceChildren(add, ...cards, ...(empty ? [empty] : []));
    if (focused) grid.querySelector(`.el-card[data-id="${CSS.escape(focused)}"]`)?.focus(); // a tick must not send the keyboard back to the page
  }

  catBtn.onclick = () => openPop(catBtn, [
    ...listMenu([ALL_LABEL, ...CATEGORIES.map((c) => categoryLabel(c))], category === ALL ? ALL_LABEL : categoryLabel(category), (label) => {
      category = label === ALL_LABEL ? ALL : CATEGORIES.find((c) => categoryLabel(c) === label);
      document.getElementById('backdrop').click(); // closes the shared popover
      paint();
    }),
  ], 240);
  allBtn.onclick = () => {
    const shown = visible();
    const ids = shown.map((e) => e.id);
    if (shown.every((e) => pool.isSelected(e.id))) pool.deselect(ids);
    else pool.select(ids);
  };
  search.addEventListener('input', () => { query = norm(search.value.trim().replace(/^@/, '')); paint(); });

  const unsubscribe = pool.onChange(paint);
  // Pictures dropped on the popup become elements in one go (a row each, named after the file).
  const stopDrop = watchDrop(pop, dola, (items) => { if (items.length) openBulkModal({ dola, pool, items }); });
  // Capture phase: the shared popover (pop.js) closes itself on Esc in the bubble phase, so by then "is it open?" would always say no and an
  // Esc meant for the category menu would close this popup too.
  function onKey(ev) {
    if (ev.key === 'Escape' && !isElementModalOpen() && !isBulkOpen() && document.getElementById('pop').hidden) close();
  }
  function close() {
    unsubscribe();
    stopDrop();
    clearTimeout(askTimer);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    back.remove();
    open = null;
    (opener?.isConnected ? opener : document.querySelector('#refs button'))?.focus();
  }
  closeBtn.onclick = close;
  back.addEventListener('mousedown', (ev) => { if (ev.target === back) close(); });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  document.body.append(back);
  open = { close };
  paint();
  pop.focus();
  pool.refresh().catch(() => {}); // a picture may have gone since the library was last read
}

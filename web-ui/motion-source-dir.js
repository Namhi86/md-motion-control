import { el } from './pop.js';
import { button, noteLine } from './analyze-controls.js';
import { ct } from './core-text.js';
import { t } from './i18n.js';

// The "Thư mục lưu phim" box at the bottom of the Motion control sidebar: where the finished films are saved (window.dola.motion.dir). The window never holds more than the text of the path
// to show: choosing goes through the core's own folder dialog and nothing is ever sent back. A core without motion.dir.get (an older app) gets no box at all.
// -> { node (null when the core has no folder API), refresh() (reads the folder again: on tab open), setLocked(on) (a film is running: "Đổi thư mục" is off, "Mở" stays on),
//      refuse(answer) -> true when motion.start refused because the folder cannot be written (the sentence is then the red line under the box), open() (opens the folder: the box's "Mở" and the result panel's "Mở thư mục"; an older core: library.openDir) }

// '/Users/a/Movies/Motion control' -> { head: '/Users/a/', tail: 'Movies/Motion control' }: the last two segments are what the eye needs, the rest shrinks first. Works for \ paths too.
export function splitPath(p) {
  const text = String(p || '').replace(new RegExp('\\x51uick\\s*Share', 'gi'), 'MD Motion Control').replace(/[\\/]+$/, '');
  const parts = text.split(/([\\/])/); // segments and their separators, alternating
  const keep = Math.max(0, parts.length - 3); // the last two segments and the separator between them
  return keep <= 1 ? { head: '', tail: text } : { head: parts.slice(0, keep).join(''), tail: parts.slice(keep).join('') };
}

export function mountSaveDir({ dola }) {
  const dir = dola.motion?.dir;
  const oldOpen = async () => { try { await dola.library?.openDir?.(); } catch { /* nothing more to say */ } }; // the way before the folder was chosen by the person
  if (typeof dir?.get !== 'function') return { node: null, refresh: async () => {}, setLocked: () => {}, refuse: () => false, open: oldOpen };

  let current = ''; // the folder films are saved in now; '' = not known (the gate is locked, or the core did not answer)
  let locked = false;
  let busy = false; // the folder dialog is open
  let seq = 0; // a late answer of an older read is dropped

  const icon = el('span', 'cm-dir-ico');
  icon.setAttribute('aria-hidden', 'true');
  const head = el('span', 'cm-dir-head');
  const tail = el('span', 'cm-dir-tail');
  const path = el('span', 'cm-dir-path');
  path.append(head, tail);
  const box = el('div', 'cm-dir');
  box.append(icon, path);
  const error = noteLine('an-err');
  error.node.setAttribute('role', 'alert');

  const change = button(t('Đổi thư mục'), 'an-btn an-btn--sm', () => choose());
  const openBtn = button(t('Mở'), 'an-btn an-btn--sm', () => open());
  openBtn.title = t('Mở thư mục lưu phim');
  const buttons = el('div', 'cm-dir-btns');
  buttons.append(change, openBtn);

  function paint() {
    const { head: h, tail: tl } = splitPath(current);
    head.textContent = h;
    tail.textContent = tl;
    path.hidden = !current;
    box.title = current;
    change.disabled = locked || busy || !current || typeof dir.choose !== 'function';
    openBtn.disabled = !current;
  }

  async function refresh() {
    const mine = ++seq;
    let next = '';
    try { const d = await dir.get(); if (typeof d === 'string') next = d; } catch { /* the gate is locked: the folder is unknown, the buttons stay off */ }
    if (mine !== seq) return;
    current = next.replace(new RegExp('\\x51uick\\s*Share', 'gi'), 'MD Motion Control');
    paint();
  }

  async function choose() {
    if (locked || busy || typeof dir.choose !== 'function') return;
    busy = true; paint();
    try {
      const r = await dir.choose();
      if (r?.ok) { error.set(''); if (typeof r.dir === 'string' && r.dir) { seq++; current = r.dir; } else await refresh(); } // else: canceled, nothing changes
      else if (!r?.canceled) error.set(ct(r?.note) || t('Không đổi được thư mục.'));
    } catch { error.set(t('Không đổi được thư mục.')); } finally { busy = false; paint(); }
  }

  async function open() {
    if (typeof dir.open !== 'function') return oldOpen();
    try {
      const r = await dir.open();
      if (r && r.ok === false) error.set(ct(r.note) || t('Không mở được thư mục.'));
    } catch { error.set(t('Không mở được thư mục.')); }
  }

  const hint = el('p', 'an-note cm-hint', t('Phim ghép xong được lưu thẳng vào thư mục này.'));
  paint();
  refresh();
  const top = el('div', 'cm-dir-top'); // the label and the two small buttons share a row: the box stays short in a sidebar that scrolls
  top.append(el('span', 'an-label', t('Thư mục lưu phim')), buttons);
  const node = el('div', 'an-field');
  node.append(top, box, error.node, hint);
  return {
    node,
    refresh,
    setLocked: (on) => { locked = on; if (on) error.set(''); paint(); }, // a new run starts with a clean box
    refuse: (r) => {
      if (r?.reason !== 'dir_unwritable') return false;
      error.set(ct(r.note) || t('Không ghi được vào thư mục lưu phim. Hãy chọn thư mục khác.'));
      node.scrollIntoView?.({ block: 'nearest' });
      return true;
    },
    open,
  };
}

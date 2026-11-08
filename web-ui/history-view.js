import { el } from './pop.js';
import { t, tn } from './i18n.js';
import { ct } from './core-text.js';
import { errText } from './ui-text.js';
import { FILTERS, canSelect, countByFilter, deleteImpact, matches, onScreen } from './history-filter.js';
import { rerunText } from './history-rerun.js';

// How the history list is looked at: the filter (the four counters of the tab line are its buttons), list or grid, and the tick boxes
// with the bar that deletes what is ticked. history.js owns the rows; this module only reads them (rows: id -> { task, node }) and
// calls sync() after any change. A ticked row that the filter hides or that starts running loses its tick, so "Xoá (N)" never
// reaches a row the person cannot see. Deleting only drops the rows from the history: saved videos stay in their folder.
const MODE_KEY = 'historyView';
const svg = (inner) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const MODES = [
  { key: 'list', tip: t('Dạng danh sách'), icon: svg('<path d="M4 6h16M4 12h16M4 18h16"/>') },
  { key: 'grid', tip: t('Dạng lưới'), icon: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>') },
];
const MSG_MS = 6000;
const ASK_GUARD_MS = 600; // a double click or a held Enter must not answer the question it has just raised

const loadMode = () => {
  try { return localStorage.getItem(MODE_KEY) === 'grid' ? 'grid' : 'list'; } catch { return 'list'; }
};
const saveMode = (mode) => {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* a view that is not remembered costs one click */ }
};
const button = (cls, text) => Object.assign(el('button', cls, text), { type: 'button' });

// mounts: { filters, view, bar } (the elements of index.html). remove(ids): asks the queue and drops the rows, resolves { ok, ids, note }.
// screen: 'video' | 'image' | 'all' (history-filter.js onScreen): the rows of the other screen are hidden and not counted.
// rerunMany(ids): makes a NEW task of every ticked row (history-rerun.js), resolves { ok, added, failed, note }; without it the "Tạo lại (N)" button is not offered.
export function createHistoryView({ list, rows, mounts, remove, rerunMany, screen: firstScreen = 'all' }) {
  let screen = firstScreen;
  let filter = 'all';
  let mode = loadMode();
  let confirmN = 0; // > 0 while the bar asks "Xoá N lệnh?"
  let askedAt = 0;
  let busy = false;
  let msg = '';
  let msgTimer = 0;
  const selected = new Set();

  const chips = FILTERS.map((f) => {
    const b = button(`qt-count qt-count--${f.key}`);
    b.title = f.tip;
    const num = el('b', '', '0');
    b.append(el('span', '', f.label), num);
    b.onclick = () => { filter = f.key; confirmN = 0; sync(); };
    return { f, b, num };
  });
  mounts.filters.replaceChildren(...chips.map((c) => c.b));

  const modeBtns = MODES.map((m) => {
    const b = button('qt-seg-btn');
    b.title = m.tip;
    b.setAttribute('aria-label', m.tip);
    b.insertAdjacentHTML('beforeend', m.icon);
    b.onclick = () => { mode = m.key; saveMode(mode); sync(); };
    return { key: m.key, b };
  });
  const seg = el('div', 'qt-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', t('Kiểu xem lịch sử'));
  seg.append(...modeBtns.map((m) => m.b));
  mounts.view.replaceChildren(seg);

  const allBox = Object.assign(el('input'), { type: 'checkbox' });
  const allLabel = el('label', 'cvr-bar-all');
  allLabel.append(allBox, el('span', '', t('Chọn tất cả')));
  const note = el('span', 'cvr-bar-note');
  note.setAttribute('aria-live', 'polite');
  const rerunBtn = button('cvr-bar-btn');
  const delBtn = button('cvr-bar-btn cvr-bar-btn--danger');
  const offBtn = button('cvr-bar-btn');
  mounts.bar.replaceChildren(allLabel, note, rerunBtn, delBtn, offBtn);

  const noMatch = el('p', 'cv-empty cvr-nomatch', t('Không có lệnh nào ở mục này.'));
  noMatch.hidden = true;
  list.append(noMatch);

  function say(text) {
    msg = text;
    clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(() => { msg = ''; sync(); }, MSG_MS);
  }
  const forgetMsg = () => say(''); // a new tick starts a new thought: the last result no longer hides "Đã chọn N"

  // The question before deleting. Saved videos stay in their folder; what is lost is said out loud: waiting tasks that will never run, and
  // a clip Dola made that this machine does not have.
  function askText(n) {
    const { waiting, unsaved } = deleteImpact([...selected].map((id) => rows.get(id)?.task));
    const warns = [];
    if (waiting) warns.push(tn(waiting, '{n} lệnh đang chờ sẽ bị bỏ, không chạy nữa.', '{n} waiting prompt will be dropped and will not run.', '{n} waiting prompts will be dropped and will not run.'));
    if (unsaved) warns.push(tn(unsaved, '{n} lệnh có video chưa tải về: xoá là không lấy lại được.', '{n} prompt has a video that is not downloaded: once deleted, it cannot be recovered.', '{n} prompts have videos that are not downloaded: once deleted, they cannot be recovered.'));
    return t('Xoá {count} khỏi lịch sử? {warns}', {
      count: tn(n, '{n} lệnh', '{n} prompt', '{n} prompts'),
      warns: warns.length ? warns.join(' ') : t('Video đã lưu vẫn nằm trong thư mục.'),
    });
  }

  function paintBar(pickable) {
    const n = selected.size;
    if (confirmN && confirmN !== n) confirmN = 0; // the ticks changed under the question: ask again
    mounts.bar.hidden = screenCount() === 0;
    allBox.disabled = busy || pickable === 0;
    allBox.checked = n > 0 && n === pickable;
    allBox.indeterminate = n > 0 && n < pickable;
    delBtn.hidden = offBtn.hidden = n === 0;
    delBtn.disabled = offBtn.disabled = rerunBtn.disabled = busy;
    rerunBtn.hidden = n === 0 || confirmN > 0 || !rerunMany; // not while the delete question is open
    if (n) {
      note.textContent = confirmN ? askText(n) : msg || t('Đã chọn {n}', { n }); // a result (a refused "Tạo lại") stays on the bar while its rows are still ticked
      rerunBtn.textContent = t('Tạo lại ({n})', { n });
      delBtn.textContent = confirmN ? t('Xoá') : t('Xoá ({n})', { n });
      offBtn.textContent = confirmN ? t('Không') : t('Bỏ chọn');
    } else {
      note.textContent = msg;
    }
    note.classList.toggle('cvr-bar-note--ask', confirmN > 0);
    note.title = note.textContent; // the question may be longer than the bar
  }

  const screenCount = () => [...rows.values()].filter((r) => onScreen(r.task, screen)).length;

  // Everything that depends on the rows, the screen, the filter, the ticks or the mode: run after any of them changes.
  function sync() {
    list.classList.toggle('cvr-grid', mode === 'grid');
    for (const m of modeBtns) m.b.setAttribute('aria-pressed', String(m.key === mode));
    const counts = countByFilter([...rows.values()].filter((r) => onScreen(r.task, screen)).map((r) => r.task.status));
    let shown = 0;
    let pickable = 0;
    for (const id of selected) if (!rows.has(id)) selected.delete(id); // a ticked row that was deleted (here or elsewhere) is gone
    for (const [id, r] of rows) {
      const status = r.task.status;
      const show = onScreen(r.task, screen) && matches(status, filter);
      const can = canSelect(status);
      const on = show && can && selected.has(id);
      if (!on) selected.delete(id);
      if (r.node.hidden === show) r.node.hidden = !show;
      r.chk.disabled = !can || busy;
      r.chk.checked = on;
      r.pick.title = can ? '' : t('Đang chạy: huỷ trước khi xoá');
      r.node.classList.toggle('cvr--sel', on);
      if (show) {
        shown += 1;
        if (can) pickable += 1;
      }
    }
    for (const { f, b, num } of chips) {
      num.textContent = String(counts[f.key]);
      b.classList.toggle('qt-count--on', f.key === filter);
      b.classList.toggle('qt-count--hot', counts[f.key] > 0 && f.key !== 'all');
      b.setAttribute('aria-pressed', String(f.key === filter));
    }
    list.classList.toggle('cvr-selecting', selected.size > 0);
    noMatch.hidden = screenCount() === 0 || shown > 0;
    paintBar(pickable);
  }

  allBox.onchange = () => {
    forgetMsg();
    selected.clear();
    if (allBox.checked) for (const [id, r] of rows) if (!r.node.hidden && canSelect(r.task.status)) selected.add(id);
    sync();
  };
  offBtn.onclick = () => {
    if (confirmN) confirmN = 0;
    else {
      forgetMsg();
      selected.clear();
    }
    sync();
  };
  // Every ticked row, successful ones too, becomes a new task. The ticks go once something was added (a second press would double the ones that worked).
  rerunBtn.onclick = async () => {
    const ids = [...selected];
    busy = true;
    sync();
    try {
      const res = await rerunMany(ids);
      say(rerunText(res, ids.length));
      if (res?.added) selected.clear();
    } catch (err) {
      say(t('Không tạo lại được: {why}', { why: errText(err) }));
    }
    busy = false;
    sync();
    allBox.focus(); // the button that had the focus is gone
  };
  delBtn.onclick = async () => {
    if (!confirmN) {
      confirmN = selected.size;
      askedAt = Date.now();
      sync();
      offBtn.focus(); // Enter or Space right after the question answers "Không"
      return;
    }
    if (Date.now() - askedAt < ASK_GUARD_MS) return;
    const ids = [...selected];
    busy = true;
    confirmN = 0;
    sync();
    try {
      const res = await remove(ids);
      const gone = res?.ids?.length ?? 0;
      if (res?.ok === false) say(ct(res.note) || t('Không xoá được các lệnh đã chọn.'));
      else say(gone === ids.length ? t('Đã xoá {count}. Video đã lưu vẫn nằm trong thư mục.', { count: tn(gone, '{n} lệnh', '{n} prompt', '{n} prompts') }) : t('Đã xoá {gone}/{total} lệnh. Lệnh đang chạy phải huỷ trước.', { gone, total: ids.length }));
    } catch (err) {
      say(t('Không xoá được: {why}', { why: errText(err) }));
    }
    busy = false;
    sync();
    allBox.focus(); // the buttons that had the focus are gone
  };

  // The tick box over the corner of a row (a running task cannot be ticked).
  function attachPick(r) {
    const chk = Object.assign(el('input'), { type: 'checkbox' });
    chk.setAttribute('aria-label', t('Chọn để xoá: {prompt}', { prompt: (r.task.prompt || '').slice(0, 60) }));
    chk.onchange = () => {
      forgetMsg();
      if (chk.checked) selected.add(r.task.id);
      else selected.delete(r.task.id);
      sync();
    };
    const pick = el('label', 'cvr-pick');
    pick.append(chk);
    r.node.insertBefore(pick, r.media.nextSibling); // Tab reaches the tick box before the row's buttons; the grid cell decides where it is drawn
    r.pick = pick;
    r.chk = chk;
  }

  // A press on the picture of a row: while rows are ticked it ticks this one too (the row's own tick box does the same), otherwise it
  // runs open() (the detail panel).
  function activate(r, open) {
    if (!selected.size) return open();
    if (!r.chk.disabled) r.chk.click();
  }

  // The form moved to another screen ("Tạo video" / "Tạo ảnh"): other rows are shown, and a tick on a row that is now hidden is dropped by sync().
  function setScreen(name) {
    if (name === screen) return;
    screen = name;
    confirmN = 0;
    sync();
  }

  return { sync, attachPick, activate, setScreen, screenCount };
}

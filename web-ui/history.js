import { el } from './pop.js';
import { t as tr } from './i18n.js';
import { optionsFeed, taskFeed } from './core-feed.js';
import { landed } from './shared/task-landed.js';
import { mediaUrl } from './shared/media-handles.js';
import { clipKey, rowButtons, shortPath, showClip, stateBox } from './library-ui.js';
import { EMPTY_TEXT } from './history-filter.js';
import { createHistoryView } from './history-view.js';
import { rerunTasks } from './history-rerun.js';
import { closeDetail, openDetail } from './video-detail.js';
import { dateTimeText } from './video-detail-info.js';
import { durationText, isImageTask, modeChipText } from './muse-form.js';
import { showImage } from './muse-ui.js';

// The history list of the right side: one row per queue task, shaped like MD Motion Control's history rows (the clip on the
// left, the details on the right). A change never redraws the list: every task owns one row that is updated in place,
// so a video that is playing keeps playing. Data: queue.list() once, then queue.onChange(tasks[]); an entry
// { id, removed: true } drops the row. Task shape: the queue contract (src/task-store.js of the app core)
const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7.75V12l2.75 2.75"/></svg>',
  ratio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="1.5"/></svg>',
};
const BADGE = { failed: tr('Lỗi'), interrupted: tr('Bị gián đoạn'), cancelled: tr('Đã huỷ') };
const NOTE = {
  failed: tr('Không tạo được video.'),
  interrupted: tr('App đã tắt khi lệnh đang chạy: xem các nút bên dưới.'),
  cancelled: tr('Bạn đã huỷ lệnh này.'),
};

// What a waiting row says while the whole queue waits for something (stats.waiting of the queue); anything else: its turn.
const WAIT_TEXT = { busy: tr('Dola đang bận — tự chạy lại'), offline: tr('Máy không có mạng — tự chạy lại') };
const QUEUED_TEXT = tr('Đang chờ tới lượt');

const rows = new Map(); // task id -> row
let waitKind = ''; // a key of WAIT_TEXT, or ''
const running = new Set(); // rows whose clock ticks
const moreOf = new WeakMap(); // prompt <p> -> its "Xem thêm" (See more) button
let seq = 0;
let listEl, emptyEl, badgeEl, onRerun, onExtract, ro, view; // view: filter, list/grid and tick boxes (history-view.js)
let labels = new Map(); // model id -> label

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const byAge = (a, b) => (a.task.createdAt || 0) - (b.task.createdAt || 0) || a.seq - b.seq;
const modelOf = (t) => labels.get(t.model) || t.model || 'Google Flow (Veo)';
const cleanLegacyDir = (p) => (typeof p === 'string' ? p.replace(new RegExp('\\x51uick\\s*Share', 'gi'), 'MD Motion Control') : p);

function chip(icon, text) {
  const c = el('span', 'cvr-chip');
  c.insertAdjacentHTML('beforeend', icon);
  c.append(text);
  return c;
}

function count() {
  const n = view.screenCount(); // only the rows of the screen that is open
  if (badgeEl) badgeEl.textContent = String(n);
  const libBadge = document.getElementById('lib-nav-badge');
  if (libBadge) libBadge.textContent = String(n);
  emptyEl.hidden = n > 0;
  window.dispatchEvent(new CustomEvent('md:tasks-update', { detail: { tasks: [...rows.values()].map((r) => r.task) } }));
}

// Queue numbers: the n-th waiting task, oldest first. Run after every batch, since any start shifts all of them.
function renumber() {
  [...rows.values()].filter((r) => r.task.status === 'queued').sort(byAge).forEach((r, i) => { if (r.posEl) r.posEl.textContent = `#${i + 1}`; });
}

function tick() {
  const now = Date.now();
  for (const r of running) r.timerEl.textContent = mmss(Math.max(0, Math.round((now - (r.task.startedAt || now)) / 1000)));
}

const queuedText = () => WAIT_TEXT[waitKind] || QUEUED_TEXT;

// Fed by the queue bar on every stats event. Only the text of the waiting rows changes (no redraw), and only when the kind does.
export function setQueueWaiting(kind) {
  const next = WAIT_TEXT[kind] ? kind : '';
  if (next === waitKind) return;
  waitKind = next;
  for (const r of rows.values()) if (r.waitEl && r.task.status === 'queued') r.waitEl.textContent = queuedText();
}

function syncMedia(r) {
  const t = r.task;
  const key = t.status === 'done' ? `done|${clipKey(t)}` : ['queued', 'running'].includes(t.status) ? t.status : `${t.status}|${t.error?.note || ''}`;
  if (key !== r.mediaKey) {
    r.mediaKey = key;
    running.delete(r);
    if (t.status === 'done' && isImageTask(t)) showImage(r.media, t); // a Muse picture: an <img>, no player and no detail panel
    else if (t.status === 'done') showClip(r.media, t, { poster: true, onOpen: () => view.activate(r, () => openDetail(r.task, { labels, onRerun, onExtract, returnFocus: () => r.media.querySelector('.cvr-open') })) });
    else if (t.status === 'queued') {
      r.posEl = el('div', 'cvr-qnum', '#–');
      r.waitEl = el('span', 'cvr-qwait', queuedText());
      r.media.replaceChildren(...stateBox('', r.posEl, r.waitEl));
    } else if (t.status === 'running') {
      [r.timerEl, r.stageEl, r.accEl] = [el('span', 'cvr-timer', '0:00'), el('span', 'cvr-stage'), el('span', 'cvr-acc')];
      r.media.replaceChildren(...stateBox('', el('div', 'cvr-spinner'), r.timerEl, r.stageEl, r.accEl));
    } else {
      r.media.replaceChildren(...stateBox('cvr-state--err', el('span', 'cvr-error-badge', BADGE[t.status] || tr('Lỗi')), el('div', 'cvr-error-message', t.error?.note || NOTE[t.status] || NOTE.failed)));
    }
  }
  if (t.status === 'running') {
    r.stageEl.textContent = t.stage || tr('Đang chạy…');
    r.accEl.textContent = t.accountLabel || '';
    running.add(r);
    tick();
  }
}

// A line under the buttons (a refusal, a note); it fades after 8 seconds.
function flash(r, text) {
  r.flash.textContent = text || '';
  clearTimeout(r.flashTimer);
  if (text) r.flashTimer = setTimeout(() => { r.flash.textContent = ''; }, 8000);
}

function syncActions(r) {
  const t = r.task;
  const key = `${t.status}|${!!t.result?.file}|${!!t.result?.vid}|${landed(t)}`;
  if (key === r.actKey) return;
  r.actKey = key;
  r.acts.replaceChildren(...rowButtons(t, { rerun: onRerun && (() => onRerun(r.task)), removed: () => { removeRow(t.id); view.sync(); }, say: (text) => flash(r, text) }));
}

// Where the video of a row is: the file once it is saved, the folder it will go to while it waits or runs (the folder chosen when the
// task was added). A task from before the folder was kept per task, or one that failed with nothing saved, says nothing.
function syncPath(r) {
  const t = r.task;
  const file = cleanLegacyDir(t.result?.file);
  const where = file || (['queued', 'running'].includes(t.status) ? cleanLegacyDir(t.saveDir) : '');
  const label = file ? tr('Đã lưu: ') : tr('Sẽ lưu vào: ');
  const key = where ? `${label}${where}` : '';
  if (key === r.pathKey) return;
  r.pathKey = key;
  r.pathEl.replaceChildren();
  r.pathEl.title = where || '';
  if (where) r.pathEl.append(label, el('span', '', shortPath(where, 64)));
}

function build(task) {
  const r = { task, seq: (seq += 1), mediaKey: '', actKey: '', pathKey: '' };
  r.node = el('article', 'cvr');
  r.node.dataset.id = task.id;
  r.media = el('div', 'cvr-media');
  const info = el('div', 'cvr-info');
  r.badge = el('span', 'cvr-badge');
  r.prompt = el('p', 'cvr-prompt', task.prompt || '');
  const more = el('button', 'cvr-seemore', tr('Xem thêm'));
  more.type = 'button';
  more.hidden = true;
  more.onclick = () => { more.textContent = r.prompt.classList.toggle('cvr-prompt--full') ? tr('Thu gọn') : tr('Xem thêm'); };
  moreOf.set(r.prompt, more);
  ro.observe(r.prompt);
  info.append(r.badge, r.prompt, more);
  const files = Array.isArray(task.files) ? task.files : [];
  if (files.length) {
    const refs = el('div', 'cvr-refs');
    for (const [i] of files.slice(0, 4).entries()) {
      const img = el('img', 'cvr-thumb');
      img.loading = 'lazy';
      img.src = mediaUrl.ref(task.id, i);
      refs.append(img);
    }
    if (files.length > 4) refs.append(el('span', 'cvr-thumb-more', `+${files.length - 4}`));
    info.append(refs);
  }
  r.accChip = el('span', 'cvr-chip cvr-chip--acc');
  const chips = el('div', 'cvr-chips');
  const [length, kindChip] = [durationText(task), modeChipText(task)]; // a picture has no length: no "…s" chip
  chips.append(...(length ? [chip(ICON.clock, length)] : []), chip(ICON.ratio, String(task.ratio)), ...(kindChip ? [chip(ICON.clock, kindChip)] : []), r.accChip);
  r.acts = el('div', 'cvr-actrow');
  r.flash = el('p', 'cvr-flash');
  r.pathEl = el('p', 'cvr-path');
  info.append(chips, el('span', 'cvr-date', dateTimeText(new Date(task.createdAt || Date.now()))), r.pathEl, r.acts, r.flash);
  r.node.append(r.media, info);
  view.attachPick(r);
  return r;
}

// Newest first. A new task is nearly always the newest, so the walk from the top ends at once.
function place(r) {
  let next = listEl.firstElementChild;
  while (next?.dataset.id && byAge(rows.get(next.dataset.id), r) > 0) next = next.nextElementSibling;
  listEl.insertBefore(r.node, next);
}

function removeRow(id) {
  const r = rows.get(id);
  if (!r) return;
  closeDetail(id); // the panel shows a snapshot of this task: it goes with the row
  running.delete(r);
  ro.unobserve(r.prompt);
  r.node.remove();
  rows.delete(id);
  count();
}

function applyOne(task) {
  if (task.removed) return removeRow(task.id);
  let r = rows.get(task.id);
  if ((task.updatedAt || 0) < (r?.task.updatedAt || 0)) return; // an older copy arriving late
  if (r) r.task = task;
  else {
    r = build(task);
    rows.set(task.id, r);
    place(r);
  }
  r.badge.textContent = modelOf(task);
  r.accChip.textContent = task.accountLabel || '';
  r.accChip.hidden = !task.accountLabel;
  syncMedia(r);
  syncActions(r);
  syncPath(r);
}

function applyMany(list) {
  for (const t of [].concat(list || [])) if (t && typeof t.id === 'string') applyOne(taskFeed(t)); // the core's sentences (stage, notes) in the page's language
  renumber();
  count();
  view.sync();
}

// The rows ticked in the bar are removed through the queue (a running task is refused); the rows it removed go from the list at once.
async function removeMany(ids) {
  const res = await window.dola.queue.remove(ids);
  for (const id of res?.ids || []) removeRow(id);
  return res;
}

// "Tạo lại (N)": every ticked row becomes a new task of its own (history-rerun.js), the oldest first so the copies keep the order of the originals in the queue.
const rerunMany = (ids) => rerunTasks(ids.map((id) => rows.get(id)?.task).filter(Boolean).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), { refs: (id) => window.dola.queue.refs(id), add: (list) => window.dola.queue.add(list) });

// mount: the element the rows go into. mounts: { filters, view, bar } for history-view.js. onRerun(task): puts a task's settings back
// into the form ("Tạo lại"). onExtract(task): opens the "Tách skill" window for a finished video (app.js gives it only when the core offers it). screen: the part of the history the form is on when the list is built ('image' | 'video' | 'all', history-filter.js
// onScreen): the form paints its first screen BEFORE this list exists (its setScreen call then has nobody to talk to), so an app that opens on
// "Tạo ảnh" must start the list on 'image' itself, or the pictures' tab lists the videos too until the person switches tabs.
// Returns { setScreen, refresh }: refresh reloads the whole list and drops rows that no longer exist.
export async function initHistory({ mount, mounts, onRerun: rerun, onExtract: extract, screen = 'all' }) {
  listEl = mount;
  onRerun = rerun;
  onExtract = extract;
  view = createHistoryView({ list: mount, rows, mounts, remove: removeMany, rerunMany, screen });
  badgeEl = document.getElementById('hist-badge');
  emptyEl = mount.querySelector('#hist-empty') || mount.appendChild(el('p', 'cv-empty'));
  const paintEmpty = (name) => emptyEl.replaceChildren(...(EMPTY_TEXT[name] || EMPTY_TEXT.video).flatMap((t, i) => (i ? [document.createElement('br'), t] : [t])));
  paintEmpty(screen);
  // a prompt that does not fit in 6 lines gets "Xem thêm"; measured again when its row is shown or resized
  ro = new ResizeObserver((entries) => {
    for (const { target: p } of entries) moreOf.get(p).hidden = !p.classList.contains('cvr-prompt--full') && p.scrollHeight <= p.clientHeight + 1;
  });
  setInterval(tick, 1000);
  window.dola.queue.onChange(applyMany);
  window.dola.options?.().then((raw) => {
    const o = optionsFeed(raw);
    labels = new Map([...(o?.models || []), ...(o?.veo?.models || []), ...(o?.muse?.models || []), ...(o?.image?.models || []), ...(o?.nano?.models || [])].map((m) => [m.id, m.label]));
    for (const r of rows.values()) r.badge.textContent = modelOf(r.task);
  }).catch(() => {}); // without the list the badge shows the model id
  applyMany(await window.dola.queue.list());
  return {
    setScreen(name) {
      paintEmpty(name);
      view.setScreen(name);
      count();
    },
    async refresh() {
      const list = await window.dola.queue.list();
      const ids = new Set(list.map((t) => t.id));
      for (const id of [...rows.keys()]) if (!ids.has(id)) removeRow(id);
      applyMany(list);
    },
  };
}

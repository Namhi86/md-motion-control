import { mediaUrl } from './shared/media-handles.js';
import { landed } from './shared/task-landed.js';
import { el } from './pop.js';
import { CLIP_HINT, DETAIL_TEXT } from './ui-text.js';
import { t } from './i18n.js';
import { errText } from './ui-text.js';
import { ct } from './core-text.js';

// Everything the window shows about saved videos: the clip of a finished task (the file on disk first, the Dola address
// second) and the buttons of a history row. The folder itself is chosen, opened and written by the main process
// (electron/library.js; the row of the composer is electron/save-dir-ui.js); the window only sends task ids.
const svg = (d, size = 14) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"><path d="${d}"/></svg>`;
const ICON = {
  trash: svg('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', 16),
  redo: svg('M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5'),
  retry: svg('M4 12a8 8 0 1 0 2.3-5.6M4 4v5h5'),
  folder: svg('M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z'),
  download: svg('M12 4v11m0 0-4-4m4 4 4-4M5 20h14'),
  stop: svg('M6 6l12 12M18 6 6 18'),
};
const PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6Z"/></svg>';

// A long folder path keeps its start and its end, the middle becomes "…" (the full path stays in the tooltip).
export function shortPath(p, max = 52) {
  if (p.length <= max) return p;
  const head = Math.ceil((max - 1) * 0.3);
  return `${p.slice(0, head)}…${p.slice(p.length - (max - 1 - head))}`;
}

// The grey/red box that fills the clip area of a row when there is no clip: stateBox(extraClass, ...nodes) -> [box].
export function stateBox(cls, ...kids) {
  const s = el('div', `cvr-state ${cls}`.trim());
  s.append(...kids);
  return [s];
}
export const hint = ([text, more]) => stateBox('', el('span', '', text), el('span', 'cvr-hint', more));

// The saved file through fs-media:// (by task id, never by path: it works for a file page and for the web alike), then the Dola
// address. The file's save time is in the address, so a clip fetched again ("Lấy lại video") is a new address and reloads.
export const clipSources = (task) => [task.result?.file && mediaUrl.task(task.id, task.result.savedAt || task.result.bytes || ''), task.result?.url].filter(Boolean);
export const clipKey = (task) => clipSources(task).join('|'); // the clip is rebuilt only when this changes, so a playing video is left alone

// A video is given its address only when its row comes near the screen: the history can hold 2000 rows. "Near" is measured from the
// scroll box the rows live in (one observer per scroll box): an observer on the page viewport never sees a row that the scroll
// box clips away, so its 300 px margin did nothing and every row below the fold stayed empty until it was scrolled to.
const starters = new WeakMap();
const observers = new Map(); // scroll box (null = the page) -> its observer
function scrollBoxOf(node) {
  for (let p = node.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') return p;
  }
  return null;
}
function observerFor(root) {
  if (!observers.has(root)) {
    observers.set(root, new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        starters.get(e.target)?.();
        obs.unobserve(e.target);
      }
    }, { root, rootMargin: '300px' }));
  }
  return observers.get(root);
}

// The button over the picture of a history card: a click anywhere on the picture (or Enter on it) calls onOpen(task, button). `bare`: no
// play mark, for a card that has no picture (the hint box) but still opens the detail panel.
function openButton(task, onOpen, bare) {
  const b = el('button', 'cvr-open');
  b.type = 'button';
  b.title = DETAIL_TEXT.open;
  b.setAttribute('aria-label', DETAIL_TEXT.open);
  if (!bare) {
    const mark = el('span', 'cvr-open-play');
    mark.insertAdjacentHTML('beforeend', PLAY);
    b.append(mark);
  }
  b.onclick = () => onOpen?.(task, b);
  return b;
}

// Fills `box` with the player of a finished task. A source that fails hands over to the next one; when none plays, the box says so.
// Default: a small player with its own controls. { poster: true, onOpen }: the first frame of the clip (no controls) under a play button
// that opens the detail panel (onOpen(task, button)); a card with no clip to show opens it too, so its hint can be read there.
export function showClip(box, task, { poster = false, onOpen } = {}) {
  const fill = (kids, bare = false) => box.replaceChildren(...kids, ...(poster ? [openButton(task, onOpen, bare)] : []));
  const list = clipSources(task);
  if (!list.length) return fill(hint(CLIP_HINT.none), true);
  const v = el('video', 'cvr-video');
  Object.assign(v, { controls: !poster, muted: true, playsInline: true, preload: 'metadata' });
  let i = 0;
  v.onerror = () => {
    i += 1;
    if (i < list.length) v.src = list[i];
    else fill(hint(CLIP_HINT.broken), true);
  };
  starters.set(v, () => { v.src = list[0]; });
  observerFor(scrollBoxOf(box)).observe(v);
  fill([v]);
}

// One button press: disabled while the call runs; a refusal or a crash is handed to say(), never lost.
async function press(btn, call, say) {
  btn.disabled = true;
  say('');
  try {
    const res = await call();
    if (res?.ok === false) say(ct(res.note) || t('Không làm được ({reason}).', { reason: res.reason || t('lỗi') }));
    else if (res?.already) say(t('Video đã nằm trong thư mục, không cần lấy lại.'));
  } catch (err) {
    say(errText(err));
  } finally {
    btn.disabled = false;
  }
}

// The buttons of a history row, by task state. ctx: { rerun(): puts the settings back into the form (or null),
// removed(): the row is gone, say(text): a line under the buttons }.
export function rowButtons(task, { rerun, removed, say }) {
  const { queue, library } = window.dola;
  const spec = (label, icon, call, cls = 'cvr-act') => ({ label, icon, call, cls });
  const get = spec(t('Lấy lại video'), ICON.download, () => library.retrieve(task.id));
  const again = rerun && spec(t('Tạo lại'), ICON.redo, rerun);
  const del = spec('', ICON.trash, async () => { const r = await queue.remove([task.id]); removed(); return r; }, 'cvr-ibtn');
  let list;
  if (task.status === 'queued' || task.status === 'running') list = [spec(t('Huỷ'), ICON.stop, () => queue.cancel([task.id]))];
  else if (task.status === 'done') list = [task.result?.file && spec(t('Mở thư mục'), ICON.folder, () => library.reveal(task.id)), get, again, del];
  // A task Dola already has (chat id or video id) is fetched, not sent again: "Lấy lại video" comes first and "Thử lại" is not offered
  // ("Tạo lại" is the explicit new request). One Dola never took (or reported as failed) may be retried.
  else if (landed(task)) list = [get, again, del];
  else list = [spec(t('Thử lại'), ICON.retry, () => queue.retry([task.id])), task.result?.vid && get, again, del];
  return list.filter(Boolean).map((a) => {
    const b = el('button', a.cls);
    b.type = 'button';
    b.title = a.label || t('Xoá khỏi lịch sử');
    b.insertAdjacentHTML('beforeend', a.icon);
    if (a.label) {
      b.setAttribute('aria-label', a.label);
      b.append(el('span', 'cvr-act-t', a.label)); // the grid hides the text (the title stays)
    }
    b.onclick = () => press(b, a.call, say);
    return b;
  });
}

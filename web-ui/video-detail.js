import { errText } from './ui-text.js';
import { ct } from './core-text.js';
import { el } from './pop.js';
import { clipSources, hint } from './library-ui.js';
import { EXTRACT_TEXT, canExtract } from './extract-skill-text.js';
import { CLIP_HINT, DETAIL_TEXT } from './ui-text.js';
import { detailRows, detailTitle } from './video-detail-info.js';
import { copyButton, studiosBlock, unmountStudios } from './video-detail-studios.js';

// The detail panel of a finished video: the big player on the left, a glass panel (368 px) on the right with the prompt, the 8 detail
// rows and the buttons. It shows a SNAPSHOT of the task taken when it opens (nothing updates it); history.js closes it when that task is
// removed and app.js when the screen changes. Texts go in through textContent only.
let current = null; // { task, close }

const button = (cls, text) => Object.assign(el('button', cls, text), { type: 'button' });
const section = (title, ...kids) => {
  const s = el('section', 'vd-sec');
  s.append(el('h3', 'vd-h', title), ...kids);
  return s;
};

// An elements popup / window or the shared popover is above this panel (z-index 1200+): Esc and Tab belong to it.
const otherLayerOpen = () => !!document.querySelector('.el-pop, .el-modal-back') || document.getElementById('pop')?.hidden === false;

// The clip in the stage: a source that fails hands over to the next; when none plays, the same hint box as the history card.
function showPlayer(stage, task, state) {
  const list = clipSources(task);
  if (!list.length) return stage.replaceChildren(...hint(CLIP_HINT.none));
  const v = el('video', 'vd-video');
  Object.assign(v, { controls: true, autoplay: true, playsInline: true });
  let i = 0;
  v.onerror = () => {
    i += 1;
    if (i < list.length) v.src = list[i];
    else stage.replaceChildren(...hint(CLIP_HINT.broken));
  };
  v.src = list[0];
  state.video = v;
  stage.replaceChildren(v);
  v.play?.()?.catch(() => {}); // a refused autoplay only means the person presses play
}

// MÔ TẢ: the full prompt, with the Chép button in its heading row (only when the core can copy a prompt).
function promptBlock(task) {
  const s = section(DETAIL_TEXT.prompt, el('p', 'vd-box', String(task.prompt || '').trim() || '—'));
  const copy = copyButton(task);
  if (copy) {
    const row = el('div', 'vd-hrow');
    s.firstElementChild.replaceWith(row);
    row.append(el('h3', 'vd-h', DETAIL_TEXT.prompt), copy);
  }
  return s;
}

function detailsBlock(task, labels) {
  const rows = detailRows(task, labels).map(([k, v]) => {
    const row = el('div', 'vd-row');
    row.append(el('p', 'vd-k', k), el('p', 'vd-v', v));
    return row;
  });
  return section(DETAIL_TEXT.details, ...rows);
}

// The button row: "Tạo lại" (only when the page gave a rerun) and "Mở thư mục" (only when the clip is on disk and the core can reveal it).
// Under it, "Tách skill" (only when the page gave onExtract, i.e. the core offers it, and the task is a finished video with its file).
function footBlock(task, { onRerun, onExtract, close }) {
  const note = el('p', 'vd-note');
  note.setAttribute('role', 'status');
  const row = el('div', 'vd-btns');
  if (onRerun) {
    const again = button('vd-btn vd-btn--main', DETAIL_TEXT.rerun);
    again.onclick = () => {
      try { onRerun(task); } catch (err) { note.textContent = errText(err); return; }
      close();
    };
    row.append(again);
  }
  if (task.result?.file && typeof window.dola?.library?.reveal === 'function') {
    const open = button('vd-btn', DETAIL_TEXT.reveal);
    open.onclick = async () => {
      open.disabled = true;
      note.textContent = '';
      try {
        const res = await window.dola.library.reveal(task.id);
        if (res?.ok === false) note.textContent = ct(res.note) || DETAIL_TEXT.revealFailed;
      } catch (err) {
        note.textContent = err?.message ? errText(err) : DETAIL_TEXT.revealFailed;
      } finally {
        open.disabled = false;
      }
    };
    row.append(open);
  }
  const foot = el('div', 'vd-foot');
  foot.append(note, row);
  if (onExtract && canExtract(task)) {
    const extract = button('vd-btn', EXTRACT_TEXT.button);
    extract.title = EXTRACT_TEXT.buttonTip;
    extract.onclick = async () => {
      note.textContent = '';
      try { await onExtract(task); } catch (err) { note.textContent = err?.message ? errText(err) : EXTRACT_TEXT.failed; }
    };
    const extraRow = el('div', 'vd-btns');
    extraRow.append(extract);
    foot.append(extraRow);
  }
  return foot;
}

// task: the task to show. labels: Map model id -> label. onRerun(task): puts the task's settings back into the form (the panel closes
// after it). onExtract(task): opens the "Tách skill" window (the panel stays below it; the window closes this one itself when it hands the skill to the form).
// returnFocus(): the element that gets the focus back on close (default: whatever had it when the panel opened).
export function openDetail(task, { labels, onRerun, onExtract, returnFocus } = {}) {
  if (!task || typeof task.id !== 'string') return;
  closeDetail();
  const opener = document.activeElement;
  for (const v of document.querySelectorAll('video')) v.pause(); // two players on one file: the list stops while this one plays
  const state = { task, video: null, close };

  const root = el('div', 'vd');
  const stage = el('div', 'vd-stage');
  const panel = el('aside', 'vd-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.tabIndex = -1;
  const title = detailTitle(task);
  panel.setAttribute('aria-label', title);
  const closeBtn = button('vd-x', '✕');
  closeBtn.title = DETAIL_TEXT.close;
  closeBtn.setAttribute('aria-label', DETAIL_TEXT.close);
  closeBtn.onclick = close;
  const head = el('div', 'vd-head');
  head.append(el('h2', 'vd-title', title), closeBtn);
  const scroll = el('div', 'vd-scroll');
  scroll.append(promptBlock(task), detailsBlock(task, labels), ...[studiosBlock(task)].filter(Boolean)); // the studios: inside the scrolling part, so the buttons below stay in view
  panel.append(head, scroll, footBlock(task, { onRerun, onExtract, close }));
  root.append(stage, panel);
  showPlayer(stage, task, state);

  // Window, capture phase: runs before the handlers of the elements popup (document, capture), so "is a popup open?" is asked before
  // that popup closes itself on the same key.
  function onKey(ev) {
    if ((ev.key !== 'Escape' && ev.key !== 'Tab') || otherLayerOpen()) return;
    if (ev.key === 'Escape') {
      if (document.fullscreenElement) return; // Esc leaves the full screen first
      ev.stopPropagation();
      close();
      return;
    }
    const items = [...root.querySelectorAll('button:not(:disabled), video[controls]')].filter((n) => n.getClientRects().length);
    if (!items.length) return ev.preventDefault();
    const [first, last] = [items[0], items[items.length - 1]];
    const outside = !root.contains(document.activeElement) || document.activeElement === panel;
    if (ev.shiftKey && (document.activeElement === first || outside)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (document.activeElement === last || outside)) { ev.preventDefault(); first.focus(); }
  }
  // A press on the empty part of the stage (beside the video) or on the gap around the panel closes it.
  root.addEventListener('mousedown', (ev) => { if (ev.target === root || ev.target === stage) close(); });

  function close() {
    if (current !== state) return;
    current = null;
    unmountStudios();
    window.removeEventListener('keydown', onKey, true);
    const v = state.video;
    if (v) { // stop the download: the file must not stay open behind a closed panel
      v.onerror = null;
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
    root.remove();
    const back = returnFocus?.() || opener;
    if (back?.isConnected) back.focus();
  }

  window.addEventListener('keydown', onKey, true);
  document.body.append(root);
  current = state;
  panel.focus();
}

// Closes the panel; with an id, only when that task is the one shown (a row that went away).
export function closeDetail(id) {
  if (current && (!id || current.task.id === id)) current.close();
}

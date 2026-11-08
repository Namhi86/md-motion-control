import { el } from './pop.js';
import { button } from './analyze-controls.js';
import { ct } from './core-text.js';
import { clock } from './motion-form.js';
import { LABEL_W, buildLanes, buildShots, laneRow } from './motion-timeline-lanes.js';
import { attachDrag } from './motion-timeline-drag.js';
import { attachSeek } from './motion-timeline-seek.js';
import { mergeCuts, splitCuts } from './motion-timeline-model.js';
import { t } from './i18n.js';

// The CapCut-style timeline of the Motion control tab (steps 2 and 3): a ruler with the playhead, the shots, and four lanes per clip (HÌNH, TIẾNG, LỜI, FLOW). It is a view of `state`
// (motion-editor-state.js): every cut change goes through state.apply() (= one motion.replan call), and the timeline repaints from the state when it answers.
// Grips (invisible, shown on hover) sit on the cuts and are draggable only while editable (the core can re-cut, nothing is running, no replan is waiting). A click or drag anywhere in the lanes seeks the source video to that time
// and selects the clip there (motion-timeline-seek.js); pick(i, true) still plays one clip's range.
// -> { node, paint(), fit(), setFlow(clips), setLocked(on), selected(), pick(i, play), onKey(ev), destroy() }
const MIN_FIT_PPS = 42; // pixels a second: a 4 s clip (the shortest) is still MIN_CARD (168 px) wide, enough for its card; a longer video scrolls. Zoomed out further, a card shows only its picture and number
const MIN_PPS = 0.5;
const MAX_PPS = 160;
const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];

export function mountTimeline({ state, video, envelope = [], frames = null, perClip = 20, onRetry = () => {}, onNote = () => {}, onSelect = () => {} }) {
  const node = el('div', 'cm-tl');
  const scroll = el('div', 'cm-tl-scroll');
  const inner = el('div', 'cm-tl-inner');
  scroll.append(inner);
  let pps = MIN_FIT_PPS;
  let flow = null;
  let locked = false;
  let selected = -1;
  let rangeEnd = null;
  let cells = [];
  const playhead = el('div', 'cm-playhead'); // a 1 px soft line in its own layer, the last child of the inner node = above every lane; its handle lives on the ruler
  let handle = null;
  const tick = el('div', 'cm-snap');
  tick.hidden = true;

  const editable = () => !locked && state.canReplan && !state.busy();
  const fitPps = () => Math.max(MIN_PPS, ((scroll.clientWidth || 960) - LABEL_W - 12) / state.duration);
  const movePlayhead = (sec) => { const x = `${Math.max(0, sec) * pps}px`; playhead.style.left = x; if (handle) handle.style.left = x; };
  const seek = (sec) => { rangeEnd = null; video.currentTime = Math.min(state.duration, Math.max(0, sec)); movePlayhead(video.currentTime); };

  const toolbar = el('div', 'cm-tl-bar');
  const splitBtn = button(t('✂ Cắt tại đây'), 'cm-tool', () => split());
  const mergeBtn = button(t('⊕ Gộp với đoạn sau'), 'cm-tool', () => merge());
  const undoBtn = button(t('↶ Hoàn tác'), 'cm-tool', () => report(state.undo()));
  const redoBtn = button(t('↷ Khôi phục'), 'cm-tool', () => report(state.redo()));
  splitBtn.title = t('Cắt đoạn đang chọn tại đầu phát (phím S)');
  mergeBtn.title = t('Nối đoạn đang chọn với đoạn sau (phím Delete)');
  const zoomOut = button('−', 'cm-tool cm-zoom', () => zoom(1 / 1.5));
  const zoomIn = button('+', 'cm-tool cm-zoom', () => zoom(1.5));
  const fitBtn = button(t('Vừa khít'), 'cm-tool', () => { pps = fitPps(); paint(); });
  zoomOut.setAttribute('aria-label', t('Thu nhỏ'));
  zoomIn.setAttribute('aria-label', t('Phóng to'));
  const edit = el('span', 'cm-tl-group');
  edit.append(splitBtn, mergeBtn, undoBtn, redoBtn);
  const zoomGroup = el('span', 'cm-tl-group');
  zoomGroup.append(zoomOut, zoomIn, fitBtn);
  toolbar.append(edit, zoomGroup);
  node.append(toolbar, scroll);

  async function report(pending) {
    const r = await pending;
    if (r.ok) onNote(r.transcriptError ? ct(r.transcriptError.note) || t('Không chép được lời: hãy nhập lời vào từng đoạn.') : '');
    else if (r.reason !== 'busy' || r.message) onNote(r.message || t('Không chia lại được các đoạn.'));
  }
  const cutTo = (next, why) => { if (next) report(state.apply(next)); else onNote(why); };
  function split() {
    if (!editable()) return;
    const at = video.currentTime || 0;
    const seg = state.segments()[selected];
    if (selected >= 0 && seg && (at <= seg.start || at >= seg.end)) { onNote(t('Đưa đầu phát vào trong đoạn đã chọn rồi cắt.')); return; }
    cutTo(splitCuts(state.cuts(), at, state.duration), t('Cắt ở đây thì một nửa ngắn hơn 4 giây.'));
  }
  function merge() {
    if (!editable()) return;
    const i = selected >= 0 ? selected : state.segments().findIndex((s) => (video.currentTime || 0) < s.end);
    cutTo(mergeCuts(state.cuts(), i, state.duration), t('Hai đoạn này gộp lại sẽ dài hơn 10,5 giây, hoặc đây là đoạn cuối.'));
  }
  function zoom(f) {
    const w = scroll.clientWidth || 0;
    const mid = (scroll.scrollLeft || 0) + w / 2;
    const before = pps;
    pps = Math.min(MAX_PPS, Math.max(MIN_PPS, pps * f));
    paint();
    if (w) scroll.scrollLeft = mid * (pps / before) - w / 2;
  }

  function pick(i, play = true) {
    const seg = state.segments()[i];
    if (!seg) return;
    selected = i;
    cells.forEach((c, k) => c.forEach((n) => n.classList.toggle('cm-cell--on', k === i)));
    onSelect(i);
    if (!play) return;
    video.currentTime = seg.start;
    rangeEnd = seg.end;
    movePlayhead(seg.start);
    Promise.resolve(video.play?.()).catch(() => {});
  }

  function ruler() {
    const row = laneRow('ruler');
    const track = el('div', 'cm-ruler');
    track.style.width = `${state.duration * pps}px`;
    handle = el('i', 'cm-playhead-handle');
    track.append(handle);
    const step = RULER_STEPS.find((s) => s * pps >= 64) || RULER_STEPS.at(-1);
    for (let s = 0; s <= state.duration; s += step) {
      const m = el('span', 'cm-ruler-tick', clock(s));
      m.style.left = `${s * pps}px`;
      track.append(m);
    }
    row.append(track);
    return row;
  }

  function paint() {
    const segs = state.segments();
    inner.style.width = `${LABEL_W + state.duration * pps}px`;
    const built = buildLanes({
      segs, texts: state.texts(), pending: state.pending(), envelope, duration: state.duration, pps, flow, frames, locked, perClip,
      h: { onPick: pick, onType: (i, v) => state.setText(i, v), onRetry },
    });
    cells = built.cells;
    const overlay = el('div', 'cm-overlay');
    const playLayer = el('div', 'cm-playlayer');
    overlay.style.left = playLayer.style.left = `${LABEL_W}px`;
    playLayer.append(playhead);
    segs.slice(0, -1).forEach((s, k) => {
      const grip = el('b', `cm-grip${editable() ? ' cm-grip--edit' : ''}`);
      grip.style.left = `${s.end * pps}px`;
      grip.title = s.cutAt === 'scene' ? t('Đổi góc máy ở {time}', { time: clock(s.end) }) : t('Chỗ ngừng nói ở {time}', { time: clock(s.end) });
      attachDrag(grip, k, { state, pps: () => pps, editable, tick, onDrop: (next) => (next ? report(state.apply(next)) : paint()) });
      overlay.append(grip);
    });
    overlay.append(tick);
    inner.replaceChildren(ruler(), buildShots(segs, pps), ...built.rows, overlay, playLayer);
    if (selected >= segs.length) selected = -1;
    if (selected >= 0) cells[selected].forEach((n) => n.classList.add('cm-cell--on'));
    movePlayhead(video.currentTime || 0);
    const can = editable() && state.canReplan;
    for (const b of [splitBtn, mergeBtn]) { b.hidden = !state.canReplan; b.disabled = !can; }
    undoBtn.hidden = redoBtn.hidden = !state.canReplan;
    undoBtn.disabled = locked || !state.canUndo();
    redoBtn.disabled = locked || !state.canRedo();
  }

  const onTime = () => {
    movePlayhead(video.currentTime || 0);
    if (rangeEnd !== null && (video.currentTime || 0) >= rangeEnd - 0.05) { video.pause?.(); rangeEnd = null; }
    const x = (video.currentTime || 0) * pps;
    if (!video.paused && scroll.clientWidth && (x > scroll.scrollLeft + scroll.clientWidth - 40 || x < scroll.scrollLeft)) scroll.scrollLeft = Math.max(0, x - 40);
  };
  const seeker = attachSeek({ inner, scroll, pps: () => pps, duration: () => state.duration, segments: state.segments, selected: () => selected, seek, select: (i) => pick(i, false) });
  video.addEventListener('timeupdate', onTime);
  video.addEventListener('seeked', onTime);
  scroll.addEventListener('wheel', (ev) => { if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); zoom(ev.deltaY < 0 ? 1.25 : 1 / 1.25); } }, { passive: false });

  // Space = play / pause, S = cut here, Delete = join with the next clip, Ctrl/Cmd+Z = undo, with Shift = redo. Nothing happens while the person types in a line, or while the tab is hidden.
  function onKey(ev) {
    const typing = /^(textarea|input|select)$/i.test(String(ev.target?.tagName || ev.target?.tag || '')) || (ev.key === ' ' && /^button$/i.test(String(ev.target?.tagName || ''))); // Space on a focused button presses it
    if (typing || ev.altKey || node.offsetParent === null) return;
    const key = String(ev.key || '').toLowerCase();
    const mod = ev.ctrlKey || ev.metaKey;
    let used = true;
    if (mod && key === 'z') { if (!locked) report(ev.shiftKey ? state.redo() : state.undo()); } else if (mod) used = false;
    else if (key === ' ') { rangeEnd = null; if (video.paused) Promise.resolve(video.play?.()).catch(() => {}); else video.pause?.(); } else if (key === 's') split();
    else if (key === 'delete' || key === 'backspace') merge();
    else used = false;
    if (used) ev.preventDefault?.();
  }
  document.addEventListener('keydown', onKey);

  paint();
  return {
    node, paint, onKey, pick, selected: () => selected,
    reveal: () => { scroll.scrollTop = scroll.scrollHeight; }, // the film started: the FLOW lane is the one to watch
    fit: () => { pps = Math.max(MIN_FIT_PPS, fitPps()); paint(); },
    setFlow: (clips) => { const first = !flow?.length && !!clips?.length; flow = clips; paint(); if (first) scroll.scrollTop = scroll.scrollHeight; }, // the first answer of the core: the FLOW lane is the one to watch
    setLocked: (on) => { locked = on; paint(); },
    destroy: () => { seeker.destroy(); document.removeEventListener('keydown', onKey); video.removeEventListener('timeupdate', onTime); video.removeEventListener('seeked', onTime); },
  };
}

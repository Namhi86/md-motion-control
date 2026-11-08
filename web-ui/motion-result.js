import { el } from './pop.js';
import { button } from './analyze-controls.js';
import { canRetry, counts, failText, secondsText, stateText, succeeded } from './motion-form.js';
import { ct } from './core-text.js';
import { t, tn } from './i18n.js';

// The right-hand panel of the "Motion control" workspace ("Video Motion control") and what feeds it. The window never holds a path: the film is an fs-media:// address.
// createResultPanel() is drawn from the start (a placeholder, "not started"); mountResult() binds it to a running film once "Tạo video" has been answered: the progress text in its head,
// the film once it is made (next to the original: the two play together), and the buttons "Mở thư mục" / "Làm video khác" / "Ghép lại" in its foot.
// A film that kept running while the page was closed has no plan to draw: the view then puts `clips` (one row per clip, with the button that makes ONLY that clip again) where the timeline would be.
export function createResultPanel() {
  const node = el('div', 'cm-panel cm-panel--result');
  const status = el('span', 'cm-strip', '');
  const head = el('div', 'cm-panel-head');
  head.append(el('span', 'cm-panel-title', t('Video Motion control')), status);
  const holder = el('p', 'cm-placeholder', t('Video Motion control sẽ hiện ở đây khi các đoạn làm xong và được ghép lại.'));
  const body = el('div', 'cm-panel-body');
  const foot = el('div', 'cm-panel-foot');
  node.append(head, body, foot);
  const reset = () => { status.textContent = t('Chưa bắt đầu'); body.replaceChildren(holder); holder.hidden = false; foot.replaceChildren(); };
  reset();
  return { node, status, holder, body, foot, reset };
}

// -> { node, clips, update(view), destroy() } with view = { clips: [{ i, state, reason, note }], result: { url, name, seconds } | { reason, note } | null, stage }
//   compare = the source <video> (played together with the film); onRetry(i) "Làm lại đoạn này"   onAgain() "Làm video khác"   onOpen() "Mở thư mục"
export function mountResult({ panel, perClip = 20, compare = null, onRetry, onAgain, onOpen }) {
  const clipsBox = el('div', 'cm-clips');
  const made = Object.assign(el('video', 'cm-video'), { controls: true, preload: 'metadata' });
  made.hidden = true;
  panel.body.append(made);
  const endNote = el('p', 'an-err', '');
  endNote.setAttribute('role', 'alert');
  endNote.hidden = true;
  const doneRow = el('div', 'cm-done');
  panel.foot.replaceChildren(endNote, doneRow);

  // play both videos together: one press starts both, a seek of one moves the other (they are the same length by construction)
  const unlinks = [];
  const link = (a, b) => {
    const on = [['play', () => { if (b.paused) b.play?.(); }], ['pause', () => { if (!b.paused) b.pause?.(); }], ['seeked', () => { if (Math.abs((b.currentTime || 0) - (a.currentTime || 0)) > 0.3) b.currentTime = a.currentTime; }]];
    for (const [type, fn] of on) a.addEventListener(type, fn);
    unlinks.push(() => { for (const [type, fn] of on) a.removeEventListener(type, fn); });
  };
  if (compare) { link(made, compare); link(compare, made); }

  function update(view = {}) {
    const clips = view.clips || [];
    const c = counts(clips);
    panel.status.textContent = [
      c.done ? tn(c.done, '{n} xong', '{n} done', '{n} done') : '',
      c.making ? tn(c.making, '{n} đang làm', '{n} in progress', '{n} in progress') : '',
      c.waiting ? tn(c.waiting, '{n} chờ', '{n} waiting', '{n} waiting') : '',
      c.failed ? tn(c.failed, '{n} lỗi', '{n} failed', '{n} failed') : '',
    ].filter(Boolean).join(' · ') || t('Đang làm');
    // once the film is made the list of clips has nothing more to tell: the count above says it and the player takes the room
    clipsBox.hidden = succeeded(view.result);
    clipsBox.replaceChildren(...clips.map((clip) => {
      const row = el('div', `cm-clip cm-clip--${clip.state}`);
      row.append(el('span', 'cm-clip-n', String(clip.i + 1)), el('span', 'cm-clip-state', stateText(clip)));
      // a clip still 'waiting' is made by the retry of the clip before it (the core runs the rest of the shot)
      if (canRetry(clip)) row.append(button(t('Làm lại đoạn này ({price} credit)', { price: perClip }), 'an-btn an-btn--sm', () => onRetry(clip.i)));
      return row;
    }));
    if (succeeded(view.result)) {
      endNote.hidden = true;
      panel.holder.hidden = true;
      made.hidden = false;
      made.src = view.result.url;
      doneRow.replaceChildren(
        el('span', 'cm-ok', t('Xong: {name} · {len}', { name: view.result.name, len: secondsText(view.result.seconds) })),
        button(t('Mở thư mục'), 'an-btn an-btn--sm', () => onOpen()),
        button(t('Làm video khác'), 'an-btn an-btn--sm', () => onAgain()),
      );
    } else if (view.result) {
      made.hidden = true;
      panel.holder.hidden = false;
      endNote.hidden = false;
      endNote.textContent = ct(view.result.note) || failText({ reason: view.result.reason });
      // every clip is made but the join failed: joining again costs no credit
      const rejoin = clips.length && clips.every((x) => x.state === 'done') ? [button(t('Ghép lại (miễn phí)'), 'an-btn an-btn--sm an-btn--on', () => onRetry(0))] : [];
      doneRow.replaceChildren(...rejoin, button(t('Làm video khác'), 'an-btn an-btn--sm', () => onAgain()));
    } else {
      made.hidden = true;
      panel.holder.hidden = false;
      endNote.hidden = true;
      doneRow.replaceChildren();
    }
  }
  return { node: panel.node, clips: clipsBox, update, destroy: () => unlinks.forEach((u) => u()) }; // the source player outlives a film: its listeners must go with it
}

import { el } from './pop.js';
import { priceLine, secondsText } from './motion-form.js';
import { createPlanState } from './motion-editor-state.js';
import { createFrames } from './motion-timeline-frames.js';
import { mountTimeline } from './motion-timeline.js';
import { t } from './i18n.js';

// The "Khung video" panel of the Motion control workspace: the timeline (ruler + lanes HÌNH / TIẾNG / LỜI / FLOW) with its toolbar, and a header with the number of clips and the length.
// Before "Tạo video" the person cuts and edits (every change of the cuts is one motion.replan); after it setLocked(true) makes the same timeline read-only, its FLOW lane following the progress of the core.
// plan = the answer of motion.prepare (segments, envelope, duration, snaps, prepareId). video = the source <video> shared with the stage (the timeline seeks and plays it, and never moves it).
// replan = dola.motion.replan or null (an older core: the marks are only shown).
// onEdit() runs when the person types in a line (the view saves a draft).
// -> { node, reveal(), lines(), draftLines(), segments(), total(), price() -> { total, minutes, text }, tooMany(), busy(), setResolution(id), setAccounts(n), setLocked(on), setFlow(clips), fit(), destroy() }
const MANY_CLIPS = 30;

export function mountEditor({ plan, video, resolution = '720p', accounts = 1, videoUrl = '', replan = null, perClip = 20, onChange = () => {}, onEdit = () => {}, onNote = () => {}, onRetry = () => {}, onSelect = () => {} }) {
  const node = el('div', 'cm-panel cm-panel--timeline');
  let res = resolution;
  let lanes = accounts;

  const state = createPlanState({ plan, replan, onEdit, onChange: () => { repaint(); onChange(); } });
  const frames = videoUrl ? createFrames({ url: videoUrl }) : null;
  const timeline = mountTimeline({ state, video, envelope: plan.envelope || [], frames, perClip, onRetry, onNote, onSelect });

  const count = el('span', 'cm-panel-meta', '');
  const head = el('div', 'cm-panel-head');
  head.append(el('span', 'cm-panel-title', t('Khung video')), count);
  const body = el('div', 'cm-panel-body cm-panel-body--scroll');
  body.append(timeline.node);
  const many = el('p', 'an-note cm-warn', '');
  many.hidden = true;
  node.append(head, body, many);

  const price = () => priceLine({ segments: state.segments(), resolution: res, accounts: lanes });
  // the clips, the price and the time follow the clips on the timeline (a cut changes them), the warning for a long video follows the price
  function repaint() {
    const segs = state.segments();
    count.textContent = t('{n} đoạn · {len}', { n: segs.length, len: secondsText(plan.duration) });
    many.textContent = segs.length > MANY_CLIPS ? t('Video dài nên có nhiều đoạn: {total} credit Flow là rất nhiều. Kiểm tra số dư của acc Google trước, hoặc chọn 360p cho rẻ một nửa.', { total: price().total }) : '';
    many.hidden = !many.textContent;
    timeline.paint();
  }
  repaint();

  return {
    node, timeline, price,
    lines: state.lines,
    draftLines: state.draftLines,
    segments: state.segments,
    busy: state.busy,
    total: () => price().total,
    setResolution: (id) => { res = id; repaint(); },
    setAccounts: (n) => { lanes = Math.max(1, n | 0); repaint(); },
    setLocked: (on) => timeline.setLocked(on),
    setFlow: (clips) => timeline.setFlow(clips),
    fit: () => timeline.fit(),
    reveal: () => timeline.reveal(),
    destroy: () => { timeline.destroy(); frames?.stop(); },
  };
}

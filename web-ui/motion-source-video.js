import { el } from './pop.js';
import { button, noteLine } from './analyze-controls.js';
import { watchVideoDrop } from './analyze-video-box.js';
import { factsParts } from './motion-form.js';
import { paintFacts as drawFacts } from './motion-facts.js';
import { mediaUrl } from './shared/media-handles.js';
import { ct } from './core-text.js';
import { t } from './i18n.js';

// The video to copy, in two places that show ONE state: the compact card of the sidebar (a drop button while empty, then a thumbnail, the name, "0:27 · 9:16 · 33 MB" and "Đổi video") and the
// "Video gốc" panel of the stage (the player). Its calls go to motion.pickVideo / dropVideo (any length, no 60 s cap); the window holds the handle only, the player shows fs-media://pick/<handle>.
// The length / shape / size come from the core's answer when it has them and are completed from the <video> element's own loadedmetadata (what the person sees, never "không rõ").
// The one `player` element is created here and handed to the timeline (it is never moved: moving a <video> in the page pauses it).
// -> { card, panel, player, error, get(), set({ handle, name, bytes, meta }) (a saved plan's video: shown, onChange does NOT run), pick(), drop(files), setLocked(on), watch(target) }; onChange(video) runs when the video changes.
export function mountSourceVideo({ dola, onChange }) {
  let video = null;
  let locked = false;
  let meta = {}; // { seconds, width, height } as far as known

  const error = noteLine('an-err');
  error.node.setAttribute('role', 'alert');
  const player = Object.assign(el('video', 'cm-video'), { controls: true, preload: 'metadata', playsInline: true });
  const thumb = Object.assign(el('video', 'cm-vthumb'), { muted: true, preload: 'metadata', playsInline: true });

  // put a video on the card and in the player (a pick, a drop, or the one a saved plan was made from)
  const show = (answer) => {
    video = answer;
    meta = { seconds: answer.meta?.seconds, width: answer.meta?.width, height: answer.meta?.height };
    const url = mediaUrl.pick(answer.handle);
    player.src = url;
    thumb.src = url;
    paint();
    return video;
  };
  const take = (answer, failNote) => {
    if (answer === null && failNote) error.set(failNote);
    if (!answer) return; // cancelled
    if (!answer.ok) { error.set(ct(answer.note) || t('Không dùng được video này.')); return; }
    error.set('');
    onChange(show(answer));
  };
  const pick = async () => {
    if (locked) return;
    try { take(await dola.motion.pickVideo()); } catch (err) { error.set(t('Không mở được hộp chọn video: {reason}', { reason: err.message })); }
  };
  const drop = async (files) => {
    if (locked) return;
    try { take(await dola.motion.dropVideo(files), t('Không đọc được tệp vừa thả: hãy chọn video bằng nút.')); } catch (err) { error.set(t('Không nhận được video: {reason}', { reason: err.message })); }
  };
  // a drop anywhere on `target` counts (the window itself ignores drops, app.js)
  const watch = (target) => watchVideoDrop(target, (files) => drop(files), () => locked);

  // the sidebar card
  const card = el('div', 'cm-vcard');
  const empty = button('', 'an-drop cm-drop', pick);
  empty.append(el('span', 'an-drop-orb', '▶'), el('span', 'an-drop-main', t('Thả video cần copy vào đây hoặc bấm để chọn')), el('span', 'an-drop-hint', t('mp4, mov, mkv, webm · video dài bao nhiêu cũng được')));
  const cardName = el('p', 'cm-vname', '');
  const cardFacts = el('div', 'cm-vfacts', '');
  const cardChange = button(t('Đổi video'), 'an-btn an-btn--sm', pick);
  const filled = el('div', 'cm-vrow');
  const text = el('div', 'cm-vtext');
  text.append(cardName, cardFacts, cardChange);
  filled.append(thumb, text);
  card.append(empty, filled);

  // the stage panel
  const panel = el('div', 'cm-panel cm-panel--source');
  const panelFacts = el('span', 'cm-panel-meta cm-facts', '');
  const head = el('div', 'cm-panel-head');
  head.append(el('span', 'cm-panel-title', t('Video gốc')), panelFacts);
  const big = button('', 'cm-bigdrop', pick);
  big.append(el('span', 'an-drop-orb', '▶'), el('span', 'an-drop-main', t('Thả video cần copy vào đây hoặc bấm để chọn')));
  const body = el('div', 'cm-panel-body');
  body.append(big, player);
  const panelName = el('span', 'cm-vname', '');
  const panelChange = button(t('Đổi video'), 'an-btn an-btn--sm', pick);
  const foot = el('div', 'cm-panel-foot cm-panel-foot--split');
  foot.append(panelName, panelChange);
  panel.append(head, body, foot);
  player.addEventListener('error', () => error.set(t('Không xem trước được video này (vẫn phân tích được).')));
  player.addEventListener('loadedmetadata', () => {
    meta = { seconds: player.duration, width: player.videoWidth, height: player.videoHeight };
    paintFacts();
  });

  function paintFacts() {
    const parts = factsParts({ ...meta, bytes: video?.bytes });
    drawFacts(cardFacts, parts);
    drawFacts(panelFacts, parts);
  }
  function paint() {
    empty.hidden = !!video;
    filled.hidden = !video;
    big.hidden = !!video;
    player.hidden = !video;
    foot.hidden = !video;
    cardName.textContent = video?.name || '';
    panelName.textContent = video?.name || '';
    paintFacts();
  }
  const lock = () => { for (const b of [empty, big, cardChange, panelChange]) b.disabled = locked; };
  paint();
  lock();

  return { card, panel, player, error, get: () => video, set: (v) => { error.set(''); return show({ ok: true, ...v }); }, pick, drop, watch, setLocked(on) { locked = on; lock(); } };
}

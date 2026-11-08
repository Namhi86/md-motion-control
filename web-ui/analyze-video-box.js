import { el } from './pop.js';
import { mediaUrl } from './shared/media-handles.js';
import { button, noteLine } from './analyze-controls.js';
import { metaLine } from './analyze-form.js';
import { t } from './i18n.js';
import { ct } from './core-text.js';

// Section 1 of the tab: the reference video. A button that picks (the app's own file dialog) and that takes drops; after a pick, a player and the line
// "30 giây · 9:16 · có tiếng". The window never holds a path: the core answers a handle, the player shows fs-media://pick/<handle>.
// A video the core refuses (over 60 s, over 2 GB, another type, a length it cannot read) is said in red at once and the video picked before stays.
// While an analysis runs (setLocked) the video cannot be changed: "Đổi video" is off and a pick or a drop does nothing.
const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');

// target lights up (class an-drop-on) while files are over it; onFiles([File]) gets a drop. -> a function that stops listening.
export function watchVideoDrop(target, onFiles, isLocked = () => false) {
  let depth = 0;
  const lit = (on) => target.classList.toggle('an-drop-on', on);
  const enter = (ev) => { if (!hasFiles(ev)) return; ev.preventDefault(); depth += 1; lit(!isLocked()); };
  const over = (ev) => { if (hasFiles(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = isLocked() ? 'none' : 'copy'; } };
  const leave = () => { depth = Math.max(0, depth - 1); if (!depth) lit(false); };
  const drop = (ev) => {
    if (!hasFiles(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    depth = 0;
    lit(false);
    if (!isLocked()) onFiles([...ev.dataTransfer.files]);
  };
  const on = [['dragenter', enter], ['dragover', over], ['dragleave', leave], ['drop', drop]];
  for (const [type, fn] of on) target.addEventListener(type, fn);
  return () => { for (const [type, fn] of on) target.removeEventListener(type, fn); };
}

// -> { node, get() -> { handle, name, bytes, meta } | null, drop(files), pick(), setLocked(on) }. onChange(video) runs when the video changes.
export function mountVideoBox({ dola, onChange, texts = null }) {
  // the words of the empty drop zone: the analysis tab's own unless a tab with other limits (Motion control: any length) gives its own { main, hint }
  const dropMain = texts?.main ?? t('Thả video mẫu vào đây hoặc bấm để chọn');
  const dropHint = texts?.hint ?? t('mp4, mov · tối đa 60 giây · 2 GB');
  const node = el('div', 'an-videobox');
  const holder = el('div', 'an-vhold');
  const error = noteLine('an-err');
  error.node.setAttribute('role', 'alert');
  let video = null;
  let locked = false;

  const take = (answer, failNote) => {
    if (answer === null && failNote) error.set(failNote);
    if (!answer) return; // cancelled
    if (!answer.ok) { error.set(ct(answer.note) || t('Không dùng được video này.')); return; }
    error.set('');
    video = answer;
    paint();
    onChange(video);
  };
  const pick = async () => {
    if (locked) return;
    try { take(await dola.analyze.pickVideo()); } catch (err) { error.set(t('Không mở được hộp chọn video: {reason}', { reason: err.message })); }
  };
  const drop = async (files) => {
    if (locked) return;
    try { take(await dola.analyze.dropVideo(files), t('Không đọc được tệp vừa thả: hãy chọn video bằng nút.')); } catch (err) { error.set(t('Không nhận được video: {reason}', { reason: err.message })); }
  };

  const lock = () => { for (const b of holder.querySelectorAll('button')) b.disabled = locked; };

  function paint() {
    holder.replaceChildren();
    if (!video) {
      const drop$ = button('', 'an-drop', pick);
      drop$.append(el('span', 'an-drop-orb', '▶'), el('span', 'an-drop-main', dropMain), el('span', 'an-drop-hint', dropHint));
      holder.append(drop$);
      lock();
      return;
    }
    const player = Object.assign(el('video', 'an-player'), { src: mediaUrl.pick(video.handle), controls: true, preload: 'metadata', playsInline: true });
    const fail = noteLine('an-note');
    player.addEventListener('error', () => fail.set(t('Không xem trước được video này (vẫn phân tích được).')));
    const info = el('div', 'an-vinfo');
    const text = el('div', 'an-vtext');
    text.append(el('p', 'an-vname', video.name), el('p', 'an-vmeta', metaLine(video.meta)));
    info.append(text, button(t('Đổi video'), 'an-btn an-btn--sm', pick));
    holder.append(player, info, fail.node);
    lock();
  }
  paint();
  node.append(holder, error.node);
  return { node, get: () => video, pick, drop, setLocked(on) { locked = on; lock(); } };
}

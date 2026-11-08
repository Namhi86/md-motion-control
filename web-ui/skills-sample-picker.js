import { isImageTask } from './muse-form.js';
import { button } from './analyze-controls.js';
import { el } from './pop.js';
import { mediaUrl } from './shared/media-handles.js';
import { MAX_SAMPLES } from './shared/skill-store-form.js';
import { publishErrorText } from './skills-text.js';
import { errText } from './ui-text.js';
import { t } from './i18n.js';

// The sample videos of a skill being posted (1-3): picked from the person's own finished videos ("Kho video": the window sends the task id and the core
// finds the file, the window never holds a path) or an .mp4 file chosen with the app's dialog (dola.skills.pickSample -> an opaque handle).
// -> { node, get() -> [{ taskId } | { handle }], count(), lock(on), clear(), preset(list) }; onChange() runs after every change.
// preset([{ taskId, label? }]): the list is replaced by those finished videos (the window opened with a skill already made from one); at most `max`, no repeat.
const SHOWN_TASKS = 24; // the most recent finished videos listed; the history can hold thousands
const mb = (bytes) => `${Math.max(1, Math.round(bytes / 1048576))} MB`;
const clip = (text, n) => { const s = String(text ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

// The finished videos (not pictures) that have a saved file, newest first.
export const sampleTasks = (tasks) => (Array.isArray(tasks) ? tasks : [])
  .filter((task) => typeof task?.id === 'string' && task.status === 'done' && task.result?.file && !isImageTask(task))
  .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));

// The chip text of a finished video taken from the Kho video (also used by the "Tách skill" window when it fills this picker in).
export const taskSampleLabel = (task) => t('Kho video: {name}', { name: clip(task?.prompt, 28) || task?.id });

// The sentence for a refused pick: the core's own ready sentence (r.note, looked at BEFORE the upload: MOV renamed to .mp4, too big, not a video...),
// else the one made from the code. Shown as text, cut to a short line.
const MAX_NOTE = 300;
export function pickRefusal(r) {
  const note = typeof r?.note === 'string' ? r.note.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE) : '';
  return note || publishErrorText(r);
}

export function mountSamplePicker({ dola = window.dola, max = MAX_SAMPLES, onChange = () => {} }) {
  const node = el('div', 'sk-samples');
  let items = []; // { key, taskId?, handle?, label }
  let locked = false;
  const list = el('div', 'sk-sample-list');
  const msg = Object.assign(el('p', 'sk-sample-msg'), { hidden: true });
  msg.setAttribute('role', 'status');
  const panel = Object.assign(el('div', 'sk-sample-panel'), { hidden: true });
  const say = (text) => { msg.textContent = text || ''; msg.hidden = !text; };
  const fromLibrary = button(t('Chọn từ Kho video'), 'an-btn an-btn--sm', () => togglePanel());
  const canUpload = typeof dola.skills?.pickSample === 'function';
  const upload = button(t('Tải mp4 lên'), 'an-btn an-btn--sm', () => pickFile());
  upload.hidden = !canUpload;
  const buttons = el('div', 'sk-sample-btns');
  buttons.append(fromLibrary, upload);
  node.append(list, buttons, msg, panel);

  function paint() {
    list.replaceChildren(...items.map((it, i) => {
      const chip = el('span', 'sk-chip');
      chip.append(el('span', 'sk-chip-name', it.label), Object.assign(button('✕', 'sk-chip-x', () => remove(i)), { title: t('Bỏ video mẫu này'), disabled: locked }));
      chip.lastChild.setAttribute('aria-label', t('Bỏ video mẫu này'));
      return chip;
    }));
    fromLibrary.disabled = upload.disabled = locked;
    onChange();
  }
  function add(item) {
    if (items.some((x) => x.key === item.key)) { say(t('Video này đã được chọn rồi.')); return false; }
    if (items.length >= max) { say(t('Tối đa {max} video mẫu.', { max })); return false; }
    say('');
    items = [...items, item];
    paint();
    return true;
  }
  function remove(i) {
    if (locked) return;
    items = items.filter((_, j) => j !== i);
    say('');
    paint();
    if (!panel.hidden) drawPanel(panel.tasks);
  }

  async function pickFile() {
    say('');
    try {
      const f = await dola.skills.pickSample(); // { handle, name, size } | null (the dialog was closed) | { ok: false, error, reason?, note? } (the file is refused)
      if (f && f.ok === false) say(pickRefusal(f)); // the samples picked before stay as they are
      else if (f && typeof f.handle === 'string' && f.handle) add({ key: `h:${f.handle}`, handle: f.handle, label: f.size ? t('{name} ({size})', { name: clip(f.name || 'video.mp4', 36), size: mb(f.size) }) : clip(f.name || 'video.mp4', 36) });
    } catch (err) {
      say(t('Không chọn được video: {reason}', { reason: errText(err) }));
    }
  }

  function drawPanel(tasks) {
    panel.tasks = tasks;
    if (!tasks.length) { panel.replaceChildren(el('p', 'sk-sample-note', t('Chưa có video nào đã làm xong trong Kho video. Hãy tạo video trước, hoặc tải mp4 lên.'))); return; }
    const grid = el('div', 'sk-pick-grid');
    for (const task of tasks.slice(0, SHOWN_TASKS)) {
      const on = items.some((x) => x.taskId === task.id);
      const tile = Object.assign(el('button', `sk-pick${on ? ' sk-pick--on' : ''}`), { type: 'button', disabled: locked });
      tile.setAttribute('aria-pressed', String(on));
      const v = Object.assign(el('video', 'sk-pick-video'), { muted: true, preload: 'metadata', src: mediaUrl.task(task.id, task.result?.savedAt || task.result?.bytes || '') });
      tile.append(v, el('span', 'sk-pick-text', clip(task.prompt, 40) || 'Video'));
      tile.onclick = () => {
        if (on) remove(items.findIndex((x) => x.taskId === task.id));
        else if (add({ key: `t:${task.id}`, taskId: task.id, label: taskSampleLabel(task) })) drawPanel(tasks);
      };
      grid.append(tile);
    }
    panel.replaceChildren(grid, ...(tasks.length > SHOWN_TASKS ? [el('p', 'sk-sample-note', t('Hiện {n} video gần nhất.', { n: SHOWN_TASKS }))] : []));
  }
  async function togglePanel() {
    if (!panel.hidden) { panel.hidden = true; return; }
    say('');
    try {
      drawPanel(sampleTasks(await dola.queue.list()));
      panel.hidden = false;
    } catch (err) {
      say(t('Không đọc được Kho video: {reason}', { reason: errText(err) }));
    }
  }

  paint();
  return {
    node,
    get: () => items.map((it) => (it.taskId ? { taskId: it.taskId } : { handle: it.handle })),
    count: () => items.length,
    lock(on) { locked = !!on; paint(); },
    clear() { items = []; panel.hidden = true; say(''); paint(); },
    preset(list) {
      const next = [];
      for (const s of Array.isArray(list) ? list : []) {
        if (next.length >= max) break;
        if (typeof s?.taskId !== 'string' || !s.taskId || next.some((x) => x.taskId === s.taskId)) continue;
        next.push({ key: `t:${s.taskId}`, taskId: s.taskId, label: typeof s.label === 'string' && s.label.trim() ? clip(s.label, 40) : t('Kho video: {name}', { name: s.taskId }) });
      }
      items = next;
      panel.hidden = true;
      say('');
      paint();
    },
  };
}

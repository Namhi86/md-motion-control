import { splitPrompts } from './shared/prompt-split.js';
import { skillFields } from './shared/skill-form.js';
import { storeSkillFields, storeSkillProblem } from './shared/skill-store-form.js';
import { setQueueWaiting } from './history.js';
import { el } from './pop.js';
import { initPromptBox } from './queue-prompt-box.js';
import { createSettingsUi } from './queue-settings-ui.js';
import { createToolbar } from './queue-toolbar.js';
import { t, tn, tx } from './i18n.js';
import { ct } from './core-text.js';
import { errText, waitLine } from './ui-text.js';

// The queue controls (the pause button on the tab line, settings in the composer, notes above the list) and the way the composer hands
// prompts to the queue.
// The task rows themselves are drawn by history.js. Contract: the queue contract (src/task-store.js of the app core)
const SETTINGS_POLL_MS = 10_000; // free RAM and the thread cap change while videos render

// One prompt (or many, apart by a blank line) from the composer -> one queued task each.
// Returns { ok, count, message }: message is the sentence for the warning line under the button.
// Any mode but Muse sends the shape it always sent: no `kind`. skillHandle (the skill file picked with window.dola.pickSkill) goes into the tasks
// of a mode that takes one (Pro, Muse) and is dropped for any other. storeSkill ({ id, title }, a skill of the Kho skill tab) goes in the same way but
// only for Pro and Muse video, up to 15 s, and never with a skill file: anything else is refused here (the core checks it again).
export async function enqueueFromForm({ promptText, ratio, duration, model, mode, files, kind, resolution, skillHandle, storeSkill }) {
  const { prompts, truncated } = splitPrompts(promptText);
  if (!prompts.length) return { ok: false, count: 0, message: kind === 'image' ? t('Chưa có mô tả ảnh.') : t('Chưa có mô tả video.') };
  const refs = Array.isArray(files) ? files.map((f) => f?.handle).filter((h) => typeof h === 'string' && h) : []; // [{ handle, name }]
  const modelId = typeof model === 'object' ? model?.id : model; // the id from MODELS; the {id, label} pair of a history row also works
  const skill = skillFields({ mode, handle: skillHandle });
  const storeProblem = storeSkillProblem({ mode, kind, duration, storeSkill, skillHandle });
  if (storeProblem) return { ok: false, count: 0, message: tx(storeProblem) }; // a fixed sentence of shared/skill-store-form.js (listed in `dynamic` of en-create.js)
  const tasks = prompts.map((prompt) => ({ prompt, ratio, duration, model: modelId, ...(mode && mode !== 'fast' ? { mode } : {}), ...(kind ? { kind } : {}), ...(resolution ? { resolution } : {}), ...skill, ...storeSkillFields(storeSkill), handles: [...refs] })); // kind: only a Muse task has one ('video' | 'image')
  try {
    const r = await window.dola.queue.add(tasks);
    if (r?.ok === false) return { ok: false, count: 0, message: ct(r.note) || t('Không thêm được vào hàng đợi ({reason}).', { reason: r.reason || t('không rõ') }) };
  } catch (err) {
    return { ok: false, count: 0, message: t('Không thêm được vào hàng đợi: {why}', { why: errText(err) }) };
  }
  const tail = truncated ? ` ${tn(prompts.length, 'Chỉ lấy {n} lệnh đầu, phần còn lại bị bỏ.', 'Only the first {n} prompt was taken; the rest was dropped.', 'Only the first {n} prompts were taken; the rest were dropped.')}` : '';
  return { ok: true, count: prompts.length, message: `${tn(prompts.length, 'Đã xếp {n} lệnh vào hàng đợi.', 'Queued {n} prompt.', 'Queued {n} prompts.')}${tail}` };
}

export function initQueueUi() {
  initPromptBox();
  const mount = document.getElementById('mount-queue');
  if (!mount) return;
  const queue = window.dola.queue;

  const msg = el('p', 'qt-msg');
  msg.hidden = true;
  let msgTimer = 0;
  const say = (text, bad) => {
    msg.textContent = text;
    msg.classList.toggle('qt-msg--bad', !!bad);
    msg.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msg.hidden = true; }, bad ? 9000 : 5000);
  };

  let settings = null;
  let pollFailed = false;
  const apply = (next) => {
    settings = next;
    toolbar.setPaused(!!next.paused);
    settingsUi.paint(next);
  };
  // The main process is the truth: after every change the bar reads the settings back. A failing poll says so once, not every 10 s.
  const refresh = async () => {
    try {
      apply(await queue.settings());
      pollFailed = false;
    } catch (err) {
      if (!pollFailed) say(t('Không đọc được cài đặt hàng đợi: {why}', { why: errText(err) }), true);
      pollFailed = true;
    }
  };
  const change = async (patch) => {
    if (settings) apply({ ...settings, ...patch }); // the bar answers at once
    try {
      await queue.setSettings(patch);
    } catch (err) {
      say(t('Không lưu được cài đặt: {why}', { why: errText(err) }), true);
    }
    await refresh();
  };

  // A line that stays while prompts wait and nothing runs: paused (the pause is remembered between runs, so the app may open paused),
  // Dola busy, accounts resting, no network, no account. The countdown in it ticks every second without asking the main process.
  const waitNote = el('p', 'qt-wait');
  waitNote.hidden = true;
  let lastStats = null;
  const paintWait = () => {
    const text = waitLine(lastStats);
    if (waitNote.textContent !== text) waitNote.textContent = text;
    waitNote.hidden = !text;
  };
  const showStats = (s) => {
    lastStats = s;
    setQueueWaiting(s?.waiting); // the waiting rows say the same
    paintWait();
  };
  setInterval(paintWait, 1000);

  const toolbar = createToolbar({
    say,
    onPause: async () => {
      await (settings?.paused ? queue.resume() : queue.pause());
      await refresh();
    },
  });
  const settingsUi = createSettingsUi({ onPatch: change });
  // The pause button goes on the line of the tabs, the settings go in the composer under duration/ratio, and the bar keeps only
  // its two notes (paused / last message). A mount that is missing falls back to the notes box, so nothing disappears.
  const notes = el('div', 'qt-notes');
  const place = (id, node) => (document.getElementById(id) || notes).append(node);
  place('mount-queue-actions', toolbar.actions);
  place('mount-queue-settings', settingsUi.node);
  notes.append(waitNote, msg);
  mount.replaceChildren(notes);

  queue.onStats(showStats);
  queue.stats().then(showStats).catch((err) => say(t('Không đọc được số đếm hàng đợi: {why}', { why: errText(err) }), true));
  window.dola.accounts.list().then(settingsUi.setAccounts).catch((err) => say(t('Không đọc được danh sách acc: {why}', { why: errText(err) }), true));
  window.dola.accounts.onChange(settingsUi.setAccounts);
  refresh();
  setInterval(refresh, SETTINGS_POLL_MS);
}

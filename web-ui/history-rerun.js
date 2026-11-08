import { t, tn } from './i18n.js';
import { ct } from './core-text.js';
import { isImageTask } from './muse-form.js';
import { resolutionOfTask } from './veo-durations.js';
import { errText } from './ui-text.js';

// "Tạo lại (N)" of the history bar: every ticked task becomes a NEW task with the same settings (a successful one too: this is not "Thử lại").
// Pure (no DOM, no Electron): the two calls into the app come in as arguments. tests/history-rerun.test.js.

// The payload of window.dola.queue.add for ONE stored task. `refs` = what queue.refs(task.id) gave ([{ handle, name }]: the reference images that are still
// on the machine). The window never holds a path, so a skill FILE cannot be sent again: the task is re-created without it and `skillFile` says so.
// Elements (@name in the prompt) need nothing: the core reads them from the prompt again, and their images are among the refs already.
// -> { payload, skillFile }
export function rerunPayload(task, refs = []) {
  const all = (Array.isArray(refs) ? refs : []).map((r) => r?.handle).filter((h) => typeof h === 'string' && h);
  // A Muse picture takes no reference image; every other task keeps the ones that are left (they passed the core's limits when first queued).
  const handles = task.mode === 'muse' && isImageTask(task) ? [] : all;
  const kind = task.kind || (task.mode === 'muse' && isImageTask(task) ? 'image' : ''); // a Muse picture from before `kind` was stored is known by its file
  const payload = {
    prompt: task.prompt, ratio: task.ratio, duration: task.duration, model: task.model,
    ...(task.mode && task.mode !== 'fast' ? { mode: task.mode } : {}),
    ...(kind ? { kind } : {}),
    ...(resolutionOfTask(task) ? { resolution: resolutionOfTask(task) } : {}), // a 360p Omni clip is made again at 360p
    handles,
    ...(task.skillId ? { storeSkill: { id: task.skillId, title: task.skillTitle || task.skillId } } : {}),
  };
  return { payload, skillFile: !task.skillId && typeof task.skill === 'string' && task.skill !== '' };
}

// One queue.add per task, so one bad task does not refuse the others (the core refuses a whole batch for one bad entry).
// tasks: the stored tasks. refs(id) / add(list): window.dola.queue.refs / .add.
// -> { ok: some task was added, added, failed, note: the first reason a task was refused, then the skill-file remark ('' when none) }
export async function rerunTasks(tasks, { refs, add }) {
  let added = 0;
  let skillFiles = 0;
  let why = '';
  for (const task of tasks) {
    try {
      const { payload, skillFile } = rerunPayload(task, await refs(task.id));
      const res = await add([payload]);
      if (res?.ok === false) throw new Error(ct(res.note) || t('Không thêm được vào hàng đợi ({reason}).', { reason: res.reason || t('không rõ') }));
      added += 1;
      if (skillFile) skillFiles += 1;
    } catch (err) {
      why ||= errText(err).replace(/^Lệnh #\d+:\s*/, ''); // the core numbers a batch of one "Lệnh #1": meaningless here
    }
  }
  const remark = skillFiles ? tn(skillFiles, '{n} lệnh có skill tệp được gửi lại không kèm skill.', '{n} prompt that used a skill file was sent again without the skill.', '{n} prompts that used a skill file were sent again without the skill.') : '';
  return { ok: added > 0, added, failed: tasks.length - added, note: [why, remark].filter(Boolean).join(' ') };
}

// The sentence for the bar. total = how many tasks were ticked.
export function rerunText({ added = 0, note = '' } = {}, total) {
  const head = !added ? t('Không tạo lại được lệnh nào.') : added < total ? t('Đã tạo lại {added}/{total} lệnh.', { added, total }) : tn(added, 'Đã tạo lại {n} lệnh.', 'Recreated {n} prompt.', 'Recreated {n} prompts.');
  return note ? `${head} ${note}` : head;
}

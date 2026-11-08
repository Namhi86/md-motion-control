// Copied from dola-seedance-client/src/skill-form.js (smit-corp). Keep the two in step: change both, run both tests.
// The rules of the "Thêm skill (.md/.txt)" button of the form: which modes take a skill file, when the button is drawn, what the task gets.
// Pure: no DOM, no Electron. The window draws it (electron/skill-ui.js, and the web copy site/skill-ui.js); tested by skill-form.test.js.
// A skill is a note for the AI that goes along with the command. The file itself never reaches the window: the core hands back
// { handle, name } (window.dola.pickSkill) and the task carries `skillHandle`, as reference images carry `handles`.
// Only Muse (video and picture) and Seedance Pro use it: Nhanh, Nhanh + tiếng and Veo never get one.

export const SKILL_TEXT = {
  button: 'Thêm skill (.md/.txt)',
  tip: 'Ghi chú hướng dẫn cho AI (file .md hoặc .txt) - đính kèm cùng lệnh',
  remove: 'Bỏ skill',
};

// Form modes ('pro', 'muse', 'image') and the task mode a form sends ('pro', 'muse': a picture is a Muse task).
const SKILL_MODES = ['pro', 'muse', 'image'];
export const modeTakesSkill = (mode) => SKILL_MODES.includes(mode);

// An older core has no `skill` in window.dola.options() or no pickSkill on the bridge: then no button is drawn at all.
export const skillOffered = (opts, dola) => opts?.skill === true && typeof dola?.pickSkill === 'function';
export const skillVisible = ({ mode, opts, dola }) => skillOffered(opts, dola) && modeTakesSkill(mode);

// What pickSkill answered -> { handle, name } | null (null = the person cancelled, or the answer is not a skill).
export function pickedSkill(result) {
  if (typeof result?.handle !== 'string' || !result.handle) return null;
  const name = typeof result.name === 'string' ? result.name.trim() : '';
  return { handle: result.handle, name: name || 'skill' };
}

// The skill that survives a change of mode: a mode that takes none drops it (and a pick that comes back late is dropped the same way).
export const skillAfterMode = (skill, mode) => (skill && modeTakesSkill(mode) ? skill : null);

// The field a task gets: `skillHandle` only when a skill is picked AND the mode takes one; otherwise nothing, so the task keeps the
// shape it always had.
export const skillFields = ({ mode, handle }) => (modeTakesSkill(mode) && typeof handle === 'string' && handle ? { skillHandle: handle } : {});

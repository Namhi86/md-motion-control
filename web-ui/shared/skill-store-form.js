// The rules of the "Kho skill" tab and of "Dùng skill" / "Đăng skill", pure: no DOM, no Electron (tests/skill-store-form.test.js).
// Web only: the bundled renderer of the app core has no Kho tab. The shapes are the ones of plans/261019-2028-md-motion-skill-store/contracts.md
// (window.dola.skills.* and the Card). The window never computes an author label (the core sends it) and never holds a skill body.
export const PERIODS = ['week', 'month', 'all'];
export const PERIOD_LABEL = { week: 'Tuần', month: 'Tháng', all: 'Tất cả' };
export const TOP_TITLE = { week: 'Top 3 tuần này', month: 'Top 3 tháng này', all: 'Top 3 mọi thời gian' };
export const isPeriod = (p) => PERIODS.includes(p);

export const STORE_MAX_SECONDS = 15; // Sếp 2026-10-20: a Kho skill makes 15 s videos only (Pro <= 15, Muse 2-15, never "Theo prompt")
const MUSE_MIN_SECONDS = 2;
const DEFAULT_MUSE_SECONDS = 10;

export const STORE_TEXT = {
  honesty: 'Nội dung skill được ẩn trong app nhưng không mã hoá.',
  unreviewed: 'Skill cộng đồng – chưa kiểm duyệt',
  empty: 'Chưa có skill nào',
  noTop: 'Chưa có lượt dùng nào trong kỳ này.',
  loading: 'Đang tải…',
  use: 'Dùng skill',
  durationNote: 'Skill từ Kho chỉ làm video tối đa 15 giây.',
  chipPrefix: 'Kho: ',
  needMode: 'Skill này chỉ có bản cho chế độ mà app của bạn chưa có.',
  dropped: (title) => `Đã bỏ skill "${title}" của Kho vì chế độ này không dùng skill đó.`,
};

// The answer of dola.skills.list when it fails -> { text, retry }.
const LIST_PROBLEMS = {
  skills_disabled: { text: 'Kho skill đang tạm đóng', retry: false },
  signed_out: { text: 'Đăng nhập để xem', retry: false },
};
export const listProblem = (error) => LIST_PROBLEMS[error] || { text: 'Không tải được Kho skill', retry: true }; // server | network | rate_limited | the rest

// ── cards ──
const cardId = (c) => (typeof c?.id === 'string' || Number.isFinite(c?.id) ? String(c.id) : '');
const createdMs = (c) => Date.parse(c?.created_at ?? c?.createdAt ?? '') || Number.POSITIVE_INFINITY; // no date = counted as the newest
export const isUnreviewed = (c) => c?.reviewed === false;
export const httpsOnly = (url) => typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url);
export const samplesOf = (c) => (Array.isArray(c?.samples) ? c.samples : []).filter((s) => httpsOnly(s?.url));

// The three most used skills of the period, from the system list and the community list together: more uses first, equal uses -> the older
// skill first; a skill that nobody used in the period is not ranked; the same id twice counts once.
export function topThree(...lists) {
  const seen = new Set();
  const ranked = [];
  for (const list of lists) {
    for (const c of Array.isArray(list) ? list : []) {
      const id = cardId(c);
      if (!id || seen.has(id) || !(Number(c.uses) > 0)) continue;
      seen.add(id);
      ranked.push(c);
    }
  }
  return ranked.sort((a, b) => Number(b.uses) - Number(a.uses) || createdMs(a) - createdMs(b) || cardId(a).localeCompare(cardId(b))).slice(0, 3);
}

// ── "Dùng skill": which mode the form opens in, and the length rules a Kho skill puts on it ──
// offered: { pro: bool, muse: bool } (what this core can do). A skill that has Pro opens Pro, else Muse (video); null = this app has neither.
export function modeForUse(modes, offered) {
  const has = (m) => Array.isArray(modes) && modes.includes(m) && offered?.[m] === true;
  if (has('pro')) return 'pro';
  return has('muse') ? 'muse' : null;
}
// What "Dùng skill" sets in the form's prefs: the mode, no "Theo prompt", a length that suits the skill. null = this app can make neither mode of the skill.
export function storeUsePatch(card, offered, prefs) {
  const mode = modeForUse(card?.modes, offered);
  return mode ? { mode, museScript: false, duration: storeSkillDuration(mode, prefs?.duration) } : null;
}
// The seconds the form may offer while a Kho skill is attached (mode 'pro' | 'muse'; range = the mode's own { min, max }).
export function storeDurationRange(mode, range) {
  const max = Math.min(Number.isFinite(range?.max) ? range.max : STORE_MAX_SECONDS, STORE_MAX_SECONDS);
  const min = mode === 'muse' ? Math.max(Number.isFinite(range?.min) ? range.min : 0, MUSE_MIN_SECONDS) : (Number.isFinite(range?.min) ? range.min : 1);
  return { min: Math.min(min, max), max };
}
// A length that suits the skill: Pro never above 15; Muse 2-15 and 0 ("Theo prompt") becomes 10.
export function storeSkillDuration(mode, current) {
  const n = Math.round(Number(current));
  if (mode === 'muse') return !Number.isFinite(n) || n <= 0 ? DEFAULT_MUSE_SECONDS : Math.min(STORE_MAX_SECONDS, Math.max(MUSE_MIN_SECONDS, n));
  return !Number.isFinite(n) || n <= 0 ? STORE_MAX_SECONDS : Math.min(STORE_MAX_SECONDS, n);
}
// The chip survives a change of mode only while the skill has that mode (a picture is not a Kho mode); null = dropped.
export const storeSkillAfterMode = (store, mode) => (store && Array.isArray(store.modes) && store.modes.includes(mode) ? store : null);

// A command with a Kho skill: Pro or Muse VIDEO, 15 s at most, no skill file next to it. -> '' or the sentence that says why not.
export function storeSkillProblem({ mode, kind, duration, storeSkill, skillHandle }) {
  if (!storeSkill) return '';
  if (typeof storeSkill.id !== 'string' || !storeSkill.id) return 'Skill từ Kho không hợp lệ. Hãy chọn lại skill.';
  if (skillHandle) return 'Chỉ dùng một skill mỗi lần: bỏ tệp skill hoặc bỏ skill từ Kho.';
  if (mode !== 'pro' && !(mode === 'muse' && kind !== 'image')) return 'Skill từ Kho chỉ dùng cho video Seedance Pro hoặc Muse.';
  const range = storeDurationRange(mode, null);
  if (!Number.isFinite(duration) || duration < range.min || duration > range.max) return mode === 'muse' ? 'Skill từ Kho: video Muse dài từ 2 đến 15 giây.' : STORE_TEXT.durationNote;
  return '';
}
// The field a task gets for a Kho skill (the core checks it again).
export const storeSkillFields = (storeSkill) => (storeSkill && typeof storeSkill.id === 'string' && storeSkill.id ? { storeSkill: { id: storeSkill.id, title: String(storeSkill.title ?? '').slice(0, 80) } } : {});

// ── "Đăng skill": what the form checks before it asks the core (the core and the server check again) ──
const MAX_TITLE = 80;
const MAX_DESC = 300;
const MIN_BODY = 50;
export const BODY_MAX = 8000; // a community skill
// Muse takes 20000 characters for the whole text of a skill, and the core puts the fixed rule line (247 characters) and a blank line (2) in front of every
// Kho body (STORE_SKILL_GUARD): a body longer than 20000 - 249 can never be used with Muse. A system skill's body (Muse falls back to it) and its Muse
// version are held to that. The number is the core's (src/skill-publish-input.js BODY_MAX_SYSTEM / BODY_MUSE_MAX): keep the two in step.
export const GUARD_RESERVE = 249;
export const BODY_MAX_SYSTEM = 20000 - GUARD_RESERVE; // 19751
export const BODY_MUSE_MAX = 20000 - GUARD_RESERVE; // 19751
// The id of a skill as the Kho gives it (a decimal number, as text); anything else is not an id to send a sample to.
export const isSkillId = (v) => typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v);
export const MAX_SAMPLES = 3;
const MODE_ORDER = ['pro', 'muse'];

// input: { title, description, modes, body, bodyHandle, bodyMuse, system, admin, samples: [{ taskId } | { handle }] } -> [sentence]
export function publishProblems(input = {}) {
  const out = [];
  const system = input.admin === true && input.system === true;
  const title = String(input.title ?? '').trim();
  if (title.length < 3 || title.length > MAX_TITLE) out.push(`Tiêu đề phải dài 3 đến ${MAX_TITLE} ký tự (đang có ${title.length}).`);
  const desc = String(input.description ?? '').trim();
  if (desc.length > MAX_DESC) out.push(`Mô tả tối đa ${MAX_DESC} ký tự (đang có ${desc.length}).`);
  if (!MODE_ORDER.some((m) => (input.modes || []).includes(m))) out.push('Chọn ít nhất một chế độ (Pro hoặc Muse).');
  if (input.system === true && input.admin !== true) out.push('Chỉ admin được đăng skill hệ thống.');
  const max = system ? BODY_MAX_SYSTEM : BODY_MAX;
  const body = String(input.body ?? '').trim();
  if (input.bodyHandle) {
    if (body) out.push('Chỉ dùng một: dán nội dung hoặc chọn tệp .md.');
  } else if (body.length < MIN_BODY) out.push(`Nội dung skill phải dài ít nhất ${MIN_BODY} ký tự (đang có ${body.length}).`);
  else if (body.length > max) out.push(`Nội dung skill tối đa ${max} ký tự (đang có ${body.length}).`);
  if (system && String(input.bodyMuse ?? '').trim().length > BODY_MUSE_MAX) out.push(`Bản cho Muse tối đa ${BODY_MUSE_MAX} ký tự.`);
  const n = Array.isArray(input.samples) ? input.samples.length : 0;
  if (n < 1) out.push('Cần ít nhất 1 video mẫu.');
  else if (n > MAX_SAMPLES) out.push(`Tối đa ${MAX_SAMPLES} video mẫu.`);
  return out;
}
// The object dola.skills.publish gets. A person that is not an admin never sends `system` or the Muse version.
export function publishPayload(input) {
  const system = input.admin === true && input.system === true;
  const bodyMuse = system ? String(input.bodyMuse ?? '').trim() : '';
  return {
    title: String(input.title).trim(),
    description: String(input.description ?? '').trim(),
    modes: MODE_ORDER.filter((m) => input.modes.includes(m)),
    ...(input.bodyHandle ? { bodyHandle: input.bodyHandle } : { body: String(input.body).trim() }),
    ...(bodyMuse ? { bodyMuse } : {}),
    ...(system ? { system: true } : {}),
    samples: input.samples.map((s) => (s.taskId ? { taskId: s.taskId } : { handle: s.handle })),
  };
}

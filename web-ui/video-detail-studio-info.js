import { HANDOFF_TEXT, SIGN_IN_REASONS, STUDIO_TEXT } from './ui-text.js';
import { dateLocale, getLang, tx } from './i18n.js';

// Thông tin chi tiết và nút sao chép trong bảng chi tiết video
const AUDIO_MODES = new Set(['voice', 'pro', 'veo', 'muse']);

export const canSend = () => false;
export const canCopy = (dola) => typeof dola?.library?.copyPrompt === 'function';

// task: a queue task snapshot. studio: { needsAudio }. -> { disabled, reason } (reason: a key of HANDOFF_TEXT, or null)
export function cardState(task, studio) {
  if (!task?.result?.file) return { disabled: true, reason: 'no_file' };
  if (studio?.needsAudio && !AUDIO_MODES.has(task.mode)) return { disabled: true, reason: 'no_audio' }; // a missing or unknown mode is "fast": no sound
  return { disabled: false, reason: null };
}

// "21/10/2026" from the ISO date the backend gave; '' when it is not a date.
export function formatDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(dateLocale(), getLang() === 'en' ? { year: 'numeric', month: 'short', day: 'numeric' } : { day: '2-digit', month: '2-digit', year: 'numeric' }); // English: "Oct 21, 2026", never 10/21
}

// Kết quả phản hồi -> { ok, text, signIn }. studio: { label }.
export function answerView(answer, studio) {
  if (answer?.ok === true) {
    const day = typeof answer.expires_at === 'string' ? formatDay(answer.expires_at) : '';
    const text = [STUDIO_TEXT.opened(tx(studio.label)), day && STUDIO_TEXT.until(day), answer.durable === true && STUDIO_TEXT.durable].filter(Boolean).join(' ');
    return { ok: true, text, signIn: false };
  }
  const reason = typeof answer?.reason === 'string' && Object.hasOwn(HANDOFF_TEXT, answer.reason) ? answer.reason : 'server';
  const wait = Number(answer?.retry_after);
  const more = reason === 'rate_limited' && Number.isFinite(wait) && wait > 0 ? STUDIO_TEXT.retryAfter(Math.ceil(wait)) : '';
  return { ok: false, text: HANDOFF_TEXT[reason] + more, signIn: SIGN_IN_REASONS.includes(reason) };
}

// The short line for the phase onHandoff reported; an unknown phase is the general "sending".
export const phaseText = (phase) => (typeof phase === 'string' && Object.hasOwn(STUDIO_TEXT.phase, phase) ? STUDIO_TEXT.phase[phase] : STUDIO_TEXT.sending);

// The word on the Chép button after copyPrompt answered.
export function copyLabel(answer) {
  if (answer?.ok === true) return STUDIO_TEXT.copied;
  if (answer?.reason === 'rate_limited') return STUDIO_TEXT.copyTooFast;
  if (answer?.reason === 'no_task') return STUDIO_TEXT.copyNone;
  return STUDIO_TEXT.copyFailed;
}

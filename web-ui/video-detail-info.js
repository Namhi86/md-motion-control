import { DETAIL_TEXT, MODE_LABEL } from './ui-text.js';
import { dateLocale, getLang } from './i18n.js';

// The text of the video detail panel, pure (no DOM): the title and the 8 rows of "CHI TIẾT" for one task. A field a task does not have
// (an old task, a clip that was never saved) is "—"; nothing here throws on a task of any shape.
const NONE = '—';
const MB = 1024 * 1024;

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : NONE);
const count = (v, min, suffix = '') => (Number.isFinite(v) && v >= min ? `${v}${suffix}` : NONE);

// A missing or unknown mode is "Nhanh": the core reads it the same way (modeOf in src/video-request.js).
export const modeLabel = (mode) => MODE_LABEL[mode] || MODE_LABEL.fast;
export const detailTitle = (task) => `${DETAIL_TEXT.title} · ${modeLabel(task?.mode)}`;

export function formatMB(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return NONE;
  const mb = bytes / MB;
  const point = getLang() === 'en' ? '.' : ','; // the decimal mark of the language of the page
  return `${mb < 0.01 ? `< 0${point}01` : mb.toFixed(2).replace('.', point)} MB`;
}

// A date and time the way the page language writes it: Vietnamese "16/10/2026, 19:05:00", English with the month in letters ("Oct 16, 2026, 7:05 PM")
// so that Oct 11 is never read as 10/11. Shared with the history rows (history.js).
export const dateTimeText = (d) => d.toLocaleString(dateLocale(), getLang() === 'en' ? { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : undefined);

export function formatWhen(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return NONE;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? NONE : dateTimeText(d);
}

// task: a queue task (any shape). labels: Map model id -> label (history.js reads it from window.dola.options()); without it the id shows.
// Returns [[label, value] x 8] in the order of DETAIL_TEXT.rows.
export function detailRows(task, labels) {
  const t = task && typeof task === 'object' ? task : {};
  const model = typeof t.model === 'string' ? (labels?.get?.(t.model) || t.model) : '';
  const values = [
    text(model),
    modeLabel(t.mode),
    count(t.duration, 1, 's'),
    text(typeof t.ratio === 'string' ? t.ratio : ''),
    formatMB(t.result?.bytes),
    formatWhen(t.createdAt),
    text(t.accountLabel),
    count(t.attempts, 0),
  ];
  return DETAIL_TEXT.rows.map((label, i) => [label, values[i]]);
}

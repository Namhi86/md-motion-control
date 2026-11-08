import { dateLocale, getLang, t, tn } from './i18n.js';

// The admin screen as plain data (admin-view.js draws it, admin-entry.js shows its link): what the person reads, what the form holds, what is sent.
// No DOM here. Every line is Vietnamese in plain words; a server code is never printed as it is. The bundled app UI has no admin screen: web only.

// The cards of "Bài viết mở khoá", ONE per feature that has its own unlock task. A feature that comes later (Veo, Phân tích video…) is one more line here: admin-view.js draws every entry with the same
// component, and each card knows only its own `app` (undefined = the app itself: the call has NO app argument, so an older core that knows nothing of `app` works as before).
export const GATE_CARDS = [
  { id: 'app', title: t('Bài viết mở khoá app'), desc: t('Bài Facebook mà mọi người phải like, comment mã và share để mở khoá app.'), app: undefined },
  { id: 'voice', title: t('Bài viết mở khoá Giọng nói'), desc: t('Bài Facebook mà mọi người phải comment mã MDMC_voice_… và share để dùng Giọng nói không giới hạn ký tự.'), app: 'voice',
    emptyHint: t('Dán link lần đầu sẽ tự tạo chiến dịch') },
];

export const POST_WARNING = t('Đổi bài viết: người đã comment/share ở bài cũ mà chưa được mở khoá sẽ phải làm lại ở bài mới.');
export const CONFIRM_MS = 10_000; // the second press that confirms a change of the post must come this soon after the first
export const LOG_LIMIT = 200;
export const MAX_EMAILS = 200; // the backend's limit (services/auth/fs-admin-access.js)
export const LOG_COLUMNS = [t('Thời gian'), t('Phiên bản'), t('Hệ điều hành'), t('Loại'), t('Mã'), t('Bước'), t('Mức')];

const MAX_EMAIL_LENGTH = 120;
const MAX_URL_LENGTH = 500;
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/; // the backend's rule
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const DASH = '—';

// One plain sentence per short code of window.dola.admin (electron/admin-ipc.js) or of this screen's own checks.
const ERRORS = {
  bad_url: t('URL không hợp lệ. Dán link bài viết Facebook (https://www.facebook.com/…).'),
  no_open_campaign: t('Chưa có chiến dịch mở khoá đang chạy, nên chưa đổi được bài.'),
  app_unsupported: t('Bản app này chưa có bài viết riêng cho tính năng này. Hãy cập nhật app lên bản mới.'),
  unsupported: t('Máy chủ chưa hỗ trợ bài viết riêng cho tính năng này.'),
  bad_app: t('Bản app này không nhận ra tính năng này. Hãy cập nhật app lên bản mới.'),
  post_unresolved: t('Không nhận ra bài viết này (link pfbid). Thử link khác.'),
  forbidden: t('Không có quyền. Chỉ tài khoản admin dùng được màn này.'),
  not_admin: t('Không có quyền. Chỉ tài khoản admin dùng được màn này.'),
  network: t('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'),
  rate_limited: t('Bạn bấm quá nhanh. Đợi một chút rồi thử lại.'),
  server: t('Máy chủ đang bận. Thử lại sau ít phút.'),
  signed_out: t('Phiên đăng nhập đã hết. Hãy đăng nhập lại.'),
  gate_locked: t('App đang bị khoá, chưa dùng được màn này.'),
  user_not_found: t('Không có người dùng nào dùng email này.'),
  bad_email: t('Email không hợp lệ.'),
  bad_from: t('Ngày bắt đầu không hợp lệ.'),
  bad_to: t('Ngày kết thúc không hợp lệ.'),
  bad_range: t('Ngày bắt đầu không được sau ngày kết thúc.'),
};
export const errorText = (code) => ERRORS[code] || t('Chưa làm được. Thử lại sau.');

// ── the post ──
// What the person typed -> { url } (trimmed at both ends) | { message }. A light check: the core and then the server judge it for real.
export function checkUrlInput(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { message: t('Hãy dán địa chỉ bài viết Facebook vào ô.') };
  if (text.length > MAX_URL_LENGTH) return { message: t('Địa chỉ quá dài (tối đa {max} ký tự).', { max: MAX_URL_LENGTH }) };
  if (/\s/.test(text)) return { message: t('Địa chỉ không được có khoảng trắng ở giữa.') };
  if (!/^https:\/\//i.test(text)) return { message: t('Địa chỉ phải bắt đầu bằng https://') };
  return { url: text };
}

// The change is confirmed by a second press on the SAME text soon after the first. -> { send, armed }; armed is kept by the caller (null = nothing waits).
export function pressSave(armed, value, now) {
  if (armed && armed.value === value && now - armed.at <= CONFIRM_MS) return { send: true, armed: null };
  return { send: false, armed: { value, at: now } };
}

const BAD_URL_REASONS = {
  not_a_post: t('URL không hợp lệ: đây không phải dạng bài viết mà hệ thống theo dõi được (cần dạng /posts/<số>, story_fbid hoặc link pfbid).'),
  host: t('URL không hợp lệ: chỉ nhận link facebook.com.'),
};

// The answer of gatePost.set -> { tone: 'ok' | 'bad', text }
export function postMessage(result) {
  if (result?.ok === true) return { tone: 'ok', text: t('Đã lưu bài viết mới. Mọi người thấy bài này ngay.') };
  if (result?.error === 'bad_url' && BAD_URL_REASONS[result.reason]) return { tone: 'bad', text: BAD_URL_REASONS[result.reason] };
  return { tone: 'bad', text: errorText(result?.error) };
}

// ── the e-mails that may watch the windows ──
// The box (one e-mail per line; commas and semicolons also separate) -> { emails (lower-case, no repeats), bad (the lines that are no e-mail), duplicates, tooMany }
export function parseEmails(value) {
  const out = { emails: [], bad: [], duplicates: 0, tooMany: false };
  for (const part of typeof value === 'string' ? value.split(/[\n\r,;]+/) : []) {
    const line = part.trim();
    if (!line) continue;
    const email = line.toLowerCase();
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) out.bad.push(line);
    else if (out.emails.includes(email)) out.duplicates += 1;
    else out.emails.push(email);
  }
  out.tooMany = out.emails.length > MAX_EMAILS;
  return out;
}

export const emailsText = (list) => (Array.isArray(list) ? list.join('\n') : '');

// The line under the box while the person types.
export function emailsCount({ emails, bad, duplicates, tooMany }) {
  if (tooMany) return t('Tối đa {max} email (đang có {n}).', { max: MAX_EMAILS, n: emails.length });
  if (!emails.length && !bad.length) return t('Chưa có email nào.');
  const dup = duplicates ? tn(duplicates, ' (bỏ {n} dòng trùng)', ' ({n} duplicate line skipped)', ' ({n} duplicate lines skipped)') : '';
  const wrong = bad.length ? ` ${tn(bad.length, '{n} dòng không phải email.', '{n} line is not an email.', '{n} lines are not emails.')}` : '';
  return `${tn(emails.length, '{n} email', '{n} email', '{n} emails')}${dup}.${wrong}`;
}

// The answer of windowEmails.set -> { tone, text }
export function saveEmailsMessage(result) {
  if (result?.ok === true) {
    const n = Array.isArray(result.emails) ? result.emails.length : 0;
    return n
      ? { tone: 'ok', text: tn(n, 'Đã lưu {n} email. Người trong danh sách xem được cửa sổ sau khi app làm mới giấy phép (khoảng 1 giờ).', 'Saved {n} email. The person on the list can watch the windows once the app refreshes its license (about 1 hour).', 'Saved {n} emails. People on the list can watch the windows once the app refreshes its license (about 1 hour).') }
      : { tone: 'ok', text: t('Đã lưu: danh sách trống, chỉ admin xem được cửa sổ.') };
  }
  if (result?.error === 'bad_emails') {
    if (result.reason === 'too_many') return { tone: 'bad', text: t('Tối đa {max} email.', { max: MAX_EMAILS }) };
    if (result.reason === 'not_array') return { tone: 'bad', text: t('Danh sách không đúng dạng. Mỗi dòng một email.') };
    return { tone: 'bad', text: Number.isInteger(result.index) ? t('Email thứ {n} không hợp lệ.', { n: result.index + 1 }) : t('Có email không hợp lệ.') };
  }
  return { tone: 'bad', text: errorText(result?.error) };
}

// ── the log of a user ──
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// The dates the form starts with: seven days back (UTC, the day the server counts in) to now.
export const defaultRange = (nowMs) => ({ from: isoDay(nowMs - 7 * DAY_MS), to: '' });

// null = not given, false = not a date, else the day's start in ms
function dayMs(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DAY_RE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) ? false : ms;
}

// The form -> '' (fine) | 'bad_email' | 'bad_from' | 'bad_to' | 'bad_range': what the server would refuse, said before the call.
export function logsProblem({ email, from, to } = {}) {
  const mail = typeof email === 'string' ? email.trim() : '';
  if (!mail || mail.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(mail)) return 'bad_email';
  const start = dayMs(from);
  const end = dayMs(to);
  if (start === false) return 'bad_from';
  if (end === false) return 'bad_to';
  return start !== null && end !== null && start > end ? 'bad_range' : '';
}

// The form -> the request of logs.list (empty dates are left out)
export function logsRequest({ email, from, to }) {
  return { email: String(email ?? '').trim(), ...(from ? { from } : {}), ...(to ? { to } : {}), limit: LOG_LIMIT };
}

// The answer of logs.list -> { tone: 'ok' | 'wait' | 'bad', text }
export function logsMessage(result) {
  if (result?.ok !== true) return { tone: 'bad', text: errorText(result?.error) };
  const n = Array.isArray(result.rows) ? result.rows.length : 0;
  if (!n) return { tone: 'wait', text: t('Không có dòng nhật ký nào trong khoảng này.') };
  return { tone: 'ok', text: n >= LOG_LIMIT ? t('Có {n} dòng mới nhất (có thể còn dòng cũ hơn).', { n }) : tn(n, 'Có {n} dòng, mới nhất ở trên.', '{n} line, newest first.', '{n} lines, newest first.') };
}

function timeText(ts) {
  const ms = typeof ts === 'string' ? Date.parse(ts) : NaN;
  if (Number.isNaN(ms)) return DASH;
  const d = new Date(ms);
  if (getLang() === 'en') return d.toLocaleString(dateLocale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// The rows of logs.list -> [{ cells (the seven columns, text only), tone: 'bad' | 'wait' | 'plain' }], newest first. A row with no usable time goes last.
export function logRows(rows) {
  const seen = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === 'object' && !Array.isArray(r)).map((r) => ({
    r, ms: typeof r.ts === 'string' && !Number.isNaN(Date.parse(r.ts)) ? Date.parse(r.ts) : Number.NEGATIVE_INFINITY, id: Number(r.id) || 0,
  }));
  seen.sort((a, b) => (b.ms - a.ms) || (b.id - a.id)); // two rows with no time give NaN: the id decides
  const cell = (v) => (typeof v === 'string' && v ? v : DASH);
  return seen.map(({ r }) => ({
    cells: [timeText(r.ts), cell(r.app_version), cell(r.os), cell(r.kind), cell(r.code), cell(r.step), cell(r.level)],
    tone: r.level === 'error' ? 'bad' : r.level === 'warn' ? 'wait' : 'plain',
  }));
}

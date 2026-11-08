import { errorText } from './admin-text.js';
import { dateLocale, getLang, t, tx } from './i18n.js';

// What the person reads when the Kho skill tab (publish, nickname, admin) is refused. Pure: no DOM. A short code of window.dola.skills becomes
// one plain Vietnamese sentence; a server code is never printed as it is. Codes: plans/261019-2028-md-motion-skill-store/contracts.md section 2.

const pad = (n) => String(n).padStart(2, '0');
// Vietnamese keeps dd/mm/yyyy; English spells the month (29/10 and 10/29 would be ambiguous).
export const dayText = (d) => (getLang() === 'en' ? d.toLocaleDateString(dateLocale(), { year: 'numeric', month: 'short', day: 'numeric' }) : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`);
const shortDay = (d) => (getLang() === 'en' ? d.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }) : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`);
export const hourText = (d, now = new Date()) => {
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === now.toDateString() ? time : t('{time} ngày {date}', { time, date: shortDay(d) });
};

// A moment the core or the server named: seconds from now (a small number), an epoch in seconds or in milliseconds, or an ISO date string -> Date | null.
export function momentOf(value, now = Date.now()) {
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms);
  }
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 1e9) return new Date(now + value * 1000);
  return new Date(value < 1e11 ? value * 1000 : value);
}

const BAD_FILE = {
  too_big: t('Video mẫu lớn quá (tối đa 50 MB).'),
  not_video: t('Tệp này không phải video.'),
  not_mp4: t('Video mẫu chỉ nhận định dạng MP4.'),
  bad_duration: t('Video mẫu phải dài từ 1 đến 60 giây.'),
  missing: t('Không tìm thấy tệp video đã chọn. Hãy chọn lại.'),
  '\x71uicktime': t('Video này là dạng MOV (.mov đổi tên), Kho chỉ nhận MP4 chuẩn: xuất lại sang MP4 rồi chọn lại.'),
  empty: t('Tệp video này trống. Hãy chọn tệp khác.'),
  not_mp4_name: t('Tệp phải có đuôi .mp4. Hãy chọn video MP4.'),
};
const NICKNAME_REASON = {
  length: t('Tên hiển thị dài từ 3 đến 30 ký tự.'),
  chars: t('Tên chỉ dùng chữ, số, dấu cách và các dấu _ . -'),
  mixed_script: t('Chỉ dùng một kiểu chữ trong tên (không trộn chữ Latin với chữ khác).'),
  reserved: t('Tên này dành riêng, hãy chọn tên khác.'),
};
export const NICKNAME_RANGE = { min: 3, max: 30 };
const SHARED = {
  skills_disabled: t('Kho skill đang tạm đóng.'),
  signed_out: t('Phiên đăng nhập đã hết. Hãy đăng nhập lại.'),
  not_found: t('Skill này không còn nữa (có thể đã bị gỡ).'),
};

// The server's own refusals of the form (the page checks the same limits first, so these are the rare ones).
const FORM_CODES = {
  bad_title: t('Tiêu đề phải dài 3 đến 80 ký tự.'),
  bad_description: t('Mô tả tối đa 300 ký tự.'),
  bad_modes: t('Chọn ít nhất một chế độ (Pro hoặc Muse).'),
  bad_body: t('Nội dung skill chưa hợp lệ: tối thiểu 50 ký tự, người thường tối đa 8000 ký tự.'),
  too_many_samples: t('Skill này đã có đủ 3 video mẫu.'),
  bad_ticket: t('Lượt tải video đã hết hạn. Hãy thử lại.'),
};

const reasonOf = (r) => (typeof r === 'object' && r ? r.reason : undefined);
const codeOf = (r) => (typeof r === 'string' ? r : r?.error);

// The answer of dola.skills.publish (or one failed sample of it) -> one sentence.
export function publishErrorText(r, now = Date.now()) {
  const code = codeOf(r);
  if (code === 'daily_limit') {
    const at = momentOf(r?.retryAfter ?? r?.retry_after, now);
    return at ? t('Mỗi ngày đăng tối đa 10 skill, thử lại sau {time}.', { time: hourText(at, new Date(now)) }) : t('Mỗi ngày đăng tối đa 10 skill.');
  }
  if (code === 'bad_file') return BAD_FILE[reasonOf(r)] || t('Video mẫu không dùng được. Hãy chọn video MP4 khác.');
  if (code === 'bad_answer') return t('Máy chủ đã trả lời nhưng không đọc được. Mở lại Kho skill để xem skill đã được tạo chưa; đừng bấm Đăng lần nữa.');
  if (code === 'busy') return t('Đang đăng một skill khác, đợi xong rồi thử lại.');
  if (code === 'bad_input') return t('Thông tin chưa hợp lệ. Kiểm tra lại tiêu đề, nội dung và video mẫu.');
  if (FORM_CODES[code]) return FORM_CODES[code];
  if (code === 'too_big') return BAD_FILE.too_big;
  if (code === 'forbidden') return t('Bạn không có quyền đăng loại skill này.');
  return SHARED[code] || errorText(code);
}

// The answer of dola.skills.nickname.get / set when it fails -> one sentence.
export function nicknameErrorText(r, now = Date.now()) {
  const code = codeOf(r);
  if (code === 'nickname_taken') return t('Tên này đã có người dùng, hãy chọn tên khác.');
  if (code === 'too_soon') {
    const at = momentOf(r?.canChangeAt ?? r?.can_change_at, now);
    return at ? t('Tên hiển thị chỉ đổi được 30 ngày một lần, đổi lại được từ {date}.', { date: dayText(at) }) : t('Tên hiển thị chỉ đổi được 30 ngày một lần.');
  }
  if (code === 'bad_nickname') return NICKNAME_REASON[reasonOf(r)] || NICKNAME_REASON.chars;
  return SHARED[code] || errorText(code);
}

// The sentences publishProblems() (shared/skill-store-form.js, never edited here) builds, with their numbers already inside: each pattern is matched and the
// sentence is built again from a template of this file, so it can be translated. A sentence no pattern knows goes through tx() (the fixed ones are in `dynamic`).
const PROBLEM_FORMS = [
  [/^Tiêu đề phải dài 3 đến (\d+) ký tự \(đang có (\d+)\)\.$/, (max, n) => t('Tiêu đề phải dài 3 đến {max} ký tự (đang có {n}).', { max, n })],
  [/^Mô tả tối đa (\d+) ký tự \(đang có (\d+)\)\.$/, (max, n) => t('Mô tả tối đa {max} ký tự (đang có {n}).', { max, n })],
  [/^Nội dung skill phải dài ít nhất (\d+) ký tự \(đang có (\d+)\)\.$/, (min, n) => t('Nội dung skill phải dài ít nhất {min} ký tự (đang có {n}).', { min, n })],
  [/^Nội dung skill tối đa (\d+) ký tự \(đang có (\d+)\)\.$/, (max, n) => t('Nội dung skill tối đa {max} ký tự (đang có {n}).', { max, n })],
  [/^Bản cho Muse tối đa (\d+) ký tự\.$/, (max) => t('Bản cho Muse tối đa {max} ký tự.', { max })],
  [/^Tối đa (\d+) video mẫu\.$/, (max) => t('Tối đa {max} video mẫu.', { max })],
];
export function publishProblemText(sentence) {
  for (const [pattern, build] of PROBLEM_FORMS) {
    const m = pattern.exec(String(sentence));
    if (m) return build(...m.slice(1));
  }
  return tx(sentence);
}

// The check made on the form before the call (the same limits the server holds).
export function nicknameProblem(value) {
  const n = String(value ?? '').trim().length;
  return n < NICKNAME_RANGE.min || n > NICKNAME_RANGE.max ? NICKNAME_REASON.length : '';
}

// The answer of an admin call (body / remove / uses / void) when it fails -> one sentence.
export const adminErrorText = (r) => SHARED[codeOf(r)] || errorText(codeOf(r));

export const ADMIN_TEXT = {
  view: t('Xem nội dung'),
  hide: t('Ẩn nội dung'),
  remove: t('Gỡ'),
  sure: t('Bấm lần nữa để gỡ'),
  removeWarn: t('Gỡ sẽ xoá video mẫu, không khôi phục được.'),
  uses: t('Lượt dùng'),
  void: t('Huỷ lượt'),
  museVersion: t('Bản cho Muse'),
};

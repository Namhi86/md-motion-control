import { defaultMode } from './model-groups.js';
import { t, tn } from './i18n.js';
import { ct } from './core-text.js';

// The settings of the "Phân tích video" tab: texts, defaults and rules, pure (no DOM, no Electron). analyze-view.js draws them, tests/analyze-form.test.js
// tests them. The numbers (how many prompts a call may ask, how many products, how long each mode may be) are the core's; what the core does not
// report is copied here on purpose and checked again by the core when "Phân tích" is pressed (the window is never trusted).
export const MAX_PER_CALL = 10; // prompts asked in ONE call to AI Studio (src/analyze-request.js); more are asked in several calls
export const MAX_TOTAL = 50;
export const MAX_PRODUCTS = 10;
export const MAX_STYLE_TEXT = 300;
export const COUNT_CHIPS = [1, 3, 5, 10];
export const PRODUCT_MODES = ['fast', 'voice', 'pro']; // the modes whose queue takes reference images (Veo takes none, Muse keeps @tag as plain text)

export const KINDS = [
  { id: 'copy', label: 'Copy', desc: t('Giữ nhịp, góc máy, chuyển cảnh của video mẫu; chỉ đổi sang sản phẩm của bạn.') },
  { id: 'style', label: t('Chỉ phong cách'), desc: t('Chỉ lấy phong cách (màu, nhịp dựng, cách quay); nội dung viết mới quanh sản phẩm.') },
];
export const DIALOGUES = [
  { id: 'rewrite', label: t('Viết lại cho sản phẩm'), desc: t('Giữ nhịp và độ dài từng câu, viết lời mới cho sản phẩm của bạn (mặc định, tránh dính thương hiệu khác).') },
  { id: 'verbatim', label: t('Giữ nguyên văn'), desc: t('Chép đúng từng câu trong video mẫu (trừ tên thương hiệu gốc).') },
];
// `id` is what goes to the AI; only the NAME shown follows the language of the page (Vietnamese: 'Tiếng Việt', English: 'Vietnamese').
export const LANGUAGES = [
  { id: 'source', label: t('Theo video gốc') },
  { id: 'vi', label: t('Tiếng Việt') },
  { id: 'en', label: t('Tiếng Anh') },
  { id: 'zh', label: t('Tiếng Trung') },
  { id: 'ja', label: t('Tiếng Nhật') },
  { id: 'ko', label: t('Tiếng Hàn') },
  { id: 'th', label: t('Tiếng Thái') },
  { id: 'id', label: t('Tiếng Indonesia') },
];
export const STYLE_CHIPS = ['UGC', 'POV', 'Hài hước', 'Kể chuyện'];
export const MODE_LABEL = { fast: t('Nhanh'), voice: t('Nhanh + tiếng'), pro: 'Pro', veo: 'Veo (Gmail)', muse: 'Muse' };

// The tab exists only when this core has the channel: web goes live before an app that has window.dola.analyze is released, and an older core
// answers options() without the `analyze` key. Both the flag and the bridge must be there.
export const analyzeOffered = (opts, dola) => opts?.analyze === true && typeof dola?.analyze?.run === 'function';

// opts: window.dola.options(). A form with no video mode of its own starts on Pro when this core offers it, else Nhanh + tiếng (model-groups.js defaultMode).
export function defaultSettings(prefs = {}, opts) {
  return {
    kind: 'copy', dialogue: 'rewrite', language: 'source', styles: [], styleText: '', products: [], count: 3, countText: '',
    mode: PRODUCT_MODES.includes(prefs.mode) ? prefs.mode : defaultMode(opts), duration: Number(prefs.duration) || 10, ratio: prefs.ratio || '9:16', model: prefs.model || '',
  };
}

// The destination (mode / length / ratio) the tab starts with: what the "Tạo video" form has now. Image mode of the form is not a video mode:
// the tab then starts on the default (Pro when `opts` says this core offers it, else Nhanh + tiếng).
export function targetFromPrefs(prefs = {}, limits = {}, opts) {
  const mode = Object.keys(MODE_LABEL).includes(prefs.mode) ? prefs.mode : defaultMode(opts);
  return fitTarget({ mode, duration: Number(prefs.duration) || 10, ratio: prefs.ratio || '9:16' }, limits);
}

// A length inside what the mode can make (limits[mode] = { min, max } from analyze.info()); a mode the core did not report keeps the number.
export function fitTarget(target, limits = {}) {
  const lim = limits[target.mode];
  if (!lim || !Number.isFinite(lim.min) || !Number.isFinite(lim.max)) return { ...target };
  return { ...target, duration: Math.min(lim.max, Math.max(lim.min, Math.round(target.duration))) };
}

// The model id the queue wants for a mode, as the "Tạo video" form picks it: Veo and Muse have their own, every other mode uses the form's Seedance model.
export function modelFor(mode, prefs = {}, opts = {}) {
  if (mode === 'veo') return prefs.veoModel || opts.veo?.defaults?.model || '';
  if (mode === 'muse') return opts.muse?.defaults?.model || '';
  return prefs.model || opts.defaults?.model || '';
}

// The first reason the products and the destination do not go together, or ''. A choice of products with Veo or Muse cannot be queued with images.
export function targetProblem(settings) {
  if (settings.products.length && !PRODUCT_MODES.includes(settings.mode)) return t('{mode} chưa nhận ảnh sản phẩm: chọn chế độ Nhanh + tiếng hoặc Pro, hoặc bỏ chọn sản phẩm.', { mode: MODE_LABEL[settings.mode] || settings.mode });
  return '';
}

// The cards are written for the destination the run was asked with (request.target); the queue must use THAT one. When the settings say something else now,
// the person is told to analyse again instead of the new choice being used without a word.
export const TARGET_CHANGED_NOTE = t('Đã đổi chế độ/độ dài: bấm Phân tích lại để prompt khớp');
export const targetDiffers = (stored, now) => !!stored && !!now && (stored.mode !== now.mode || stored.duration !== now.duration || stored.ratio !== now.ratio);

// "23" -> 23; anything that is not a whole number from 1 to MAX_TOTAL -> null.
export function parseCount(text) {
  const raw = String(text ?? '').trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_TOTAL ? n : null;
}

// 23 -> [10, 10, 3]: how many calls to AI Studio and how many prompts each (the core splits the same way, src/analyze-request.js splitCount).
export function splitCount(total, max = MAX_PER_CALL) {
  if (!Number.isInteger(total) || total < 1) return [];
  const parts = Array.from({ length: Math.floor(total / max) }, () => max);
  if (total % max) parts.push(total % max);
  return parts;
}

// What is said under the count when it needs several calls.
export const countNote = (total) => {
  const parts = splitCount(total);
  return parts.length > 1 ? t('{total} prompt = {calls} lượt gọi AI Studio ({parts}), hiện dần từng lượt.', { total, calls: parts.length, parts: parts.join(' + ') }) : '';
};

// The chosen products in the order they were picked ("Image N" follows it). Stale handles (no longer in the library) are dropped.
export const pickedProducts = (handles, library) => handles.map((h) => library.find((e) => e.handle === h)).filter(Boolean);

// -> { ok: true, request } | { ok: false, note }. `request` is what window.dola.analyze.run takes. Everything is checked again by the core.
export function buildRunRequest(settings, video) {
  if (!video?.handle) return { ok: false, note: t('Chưa chọn video mẫu.') };
  const count = settings.countText ? parseCount(settings.countText) : settings.count;
  if (!count) return { ok: false, note: t('Số prompt phải là số nguyên từ 1 đến {max}.', { max: MAX_TOTAL }) };
  if (settings.styleText.length > MAX_STYLE_TEXT) return { ok: false, note: t('Mô tả phong cách tối đa {max} ký tự.', { max: MAX_STYLE_TEXT }) };
  if (settings.products.length > MAX_PRODUCTS) return { ok: false, note: t('Chọn tối đa {max} sản phẩm.', { max: MAX_PRODUCTS }) };
  const problem = targetProblem(settings);
  if (problem) return { ok: false, note: problem };
  return {
    ok: true,
    request: {
      videoHandle: video.handle,
      kind: settings.kind,
      dialogue: settings.kind === 'copy' ? settings.dialogue : 'rewrite', // "giữ nguyên văn" only exists for Copy
      language: settings.language,
      styles: [...settings.styles],
      styleText: settings.styleText.trim(),
      products: [...settings.products],
      target: { mode: settings.mode, duration: settings.duration, ratio: settings.ratio },
      count,
    },
  };
}

// The sentence for a failure of the run, by the reason the core gave; the core's own note is used when it has one and the reason has no text here.
const FAIL_TEXT = {
  limit: t('Mọi acc Gmail của Veo đều hết lượt AI Studio: thử lại sau, hoặc thêm acc Gmail ở mục Veo (Setup → Veo).'),
  no_account: t('Cần ít nhất 1 acc Gmail ở mục Veo (Setup → Veo).'),
  busy: t('Các acc Gmail đang chạy việc khác: thử lại khi hàng đợi rảnh.'),
  needs_person: t('Google đòi người thật xác minh acc Gmail này: mở Setup, bật "Hiện cửa sổ đăng nhập" rồi thử lại.'),
  login_failed: t('Không đăng nhập được Google bằng acc Gmail này.'),
  no_access: t('Google không cho acc Gmail này dùng AI Studio (thiếu quyền truy cập).'),
  needs_real_chrome: t('AI Studio chỉ chạy trên Google Chrome thật: cài Chrome và bật "Chrome thật" ở Setup tài khoản, rồi thử lại.'),
  page_changed: t('AI Studio vừa đổi giao diện nên app chưa đọc được. Báo cho người làm app.'),
  upload_failed: t('AI Studio không nhận tệp video/ảnh.'),
  no_answer: t('AI Studio không trả lời. Thử phân tích lại.'),
  timeout: t('AI Studio trả lời quá lâu nên app dừng. Thử lại hoặc dùng video ngắn hơn.'),
  network_failed: t('Mất mạng hoặc proxy của acc không chạy.'),
  dola_window_closed: t('Cửa sổ của acc bị đóng giữa chừng. Thử lại.'),
  stopped: t('Hàng đợi chưa chạy nên chưa mượn được acc: bấm "Tiếp tục" ở hàng đợi.'),
  bad_answer: t('AI Studio trả lời nhưng không đúng dạng. Bấm Phân tích lại.'),
  files_failed: t('App chưa tách được khung hình và âm thanh của video để gửi AI Studio. Thử video khác (mp4 hoặc mov thông thường).'),
};
// info: window.dola.analyze.info() read just before; with Gmail accounts that are only RESTING ("no_account" then means "none free now", not "none at all")
// the sentence says so instead of asking for an account the person already has.
export function failText(result, keptCards = 0, info = null) {
  // the first-use terms of AI Studio the app could not accept itself (core 0.1.24+): the core's own sentence says what to do; the generic needs_person line would send the person to the wrong switch
  // and (core 0.1.30+) AI Studio's Run button that never turned on even after the page was loaded again: the note says to press Kiểm tra at the Veo tab
  const terms = result?.reason === 'needs_person' && typeof result?.note === 'string' && /điều khoản|Nút Run/i.test(result.note);
  let base = result?.reason === 'cancelled' ? t('Đã huỷ.') : terms ? ct(result.note) : FAIL_TEXT[result?.reason] || ct(result?.note) || t('Không phân tích được video.');
  if (result?.reason === 'no_account' && info?.ok && info.total > 0) base = accountsLine(info);
  return keptCards ? t('{base} {kept}', { base, kept: tn(keptCards, 'Giữ lại {n} prompt đã có.', 'Kept the {n} prompt you already had.', 'Kept the {n} prompts you already had.') }) : base;
}

// "30 giây · 9:16 · có tiếng"; what cannot be read is "không rõ".
export function metaLine(meta) {
  const seconds = Number.isFinite(meta?.seconds) ? tn(Math.round(meta.seconds * 10) / 10, '{n} giây', '{n} second', '{n} seconds') : t('không rõ thời lượng');
  const ratio = meta?.width && meta?.height ? ratioLabel(meta.width, meta.height) : t('không rõ tỷ lệ');
  const sound = meta?.hasAudio === true ? t('có tiếng') : meta?.hasAudio === false ? t('không có tiếng') : t('không rõ tiếng');
  return `${seconds} · ${ratio} · ${sound}`;
}
function ratioLabel(w, h) {
  const known = [['9:16', 9 / 16], ['16:9', 16 / 9], ['1:1', 1], ['3:4', 3 / 4], ['4:3', 4 / 3], ['21:9', 21 / 9]];
  const r = w / h;
  const near = known.find(([, v]) => Math.abs(v - r) / v < 0.03);
  return near ? near[0] : `${w}x${h}`;
}

// The line above "Phân tích" about the Gmail accounts: info = window.dola.analyze.info().
export function accountsLine(info) {
  if (!info?.ok) return '';
  if (!info.total) return t('Cần ít nhất 1 acc Gmail ở mục Veo (Setup → Veo).');
  if (!info.usable) return tn(info.total, 'Có {n} acc Gmail của Veo nhưng đều đang nghỉ vì AI Studio báo hết lượt: thử lại sau.', 'You have {n} Veo Gmail account, but it is resting because AI Studio reports its limit is reached: try again later.', 'You have {n} Veo Gmail accounts, but all of them are resting because AI Studio reports their limit is reached: try again later.');
  if (info.usable >= info.total) return tn(info.usable, '{n} acc Gmail của Veo dùng được để phân tích.', '{n} Veo Gmail account can be used for analysis.', '{n} Veo Gmail accounts can be used for analysis.');
  return t('{main} ({resting}).', {
    main: tn(info.usable, '{n} acc Gmail của Veo dùng được để phân tích', '{n} Veo Gmail account can be used for analysis', '{n} Veo Gmail accounts can be used for analysis'),
    resting: tn(info.total - info.usable, '{n} acc đang nghỉ', '{n} account resting', '{n} accounts resting'),
  });
}

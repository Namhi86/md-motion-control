import { isImageTask } from './muse-form.js';
import { t, tn } from './i18n.js';

// The words of the "Tách skill" window (extract-skill-panel.js), when its button shows, and the two pure readers of what the core answers. No DOM.
// The core's answer: window.dola.analyze.extractSkill({ taskId }) -> { ok: true, skill: { title, description, pro, muse, veo, weak }, problems: [text], accountLabel, ms }
// | { ok: false, reason, note } (note: a ready Vietnamese sentence, shown as it is).
const MAX_NOTE = 300;
const MAX_PROBLEMS = 20;

// The button of the video detail: an app whose core says so (options().extractSkill === true and the bridge call), and a finished VIDEO with its file on the machine.
export const extractOffered = (opts, dola) => opts?.extractSkill === true && typeof dola?.analyze?.extractSkill === 'function';
export const canExtract = (task) => task?.status === 'done' && !!task.result?.file && !isImageTask(task);

export const EXTRACT_TEXT = {
  button: t('Tách skill'),
  buttonTip: t('Tách khuôn của video này thành skill để làm video giống thế cho sản phẩm khác'),
  title: t('Tách skill từ video'),
  close: t('Đóng'),
  starting: t('Đang bắt đầu…'),
  cancel: t('Huỷ'),
  retry: t('Thử lại'),
  weak: t('Video này không có khuôn quảng cáo rõ, skill tách ra có thể chưa hay.'),
  problemsHead: t('Còn vài điểm cần xem lại:'),
  fieldTitle: t('Tiêu đề'),
  fieldDesc: t('Mô tả'),
  tabs: { pro: 'Pro', muse: 'Muse', veo: 'Veo' },
  tabLabel: { pro: t('Skill cho Seedance Pro'), muse: t('Skill cho Muse'), veo: t('Prompt cho Veo') },
  veoHint: t('Veo không đọc skill: đây là một prompt cho một clip. Chọn ảnh sản phẩm rồi gắn vào @product.'),
  use: t('Dùng ngay'),
  publish: t('Đăng Kho'),
  save: t('Tải xuống'),
  saved: (file) => (file ? t('Đã lưu: {file}', { file }) : t('Đã lưu.')),
  meta: (account, ms) => {
    const timed = Number.isFinite(ms) && ms > 0;
    const secs = tn(timed ? Math.round(ms / 1000) : 0, '{n} giây', '{n} second', '{n} seconds');
    if (account && timed) return t('Tách xong bằng acc {account} ({secs}).', { account, secs });
    if (account) return t('Tách xong bằng acc {account}.', { account });
    return timed ? t('Tách xong ({secs}).', { secs }) : t('Tách xong.');
  },
  notOffered: (label) => t('App của bạn chưa có chế độ {label}.', { label }),
  emptyText: (label) => t('Ô {label} đang trống: hãy điền chữ rồi bấm lại.', { label }),
  useFailed: t('Không đưa skill vào form được.'),
  noSkillRow: t('Form chưa có chỗ gắn skill nên chưa dùng được.'),
  saveFailed: t('Không lưu được tệp.'),
  publishFailed: t('Không mở được cửa sổ Đăng skill.'),
  // shown in the publish window opened from here (prefill.note): the Kho keeps one body (Pro) for a community skill
  publishNote: t('Kho chỉ giữ một bản nội dung cho skill cộng đồng (bản Pro). Muốn dùng bản Muse thì bấm "Tải xuống" hoặc "Dùng ngay" ở tab Muse.'),
  badAnswer: t('App trả lời nhưng không đúng dạng. Bấm Thử lại.'),
  failed: t('Không tách được skill từ video này.'),
  // "Dùng ngay" in the form (app.js)
  veoWarn: t('Chọn ảnh sản phẩm rồi gắn vào @product.'),
  veoReplace: t('Ô mô tả đang có chữ chưa xếp hàng. Bấm "Dùng ngay" thêm một lần nữa để thay bằng prompt này.'),
  fileDone: t('Đã gắn skill vào ô "Thêm skill". Thêm ảnh sản phẩm rồi bấm "Tạo video".'),
};

// A progress line of the core (the same event the "Phân tích video" tab shows): { text, account? }.
export const stageText = (s) => (s?.account ? `${s.text} (acc ${s.account})` : String(s?.text ?? ''));

const BY_REASON = {
  cancelled: t('Đã huỷ.'),
  busy: t('Tab "Phân tích video" đang chạy một việc. Đợi nó xong rồi thử lại.'),
  no_video: t('Chưa có tệp video trên máy để tách. Bấm "Lấy lại video" trước.'),
  no_account: t('Cần ít nhất 1 acc Gmail ở mục Veo (Setup → Veo).'),
};

// The sentence for a failed answer: a cancel is always "Đã huỷ."; a busy core always gets the web's own line (the core's note points to a "Huỷ" button
// that neither window shows); else the core's own note, else the one of its reason, else a plain line.
export function failNote(result) {
  const note = typeof result?.note === 'string' ? result.note.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE) : '';
  if (result?.reason === 'cancelled') return BY_REASON.cancelled;
  if (result?.reason === 'busy') return BY_REASON.busy;
  return note || (Object.hasOwn(BY_REASON, result?.reason) ? BY_REASON[result.reason] : '') || EXTRACT_TEXT.failed;
}

// A good answer -> { skill: { title, description, pro, muse, veo }, weak, problems: [text], meta } | null (not a skill the window can edit).
export function readResult(result) {
  const s = result?.skill;
  if (!s || typeof s !== 'object') return null;
  const text = (v) => (typeof v === 'string' ? v : '');
  const skill = { title: text(s.title), description: text(s.description), pro: text(s.pro), muse: text(s.muse), veo: text(s.veo) };
  if (!skill.pro.trim() && !skill.muse.trim() && !skill.veo.trim()) return null;
  const problems = (Array.isArray(result.problems) ? result.problems : []).filter((p) => typeof p === 'string' && p.trim()).slice(0, MAX_PROBLEMS).map((p) => p.trim().slice(0, MAX_NOTE));
  const account = typeof result.accountLabel === 'string' ? result.accountLabel.trim() : '';
  return { skill, weak: s.weak === true, problems, meta: EXTRACT_TEXT.meta(account, result.ms) };
}

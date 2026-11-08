// Pure text and status helpers shared by the queue toolbar and the account table. No DOM, no Electron: tested by ui-text.test.js.
import { ct } from './core-text.js';
import { t, tn } from './i18n.js';

// ipcRenderer.invoke wraps a main-process error as "Error invoking remote method 'x': Error: msg"; the person only needs msg.
export function errText(err) {
  const msg = String(err?.message ?? err ?? '');
  const plain = msg.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '').trim();
  return plain ? ct(plain) : t('lỗi không rõ'); // the core's sentence in the page's language (core-text.js); an unknown one stays as the core wrote it
}

// Milliseconds left -> "8:43", or "1:05:09" from one hour up. Past or invalid -> "0:00".
export function countdown(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// What the account table shows. An account the user switched off is 'off' whatever its stored status is;
// a resting account is back to 'ready' once restUntil has passed (same rule as isReady in src/accounts.js).
export function effectiveStatus(acc, now = Date.now()) {
  if (acc.enabled === false) return 'off';
  if (acc.status === 'rest') return acc.restUntil > now ? (acc.restWhy === 'login' ? 'login' : 'rest') : 'ready';
  return acc.status;
}

// The line above the task list that says why queued work is not moving (stats.waiting of the queue), with a live countdown to
// stats.resumeAt. '' = nothing to say. now: the time to count from (the caller repaints every second).
export function waitLine(s, now = Date.now()) {
  const left = () => countdown((Number(s?.resumeAt) || 0) - now);
  switch (s?.waiting) {
    case 'paused': return t('Hàng đợi đang tạm dừng — bấm Tiếp tục để chạy');
    case 'offline': return t('Máy không có mạng, tự chạy lại khi có mạng');
    case 'busy': return t('Dola đang báo bận — các acc đang đợi, tự chạy lại khi được (thử lại sau {left}, lần {n})', { left: left(), n: Math.max(1, Math.floor(Number(s.busyTries)) || 1) });
    case 'resting': return t('Các acc đang nghỉ, tự chạy lại sau {left}', { left: left() });
    case 'no_account': return t('Chưa có acc dùng được: thêm hoặc kiểm tra cookie ở Setup tài khoản');
    default: return '';
  }
}

// Words for the account statuses (the table badge and the account picker).
export const STATUS_LABEL = {
  ready: t('Sẵn sàng'),
  rest: t('Nghỉ tạm'),
  login: t('Đang lấy cookie'),
  off: t('Đã tắt'),
  dead: t('Cookie hỏng'),
  limit: t('Hết lượt hôm nay'),
  used: t('Đã dùng hết'),
};

// ── Prompt box ──
export function promptCountText(n, truncated) {
  if (!n) return '';
  return truncated ? tn(n, '{n} lệnh · đã bỏ phần thừa', '{n} prompt · extras dropped', '{n} prompts · extras dropped') : tn(n, '{n} lệnh', '{n} prompt', '{n} prompts');
}

// ── The machine, in the thread-count popup ──
const gb = (n) => String(Math.round(n * 10) / 10);
// "6 luồng": the counted noun alone, so a longer sentence can carry it as one placeholder (English has 1 thread / 2 threads).
export const threadsText = (n) => tn(n, '{n} luồng', '{n} thread', '{n} threads');

// What the free RAM suggests (cap comes from thread-cap.js): a suggestion, not a limit, the person picks the number. machine: { totalGb, freeGb, cap }.
// '' when the main process sent nothing usable.
export function machineNote(machine) {
  const { totalGb, freeGb, cap } = machine || {};
  if (![totalGb, freeGb, cap].every(Number.isFinite)) return '';
  return t('Máy bạn đang trống {free} GB RAM (tổng {total} GB): nên chạy khoảng {threads} (chỉ là gợi ý, bạn chọn số khác được).', { free: gb(freeGb), total: gb(totalGb), threads: threadsText(cap) });
}

// ── The video detail panel (video-detail.js) and the clip of a history card (library-ui.js) ──
export const MODE_LABEL = { fast: t('Nhanh'), voice: t('Nhanh + tiếng'), pro: 'Pro', muse: 'Muse' };
export const DETAIL_TEXT = {
  title: 'VIDEO',
  prompt: t('MÔ TẢ'),
  details: t('CHI TIẾT'),
  rerun: t('Tạo lại'),
  reveal: t('Mở thư mục'),
  close: t('Đóng'),
  open: t('Xem chi tiết video'),
  revealFailed: t('Không mở được thư mục.'),
  rows: [t('Mô hình'), t('Chế độ'), t('Thời lượng yêu cầu'), t('Tỉ lệ'), t('Dung lượng'), t('Ngày giờ'), t('Tài khoản Dola'), t('Số lần thử')],
};
// ── Nút Chép trong chi tiết video (video-detail-studios.js) ──
const SIGN_IN_AGAIN = t('Hãy đăng nhập lại MD Motion Control.');
export const HANDOFF_TEXT = {
  no_file: t('Chưa có tệp video trên máy. Bấm "Lấy lại video" trước.'),
  outside_library: t('Tệp nằm ngoài thư mục lưu nên app không dùng.'),
  file_missing: t('Tệp video không còn trên đĩa. Bấm "Lấy lại video".'),
  too_big: t('Video lớn hơn 50 MB nên không gửi được.'),
  no_audio: t('Clip này không có tiếng nên không dùng được Phụ đề tự động.'),
  bad_studio: t('Xưởng này chưa hỗ trợ.'),
  signed_out: SIGN_IN_AGAIN,
  force_logout: SIGN_IN_AGAIN,
  user_not_found: SIGN_IN_AGAIN,
  fs_login_disabled: t('Đăng nhập MD Motion Control đang tạm tắt, thử lại sau.'),
  offline: t('Không kết nối được máy chủ.'),
  rate_limited: t('Bấm hơi nhanh, đợi vài giây rồi thử lại.'),
  rejected: t('Máy chủ không nhận tệp này (không phải video).'),
  server: t('Máy chủ đang bận, thử lại sau.'),
  busy: t('Video này đang được gửi.'),
  stale: t('Phiên đăng nhập vừa đổi, bấm lại.'),
};
export const SIGN_IN_REASONS = ['signed_out', 'force_logout', 'user_not_found'];
export const STUDIO_TEXT = {
  title: t('CÔNG CỤ MỞ RỘNG'),
  sending: t('Đang gửi…'),
  phase: { hash: t('Đang chuẩn bị…'), upload: t('Đang tải lên…'), finish: t('Đang xử lý…'), open: t('Đang mở trình duyệt…') }, // the phases of onHandoff
  signIn: t('Đăng nhập'),
  opened: (label) => t('Đã mở {label} trong trình duyệt.', { label }),
  until: (date) => t('Lưu tới {date}.', { date }),
  durable: t('Lưu theo gói của bạn.'),
  retryAfter: (seconds) => ` ${tn(seconds, '(thử lại sau {n} giây)', '(try again in {n} second)', '(try again in {n} seconds)')}`,
  copy: t('Chép'),
  copied: t('Đã chép'),
  copyTooFast: t('Bấm hơi nhanh'),
  copyNone: t('Không có lời nhắc'),
  copyFailed: t('Không chép được'),
};

// The two boxes a finished task shows when there is no clip to play: [what happened, what to press].
export const CLIP_HINT = {
  none: [t('Video đã tạo xong nhưng chưa có tệp trên máy.'), t('Bấm "Lấy lại video" để tải về.')],
  broken: [t('Không phát được video này: tệp đã mất hoặc địa chỉ đã hết hạn.'), t('Bấm "Lấy lại video" để tải lại.')],
};

// ── How prompts are shared out between accounts ──
const perAccountLabel = (n) => tn(n, 'Mỗi tài khoản {n} prompt', '{n} prompt per account', '{n} prompts per account');
const perAccountDesc = (n) => tn(n, 'Mỗi acc nhận tối đa {n} prompt của lô rồi nhường acc khác.', 'Each account takes up to {n} prompt of the batch, then hands over to another account.', 'Each account takes up to {n} prompts of the batch, then hands over to another account.');
export const DISTRIBUTION = [
  { key: 'rotate', mode: 'rotate', label: t('Tự xoay'), desc: t('Lần lượt từng acc; acc hết lượt hoặc bận thì nhường acc khác.') },
  { key: 'per10', mode: 'perAccount', perAccount: 10, label: perAccountLabel(10), desc: perAccountDesc(10) },
  { key: 'per20', mode: 'perAccount', perAccount: 20, label: perAccountLabel(20), desc: perAccountDesc(20) },
  { key: 'even', mode: 'even', label: t('Chia đều mọi tài khoản'), desc: t('Prompt được chia đều cho mọi acc sẵn sàng.') },
  { key: 'fixed', mode: 'fixed', label: t('Chỉ định tài khoản'), desc: t('Chỉ chạy bằng acc bạn chọn, không xoay sang acc khác.') },
];

// distribution: { mode, perAccount, fixedAccountId } -> the row of DISTRIBUTION it matches (rotate when unknown).
export function distributionRow(d) {
  const per = Number(d?.perAccount) || 10;
  if (d?.mode === 'perAccount') {
    return DISTRIBUTION.find((r) => r.perAccount === per) || { ...DISTRIBUTION[1], key: `per${per}`, perAccount: per, label: perAccountLabel(per) };
  }
  return DISTRIBUTION.find((r) => r.mode === d?.mode) || DISTRIBUTION[0];
}

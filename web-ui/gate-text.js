// The "Mở khoá MD Motion Control" screen as plain data (plans/261018-2154-md-motion-share-gate, phase-03): gateModel() turns what the
// screen knows (the core's GateView, a fault, the answer to the last "Tôi đã làm xong", a cooldown, the clock) into the texts and
// the on/off of every part. No DOM here: gate.js draws the model and wires the buttons.
//   GateView = { unlocked, exempt, code, status: none|issued|commented|completed|activated|rejected, reject_reason, post_url, error? }
import { t, tn } from './i18n.js';

export const TIP_AFTER_MS = 20 * 60 * 1000; // this long on the screen without success: the tip about a public share
// A press of "Tôi đã làm xong" asks the backend to look at THIS code at once; the backend allows 5 presses per 2 minutes, so the button is NOT
// locked after an answer: only while the check runs and when the backend says 429 (its retry_after is the real wait).
export const BUSY_LABEL = t('Đang kiểm tra… (có thể mất tới 1–2 phút)');

const MAX_COOLDOWN_S = 3600;
const TRY_AGAIN = t('Thử lại sau ít phút.');
const DONE_LABEL = t('Tôi đã làm xong ✓');

// A rejection that ends the road for this account: the steps are hidden (nothing the person does here changes it).
const TERMINAL = {
  fb_uid_dup: t('Facebook này đã mở khoá cho tài khoản khác.'),
  campaign_full: t('Chiến dịch đã hết suất.'),
  campaign_ended: t('Chiến dịch đã kết thúc.'),
};
const REJECT_OTHER = t('Chưa mở khoá được. Kiểm tra lại bài comment và bài share, rồi bấm "Tôi đã làm xong".');
const FAULTS = {
  network: { tone: 'bad', text: t('Không kết nối được máy chủ') },
  no_campaign: { tone: 'wait', text: t('Hiện chưa có chương trình mở khoá, vui lòng quay lại sau.') },
  other: { tone: 'bad', text: `${t('Chưa lấy được mã mở khoá.')} ${TRY_AGAIN}` },
};
const ACKS = {
  ok: t('Đã kiểm tra. Hệ thống sẽ tự kiểm lại sau vài phút nếu chưa thấy.'),
  not_found: t('Chưa thấy comment mã này trên bài viết Facebook. Hãy comment đúng mã ở chế độ Công khai (bước 3), rồi bấm lại.'),
  zalo_not_joined: t('Bạn cần bấm nút "Tham gia nhóm Zalo ↗" ở bước 5 trước khi bấm Tôi đã làm xong.'),
  not_shared: t('Đã thấy comment, nhưng chưa thấy bài share. Hãy share CÔNG KHAI lên trang cá nhân (bước 4), rồi bấm lại.'),
  waiting: t('Hệ thống vẫn đang kiểm tra ở nền, thường xong sau vài phút. Bạn không cần bấm lại ngay.'),
  cooldown: t('Bạn bấm hơi nhiều lần. Hãy đợi một chút rồi bấm lại.'),
  network: `${t('Không kết nối được máy chủ.')} ${TRY_AGAIN}`,
  other: `${t('Chưa ghi nhận được.')} ${TRY_AGAIN}`,
};
export const TIP_TEXT = t('Kiểm tra bài share đang để chế độ Công khai, nằm trên trang cá nhân của bạn (không phải nhóm hoặc story) và còn trong 5 bài mới nhất.');

export const cooldownLeft = (until, now) => Math.max(0, Math.ceil((until - now) / 1000));

// The line that says where the person stands: { tone: 'wait' | 'ok' | 'bad', text }.
export function statusLine(view) {
  switch (view?.status) {
    case 'commented': return { tone: 'ok', text: t('✓ Đã thấy comment — còn bước share') };
    case 'completed': return { tone: 'ok', text: t('Đang mở khoá…') };
    case 'activated': return { tone: 'ok', text: t('Đã mở khoá') };
    case 'rejected': return { tone: 'bad', text: TERMINAL[view.reject_reason] || REJECT_OTHER };
    default: return { tone: 'wait', text: t('Chưa thấy comment') };
  }
}

// What a claim() answer is: a fault name ('network' | 'no_campaign' | 'other') when it is { ok:false, error }, '' when it is a view.
export function claimFault(result) {
  if (!result || typeof result !== 'object') return 'other';
  if (result.ok !== false) return result.error === 'network' ? 'network' : '';
  return result.error === 'no_campaign' || result.error === 'network' ? result.error : 'other';
}

// What an answer of checkNow() means: { ack, until } (until = ms when the button may be pressed again, 0 = now). An answer that is ok carries the
// gate as it stands after the check: unlocked (the screen goes away by itself), commented (the share is missing), or still waiting.
export function ackFrom(result, now) {
  if (result?.ok === true) {
    if (result.unlocked === true) return { ack: '', until: 0 };
    if (result.status === 'commented') return { ack: 'not_shared', until: 0 };
    if (result.status === 'issued' || result.status === 'none') return { ack: 'not_found', until: 0 };
    if (result.status === 'completed') return { ack: 'waiting', until: 0 };
    return { ack: 'ok', until: 0 };
  }
  const wait = Number(result?.retry_after);
  if (Number.isFinite(wait) && wait > 0) return { ack: 'cooldown', until: now + Math.min(wait, MAX_COOLDOWN_S) * 1000 };
  if (result?.error === 'zalo_not_joined' || result?.reason === 'zalo_not_joined') return { ack: 'zalo_not_joined', until: 0 };
  if (result?.error === 'comment_not_found' || result?.reason === 'comment_not_found') return { ack: 'not_found', until: 0 };
  return { ack: result?.error === 'network' ? 'network' : 'other', until: 0 };
}

// s = { view, fault, ack, cooldownUntil, busy, copy: { of: 'code' | 'link', ok } | null, shownAt, now, canOpenPost }
// -> { mode: 'loading' | 'fault' | 'done' | 'rejected' | 'steps', notice: { tone, text }, code, copyLabel, openLabel, openDisabled,
//      done: { label, disabled }, ack, tip, retry }
export function gateModel(s) {
  const view = s.view;
  const fault = s.fault || (view?.error === 'network' ? 'network' : '');
  const base = {
    notice: { tone: 'wait', text: '' }, code: view?.code || '', copyLabel: t('Sao chép'), openLabel: s.canOpenPost ? t('Mở bài viết ↗') : t('Sao chép liên kết bài viết'),
    openDisabled: !view?.post_url, done: { label: DONE_LABEL, disabled: true }, ack: '', tip: false, retry: false,
  };
  if (fault) return { ...base, mode: 'fault', notice: FAULTS[fault] || FAULTS.other, retry: fault !== 'no_campaign' };
  if (!view) return { ...base, mode: 'loading', notice: { tone: 'wait', text: t('Đang tải…') } };
  if (view.unlocked) return { ...base, mode: 'done', notice: { tone: 'ok', text: t('Đã mở khoá. Đang vào app…') } };
  if (view.status === 'rejected' && TERMINAL[view.reject_reason]) return { ...base, mode: 'rejected', notice: statusLine(view) };

  const left = cooldownLeft(s.cooldownUntil, s.now);
  let copyLabel = base.copyLabel;
  let openLabel = base.openLabel;
  if (s.copy?.of === 'code') copyLabel = s.copy.ok ? t('Đã sao chép ✓') : t('Bôi đen mã để chép');
  if (s.copy?.of === 'link') openLabel = s.copy.ok ? t('Đã sao chép liên kết ✓') : t('Không sao chép được');
  return {
    ...base, mode: 'steps', notice: statusLine(view), copyLabel, openLabel,
    done: { label: s.busy === true ? BUSY_LABEL : left > 0 ? tn(left, 'Đợi {n} giây để bấm lại', 'Wait {n} second to click again', 'Wait {n} seconds to click again') : DONE_LABEL, disabled: !view.code || s.busy === true || left > 0 },
    ack: ACKS[s.ack] || '', tip: s.now - s.shownAt >= TIP_AFTER_MS,
  };
}

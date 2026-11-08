import { t } from './i18n.js';

// The one-line notice of the support log (owner decision 2026-10-19: the person cannot switch the log off, so the app says it plainly).
// Shown at the bottom of the Setup screen, and ONLY for a core that says options().diag === true: an older core sends nothing, and a line that said
// otherwise would be false. Pure, so the sentence and the rule are tested without a window (tests/diag-notice.test.js).
export const DIAG_NOTICE = t('App gửi nhật ký lỗi (không có mật khẩu, prompt, ảnh) để hỗ trợ khi có sự cố.');

export const diagNoticeShown = (opts) => !!opts && typeof opts === 'object' && opts.diag === true;

// node: the paragraph #su-diag (hidden in the markup); opts: window.dola.options() or null. Text only, never markup.
export function paintDiagNotice(node, opts) {
  if (!node) return;
  const on = diagNoticeShown(opts);
  node.textContent = on ? DIAG_NOTICE : '';
  node.hidden = !on;
}

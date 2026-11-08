import { t } from './i18n.js';
import { ct } from './core-text.js';

// What the "Chrome thật" switch of the Setup screen says, from what main answers to window.dola.browser.get():
//   { mode: 'electron' | 'chrome', chromeInstalled, busy, ignored, fellBack }
// (a new profile starts on the real Chrome; with none installed main answers mode 'electron' and fellBack: true)
// Pure, so the sentences are tested without a window. The page (setup.js) only puts them on the screen.
export const TITLE = t('Dùng Chrome thật');
export const DESC = t('Mỗi acc một Google Chrome thật của máy; tắt: cửa sổ trong app với vân tay giả');
const FELL_BACK = t('Máy này chưa có Google Chrome nên đang dùng cửa sổ trong app.');
const WHEN_ON = t('Chrome thật: mỗi luồng tốn khoảng 0,7 GB RAM (cửa sổ trong app: 0,4 GB), nên cùng một máy chạy được ít luồng hơn. Khi bấm "Hiện cửa sổ", Chrome lấy bàn phím khoảng 1 giây.');

// -> { checked, disabled, hint, bad }
//   disabled: the switch cannot be touched now (a task runs, an account logs in, or no Chrome and the mode is off)
//   hint: one sentence under the switch ('' = nothing to say); bad: the sentence is a problem, not an explanation
export function browserSwitchView(state) {
  const s = state && typeof state === 'object' ? state : {};
  const on = s.mode === 'chrome';
  if (s.fellBack === true && !on) {
    return { checked: false, disabled: true, hint: FELL_BACK, bad: false };
  }
  if (s.chromeInstalled === false && !on) {
    return { checked: false, disabled: true, hint: t('Máy này chưa cài Google Chrome (hoặc Microsoft Edge): cài rồi mở lại app để dùng chế độ này.'), bad: false };
  }
  if (s.busy === true) {
    return { checked: on, disabled: true, hint: t('Đang có acc chạy hoặc đăng nhập: chờ xong (hoặc dừng hàng đợi) rồi đổi.'), bad: false };
  }
  if (on && s.chromeInstalled === false) {
    return { checked: true, disabled: false, hint: t('Đang chọn Chrome thật nhưng máy không còn Chrome: app tạm dùng cửa sổ trong app. Tắt công tắc hoặc cài lại Chrome.'), bad: true };
  }
  if (typeof s.ignored === 'string' && s.ignored) {
    return { checked: on, disabled: false, hint: t('File browser-mode.json không đọc được ({why}): đang dùng cửa sổ trong app.', { why: s.ignored }), bad: true };
  }
  return { checked: on, disabled: false, hint: on ? WHEN_ON : '', bad: false };
}

// The sentence for what main answered to window.dola.browser.set(mode): { ok, mode } | { ok: false, reason, note }.
export function browserSetNote(answer) {
  if (answer?.ok === true) return answer.mode === 'chrome' ? t('Đã chuyển sang Chrome thật: áp cho các cửa sổ mở từ giờ.') : t('Đã chuyển sang cửa sổ trong app: áp cho các cửa sổ mở từ giờ.');
  return String(ct(answer?.note) || t('Không đổi được chế độ cửa sổ.'));
}

import { t } from './i18n.js';
import { LOGIN_BUTTON } from './setup-muse.js';

// What the "⋯" menu of an account row holds: the buttons the row used to show, with the same words, the same tooltips and the same conditions for being locked.
// Pure (no DOM, no Electron): setup-row-menu.js draws, tests/setup-row-model.test.js tests.
//   running   the account is running a task now       checking  its "Kiểm tra" is in flight       login  the "Đăng nhập" of Muse is offered for this row (core can, account needs it)
//   loginBusy the Muse login window of this account is being opened
// -> [{ id: 'login' | 'check' | 'reset' | 'delete', text, title, disabled, danger? }]
export function rowMenuItems({ running = false, checking = false, login = false, loginBusy = false } = {}) {
  const locked = running || checking;
  const items = [];
  if (login) items.push({ id: 'login', text: LOGIN_BUTTON.text, title: LOGIN_BUTTON.title, disabled: locked || loginBusy });
  items.push(
    {
      id: 'check',
      text: checking ? t('Đang kiểm tra…') : t('Kiểm tra'),
      title: running ? t('Acc đang chạy việc, đợi xong rồi hãy kiểm tra') : t('Đăng nhập thử để biết cookie còn dùng được không'),
      disabled: locked,
    },
    {
      id: 'reset',
      text: t('Đặt lại'),
      title: running ? t('Acc đang chạy việc, đợi xong rồi hãy đặt lại')
        : t('Đưa acc về Sẵn sàng ngay (bỏ nghỉ tạm, hết lượt hay hỏng) khi app đoán sai. Không đăng nhập thử: nếu thật sự lỗi thì lần chạy sau sẽ đánh dấu lại'),
      disabled: locked,
    },
    {
      id: 'delete',
      text: t('Xoá khỏi danh sách'),
      title: locked ? t('Acc đang chạy lệnh: tắt công tắc của acc, đợi lệnh hiện tại xong hoặc huỷ lệnh rồi gỡ') : t('Xoá acc khỏi danh sách'), // its session would be wiped under the task
      disabled: locked,
      danger: true,
    },
  );
  return items;
}

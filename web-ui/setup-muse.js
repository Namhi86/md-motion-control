import { t, tn } from './i18n.js';
import { ct } from './core-text.js';
import { STATUS_LABEL, effectiveStatus, errText } from './ui-text.js';

// The Muse part of the Setup screen: two ways of adding (email, cookie), the status badge and the login button.
// Pure functions only (no DOM, no Electron): setup.js and setup-table.js call them, tests/setup-muse.test.js tests them.
// Everything is gated by the functions the app core offers on window.dola.accounts: an older core has none, so nothing Muse shows.
// The window never sees a Muse cookie: the public view of an account has none.

const EMAIL_TEXT = t('Dán nhiều email: mỗi dòng 1, hoặc cách nhau bằng dấu phẩy. Dòng dạng email|mật khẩu|2fa cũng được (app chỉ lấy email, không lưu mật khẩu). App mở cửa sổ đăng nhập Muse lần lượt từng email; bạn tự nhập mã Muse gửi về mail.');
const COOKIE_TEXT = t('Dán nhiều cookie muse.ai: mỗi dòng 1 chuỗi (datr=…; hatch_sess=…) hoặc dán JSON xuất từ tiện ích cookie. App kiểm từng cookie còn dùng được rồi mới thêm (mỗi cookie vài giây).');

export const MUSE_TYPES = {
  muse_email: { kind: 'email', label: 'Email', hint: EMAIL_TEXT, holder: t('ten@gmail.com'), noun: 'email' },
  muse_cookie: { kind: 'cookie', label: 'Cookie', hint: COOKIE_TEXT, holder: 'datr=…; hatch_sess=…', noun: 'cookie' },
};
export const MUSE_OLD_APP = t('Cần cập nhật app lên bản mới để thêm acc Muse.');
export const LOGIN_BUTTON = {
  text: t('Đăng nhập'),
  title: t('Mở cửa sổ đăng nhập Muse cho acc này; bạn tự gõ mã Muse gửi về email (acc thêm bằng cookie: dán cookie mới ở tab Muse › Cookie)'),
  bulkTitle: t('Mở cửa sổ đăng nhập Muse cho từng acc đã chọn (lần lượt từng acc); bạn tự gõ mã Muse gửi về email'),
};
const EMAIL_OPENED = t('App đang mở cửa sổ đăng nhập Muse: hãy gõ mã Muse gửi về email của bạn.');
// Several e-mails: the core opens ONE login window at a time, the next one only after the person finished (or closed) the one before.
const EMAIL_ONE_BY_ONE = t('App mở cửa sổ đăng nhập Muse lần lượt từng acc: nhập mã của acc 1 xong mới tới acc 2 (cột Trạng thái: "Đợi mã").');
const ADD_FN = { email: 'addMuse', cookie: 'addMuseCookie' }; // the core function behind each way of adding

// 'email' | 'cookie' when `type` is one of the two Muse ways of adding, else null (facebook, fbpass, gmail…).
export const museAddKind = (type) => (Object.hasOwn(MUSE_TYPES, type) ? MUSE_TYPES[type].kind : null);
// What the box asks for ('email' / 'cookie'); '' for a way of adding that is not Muse.
export const museNoun = (type) => (museAddKind(type) ? MUSE_TYPES[type].noun : '');

export const museCanAdd = (api, kind) => typeof api?.[ADD_FN[kind]] === 'function';
export const canLoginMuse = (api) => typeof api?.loginMuse === 'function';

// The ways of adding the core offers: email needs addMuse, cookie needs addMuseCookie. An older core offers none.
export const museCards = (api) => Object.fromEntries(Object.entries(MUSE_TYPES).filter(([, type]) => museCanAdd(api, type.kind)));

// A Muse account waits for its login code: the core sets status 'rest' and restWhy 'login' for the time it waits.
const waitingForCode = (a, now) => a.status === 'rest' && a.restWhy === 'login' && a.restUntil > now;
export const museWaiting = (accounts, now = Date.now()) => accounts.filter((a) => a.type === 'muse' && waitingForCode(a, now)).length;

// The person must log in again: the cookie is dead, or the wait for the code ran out. Such an account is never "ready".
export function needsLogin(acc, now = Date.now()) {
  if (acc?.type !== 'muse') return false;
  return acc.status === 'dead' || (acc.status === 'rest' && acc.restWhy === 'login' && !(acc.restUntil > now));
}

// The badge of a Muse row: { text, cls } (cls = the stp-badge--<cls> class); null for any other account type (setup-table.js keeps its own).
export function museBadge(acc, now = Date.now()) {
  if (acc?.type !== 'muse') return null;
  const st = effectiveStatus(acc, now);
  if (st === 'login') return { text: t('Đợi mã'), cls: 'login' };
  if (st === 'ready' && needsLogin(acc, now)) return { text: t('Cần đăng nhập'), cls: 'dead' }; // the wait for the code ran out
  return { text: STATUS_LABEL[st] || acc.status, cls: st };
}

// "thêm 2, trùng 1…": the counts every add button answers with. `expired` = Muse cookies that are dead or not usable.
export function addMessage(r) {
  const parts = [];
  if (r.added) parts.push(t('thêm {n}', { n: r.added }));
  if (r.updated) parts.push(t('đổi cookie mới {n}', { n: r.updated }));
  if (r.duplicates) parts.push(t('trùng {n}', { n: r.duplicates }));
  if (r.invalid) parts.push(tn(r.invalid, 'bỏ {n} dòng không hợp lệ', 'skipped {n} invalid line', 'skipped {n} invalid lines'));
  if (r.expired) parts.push(t('cookie hết hạn/không dùng được {n}', { n: r.expired }));
  return parts.join(', ') || t('Không có dòng nào để thêm.');
}

// The answer line under a Muse card. The core opens the login windows itself after e-mails are added (an account that waits for a code again
// counts too): the web only says so, and says they come one after the other when there are several.
export function addMuseMessage(r, kind) {
  if (r?.ok === false) return ct(r.note) || t('Không thêm được acc Muse.');
  const result = addMessage(r);
  const windows = kind === 'email' ? (r.added || 0) + (r.updated || 0) : 0;
  if (!windows) return t('Đã xử lý: {result}.', { result });
  return t('Đã xử lý: {result}. {next}', { result, next: windows > 1 ? EMAIL_ONE_BY_ONE : EMAIL_OPENED });
}

// The wrong box: e-mails pasted in the Cookie box, cookies in the Email box. Caught here, before the core, so it also works with an older core and
// the person is told what to press instead of "bỏ N dòng không hợp lệ".
const WRONG_BOX = {
  cookie: t('Đây là email, không phải cookie: bấm nút Email ở trên rồi dán lại.'),
  email: t('Đây là cookie, không phải email: bấm nút Cookie ở trên rồi dán lại.'),
};
const ADDRESS = /[^\s@=|,;:<>"'()]+@[^\s@=|,;:<>"'()]+\.[^\s@=|,;:<>"'()]+/;
const isJsonStart = (line) => /^[[{]/.test(line);
// A line is e-mail-like when an address stands before any "=" (in a cookie "name=value" an "@" can only come after one); "email|pass|2fa" counts.
const emailLine = (line) => !isJsonStart(line) && ADDRESS.test(line.split('=')[0]);
const cookieLine = (line) => /hatch_sess/i.test(line) || /^(cookie:\s*)?[\w.-]+=/i.test(line) || isJsonStart(line);

// '' when the paste fits the box; else the line to show. A paste that mixes both kinds goes through (the core counts the lines it cannot use).
export function wrongBox(kind, text) {
  const lines = String(text || '').split(/\r?\n|\r/).map((l) => l.trim()).filter(Boolean);
  if (kind === 'cookie') return !/hatch_sess/i.test(text) && lines.some(emailLine) ? WRONG_BOX.cookie : '';
  if (kind === 'email') return lines.length && !lines.some(emailLine) && lines.some(cookieLine) ? WRONG_BOX.email : '';
  return '';
}

// A cookie paste is checked one cookie after the other (each through its own proxy), so a long wait says what it waits for.
// Every usable cookie holds one `hatch_sess`: that is the count.
const checkingText = (n) => tn(n, 'Đang kiểm {n} cookie… (mỗi cookie vài giây)', 'Checking {n} cookie… (a few seconds each)', 'Checking {n} cookies… (a few seconds each)');

// Sends the pasted text to the core. -> { text, bad, clear }: the line to show, whether it is an error, whether to empty the box.
// progress(text) says what is happening while a long call runs (checking many cookies). A call that fails or is refused comes back as a line, never as a throw.
export async function museSubmit(api, kind, text, progress = () => {}) {
  if (!museCanAdd(api, kind)) return { text: MUSE_OLD_APP, bad: true, clear: false };
  const wrong = wrongBox(kind, text);
  if (wrong) return { text: wrong, bad: true, clear: false };
  const toCheck = kind === 'cookie' ? (String(text).match(/hatch_sess/gi) || []).length : 0;
  if (toCheck) progress(checkingText(toCheck));
  let r;
  try {
    r = (await api[ADD_FN[kind]](text)) || { ok: false };
  } catch (err) {
    r = { ok: false, note: t('Không thêm được acc Muse: {why}', { why: errText(err) }) };
  }
  const done = r.ok !== false && !!(r.added || r.updated);
  return { text: addMuseMessage(r, kind), bad: !done, clear: done };
}

// Opens the Muse login window of each account, one after the other; progress(text) says which one is next.
// -> { text, bad }: the line to show once all are done. The progress of each login itself arrives through accounts.onChange.
export async function loginMuseList(api, list, progress = () => {}) {
  if (!canLoginMuse(api)) return { text: MUSE_OLD_APP, bad: true };
  let failed = 0;
  let note = '';
  for (const [i, a] of list.entries()) {
    progress(t('Đang mở đăng nhập Muse {i}/{total}: {label}…', { i: i + 1, total: list.length, label: a.label }));
    try {
      const r = await api.loginMuse(a.id);
      if (r?.ok === false) { failed += 1; note = ct(r.note) || t('Không đăng nhập được acc {label}.', { label: a.label }); }
    } catch (err) {
      failed += 1;
      note = t('Không đăng nhập được acc {label}: {why}', { label: a.label, why: errText(err) });
    }
  }
  if (!failed) {
    return { text: tn(list.length, 'Xong lệnh đăng nhập Muse cho {n} acc. Xem cột Trạng thái: "Đợi mã" = hãy gõ mã Muse gửi về email trong cửa sổ Muse.', 'Muse sign-in started for {n} account. See the Status column: "Waiting for code" = type the code Muse emailed you in the Muse window.', 'Muse sign-in started for {n} accounts. See the Status column: "Waiting for code" = type the code Muse emailed you in the Muse window.'), bad: false };
  }
  return { text: list.length === 1 ? note : t('Đăng nhập Muse: {ok} acc ổn, {failed} lỗi. {note}', { ok: list.length - failed, failed, note }), bad: true };
}

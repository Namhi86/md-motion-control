// Quản lý trạng thái đăng nhập và mở khoá MD Motion Control
import { t } from './i18n.js';

const RETRY = t('Bấm "Thử lại" để đăng nhập lần nữa.');
const LOGIN_ERRORS = {
  timeout: `${t('Hết 5 phút mà chưa đăng nhập xong trong trình duyệt.')} ${RETRY}`,
  denied: `${t('Google chưa cho đăng nhập (bạn đã huỷ hoặc tài khoản bị từ chối).')} ${RETRY}`,
  bad_code: `${t('Trang đăng nhập trả về địa chỉ không hợp lệ.')} ${RETRY}`,
  exchange_failed: `${t('Máy chủ không xác nhận được lần đăng nhập này.')} ${RETRY}`,
  network: `${t('Không kết nối được máy chủ.')} ${t('Kiểm tra mạng rồi bấm "Thử lại".')}`,
};
const NETWORK_LEAD = t('Không kết nối được máy chủ.');

// The core's `note` for a network failure is a short code (electron/auth/net-note.js): the real reason, so the person (and support) can tell
// "no DNS" from "blocked" from "too slow". One line of advice per family; an unknown code keeps the plain line.
const NET_ADVICE = [
  [/^timeout$/, t('Máy chủ không trả lời kịp (quá 15 giây). Mạng đang chậm hoặc bị chặn giữa đường.')],
  [/^(ENOTFOUND|EAI_AGAIN)$/, t('Máy này không tìm được địa chỉ máy chủ (lỗi DNS). Thử đổi DNS sang 1.1.1.1 hoặc 8.8.8.8, hoặc tắt VPN.')],
  [/^(ECONNREFUSED|ECONNRESET|EPIPE)$/, t('Kết nối tới máy chủ bị từ chối hoặc bị ngắt giữa chừng. Thường do VPN, tường lửa hoặc phần mềm diệt virus.')],
  [/^(ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENETDOWN)$/, t('Không có đường mạng tới máy chủ. Kiểm tra mạng, tắt VPN hoặc proxy rồi thử lại.')],
  [/CERT|SIGNATURE|^ERR_TLS|^ERR_SSL/, t('Chứng chỉ bảo mật bị chặn giữa đường (thường do phần mềm diệt virus hoặc proxy quét HTTPS). Tắt tính năng quét HTTPS rồi thử lại.')],
];
const netAdvice = (note) => NET_ADVICE.find(([re]) => re.test(String(note || '')))?.[1] || '';

export const screenFor = (state, hasGate = false) => {
  if (state?.status === 'signed-in') return hasGate && state.unlocked === false ? 'gate' : 'main';
  return state?.status === 'pending' ? 'pending' : 'login';
};

// The line to show under the button after auth.login() answered ('' = nothing to say). A refused exchange carries the backend's
// reason in `code` (fs_login_disabled, temporarily_unavailable, invalid_grant, … or http_<status>).
export function loginErrorText(result) {
  if (!result || result.ok || result.reason === 'cancelled') return '';
  if (result.reason === 'exchange_failed') {
    if (result.code === 'fs_login_disabled') return t('Tài khoản này chưa được mở cho MD Motion Control.');
    if (result.code === 'temporarily_unavailable' || /^http_5\d\d$/.test(result.code || '')) return t('Máy chủ đang bận, thử lại sau ít phút.');
  }
  if (result.reason === 'network') {
    const advice = netAdvice(result.note);
    if (advice) return `${NETWORK_LEAD} ${advice} ${RETRY}`;
  }
  return LOGIN_ERRORS[result.reason] || `${t('Đăng nhập không thành công.')} ${RETRY}`;
}

// Paints the screen for the core's login state and keeps it in step. startMain() starts the app's UI the first time the app screen
// is shown; when it fails (rejects) the screen says so with a "Tải lại" button (reload()), and the next time the app screen is
// painted it is tried again. The first screen drawn here (login or pending) tells the core the web is up (dola.ready()); the app
// screen says it itself once its first frame is drawn (app.js). Returns the first state.
export async function startAuth({ dola, doc = document, startMain, reload = () => location.reload() }) {
  const $ = (id) => doc.getElementById(id);
  let error = ''; // the error of the last try, shown until the next try or a sign-in
  let trying = false;
  let main = null; // the app UI's start, running or done (null again after a failure)
  let failed = false;
  const hasGate = !!dola.gate;
  let gate = null; // the gate screen's controller (gate.js, imported the first time the screen is needed)

  // Shows or ends the gate screen's visit. The module is imported on first need; a failure leaves the screen with its markup only.
  function paintGate(on) {
    if (!on) { gate?.then((g) => g.hide()).catch(() => {}); return; } // a failed import was already told
    gate ||= import('./gate.js').then(({ initGate }) => initGate({ dola, doc, onUnlocked: refresh }));
    gate.then((g) => g.show()).catch((err) => {
      gate = null;
      console.error('Free Seedance: the unlock screen did not start', err);
      $('gate-notice').textContent = t('Không mở được màn mở khoá. Đăng xuất rồi đăng nhập lại.');
    });
  }

  // The gate screen saw "unlocked": read the login again (the core also pushes auth:changed; this is the second way to the app).
  function refresh() {
    dola.auth.state().then((state) => paint(state)).catch((err) => console.error('dola.auth.state() failed', err));
  }

  function start() {
    if (main) return;
    failed = false;
    main = Promise.resolve().then(startMain).catch((err) => {
      main = null;
      failed = true;
      console.error('Free Seedance: the page did not start', err);
      $('start-error').hidden = doc.body.dataset.auth !== 'main';
    });
  }

  function paint(state) {
    const screen = screenFor(state, hasGate);
    if (screen === 'main') error = '';
    doc.body.dataset.auth = screen;
    $('login').hidden = screen === 'main' || screen === 'gate';
    if (hasGate) { // an older core never touches the unlock screen: its node stays hidden as the markup has it
      $('gate').hidden = screen !== 'gate';
      $('gate-email').textContent = screen === 'gate' ? state.email || state.name || '' : '';
      paintGate(screen === 'gate');
    }
    $('login-idle').hidden = screen !== 'login';
    $('login-pending').hidden = screen !== 'pending';
    $('login-error').textContent = error;
    $('login-google-label').textContent = error ? t('Thử lại') : t('Đăng nhập bằng Google');
    $('login-google').disabled = trying;
    $('auth-user').hidden = screen !== 'main';
    $('auth-email').textContent = screen === 'main' ? state.email || state.name || '' : '';
    if (screen !== 'main') {
      $('pop').hidden = true; // a picker left open on the app screen does not float over the login
      $('backdrop').hidden = true;
    }
    if (screen === 'main') start(); // first: a new try clears the failure of the last one
    $('start-error').hidden = !(failed && screen === 'main');
    return screen;
  }

  async function login() {
    if (trying) return;
    trying = true;
    error = '';
    paint({ status: 'pending' });
    let result;
    try {
      result = await dola.auth.login();
    } catch (err) {
      result = { ok: false, reason: 'bridge', note: err?.message };
    }
    trying = false;
    error = loginErrorText(result);
    let state = { status: 'signed-out' };
    try {
      state = await dola.auth.state();
    } catch (err) {
      console.error('dola.auth.state() failed', err); // the error of the try is shown all the same
    }
    paint(state);
  }

  const logout = () => dola.auth.logout().catch((err) => console.error('dola.auth.logout() failed', err));
  $('login-google').addEventListener('click', () => { login().catch((err) => console.error('login failed', err)); });
  $('login-cancel').addEventListener('click', logout); // ends the login that waits for the browser (the core has no other cancel)
  $('auth-logout').addEventListener('click', logout);
  if (hasGate) $('gate-logout').addEventListener('click', logout);
  $('start-reload').addEventListener('click', () => reload());
  dola.auth.onChange((state) => paint(state));

  const first = await dola.auth.state();
  if (paint(first) !== 'main') dola.ready().catch((err) => console.error('dola.ready() failed', err));
  return first;
}

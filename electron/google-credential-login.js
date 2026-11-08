import { BrowserWindow, session } from 'electron';
import {
  classifyGoogle,
  DEVICE_WAIT_MS,
  deviceStep,
  GOOGLE_SNAPSHOT,
  googleWrongPassword,
  isRecoveryOffer,
  loginIsDone,
} from '../src/google-login-state.js';
import { totp } from '../src/totp.js';
import { windowSize } from './account-fingerprint.js';
import { chromeHost } from './chrome-host.js';
import { clickAt, clickPoint, findExpr } from './click-at.js';
import {
  cookiesOfSite,
  dolaPrefs,
  evalJs,
  removeCookies,
} from './dola-session.js';
import { press } from './fb-login-press.js';
import { setSessionProxy } from './proxy-auth.js';
import {
  CHROME_LANG,
  CHROME_SIZES,
  isQuitting,
  windowKindFor,
} from './window-kind.js';
import { partitionOf } from './worker-context.js';

// Đăng nhập tài khoản Google bằng email/mật khẩu/2FA:
// Khi visible = true (lúc bấm Đăng nhập / Kiểm tra tài khoản), hiện cửa sổ trình duyệt lên màn hình chính.
const LOGIN_URL =
  'https://accounts.google.com/ServiceLogin?hl=en&continue=https%3A%2F%2Fmyaccount.google.com%2F';
const LOAD_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fail = (reason, note) => ({
  ok: false,
  reason,
  note,
});

const load = (win, url) =>
  Promise.race([win.loadURL(url).catch(() => {}), sleep(LOAD_MS)]);

const focusExpr = (selector) => `(() => {
  const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((i) => {
    const r = i.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  });
  if (!e) return false;
  e.focus();
  e.select && e.select();
  return true;
})()`;

const OTHER_WAY = findExpr(
  '/^(try another way|more ways to verify|thử cách khác|các cách xác minh khác)$/i.test(t)'
);

const findOption = (regexLiteral, challengeType) => `(() => {
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  };
  const re = ${regexLiteral};
  const byType = ${
    challengeType
      ? `document.querySelector('[data-challengetype="${challengeType}"]')`
      : 'null'
  };
  const byText = [...document.querySelectorAll('li, [role=link], [role=button], div')]
    .filter((e) => vis(e) && re.test(e.innerText || '') && (e.innerText || '').length < 120)
    .sort((x, y) => x.getBoundingClientRect().width * x.getBoundingClientRect().height - y.getBoundingClientRect().width * y.getBoundingClientRect().height)[0];
  const el = byType && vis(byType) ? byType : byText;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.left + r.width / 2),
    y: Math.round(r.top + r.height / 2)
  };
})()`;

const AUTHENTICATOR = findOption('/authenticator/i', 6);
const PASSWORD_OPTION = findOption('/enter your password|nhập mật khẩu/i', 0);

const OPTION_TEXTS =
  "JSON.stringify([...document.querySelectorAll('li, [role=link], [role=button]')].map((e) => (e.innerText || '').replace(/\\s+/g, ' ').trim()).filter((t) => t && t.length < 100).slice(0, 12))";

async function pickOption(win, expr) {
  const pt = await evalJs(win, expr, { timeout: 8000 }).catch(() => null);
  if (!pt) return false;
  await clickPoint(win, pt);
  return true;
}

async function typeInto(win, selector, text) {
  if (
    !(await evalJs(win, focusExpr(selector), { timeout: 8000 }).catch(
      () => false
    ))
  ) {
    return false;
  }
  await win.webContents.insertText(text);
  return true;
}

const submit = (win) => press(win, 'next');

export const hasGoogleSession = async (ses) =>
  (await cookiesOfSite(ses, 'google.com')).some(
    (c) => c.name === 'SID' && c.value
  );

const hasSid = hasGoogleSession;

export const newGoogleState = () => ({
  tries: {
    email: 0,
    password: 0,
    totp: 0,
    select: 0,
    skip: 0,
  },
  at: 0,
  sawCaptcha: false,
  lastText: null,
  deviceSince: 0,
});

export async function driveGoogleScreen(
  win,
  screen,
  snap,
  { pass, twofa, uid },
  state,
  log
) {
  const { tries } = state;
  if (screen === 'disabled') {
    return fail(
      'disabled',
      `Google báo acc bị vô hiệu hoá (${String(snap.text).slice(0, 100)}).`
    );
  }
  if (screen === 'blocked') {
    return fail(
      'blocked',
      `Google không cho đăng nhập (${String(snap.text).slice(0, 80)}): thử lại sau hoặc đổi proxy.`
    );
  }
  if (screen === 'phone') {
    return fail(
      'phone_needed',
      'Google đòi xác minh bằng số điện thoại: app không làm được, đăng nhập tay.'
    );
  }
  if (screen === 'recovery_email') {
    return fail(
      'recovery_needed',
      'Google đòi email khôi phục: app chưa có thông tin này.'
    );
  }
  if (
    Date.now() - state.at < 6000 &&
    ['email', 'password', 'totp'].includes(screen)
  ) {
    return null;
  }
  if (screen === 'email') {
    if (tries.email >= 3) {
      return fail('bad_email', 'Google không nhận email này.');
    }
    if (
      await typeInto(win, 'input[type=email], input[name=identifier]', uid)
    ) {
      await submit(win);
      tries.email += 1;
      state.at = Date.now();
    }
  } else if (screen === 'password') {
    if (tries.password >= 3) {
      return fail(
        'bad_password',
        `Google không nhận mật khẩu${googleWrongPassword(snap) ? ' (báo sai mật khẩu)' : ''}.`
      );
    }
    if (await typeInto(win, 'input[type=password]', pass)) {
      await submit(win);
      tries.password += 1;
      state.at = Date.now();
    }
  } else if (screen === 'totp') {
    if (!twofa) {
      return fail(
        'twofa_needed',
        'Google đòi mã 2FA mà dòng này không có khoá 2FA.'
      );
    }
    if (tries.totp >= 3) {
      return fail(
        'twofa_failed',
        'Google không nhận mã 2FA (đã thử 3 lần): kiểm tra khoá 2FA.'
      );
    }
    if (
      await typeInto(
        win,
        'input[name=totpPin], input[autocomplete=one-time-code], input[type=tel]',
        totp(twofa, Date.now())
      )
    ) {
      await submit(win);
      tries.totp += 1;
      state.at = Date.now();
      log(`đã nhập mã 2FA (lần ${tries.totp})`);
    }
  } else if (screen === 'select') {
    if (tries.select >= 5) {
      return fail(
        'twofa_needed',
        'Google đòi một cách xác minh mà app không làm được (chỉ làm được bằng mật khẩu và mã 2FA).'
      );
    }
    const pickedPass =
      tries.password === 0 && (await pickOption(win, PASSWORD_OPTION));
    if (pickedPass) {
      tries.select += 1;
      log('chọn "Enter your password"');
      await sleep(2500);
    } else if (twofa && (await pickOption(win, AUTHENTICATOR))) {
      tries.select += 1;
      log('chọn "Google Authenticator"');
      await sleep(2500);
    } else if (tries.select === 0 || tries.skip === 0) {
      tries.skip += 1;
      log(
        'select: không thấy cách nào dùng được: ' +
          (await evalJs(win, OPTION_TEXTS, { timeout: 8000 }).catch(() => ''))
      );
    }
  } else if (screen === 'device') {
    const dev = deviceStep({
      twofa,
      selectTries: tries.select,
      since: state.deviceSince,
      now: Date.now(),
    });
    if (dev.since !== state.deviceSince) {
      state.deviceSince = dev.since;
      if (dev.action === 'wait' && !win.isVisible()) win.showInactive();
      log(
        `Google gửi thông báo tới điện thoại: đợi tối đa ${Math.round(DEVICE_WAIT_MS / 1000)} giây để bấm "Yes" trên điện thoại`
      );
    }
    if (dev.action === 'fail') {
      return fail(
        'twofa_needed',
        dev.waited
          ? `Google đòi bấm xác nhận trên điện thoại, đã đợi ${Math.round(DEVICE_WAIT_MS / 1000)} giây mà chưa ai bấm.`
          : 'Google đòi bấm xác nhận trên điện thoại mà acc này không có khoá 2FA để đổi cách.'
      );
    }
    if (dev.action === 'other') {
      const clickedTxt = await clickAt(win, OTHER_WAY);
      if (clickedTxt) {
        tries.select += 1;
        log(`bấm "${clickedTxt}"`);
        await sleep(2500);
      }
    }
  } else if (screen === 'captcha') {
    if (!win.isVisible()) win.showInactive();
    if (!state.sawCaptcha) {
      state.sawCaptcha = true;
      log(
        'Google đòi captcha: cửa sổ Google đã hiện, bấm vào ô đó, app tự làm tiếp'
      );
    }
  } else {
    const pressed =
      tries.skip < 8
        ? await press(
            win,
            isRecoveryOffer(snap) ? 'recovery_skip' : 'passby',
            log
          )
        : '';
    if (pressed) {
      tries.skip += 1;
    } else if (snap?.text !== state.lastText) {
      state.lastText = snap?.text ?? '';
      log(
        `trang lạ, chưa biết bấm gì: "${String(state.lastText).slice(0, 200)}"`
      );
    }
  }
  return null;
}

export async function loginWithGoogle(
  account,
  {
    visible = true,
    log = () => {},
    timeoutMs = 240000,
    signal,
    chrome,
  } = {}
) {
  const creds = account.login || {};
  if (!creds.uid || !creds.pass) {
    return fail('no_login', 'Acc này chưa có email|mật khẩu.');
  }
  const useChrome =
    typeof chrome === 'boolean'
      ? chrome
      : windowKindFor(account, { log }) === 'chrome';
  if (useChrome && isQuitting()) return fail('cancelled', 'Đã huỷ.');

  const elecSession = session.fromPartition(partitionOf(account.id));
  const targetSession = useChrome
    ? chromeHost().acquire(account.id, {
        lang: CHROME_LANG,
        downloadSession: elecSession,
      })
    : elecSession;

  let win = null;
  const state = newGoogleState();
  const startedAt = Date.now();
  let lastScreen = '';
  try {
    await setSessionProxy(targetSession, account.proxy);
    await removeCookies(
      targetSession,
      await cookiesOfSite(targetSession, 'google.com')
    );
    win = useChrome
      ? targetSession.newWindow(CHROME_SIZES.login)
      : new BrowserWindow({
          show: false,
          ...windowSize(account.id, 'login', { width: 520, height: 760 }),
          title: 'Google ' + creds.uid,
          autoHideMenuBar: true,
          webPreferences: dolaPrefs(targetSession),
        });
    if (visible && !(useChrome && targetSession.shown)) {
      win.showInactive();
    }
    log(
      `đăng nhập Google ${creds.uid}` +
        (account.proxy
          ? ` qua proxy ${account.proxy.host}:${account.proxy.port}`
          : ' (không proxy)')
    );
    await load(win, LOGIN_URL);
    // Đảm bảo sau khi Chrome target đã sẵn sàng, nếu đang ở chế độ đăng nhập (visible = true) thì hiện cửa sổ lên màn hình
    if (visible) {
      if (useChrome) {
        await targetSession.bringForward?.().catch(() => {});
      } else if (!win.isDestroyed() && !win.isVisible()) {
        win.showInactive();
      }
    }

    while (Date.now() - startedAt < timeoutMs) {
      if (signal?.aborted) return fail('cancelled', 'Đã huỷ.');
      await sleep(1500);
      if (win.isDestroyed()) {
        return fail('window_closed', 'Cửa sổ đăng nhập Google bị đóng.');
      }
      const snap = await evalJs(win, GOOGLE_SNAPSHOT, { timeout: 8000 }).catch(
        () => null
      );
      const screen = classifyGoogle(snap);
      if (screen !== lastScreen) {
        log(`google: ${screen} ${String(snap?.url || '').slice(0, 70)}`);
        lastScreen = screen;
      }
      if (
        loginIsDone(
          screen,
          snap,
          (screen === 'done' || screen === 'speedbump') &&
            (await hasSid(targetSession))
        )
      ) {
        await targetSession.cookies.flushStore().catch(() => {});
        log('đã đăng nhập Google');
        return { ok: true };
      }
      const stepErr = await driveGoogleScreen(
        win,
        screen,
        snap,
        creds,
        state,
        log
      );
      if (stepErr) return stepErr;
      if (
        screen === 'unknown' &&
        (await hasSid(targetSession)) &&
        Date.now() - startedAt > 20000
      ) {
        await load(win, 'https://myaccount.google.com/');
      }
    }
    if (state.sawCaptcha) {
      return fail(
        'captcha',
        'Google đòi captcha mà chưa ai bấm: bấm vào ô đó khi cửa sổ Google hiện.'
      );
    }
    return fail(
      'timeout',
      'Google chưa cho đăng nhập xong sau 4 phút (có thể đòi xác minh): đăng nhập tay.'
    );
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    if (useChrome) {
      await targetSession.hideWindows?.().catch(() => {});
      await chromeHost().release(account.id);
    }
  }
}

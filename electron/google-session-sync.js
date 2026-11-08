import { untilAbort } from '../src/abortable.js';
import { realChromeProblem } from '../src/analyze-job.js';
import { waitMs } from '../src/flow-pacing.js';
import {
  hasSignInSet,
  isGoogleFamilyDomain,
  NEEDS_CHROME_FOR_FLOW_NOTE,
  NOT_SIGNED_NOTE,
  pickGoogleCookies,
  removeUrlOf,
  rotationDone,
  setDetailsOf,
  staleTokenNames,
  tokenSnapshot,
  TOKEN_ROTATE_URLS,
  TS_POLL_MS,
  TS_ROTATE_CAP_MS,
  TS_SWITCH_MS,
} from '../src/google-session.js';
import { createChromeContext } from './chrome-context.js';
import { chromeHost } from './chrome-host.js';
import { CHROME_START_NOTE } from './chrome-start-failure.js';
import { setSessionProxy } from './proxy-auth.js';
import { CHROME_LANG, isQuitting } from './window-kind.js';

// Đồng bộ phiên Google từ Chrome profile sang Electron partition (ẩn hoàn toàn khi chạy ngầm)
const cancelled = {
  ok: false,
  reason: 'cancelled',
  note: 'Đã huỷ.',
};

const nowSec = (nowFn) => Math.floor(nowFn() / 1000);

async function withChromeJar(
  account,
  workFn,
  {
    log = () => {},
    signal,
    host = chromeHost(),
    makeContext = createChromeContext,
    setProxy = setSessionProxy,
    quitting = isQuitting,
  } = {}
) {
  if (realChromeProblem(host)) {
    return {
      ok: false,
      reason: 'chrome_unavailable',
      note: NEEDS_CHROME_FOR_FLOW_NOTE,
    };
  }
  if (quitting() || signal?.aborted) return cancelled;
  let ctx = null;
  try {
    ctx = makeContext(account, {
      onLog: log,
      visible: false,
      host,
    });
    await setProxy(ctx.session, account.proxy ?? null);
    if (signal?.aborted) return cancelled;
    const p = workFn(ctx.session.cookies, ctx);
    p.catch(() => {});
    const res = await untilAbort(p, signal);
    return res === undefined ? cancelled : res;
  } catch (err) {
    if (quitting() || signal?.aborted) return cancelled;
    log(
      'Phiên Google: Chrome thật của acc không dùng được: ' +
        String(err?.message || err).slice(0, 120)
    );
    return {
      ok: false,
      reason: 'chrome_unavailable',
      note: CHROME_START_NOTE,
    };
  } finally {
    if (ctx) await ctx.dispose().catch(() => {});
  }
}

export const readChromeGoogleCookies = (account, opts = {}) =>
  withChromeJar(
    account,
    async (cookieJar) => {
      const all = await cookieJar.get({});
      return {
        ok: true,
        cookies: pickGoogleCookies(all, nowSec(opts.now ?? Date.now)),
      };
    },
    opts
  );

export async function chromeProfileHasSession(account, opts = {}) {
  const res = await readChromeGoogleCookies(account, opts);
  return res.ok && hasSignInSet(res.cookies);
}

export const sessionHasSid = async (electronSession) =>
  hasSignInSet(await electronSession.cookies.get({}));

export async function forgetGoogleCookies(electronSession) {
  const all = (await electronSession.cookies.get({})).filter((c) =>
    isGoogleFamilyDomain(c.domain)
  );
  for (const c of all) {
    await electronSession.cookies.remove(removeUrlOf(c), c.name).catch(() => {});
  }
  await electronSession.cookies.flushStore?.().catch(() => {});
  return all.length;
}

export async function forgetGoogleSession(
  account,
  { electronSession, profile = true, ...opts } = {}
) {
  if (electronSession?.cookies) {
    await forgetGoogleCookies(electronSession).catch(() => {});
  }
  if (!profile) return { ok: true };
  const res = await withChromeJar(
    account,
    async (cookieJar) => ({
      ok: true,
      removed: await forgetGoogleCookies({ cookies: cookieJar }),
    }),
    opts
  ).catch(() => ({ ok: false }));
  if (res.ok) {
    opts.log?.(
      'Phiên Google: đã xoá cookie Google của acc (phiên đã hết hạn), cần đăng nhập lại bằng nút Kiểm tra'
    );
  }
  return res;
}

async function rotateStaleTokens(cookieJar, ctx, opts) {
  const {
    log = () => {},
    signal,
    now = Date.now,
    sleep = waitMs,
    force = false,
  } = opts;
  const rotateCapMs = opts.rotateCapMs ?? TS_ROTATE_CAP_MS;
  const rotatePollMs = opts.rotatePollMs ?? TS_POLL_MS;
  const rotateSwitchMs = opts.rotateSwitchMs ?? TS_SWITCH_MS;
  const curSec = () => nowSec(now);
  const initialRaw = await cookieJar.get({});
  let picked = pickGoogleCookies(initialRaw, curSec());
  if (!hasSignInSet(picked)) return picked;

  const staleNames = staleTokenNames(initialRaw, curSec());
  if (!force && !staleNames.length) return picked;

  let win = null;
  try {
    win = ctx?.ensureWindow?.() ?? null;
  } catch {
    win = null;
  }
  if (!win) return picked;

  log(
    force
      ? 'Phiên Google: Flow không nhận phiên đã chép, làm mới token trong Chrome thật'
      : 'Phiên Google: token Google sắp hết hạn, làm mới trong Chrome thật'
  );
  const beforeSnap = tokenSnapshot(initialRaw, curSec());
  const targetNames = force ? Object.keys(beforeSnap) : staleNames;
  const navigateTo = (idx) => {
    try {
      Promise.resolve(
        win.loadURL(TOKEN_ROTATE_URLS[idx % TOKEN_ROTATE_URLS.length])
      ).catch(() => {});
    } catch {}
  };
  navigateTo(0);

  let switched = false;
  for (let elapsed = 0; elapsed < rotateCapMs; elapsed += rotatePollMs) {
    await sleep(rotatePollMs, signal);
    if (signal?.aborted) return picked;
    const latestRaw = await cookieJar.get({});
    picked = pickGoogleCookies(latestRaw, curSec());
    if (rotationDone(targetNames, beforeSnap, latestRaw, curSec(), force)) {
      log('Phiên Google: Chrome thật đã làm mới token Google');
      return picked;
    }
    if (!switched && elapsed + rotatePollMs >= rotateSwitchMs) {
      switched = true;
      navigateTo(1);
    }
  }
  log(
    `Phiên Google: Chrome thật chưa làm mới được token Google sau ${Math.round(rotateCapMs / 1000)} giây, vẫn chép phiên hiện có`
  );
  return picked;
}

export async function syncGoogleSession(
  account,
  { electronSession, forceRotate = false, ...opts } = {}
) {
  if (!electronSession?.cookies) {
    throw new TypeError(
      'syncGoogleSession needs the Electron session of the account'
    );
  }
  const { log = () => {}, signal } = opts;
  const jarRes = await withChromeJar(
    account,
    async (cookieJar, ctx) => ({
      ok: true,
      cookies: await rotateStaleTokens(cookieJar, ctx, {
        ...opts,
        force: forceRotate,
      }),
    }),
    opts
  );
  if (!jarRes.ok) return jarRes;
  if (signal?.aborted) return cancelled;
  if (!hasSignInSet(jarRes.cookies)) {
    return {
      ok: false,
      reason: 'no_session',
      note: NOT_SIGNED_NOTE,
    };
  }

  let copied = 0;
  let failed = 0;
  let sidFailed = false;
  try {
    const existing = (await electronSession.cookies.get({})).filter((c) =>
      isGoogleFamilyDomain(c.domain)
    );
    if (signal?.aborted) return cancelled;
    for (const c of existing) {
      await electronSession.cookies.remove(removeUrlOf(c), c.name).catch(() => {});
    }
    for (const c of jarRes.cookies) {
      try {
        await electronSession.cookies.set(setDetailsOf(c));
        copied += 1;
      } catch {
        failed += 1;
        if (c.name === 'SID') sidFailed = true;
      }
    }
    await electronSession.cookies.flushStore().catch(() => {});
  } catch (err) {
    log(
      'Phiên Google: không chép được vào cửa sổ Flow: ' +
        String(err?.message || err).slice(0, 100)
    );
    return {
      ok: false,
      reason: 'copy_failed',
      note: 'Không chép được phiên Google từ Chrome thật vào cửa sổ Flow.',
    };
  }
  if (sidFailed || !copied) {
    log(
      `Phiên Google: chép cookie vào cửa sổ Flow lỗi (${failed} cookie không đặt được)`
    );
    return {
      ok: false,
      reason: 'copy_failed',
      note: 'Không chép được phiên Google từ Chrome thật vào cửa sổ Flow.',
    };
  }
  log(
    `Phiên Google: đã chép ${copied} cookie từ Chrome thật vào cửa sổ Flow` +
      (failed ? ` (${failed} cookie không đặt được)` : '')
  );
  return { ok: true, copied, failed };
}

export async function ensureGoogleSession(
  account,
  { login, electronSession, probe = null, visible = false, ...opts } = {}
) {
  if (typeof login !== 'function' || !electronSession?.cookies) {
    throw new TypeError(
      'ensureGoogleSession needs the login function and the Electron session of the account'
    );
  }
  const { log = () => {}, signal, host = chromeHost() } = opts;
  if (realChromeProblem(host)) {
    return {
      ok: false,
      reason: 'chrome_unavailable',
      note: NEEDS_CHROME_FOR_FLOW_NOTE,
    };
  }
  host.acquire(String(account.id), {
    lang: CHROME_LANG,
    downloadSession: electronSession,
  });
  try {
    const doSync = () =>
      syncGoogleSession(account, {
        ...opts,
        electronSession,
        host,
      });
    let syncRes = await doSync();
    if (syncRes.ok && probe) {
      const state = await probe();
      // Nếu trang Flow đã sẵn sàng hoặc đang tải nhưng cookie SID đã hợp lệ (không bị đẩy ra trang đăng nhập)
      if (state === 'ready' || state === 'not_ready') {
        return {
          ok: true,
          copied: syncRes.copied,
          signedIn: false,
        };
      }
      log(
        'Phiên Google: Flow không nhận phiên đã chép, đăng nhập lại trong Chrome thật'
      );
      await forgetGoogleSession(account, {
        electronSession,
        ...opts,
        host,
      });
    } else if (syncRes.ok) {
      return {
        ok: true,
        copied: syncRes.copied,
        signedIn: false,
      };
    } else if (syncRes.reason !== 'no_session') {
      return syncRes;
    }

    if (signal?.aborted) return cancelled;
    // Khi cần đăng nhập Google thực sự, cho phép hiển thị cửa sổ trình duyệt để người dùng theo dõi/xác nhận
    const loginRes = await login(account, {
      visible: Boolean(visible),
      log,
      signal,
      chrome: true,
    });
    if (!loginRes?.ok) {
      return (
        loginRes || {
          ok: false,
          reason: 'login_failed',
          note: 'Google không cho đăng nhập.',
        }
      );
    }
    syncRes = await doSync();
    return syncRes.ok
      ? {
          ok: true,
          copied: syncRes.copied,
          signedIn: true,
        }
      : {
          ok: false,
          reason:
            syncRes.reason === 'no_session' ? 'login_failed' : syncRes.reason,
          note: syncRes.note,
        };
  } finally {
    await host.release(String(account.id)).catch(() => {});
  }
}

import { markAccount, platformOfAccount, restAccount } from './accounts.js';

// Quản lý phiên đăng nhập và cookie Google / Google Flow (labs.google)
export const SESSION_GONE_NOTE =
  'Phiên Google của acc hết hạn: bấm Đặt lại rồi Kiểm tra để đăng nhập lại.';

export const sessionGoneAnalyzeNote = (label) =>
  'Phiên Google của acc' +
  (label ? ' ' + label : '') +
  ' hết hạn: bấm Kiểm tra ở tab Veo (Setup tài khoản) để đăng nhập lại, rồi phân tích lại.';

export const NEEDS_CHROME_FOR_FLOW_NOTE =
  'Acc Gmail của Veo lấy phiên Google từ Chrome thật (hoặc Edge) của máy: máy này không có, cài Google Chrome rồi chạy lại.';

export const SIGNIN_WAIT_NOTE = 'Đang chờ tới lượt đăng nhập';
export const SIGNIN_RUNNING_NOTE = 'Đang đăng nhập Google';
export const NOT_SIGNED_NOTE = 'Chưa đăng nhập Google: bấm Kiểm tra để đăng nhập.';

export const signinFailedNote = (reason) =>
  'Đăng nhập Google chưa xong' +
  (reason ? ' (' + String(reason).slice(0, 160) + ')' : '') +
  ': bấm Kiểm tra để thử lại.';

const COUNTRY = /^(?:[a-z0-9-]+\.)*google\.(?:com?\.)?[a-z]{2}$/;

// Hỗ trợ đầy đủ miền google.com, youtube.com và labs.google (nơi Google Flow chuyển hướng tới)
export function isGoogleFamilyDomain(domain) {
  const d = String(domain ?? '').replace(/^\./, '').toLowerCase();
  if (!d) return false;
  return (
    d === 'google.com' ||
    d.endsWith('.google.com') ||
    d === 'labs.google' ||
    d.endsWith('.labs.google') ||
    d.endsWith('.google') ||
    d === 'youtube.com' ||
    d.endsWith('.youtube.com') ||
    COUNTRY.test(d)
  );
}

export const isExpired = (cookie, nowSec) =>
  Number.isFinite(cookie?.expirationDate) && cookie.expirationDate <= nowSec;

export const pickGoogleCookies = (cookies, nowSec) =>
  (Array.isArray(cookies) ? cookies : []).filter(
    (c) =>
      c &&
      c.name &&
      typeof c.value === 'string' &&
      isGoogleFamilyDomain(c.domain) &&
      !isExpired(c, nowSec)
  );

export const hasSignInSet = (cookies) =>
  (Array.isArray(cookies) ? cookies : []).some(
    (c) => c?.name === 'SID' && c.value && isGoogleFamilyDomain(c.domain)
  );

const hostOf = (cookie) => String(cookie.domain).replace(/^\./, '');

export const removeUrlOf = (cookie) =>
  'https://' + hostOf(cookie) + (cookie.path || '/');

export function setDetailsOf(cookie) {
  const name = String(cookie?.name ?? '');
  const isHostPrefix = name.startsWith('__Host-');
  const isSecurePrefix = name.startsWith('__Secure-');
  const sameSite = cookie?.sameSite || 'unspecified';
  const details = {
    url: removeUrlOf(cookie),
    name,
    value: cookie.value,
    path: isHostPrefix ? '/' : cookie.path || '/',
    secure: isHostPrefix || isSecurePrefix || sameSite === 'no_restriction' ? true : Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite,
  };
  if (!isHostPrefix && !cookie.hostOnly && String(cookie.domain).startsWith('.')) {
    details.domain = cookie.domain;
  }
  if (Number.isFinite(cookie.expirationDate) && cookie.expirationDate > 0) {
    details.expirationDate = cookie.expirationDate;
  }
  return details;
}

export const TS_COOKIES = ['__Secure-1PSIDTS', '__Secure-3PSIDTS'];
export const TS_MIN_LEFT_S = 20 * 60;
export const TS_FRESH_LEFT_S = 40 * 60;
export const TS_ROTATE_CAP_MS = 25000;
export const TS_POLL_MS = 1000;
export const TS_SWITCH_MS = 8000;
export const TOKEN_ROTATE_URLS = [
  'https://flow.google.com/?pli=1&hl=en',
  'https://labs.google/fx/tools/flow',
  'https://accounts.google.com/RotateCookiesPage?origin=https://flow.google.com',
];

const lifeOf = (cookie) =>
  Number.isFinite(cookie.expirationDate) ? cookie.expirationDate : Infinity;

export function tokenSnapshot(cookies, nowSec) {
  const snap = {};
  for (const name of TS_COOKIES) {
    const best = (Array.isArray(cookies) ? cookies : [])
      .filter(
        (c) => c?.name === name && c.value && isGoogleFamilyDomain(c.domain)
      )
      .sort((a, b) => lifeOf(b) - lifeOf(a))[0];
    snap[name] = best
      ? { value: best.value, left: lifeOf(best) - nowSec }
      : null;
  }
  return snap;
}

export function staleTokenNames(cookies, nowSec) {
  const snap = tokenSnapshot(cookies, nowSec);
  const isFresh = (name) => snap[name] && snap[name].left > TS_MIN_LEFT_S;
  if (!TS_COOKIES.some(isFresh)) return [...TS_COOKIES];
  return TS_COOKIES.filter((name) => snap[name] && !isFresh(name));
}

export function tokenRotated(name, before, cookies, nowSec, force = false) {
  const cur = tokenSnapshot(cookies, nowSec)[name];
  if (!cur || cur.left <= TS_MIN_LEFT_S) return false;
  const changed = !before || cur.value !== before.value;
  return force ? changed : cur.left > TS_FRESH_LEFT_S || changed;
}

export function rotationDone(names, beforeSnap, cookies, nowSec, force = false) {
  const existing = names.filter((name) => beforeSnap[name]);
  const check = (name) =>
    tokenRotated(name, beforeSnap[name], cookies, nowSec, force);
  return existing.length ? existing.every(check) : names.some(check);
}

export const isSigninCandidate = (acc) =>
  acc?.type === 'google' &&
  platformOfAccount(acc) === 'veo' &&
  acc.enabled !== false &&
  acc.status !== 'dead' &&
  !!acc.login?.uid &&
  !!acc.login?.pass;

export const holdsSigninMark = (acc) =>
  acc?.status === 'rest' && acc.restWhy === 'login';

export const stillWaitingToSignIn = (acc) =>
  isSigninCandidate(acc) && holdsSigninMark(acc);

export const SIGNING_IN_NOTE =
  'Acc đang đăng nhập Google (tự động khi mới thêm): đợi xong rồi bấm lại.';

export const isSigningIn = (acc) =>
  acc?.type === 'google' &&
  holdsSigninMark(acc) &&
  acc.note === SIGNIN_RUNNING_NOTE;

export const refuseSigningIn = (acc) =>
  isSigningIn(acc)
    ? { ok: false, reason: 'signing_in', note: SIGNING_IN_NOTE }
    : null;

export const veoSignInVisible = (fn) =>
  typeof fn === 'function' ? fn() === true : true;

export const SIGNIN_HOLD_MS = 12 * 3600_000;

export const signinDeadNote = (reason) =>
  'Đăng nhập Google không được' +
  (reason ? ': ' + String(reason).replace(/[.\s]+$/, '').slice(0, 160) : '') +
  '. Bấm Đặt lại rồi Kiểm tra để đăng nhập lại.';

export function applySigninState(list, id, state, reason = '', now = Date.now()) {
  const acc = list.find((item) => item.id === id);
  if (!acc) return list;
  if (state === 'waiting' || state === 'running') {
    if (
      !isSigninCandidate(acc) ||
      (acc.status !== 'ready' && !holdsSigninMark(acc))
    ) {
      return list;
    }
    return restAccount(
      list,
      id,
      now + SIGNIN_HOLD_MS,
      state === 'running' ? SIGNIN_RUNNING_NOTE : SIGNIN_WAIT_NOTE,
      'login'
    );
  }
  if (!holdsSigninMark(acc)) return list;
  if (state === 'ok') return markAccount(list, id, 'ready', '', now);
  if (state === 'dead') {
    return markAccount(list, id, 'dead', signinDeadNote(reason), now);
  }
  if (state === 'released') {
    return markAccount(list, id, 'ready', reason || NOT_SIGNED_NOTE, now);
  }
  return list;
}

export function releaseStaleSignins(list, now = Date.now()) {
  let next = list;
  for (const acc of list) {
    if (
      acc.type === 'google' &&
      holdsSigninMark(acc) &&
      [SIGNIN_WAIT_NOTE, SIGNIN_RUNNING_NOTE].includes(acc.note)
    ) {
      next = markAccount(next, acc.id, 'ready', NOT_SIGNED_NOTE, now);
    }
  }
  return next;
}

import {
  activateExpr,
  clickAt,
  clickPoint,
  findExpr,
  probeExpr,
} from './click-at.js';
import { evalJs, loadUrl, PAGE_CALL_MS } from './dola-session.js';
import { idsOfPage, tileState } from '../src/veo.js';
import {
  ACCOUNT_BUTTON_SELECTOR,
  classifyFlowHome,
  creditsInText,
  FLOW_HOME_SNAPSHOT,
  NEW_PROJECT_WORDS,
} from '../src/veo-home.js';

// Tương tác với trang Google Flow (flow.google.com & labs.google/fx/tools/flow)
export const FLOW_HOME = 'https://flow.google.com/?pli=1&hl=en';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const flowPage = (win) =>
  win.isDestroyed() ? '' : win.webContents.getURL();

const FIRST_RUN_BOX =
  /experience and shape ai tools|review our privacy policy|nano banana|what.s new|changelog|terms of service|welcome to flow/i;

const DIALOG_BUTTON = findExpr(
  `(/^(next|continue|got it|agree|i agree|accept|create with flow|tạo bằng flow|get started|bắt đầu)$/i.test(t)) && (e.tagName === 'BUTTON' || e.tagName === 'A' || e.getAttribute('role') === 'button') && !e.disabled && (() => {
    if (/^(create with flow|tạo bằng flow|get started|bắt đầu)$/i.test(t)) return true;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const x = (a.innerText || '');
      if (x.length < 4000 && ${FIRST_RUN_BOX}.test(x)) return true;
    }
    return false;
  })()`
);

const SCROLL_DIALOGS = `(() => {
  let n = 0;
  for (const e of document.querySelectorAll('*')) {
    if (e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible' && e.getBoundingClientRect().width < 700) {
      e.scrollTop = e.scrollHeight;
      n += 1;
    }
  }
  return n;
})()`;

const NEW_PROJECT_TEST = `${NEW_PROJECT_WORDS}.test(t) && (e.tagName === 'BUTTON' || e.tagName === 'A' || e.getAttribute('role') === 'button')`;
const NEW_PROJECT_PROBE = probeExpr(NEW_PROJECT_TEST);
const NEW_PROJECT_PROBE_SCROLLED = probeExpr(NEW_PROJECT_TEST, true);
const NEW_PROJECT_ACTIVATE = activateExpr(NEW_PROJECT_TEST);
const GET_STARTED = findExpr('/^(get started|bắt đầu|create with flow|tạo bằng flow)$/i.test(t)');
const PAGE_TEXT = "document.body.innerText.replace(/\\s+/g, ' ')";

export const textOf = (win) =>
  evalJs(win, PAGE_TEXT, { timeout: PAGE_CALL_MS }).catch(() => '');

export async function openHome(win, signal) {
  win.setSize(1400, 900);
  await loadUrl(win, FLOW_HOME);
  let misses = 0;
  for (let i = 0; i < 14 && misses < 3 && !signal?.aborted; i += 1) {
    const clicked = await clickAt(win, DIALOG_BUTTON);
    await evalJs(win, SCROLL_DIALOGS, { timeout: PAGE_CALL_MS }).catch(() => 0);
    misses = clicked ? 0 : misses + 1;
    await sleep(1600);
    const snap = await evalJs(win, FLOW_HOME_SNAPSHOT, {
      timeout: PAGE_CALL_MS,
    }).catch(() => null);
    const state = classifyFlowHome(snap);
    if (state === 'ready' && !clicked) {
      return 'ready';
    }
  }
  const snap = await evalJs(win, FLOW_HOME_SNAPSHOT, {
    timeout: PAGE_CALL_MS,
  }).catch(() => null);
  return classifyFlowHome(snap);
}

export const NEW_PROJECT_PRESSES = 3;
export const NEW_PROJECT_REAL_PRESSES = 2;
export const NEW_PROJECT_WAIT_S = 8;
export const NEW_PROJECT_HOVER_MS = 150;
export const NEW_PROJECT_SETTLE_EVERY_MS = 250;
export const NEW_PROJECT_SETTLE_CAP_MS = 4000;

const sameRect = (a, b) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

async function settledNewProject(
  win,
  signal,
  { scroll = false, everyMs, capMs }
) {
  const expr = scroll ? NEW_PROJECT_PROBE_SCROLLED : NEW_PROJECT_PROBE;
  const read = () =>
    evalJs(win, expr, { timeout: PAGE_CALL_MS }).catch(() => null);
  let prev = await read();
  for (let elapsed = 0; prev && elapsed < capMs && !signal?.aborted; elapsed += everyMs) {
    await sleep(everyMs);
    const cur = await read();
    if (!cur) return null;
    if (sameRect(prev.rect, cur.rect)) {
      return { ...cur, steady: true };
    }
    prev = cur;
  }
  return prev && { ...prev, steady: false };
}

export async function renewFlowSession(
  win,
  signal,
  log,
  refreshSession,
  { why, openHomeFn } = {}
) {
  log(
    `Veo: ${why}: làm mới phiên Google rồi thử lại (chưa gửi gì, chưa tốn credit)`
  );
  let res = null;
  try {
    res = await refreshSession();
  } catch {
    res = null;
  }
  if (signal?.aborted) return { ok: false, reason: 'cancelled' };
  if (!res?.ok) {
    log(`Veo: không làm mới được phiên Google (${res?.reason || 'lỗi'})`);
    return { ok: false, reason: res?.reason || 'refresh_failed' };
  }
  const home = await (openHomeFn || openHome)(win, signal);
  log(`Veo: đã làm mới phiên Google rồi thử lại (trang Flow: ${home})`);
  return { ok: true, home };
}

export const NEW_PROJECT_MAX_REFRESHES = 2;
const SIGN_IN_PAGE = /accounts\.google\.com/i;
const MARK_PAGE = '(document.__vpPressed = 1, true)';
const MARK_KEPT = 'document.__vpPressed === 1';

export async function newProject(
  win,
  signal,
  log = () => {},
  {
    waitS = NEW_PROJECT_WAIT_S,
    settleMs = NEW_PROJECT_SETTLE_EVERY_MS,
    settleCapMs = NEW_PROJECT_SETTLE_CAP_MS,
    hoverMs = NEW_PROJECT_HOVER_MS,
    refreshSession = null,
    maxRefreshes = NEW_PROJECT_MAX_REFRESHES,
    openHomeFn = null,
  } = {}
) {
  let refreshes = 0;
  let refreshFailed = false;
  const canRefresh = () =>
    typeof refreshSession === 'function' &&
    !refreshFailed &&
    refreshes < maxRefreshes;

  const doRefresh = async (reason) => {
    refreshes += 1;
    const res = await renewFlowSession(win, signal, log, refreshSession, {
      why: `${reason} (lần ${refreshes}/${maxRefreshes})`,
      openHomeFn,
    });
    if (!res.ok || res.home === 'not_logged_in') refreshFailed = true;
    return res.ok;
  };

  const prefixOf = (attempt) => `Veo: lần ${attempt + 1}/${NEW_PROJECT_PRESSES}`;

  for (let i = 0; i < NEW_PROJECT_PRESSES && !signal?.aborted; i += 1) {
    if (i >= NEW_PROJECT_REAL_PRESSES && canRefresh()) {
      if (await doRefresh(`bấm "New project" mất ${i} lần`)) {
        i = -1;
        continue;
      }
    }
    let found = await settledNewProject(win, signal, {
      everyMs: settleMs,
      capMs: settleCapMs,
    });
    if (!found) {
      // Thử bấm nút Create with Flow / Get started nếu đang ở trang giới thiệu labs.google
      await clickAt(win, GET_STARTED).catch(() => null);
      log(
        `${prefixOf(i)} không thấy nút "New project" trên ${String(flowPage(win)).slice(0, 70)}`
      );
      await sleep(2000);
      continue;
    }
    let pt = found.points.find((p) => p.on);
    if (!pt) {
      const scrolled = await settledNewProject(win, signal, {
        scroll: true,
        everyMs: settleMs,
        capMs: settleCapMs,
      });
      if (scrolled) {
        found = scrolled;
        pt = found.points.find((p) => p.on);
      }
    }
    const targetPt = pt || found.points[0];
    const coveredCount = found.points.filter((p) => !p.on).length;
    const useActivate = i >= NEW_PROJECT_REAL_PRESSES;
    if (signal?.aborted) break;

    await evalJs(win, MARK_PAGE, { timeout: PAGE_CALL_MS }).catch(() => false);
    if (useActivate) {
      await evalJs(win, NEW_PROJECT_ACTIVATE, { timeout: PAGE_CALL_MS }).catch(
        () => false
      );
    } else {
      await clickPoint(win, targetPt, [], hoverMs);
    }

    let kickedToSignIn = false;
    for (let s = 0; s < waitS && !signal?.aborted; s += 1) {
      await sleep(1000);
      const url = flowPage(win);
      const projMatch = /\/project\/([0-9a-f-]{36})/i.exec(url);
      if (projMatch) {
        await sleep(2500);
        await clickAt(win, GET_STARTED);
        return projMatch[1];
      }
      if (SIGN_IN_PAGE.test(url)) kickedToSignIn = true;
    }

    if (
      !kickedToSignIn &&
      (await evalJs(win, MARK_KEPT, { timeout: PAGE_CALL_MS }).catch(
        () => null
      )) === false
    ) {
      kickedToSignIn = true;
    }

    const detail = `nút ${found.rect.w}x${found.rect.h} ở (${found.rect.x}, ${found.rect.y})${found.steady ? '' : ' chưa đứng yên'}, ${coveredCount}/${found.points.length} điểm bị che, điểm bấm (${targetPt.x}, ${targetPt.y}) có "${targetPt.top}" nằm trên`;
    log(
      `${prefixOf(i)} đã ${useActivate ? 'bấm trong trang' : 'bấm'} "${found.text}" nhưng sau ${waitS} giây trang vẫn ở ${String(flowPage(win)).slice(0, 70)} (${detail})`
    );
    if (
      kickedToSignIn &&
      !signal?.aborted &&
      canRefresh() &&
      (await doRefresh('Flow đẩy trang qua đăng nhập Google sau khi bấm'))
    ) {
      i = -1;
    }
  }
  return '';
}

export async function creditsLeft(win) {
  const pt = await evalJs(
    win,
    `(() => {
      const e = document.querySelector(${JSON.stringify(ACCOUNT_BUTTON_SELECTOR)});
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
    { timeout: PAGE_CALL_MS }
  ).catch(() => null);
  if (!pt) return null;
  await clickPoint(win, pt);
  for (let i = 0; i < 6; i += 1) {
    await sleep(700);
    const val = creditsInText(await textOf(win));
    if (val !== null) {
      await loadUrl(win, FLOW_HOME);
      return val;
    }
  }
  await loadUrl(win, FLOW_HOME);
  return null;
}

export const CLIP_TILE = 'flow-video-tile, .video-container';

const CLIP_STATE = `(() => {
  const e = document.querySelector('${CLIP_TILE}');
  if (!e) return null;
  const text = (e.innerText || '').replace(/\\s+/g, ' ').trim();
  return {
    text,
    pending: !!e.querySelector('flow-pending-tile'),
    thumb: !!e.querySelector('img.thumbnail, img')
  };
})()`;

export async function clipCard(win) {
  const raw = await evalJs(win, CLIP_STATE, { timeout: PAGE_CALL_MS }).catch(
    () => null
  );
  if (!raw) return null;
  const st = tileState(raw.text);
  return {
    text: raw.text,
    state: st === 'done' && raw.pending ? 'working' : st,
  };
}

export async function openClip(win) {
  const pt = await evalJs(
    win,
    `(() => {
      const e = document.querySelector('${CLIP_TILE}');
      if (!e) return null;
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
    { timeout: PAGE_CALL_MS }
  ).catch(() => null);
  if (!pt) return null;
  await clickPoint(win, pt);
  for (let i = 0; i < 15; i += 1) {
    await sleep(1000);
    const ids = idsOfPage(flowPage(win));
    if (ids) return ids;
  }
  return null;
}

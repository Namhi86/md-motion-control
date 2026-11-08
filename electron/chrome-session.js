import { createCookieJar } from './chrome-cookie-jar.js';
import { deferChromeWindow } from './chrome-window.js';
import { setSessionProxy } from './proxy-auth.js';
import { startProxyRelay } from './proxy-relay.js';

// Quản lý phiên Chrome CDP: mặc định ẩn hoàn toàn ngoài màn hình (-32000, -32000),
// chỉ đưa cửa sổ lên màn hình chính (VISIBLE_AT) khi thực hiện đăng nhập tài khoản.
const noop = () => {};
const BUSY = 'Chrome đang mở: không đổi được proxy giữa có và không có';
const RETIRED = 'the app is closing: no Chrome is started any more';

const quietly = async (fn) => {
  try {
    return await fn();
  } catch {
    return undefined;
  }
};

const CORNER = Object.freeze({
  left: -32000,
  top: -32000,
});

const VISIBLE_AT = Object.freeze({
  left: 60,
  top: 80,
});

const VISIBLE_STEP = 28;

const sizeOf = (sz) =>
  sz &&
  sz.width > 0 &&
  sz.height > 0 &&
  Number.isFinite(sz.width) &&
  Number.isFinite(sz.height)
    ? { width: Math.round(sz.width), height: Math.round(sz.height) }
    : null;

const sameProxy = (a, b) =>
  Boolean(a) &&
  Boolean(b) &&
  (a.scheme || 'http') === (b.scheme || 'http') &&
  a.host === b.host &&
  a.port === b.port &&
  (a.username || '') === (b.username || '') &&
  (a.password || '') === (b.password || '');

function cleanProxy(proxy) {
  if (proxy == null) return null;
  const port = Number(proxy.port);
  const validScheme =
    proxy.scheme === undefined ||
    proxy.scheme === 'http' ||
    proxy.scheme === 'https';
  if (
    !validScheme ||
    typeof proxy.host !== 'string' ||
    !proxy.host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new TypeError(
      'proxy needs a scheme http or https, a host and a port'
    );
  }
  return { ...proxy, port };
}

export function createChromeSession({
  id,
  launcher,
  startRelay = startProxyRelay,
  openWindow = deferChromeWindow,
  lang,
  log = noop,
  downloadSession = null,
  setDownloadProxy = setSessionProxy,
  startMs,
  afterClose = null,
} = {}) {
  if (!launcher) throw new TypeError('a ChromeSession needs a launcher');
  const windows = [];
  let proxyConfig = null;
  let running = null;
  let starting = null;
  let closing = null;
  let retired = false;

  const activeWindows = () => windows.filter((w) => !w.isDestroyed());
  const destroyAllWindows = () => {
    for (const w of [...windows]) w.destroy();
  };
  const trackWindow = (win) => {
    windows.push(win);
    win.on('closed', () => {
      const idx = windows.indexOf(win);
      if (idx >= 0) windows.splice(idx, 1);
    });
    return win;
  };

  function detachRunning(inst) {
    if (running === inst) running = null;
    sessionApi.shown = false;
    inst.stopEvents();
  }

  function handleChromeGone(inst) {
    if (running !== inst) return;
    log(`chrome-session ${id}: Chrome is gone`);
    detachRunning(inst);
    destroyAllWindows();
    quietly(() => inst.relay?.close());
  }

  function handleCdpEvent(cdp, { method, params }) {
    const info = params?.targetInfo;
    if (
      closing ||
      method !== 'Target.targetCreated' ||
      info?.type !== 'page' ||
      !info.openerId
    ) {
      return;
    }
    if (
      !windows.some((w) => w.targetId === info.openerId) ||
      windows.some((w) => w.targetId === info.targetId)
    ) {
      return;
    }
    trackWindow(
      openWindow({
        session: sessionApi,
        target: Promise.resolve({ cdp, targetId: info.targetId }),
        log,
      })
    );
    hideTargetWindow(cdp, info.targetId);
  }

  async function launchChrome(reqSize) {
    if (afterClose) await quietly(() => afterClose);
    if (launcher.isOpen(id)) {
      log(
        `chrome-session ${id}: stopping the Chrome the launcher still remembers`
      );
      await quietly(() => launcher.stop(id));
    }
    const sz = sizeOf(reqSize);
    let relay = null;
    let started = null;
    let stopEvents = noop;
    try {
      if (proxyConfig) {
        relay = await startRelay({ upstream: proxyConfig, log });
      }
      started = await launcher.start(id, {
        proxy: relay
          ? { scheme: 'http', host: '127.0.0.1', port: relay.port }
          : null,
        lang,
        ...(sz ? { size: sz } : {}),
        ...(startMs ? { timeoutMs: startMs } : {}),
      });
      stopEvents = started.cdp.on((evt) => handleCdpEvent(started.cdp, evt));
      await started.cdp.send('Target.setDiscoverTargets', { discover: true });
      await started.cdp.send('Browser.setDownloadBehavior', {
        behavior: 'deny',
      });
    } catch (err) {
      stopEvents();
      if (started) await quietly(() => launcher.stop(id));
      await quietly(() => relay?.close());
      throw err;
    }
    const inst = {
      cdp: started.cdp,
      relay,
      stopEvents,
      blankTaken: false,
    };
    running = inst;
    started.cdp.closed.then(() => handleChromeGone(inst));
    return inst;
  }

  function ensureRunning(reqSize) {
    if (retired) return Promise.reject(new Error(RETIRED));
    if (running && running.cdp.isOpen === false) handleChromeGone(running);
    if (closing) return closing.then(() => ensureRunning(reqSize));
    if (running) return Promise.resolve(running);
    if (!starting) {
      const p = launchChrome(reqSize);
      starting = p;
      p.then(noop, noop).then(() => {
        if (starting === p) starting = null;
      });
    }
    return starting;
  }

  async function hideTargetWindow(cdp, targetId) {
    if (sessionApi.shown) return;
    try {
      const { windowId } = await cdp.send('Browser.getWindowForTarget', {
        targetId,
      });
      await cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: CORNER,
      });
    } catch (err) {
      log(`chrome-session ${id}: cannot hide a window: ${err.message}`);
    }
  }

  async function openTargetPage(inst, reqSize) {
    const sz = sizeOf(reqSize);
    const { cdp } = inst;
    if (!inst.blankTaken) {
      inst.blankTaken = true;
      const { targetInfos = [] } = await cdp.send('Target.getTargets');
      const blank = targetInfos.find(
        (t) =>
          t.type === 'page' &&
          String(t.url).startsWith('about:blank') &&
          !windows.some((w) => w.targetId === t.targetId)
      );
      if (blank) {
        if (sz) {
          try {
            const { windowId } = await cdp.send('Browser.getWindowForTarget', {
              targetId: blank.targetId,
            });
            await cdp.send('Browser.setWindowBounds', {
              windowId,
              bounds: sz,
            });
          } catch (err) {
            log(
              `chrome-session ${id}: cannot resize the first window: ${err.message}`
            );
          }
        }
        await hideTargetWindow(cdp, blank.targetId);
        return { cdp, targetId: blank.targetId };
      }
    }
    const { targetId } = await cdp.send('Target.createTarget', {
      url: 'about:blank',
      newWindow: true,
      ...(sz || {}),
    });
    await hideTargetWindow(cdp, targetId);
    return { cdp, targetId };
  }

  async function showWindowAt(cdp, targetId, offsetIndex) {
    const { windowId } = await cdp.send('Browser.getWindowForTarget', {
      targetId,
    });
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: {
        left: VISIBLE_AT.left + VISIBLE_STEP * offsetIndex,
        top: VISIBLE_AT.top + VISIBLE_STEP * offsetIndex,
        windowState: 'normal',
      },
    });
  }

  async function showAllWindows(cdp) {
    let idx = 0;
    for (const w of activeWindows()) {
      try {
        await showWindowAt(cdp, w.targetId, idx);
        idx += 1;
      } catch (err) {
        log(`chrome-session ${id}: cannot show a window: ${err.message}`);
      }
    }
  }

  async function stopRunning() {
    if (starting) await quietly(() => starting);
    const inst = running;
    if (!inst) return;
    detachRunning(inst);
    await quietly(() => launcher.stop(id));
    await quietly(() => inst.relay?.close());
  }

  const sessionApi = {
    isChromeSession: true,
    id,
    downloadSession,
    shown: false,
    cookies: createCookieJar(
      async () => (await ensureRunning()).cdp,
      () => (running && running.cdp.isOpen !== false ? running.cdp : null)
    ),
    newWindow(reqSize) {
      const targetPromise = ensureRunning(reqSize).then((inst) => {
        if (win.isDestroyed()) {
          throw new Error('the window was destroyed before Chrome was ready');
        }
        return openTargetPage(inst, reqSize);
      });
      targetPromise.catch((err) =>
        log(`chrome-session ${id}: no window: ${err.message}`)
      );
      const win = trackWindow(
        openWindow({
          session: sessionApi,
          target: targetPromise,
          log,
        })
      );
      return win;
    },
    windows: activeWindows,
    isRunning: () => Boolean(running) && running.cdp.isOpen !== false,
    proxyRefused: () => Boolean(running?.relay?.refused()),
    async setProxy(nextProxy) {
      const cleaned = cleanProxy(nextProxy);
      if (starting) await quietly(() => starting);
      const inst = running;
      const modeChanged =
        Boolean(inst) && Boolean(inst.relay) !== Boolean(cleaned);
      if (modeChanged && activeWindows().length) throw new Error(BUSY);
      if (inst?.relay && cleaned && !sameProxy(proxyConfig, cleaned)) {
        inst.relay.setUpstream(cleaned);
      }
      proxyConfig = cleaned;
      if (modeChanged) await sessionApi.close();
      if (downloadSession) await setDownloadProxy(downloadSession, cleaned);
    },
    async clearStorageData({ storages = [], origin = '' } = {}) {
      if (storages.length && !storages.includes('cookies')) return;
      let domain = '';
      try {
        domain = new URL(origin).hostname;
      } catch {
        return;
      }
      for (const c of await sessionApi.cookies.get({ domain })) {
        await sessionApi.cookies.remove(
          'https://' + c.domain.replace(/^\./, '') + (c.path || '/'),
          c.name
        );
      }
    },
    async bringForward() {
      try {
        if (!sessionApi.shown && running) await showAllWindows(running.cdp);
        const ok = Boolean(await launcher.bringForward?.(id));
        if (ok) sessionApi.shown = true;
        return ok;
      } catch (err) {
        log(
          `chrome-session ${id}: cannot bring Chrome forward: ${err.message}`
        );
        return false;
      }
    },
    async showOnly(win) {
      try {
        if (!running) return false;
        if (!win?.targetId) {
          log(
            `chrome-session ${id}: cannot show a window that has no page yet`
          );
          return false;
        }
        await showWindowAt(running.cdp, win.targetId, 0);
        return Boolean(await launcher.bringForward?.(id));
      } catch (err) {
        log(`chrome-session ${id}: cannot show one window: ${err.message}`);
        return false;
      }
    },
    async hideWindows() {
      sessionApi.shown = false;
      if (!running) return;
      const { cdp } = running;
      for (const w of activeWindows()) {
        if (w.targetId) await hideTargetWindow(cdp, w.targetId);
      }
    },
    retire() {
      retired = true;
      return sessionApi.close();
    },
    close() {
      if (closing) return closing;
      let done;
      const p = new Promise((resolve) => {
        done = resolve;
      });
      closing = p;
      destroyAllWindows();
      stopRunning()
        .catch(noop)
        .then(() => {
          if (closing === p) closing = null;
          done();
        });
      return p;
    },
  };
  return sessionApi;
}

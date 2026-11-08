// Quản lý cửa sổ chính (Control Window) của ứng dụng MD Motion Control
import { BrowserWindow, Menu, WebContentsView } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAppPage } from '../src/ipc-guard.js';
import { guardClose } from './close-flush.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_FILE = path.join(here, '..', 'web-ui', 'index.html');
export const APP_URL = pathToFileURL(APP_FILE).href;
const OFFLINE_FILE = path.join(here, 'offline.html');
export const OFFLINE_URL = pathToFileURL(OFFLINE_FILE).href;

const READY_MS = 15000;
const ABORTED = -3;

export function createControlWindow({
  mode,
  devTools,
  log,
  event,
  onClosed,
  closeGuard,
}) {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0f1a',
      symbolColor: '#fde68a',
      height: 58,
    },
    backgroundColor: '#090d16',
    title: 'MD MEDIA — AI Video & Motion Studio',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools,
    },
  });
  win.setMenuBarVisibility(false);
  win.removeMenu?.();

  const contents = win.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Đảm bảo cửa sổ luôn hiển thị nổi lên khi nạp xong giao diện
  contents.on('did-finish-load', () => {
    if (!win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  const onWillNavigate = (evt) => {
    if (!isAppPage(evt.url, mode)) {
      evt.preventDefault();
    }
  };

  const onWillFrameNavigate = (evt) => {
    if (mode.kind !== 'web' || evt.isMainFrame) {
      return onWillNavigate(evt);
    }
    if (!isAppPage(evt.url, mode) && !/^about:(blank|srcdoc)$/.test(evt.url)) {
      evt.preventDefault();
    }
  };

  contents.on('will-navigate', onWillNavigate);
  contents.on('will-frame-navigate', onWillFrameNavigate);
  contents.on('will-redirect', onWillFrameNavigate);

  let fallbackView = null;
  let readyTimer = null;
  let isWebReady = false;

  const clearReadyTimer = () => {
    clearTimeout(readyTimer);
    readyTimer = null;
  };

  const resizeFallback = () => {
    if (!fallbackView) return;
    const [width, height] = win.getContentSize();
    fallbackView.setBounds({ x: 0, y: 0, width, height });
  };

  function showFallback(reason) {
    clearReadyTimer();
    if (fallbackView || win.isDestroyed()) return;
    event('fallback', { reason });
    log('Không mở được giao diện (' + reason + '): đang hiện trang dự phòng.');
    fallbackView = new WebContentsView({
      webPreferences: {
        preload: path.join(here, 'offline-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        devTools,
      },
    });
    fallbackView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    fallbackView.webContents.on('will-navigate', (e) => e.preventDefault());
    win.contentView.addChildView(fallbackView);
    resizeFallback();
    fallbackView.webContents.loadFile(OFFLINE_FILE).catch(() => {});
  }

  function removeFallback() {
    if (!fallbackView) return;
    if (!win.isDestroyed()) {
      win.contentView.removeChildView(fallbackView);
    }
    fallbackView.webContents.close();
    fallbackView = null;
  }

  if (mode.kind === 'web') {
    contents.on('did-start-navigation', (evt) => {
      if (!evt.isMainFrame || evt.isSameDocument) return;
      clearReadyTimer();
      readyTimer = setTimeout(() => showFallback('no-ready'), READY_MS);
    });
    const onFailLoad = (_evt, code, desc, _url, isMainFrame) => {
      if (!isMainFrame) return;
      if (code === ABORTED) return isWebReady ? clearReadyTimer() : undefined;
      showFallback('load-failed ' + code + ' ' + desc);
    };
    contents.on('did-fail-load', onFailLoad);
    contents.on('did-fail-provisional-load', onFailLoad);
    contents.on('did-stop-loading', () => {
      if (isWebReady) clearReadyTimer();
    });
    contents.on('did-navigate', (_evt, _url, httpCode) => {
      isWebReady = false;
      if (httpCode >= 400) showFallback('http-' + httpCode);
    });
    win.on('resize', resizeFallback);
  }

  if (closeGuard) {
    guardClose(win, closeGuard);
  }

  win.on('closed', () => {
    clearReadyTimer();
    if (fallbackView) {
      fallbackView.webContents.close();
    }
    fallbackView = null;
    onClosed();
  });

  const load = () =>
    (mode.kind === 'web'
      ? contents.loadURL(mode.url)
      : win.loadFile(APP_FILE)
    ).catch(() => {});

  return {
    win,
    load,
    send(channel, payload) {
      if (!win.isDestroyed()) {
        contents.send(channel, payload);
      }
    },
    ready() {
      if (mode.kind !== 'web') return;
      isWebReady = true;
      clearReadyTimer();
      removeFallback();
      event('web-ready');
    },
    retry() {
      setImmediate(() => {
        removeFallback();
        load();
      });
      return { ok: true };
    },
    focus() {
      if (win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
  };
}

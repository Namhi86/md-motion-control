// Tiến trình chính (Main Process) của ứng dụng MD Motion Control
import WebSocket from 'ws';
if (typeof globalThis.WebSocket !== 'function') {
  globalThis.WebSocket = WebSocket;
}
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
} from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { addAccounts } from '../src/accounts.js';
import { pickWindowMode } from '../src/app-mode.js';
import { safeHostRules } from '../src/host-rules.js';
import { gateEnforced, gatePollOptions } from '../src/gate-mode.js';
import { guardHandler, senderAllowed } from '../src/ipc-guard.js';
import { createSamplePicker } from './skills-pick.js';
import { setupSkillsIpc } from './skills-ipc.js';
import { createHandles } from '../src/media-handles.js';
import { createMuse } from '../src/muse/client.js';
import { setupAccounts } from './account-ipc.js';
import { setupAdminIpc } from './admin-ipc.js';
import { setupAnalyze } from './analyze-ipc.js';
import { setupAppIpc } from './app-ipc.js';
import { setupBrowserMode } from './browser-ipc.js';
import { chromeHost, initChromeHost } from './chrome-host.js';
import { findChrome } from './chrome-launcher.js';
import { createChromeSession } from './chrome-session.js';
import { createMdViralGate } from './md-viral-gate.js';
import { scanFacebookPostForCode } from './fb-comment-scanner.js';
import { offerDevDataImport } from './dev-data-import.js';
import { setupElements } from './elements-ipc.js';
import { installAccountFingerprint } from './account-fingerprint.js';
import { setupDiagLog } from './diag-log.js';
import { flushOnce } from './close-flush.js';
import { createGateGuard } from './gate-guard.js';
import { setupGateIpc } from './gate-ipc.js';
import { setupVoiceGateIpc } from './voice-gate-ipc.js';
import { createGatePoll } from './gate-poll.js';
import { setupHandoff } from './handoff.js';
import {
  limitPermissions,
  offerMoveToApplications,
  refuseDebugging,
} from './hardening.js';
import { clearLegacySessionOnce } from './legacy-session.js';
import { setupMediaLibrary } from './media-ipc.js';
import { installMediaProtocol, registerMediaScheme } from './media-protocol.js';
import { createChromeContext } from './chrome-context.js';
import { createElevenlabsRegister } from './elevenlabs-register.js';
import { setupElevenlabs } from './elevenlabs-ipc.js';
import { createVoiceHistory } from './voice-history.js';
import { setupVoice } from './voice-ipc.js';
import { setupMotionTab } from './motion-setup.js';
import { createVoiceCapcutRun } from './voice-capcut-run.js';
import { setupVoiceDir } from './voice-dir.js';
import { createTtsDownloader } from './tts-download.js';
import { findFfmpeg } from './stitch.js';
import { createElevenlabsSettingsStore } from '../src/elevenlabs-settings-store.js';
import { sweepCreating } from '../src/elevenlabs-accounts.js';
import { setupMuse } from './muse-ipc.js';
import { loginMuseInWindow, museUaFor } from './muse-login.js';
import { installProxyAuth } from './proxy-auth.js';
import { setupProxies } from './proxy-ipc.js';
import { ffmpegPath, setupStudio } from './studio-ipc.js';
import { setupStudioBoards } from './studio-boards-ipc.js';
import { setupTemplatesIpc } from './templates-ipc.js';
import { setupQueue } from './queue-ipc.js';
import { startProxyRelay } from './proxy-relay.js';
import { startUpdater } from './updater.js';
import { APP_URL, createControlWindow, OFFLINE_URL } from './web-window.js';
import { markQuitting, testChromeArgs, testRelayTls } from './window-kind.js';

const STOP_MAX_MS = 15000;
const CHROME_STOP_MAX_MS = 10000;
const TEST_MODE = !!process.env.FS_USER_DATA && !app.isPackaged;
const event = (name, extra = {}) =>
  console.error(JSON.stringify({ event: name, ...extra }));
const VERSION = JSON.parse(
  readFileSync(path.join(ROOT, 'package.json'), 'utf8')
).version;

refuseDebugging();

const picked = pickWindowMode({
  isPackaged: app.isPackaged,
  testMode: TEST_MODE,
  webUrl: process.env.FS_WEB_URL,
});
if (picked.refused) {
  event('web-url-refused', { url: picked.refused });
}

const mode =
  picked.kind === 'web' ? picked : { kind: 'file', appUrl: APP_URL };
const GATE_ENFORCED = gateEnforced({
  isPackaged: app.isPackaged,
  env: process.env,
});
const gateGuard = createGateGuard();
const registerHandler = ipcMain.handle.bind(ipcMain);

ipcMain.handle = (channel, handler) =>
  registerHandler(
    channel,
    guardHandler(
      (evt) =>
        senderAllowed(evt, channel, { mode, offlineUrl: OFFLINE_URL }),
      GATE_ENFORCED ? gateGuard.wrap(channel, handler) : handler
    )
  );

if (TEST_MODE) {
  app.setPath('userData', process.env.FS_USER_DATA);
} else if (!app.isPackaged) {
  app.setPath('userData', path.join(ROOT, '.electron-user-data'));
}

if (TEST_MODE) {
  for (const name of [
    'videos',
    'downloads',
    'documents',
    'desktop',
    'music',
    'pictures',
  ]) {
    app.setPath(
      name,
      path.join(process.env.FS_USER_DATA, 'user-folders', name)
    );
  }
  const hosts = safeHostRules(process.env.FS_HOST_RULES);
  if (hosts.rejected.length) {
    event('host-rules-refused', { rejected: hosts.rejected });
  }
  if (hosts.rules) {
    app.commandLine.appendSwitch('host-resolver-rules', hosts.rules);
  }
  if (process.env.FS_IGNORE_CERT === '1') {
    app.commandLine.appendSwitch('ignore-certificate-errors');
  }
}

registerMediaScheme();
installAccountFingerprint({
  userData: app.getPath('userData'),
  event,
});

if (app.requestSingleInstanceLock()) {
  start();
} else {
  event('second-instance-exit');
  app.exit(0);
}

/**
 * Tạo chuỗi định danh thiết bị ổn định cho máy hiện tại
 */
function buildDeviceSeed() {
  if (process.env.MD_DEVICE_SEED) {
    return String(process.env.MD_DEVICE_SEED);
  }
  let username = 'user';
  try {
    username = os.userInfo().username || 'user';
  } catch {
    // Bỏ qua nếu không lấy được username
  }
  return `${os.hostname()}-${username}-${os.platform()}-${os.arch()}`;
}

function start() {
  let controlWindow;
  let queueCtrl;
  let museCtrl;
  let elevenlabsCtrl;
  let voiceCtrl;
  let analyzeCtrl;
  let motionCtrl;
  let studioCtrl;
  let studioBoardsCtrl;
  let mediaLibCtrl;
  let accountsCtrl;
  let authGate;

  const diagLog = setupDiagLog({
    userData: app.getPath('userData'),
    version: VERSION,
    testMode: TEST_MODE,
    env: process.env,
  });
  const sendToRenderer = diagLog.tapSend((channel, payload) =>
    controlWindow?.send(channel, payload)
  );

  function logUi(msg) {
    const item = {
      t: new Date().toISOString().slice(11, 19),
      msg: String(msg),
    };
    event('ui', item);
    diagLog.push(item.msg);
  }

  app.on('second-instance', () => {
    event('second-instance');
    controlWindow?.focus();
  });

  let runState = 'running';
  let quitPromise = null;
  const flushBoardsOnce = flushOnce(
    () => studioBoardsCtrl?.flushWindow(),
    logUi
  );

  function prepareQuit() {
    return (quitPromise ||= (async () => {
      await flushBoardsOnce();
      museCtrl?.stop();
      const stopEleven = Promise.resolve(elevenlabsCtrl?.stop()).catch((err) =>
        logUi('Lỗi khi dừng tạo acc ElevenLabs: ' + err.message)
      );
      const stopVoice = Promise.resolve(voiceCtrl?.stop()).catch((err) =>
        logUi('Lỗi khi dừng tạo giọng nói: ' + err.message)
      );
      const stopMotion = Promise.resolve(motionCtrl?.stop()).catch((err) =>
        logUi('Lỗi khi dừng Motion control: ' + err.message)
      );
      analyzeCtrl?.cancel();
      const stopStudio = Promise.resolve(studioCtrl?.stop()).catch((err) =>
        logUi('Lỗi khi dừng ghép video: ' + err.message)
      );
      const stopSignins = Promise.resolve(
        accountsCtrl?.signins?.stop()
      ).catch((err) =>
        logUi('Lỗi khi dừng đăng nhập Google acc mới: ' + err.message)
      );

      let stopTimer;
      const stopTimeout = new Promise((resolve) => {
        stopTimer = setTimeout(resolve, STOP_MAX_MS);
      });
      try {
        await Promise.race([
          Promise.all([
            queueCtrl?.stop(),
            stopStudio,
            stopSignins,
            stopEleven,
            stopVoice,
            stopMotion,
          ]),
          stopTimeout,
        ]);
      } catch (err) {
        logUi('Lỗi khi dừng hàng đợi: ' + err.message);
      }

      try {
        mediaLibCtrl?.stop();
        mediaLibCtrl?.flush();
      } catch (err) {
        logUi('Lỗi khi ghi thư viện: ' + err.message);
      }

      let chromeTimer;
      markQuitting();
      try {
        const chromeTimeout = new Promise((resolve) => {
          chromeTimer = setTimeout(resolve, CHROME_STOP_MAX_MS);
        });
        await Promise.race([
          Promise.resolve(chromeHost()?.stopAll()),
          chromeTimeout,
        ]);
      } catch (err) {
        logUi('Lỗi khi đóng Chrome: ' + err.message);
      } finally {
        clearTimeout(chromeTimer);
        clearTimeout(stopTimer);
        for (const win of BrowserWindow.getAllWindows()) {
          if (win !== controlWindow?.win && !win.isDestroyed()) {
            win.destroy();
          }
        }
        runState = 'done';
      }
    })());
  }

  app.on('before-quit', (evt) => {
    if (runState === 'done') return;
    evt.preventDefault();
    if (runState === 'stopping') return;
    runState = 'stopping';
    prepareQuit().then(() => app.quit());
  });

  app.on('quit', () => diagLog.quit());
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(sig, () => app.quit());
  }
  app.on('window-all-closed', () => app.quit());

  app
    .whenReady()
    .then(async () => {
      if (await offerMoveToApplications(logUi)) return;
      const userData = app.getPath('userData');
      if (app.isPackaged) {
        await offerDevDataImport({ userData, log: logUi });
      }

      const tlsOpts = testRelayTls({
        testMode: TEST_MODE,
        ignoreCert: process.env.FS_IGNORE_CERT === '1',
      });
      initChromeHost({
        userData,
        log: logUi,
        extraArgs: testChromeArgs({
          testMode: TEST_MODE,
          hostRules: safeHostRules(process.env.FS_HOST_RULES).rules,
          ignoreCert: process.env.FS_IGNORE_CERT === '1',
        }),
        ...(tlsOpts.rejectUnauthorized === false
          ? {
              makeSession: (opts) =>
                createChromeSession({
                  ...opts,
                  startRelay: (relayOpts) =>
                    startProxyRelay({ ...relayOpts, tlsOptions: tlsOpts }),
                }),
            }
          : {}),
      });

      limitPermissions(session.defaultSession, {
        mainContents: () =>
          controlWindow && !controlWindow.win.isDestroyed()
            ? controlWindow.win.webContents
            : null,
        mode,
      });

      Menu.setApplicationMenu(null);
      controlWindow = createControlWindow({
        mode,
        devTools: !app.isPackaged,
        log: logUi,
        event,
        onClosed: () => app.quit(),
        closeGuard: {
          flush: flushBoardsOnce,
          skip: () => runState !== 'running' || quitPromise !== null,
        },
      });
      controlWindow.load();
      installProxyAuth(app);

      const accounts = (accountsCtrl = setupAccounts({
        userData,
        notify: (payload) => sendToRenderer('accounts:changed', payload),
        onChanged: () => queueCtrl?.refresh(),
        isBusy: (id) =>
          queueCtrl?.isBusy(id) === true ||
          museCtrl?.isBusy(id) === true ||
          elevenlabsCtrl?.isBusy(id) === true ||
          voiceCtrl?.isBusy(id) === true,
        log: logUi,
        ...(TEST_MODE || app.isPackaged ? { seedCookie: '' } : {}),
        ...(TEST_MODE
          ? { confirmRemove: async () => process.env.FS_CONFIRM !== 'no' }
          : {}),
        assignFreeProxies: (count) => proxies.assignFree(count),
        showWindows: () => true,
      }));

      if (
        TEST_MODE &&
        process.env.FS_SEED_ACCOUNTS &&
        !accounts.get().length
      ) {
        let seeded = [];
        for (const item of JSON.parse(
          readFileSync(process.env.FS_SEED_ACCOUNTS, 'utf8')
        )) {
          seeded = addAccounts(seeded, item.type, item.cookie).list;
          if (item.proxy) {
            seeded[seeded.length - 1].proxy = item.proxy;
          }
        }
        accounts.set(seeded);
      }

      const proxies = setupProxies({
        userData,
        notify: (payload) => sendToRenderer('proxies:changed', payload),
        getAccounts: accounts.get,
        isBusy: (id) => queueCtrl?.isBusy(id) === true,
        setAccounts: (nextList) => {
          accounts.set(nextList);
          queueCtrl?.refresh();
        },
      });

      museCtrl = setupMuse({
        ipc: ipcMain,
        store: accounts,
        changed: () => queueCtrl?.refresh(),
        assignFreeProxies: (count) => proxies.assignFree(count),
        createMuse,
        login: loginMuseInWindow,
        uaFor: museUaFor,
        isTaskBusy: (id) => queueCtrl?.isBusy(id) === true,
        log: logUi,
      });
      museCtrl.start();

      const elevenSettings = createElevenlabsSettingsStore(
        path.join(userData, 'elevenlabs-settings.json'),
        { log: logUi }
      );
      elevenlabsCtrl = setupElevenlabs({
        ipc: ipcMain,
        store: accounts,
        settings: elevenSettings,
        register: createElevenlabsRegister({
          store: accounts,
          host: chromeHost(),
          makeContext: createChromeContext,
          settings: elevenSettings,
          changed: () => queueCtrl?.refresh(),
          log: logUi,
        }),
        log: logUi,
      });
      elevenlabsCtrl.start(() => {
        const swept = sweepCreating(accounts.get());
        if (swept !== accounts.get()) {
          accounts.set(swept);
        }
      });

      const handles = createHandles();
      const elements = setupElements({
        userData,
        handles,
        notify: (payload) => sendToRenderer('elements:changed', payload),
        control: controlWindow,
        pickTestFile: TEST_MODE ? process.env.FS_PICK_FILE || '' : '',
        log: logUi,
      });

      queueCtrl = setupQueue({
        userData,
        send: sendToRenderer,
        accounts,
        proxies,
        log: logUi,
        resolveHandle: handles.resolve,
        elementLibrary: elements.library,
        canRun: GATE_ENFORCED ? gateGuard.isUnlocked : () => true,
        canShowWindows: () =>
          authGate ? authGate.canShowWindows() : !GATE_ENFORCED,
        skillSession: () => authGate ?? null,
        onChanged: (tasks) => mediaLibCtrl?.noteTasks(tasks),
      });

      setupBrowserMode({
        ipc: ipcMain,
        userData,
        isAnyBusy: () =>
          (queueCtrl?.stats?.().running ?? 0) > 0 ||
          accounts.isAnyFetching?.() === true ||
          museCtrl?.isAnyLoggingIn() === true ||
          elevenlabsCtrl?.isAnyBusy() === true ||
          voiceCtrl?.isAnyBusy() === true,
        chromeAvailable: () => !!findChrome(),
        log: logUi,
      });

      studioBoardsCtrl = setupStudioBoards({
        ipc: ipcMain,
        userData,
        handles,
        send: sendToRenderer,
        log: logUi,
        windowAlive: () =>
          !!controlWindow && !controlWindow.win.isDestroyed(),
      });

      const mediaEnabled = !(
        TEST_MODE && process.env.FS_FAKE_NO_MEDIA === '1'
      );
      mediaLibCtrl = setupMediaLibrary({
        ipc: ipcMain,
        userData,
        queue: queueCtrl,
        studioBoards: studioBoardsCtrl,
        elements,
        handles,
        send: sendToRenderer,
        log: logUi,
        ffmpegPath: ffmpegPath(),
        register: mediaEnabled,
      });

      installMediaProtocol({
        taskOf: (id) => queueCtrl.taskOf(id),
        handles,
        elementThumb: elements.thumbFor,
        studioMediaFile: studioBoardsCtrl.mediaFileOf,
        libFile: mediaLibCtrl.fileOf,
        libThumb: mediaLibCtrl.thumbFor,
        log: logUi,
      });

      studioBoardsCtrl
        .gc({ keepNames: mediaLibCtrl.keepNames })
        .then(
          (res) =>
            res &&
            res.removed &&
            logUi(
              'Dọn ảnh bàn sáng tạo: xoá ' +
                res.removed +
                ' tệp không còn bàn nào dùng.'
            )
        )
        .catch((err) =>
          logUi('Lỗi khi dọn ảnh bàn sáng tạo: ' + err.message)
        )
        .finally(() => mediaLibCtrl.start());

      clearLegacySessionOnce(userData, logUi);

      const openExternal = (url) =>
        TEST_MODE
          ? event('open-external', { url })
          : shell.openExternal(url);

      let gatePoll;
      // Khởi tạo cổng kích hoạt Viral (Facebook Comment + Share + Nhóm Zalo) độc lập 100%
      authGate = createMdViralGate({
        file: path.join(userData, 'md-viral-gate.json'),
        deviceSeed: buildDeviceSeed(),
        scanner: scanFacebookPostForCode,
        log: logUi,
        onChange: (gateStateView) => {
          sendToRenderer('gate:changed', gateStateView);
          sendToRenderer('auth:changed', authGate.state());
          queueCtrl?.refresh();
          gatePoll?.sync();
        },
      });
      gateGuard.bind(authGate);

      const pollOpts = gatePollOptions({
        testMode: TEST_MODE,
        env: process.env,
      });
      gatePoll = createGatePoll({
        auth: () => authGate,
        visible: () =>
          !!controlWindow &&
          !controlWindow.win.isDestroyed() &&
          (pollOpts.hidden ||
            (controlWindow.win.isVisible() &&
              !controlWindow.win.isMinimized())),
        intervalMs: pollOpts.intervalMs,
        log: logUi,
      });

      setupGateIpc({
        ipc: ipcMain,
        auth: authGate,
        openExternal,
        log: logUi,
      });
      setupAdminIpc({
        ipc: ipcMain,
        auth: authGate,
        borrow: queueCtrl.borrow,
        getAccounts: accounts.get,
      });
      setupSkillsIpc({
        ipc: ipcMain,
        auth: authGate,
        library: queueCtrl.library,
        handles,
        send: sendToRenderer,
        log: logUi,
        allowLoopback: TEST_MODE,
        pickPaths: createSamplePicker({
          control: controlWindow,
          pickTestFile: TEST_MODE ? process.env.FS_PICK_FILE || '' : '',
        }),
      });
      setupTemplatesIpc({
        ipc: ipcMain,
        auth: authGate,
        templates: studioBoardsCtrl.templates,
        log: logUi,
      });
      setupAppIpc({
        control: controlWindow,
        queue: queueCtrl,
        handles,
        auth: authGate,
        version: VERSION,
        log: logUi,
        pickTestFile: TEST_MODE ? process.env.FS_PICK_FILE || '' : '',
        media: mediaEnabled,
      });

      analyzeCtrl = setupAnalyze({
        userData,
        queue: queueCtrl,
        accounts,
        handles,
        elementLibrary: elements.library,
        library: queueCtrl.library,
        control: controlWindow,
        send: sendToRenderer,
        log: logUi,
        pickTestFile: TEST_MODE ? process.env.FS_PICK_FILE || '' : '',
      });

      studioCtrl = setupStudio({
        queue: queueCtrl,
        handles,
        library: queueCtrl.library,
        accounts,
        send: sendToRenderer,
        log: logUi,
        videos: studioBoardsCtrl.videos,
        media: mediaLibCtrl,
      });

      const voiceHistory = createVoiceHistory({
        file: path.join(userData, 'voice-history.json'),
        handles,
        log: logUi,
      });
      const voiceDir = setupVoiceDir({
        ipc: ipcMain,
        file: path.join(userData, 'voice-dir.json'),
        base: () => queueCtrl.library.dir(),
        dialog,
        window: () => BrowserWindow.getFocusedWindow() || undefined,
        openPath: (targetPath) => shell.openPath(targetPath),
        pickTestFile: TEST_MODE ? process.env.FS_PICK_DIR_FILE || '' : '',
        log: logUi,
      });

      voiceCtrl = setupVoice({
        ipc: ipcMain,
        run: createVoiceCapcutRun({
          authed: authGate.authed,
          download: createTtsDownloader({ allowLoopback: TEST_MODE }),
          history: voiceHistory,
          ffmpegPath: findFfmpeg({ isPackaged: app.isPackaged }),
          baseDir: () => queueCtrl.library.dir(),
          saveDir: voiceDir.target,
          tempRoot: path.join(
            app.getPath('temp'),
            'md-motion-voice-' + process.pid
          ),
          send: sendToRenderer,
          handleUrl: (filePath) => 'fs-media://pick/' + handles.add(filePath),
          log: logUi,
        }),
        history: voiceHistory,
        authed: authGate.authed,
        log: logUi,
      });

      setupVoiceGateIpc({
        ipc: ipcMain,
        authed: authGate.authed,
        openExternal,
        send: sendToRenderer,
        log: logUi,
      });

      motionCtrl = setupMotionTab({
        ipc: ipcMain,
        userData,
        queue: queueCtrl,
        accounts,
        handles,
        library: queueCtrl.library,
        ffmpegPath: findFfmpeg({ isPackaged: app.isPackaged }),
        send: sendToRenderer,
        log: logUi,
        choose: async () => {
          if (TEST_MODE && process.env.FS_PICK_FILE) {
            return JSON.parse(
              readFileSync(process.env.FS_PICK_FILE, 'utf8')
            ).slice(0, 1);
          }
          const pickedVideo = await dialog.showOpenDialog(
            controlWindow?.win,
            {
              title: 'Chọn video để Motion control',
              properties: ['openFile'],
              filters: [
                {
                  name: 'Video',
                  extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm'],
                },
              ],
            }
          );
          return pickedVideo.canceled
            ? []
            : pickedVideo.filePaths.slice(0, 1);
        },
        dialog,
        window: () => BrowserWindow.getFocusedWindow() || undefined,
        openPath: (targetPath) => shell.openPath(targetPath),
        pickDirTestFile: TEST_MODE ? process.env.FS_PICK_DIR_FILE || '' : '',
      });

      setupHandoff({
        library: queueCtrl.library,
        auth: authGate,
        notify: (payload) => sendToRenderer('library:handoff', payload),
        openExternal,
        clipboard,
        taskOf: queueCtrl.taskOf,
        log: logUi,
        allowLoopback: TEST_MODE,
      });

      const initialAuth = authGate.init();
      queueCtrl.skillSync(initialAuth);
      diagLog.bind(
        {
          auth: authGate,
          accounts,
          taskOf: queueCtrl.taskOf,
        },
        initialAuth
      );
      gatePoll.sync();

      try {
        const reaped = await chromeHost().reapLeftovers();
        if (reaped) {
          logUi(
            'Đã đóng ' + reaped + ' Chrome còn sót từ lần chạy trước'
          );
        }
      } catch (err) {
        logUi('Không dọn được Chrome còn sót: ' + err.message);
      }

      queueCtrl.start();
      ipcMain.handle('app:relaunch', () => {
        app.relaunch();
        app.exit(0);
        return { ok: true };
      });
      const autoCmdFile = path.join(userData, 'auto-cmd.json');
      const autoResFile = path.join(userData, 'auto-res.json');
      setInterval(async () => {
        if (!existsSync(autoCmdFile) || !controlWindow?.win || controlWindow.win.isDestroyed()) return;
        let cmdObj;
        try {
          cmdObj = JSON.parse(readFileSync(autoCmdFile, 'utf8').replace(/^\uFEFF/, ''));
          unlinkSync(autoCmdFile);
        } catch {
          return;
        }
        try {
          if (cmdObj.action === 'relaunch') {
            writeFileSync(autoResFile, JSON.stringify({ ok: true, ts: Date.now(), out: 'relaunching' }, null, 2));
            app.relaunch();
            app.exit(0);
            return;
          }
          const out = await controlWindow.win.webContents.executeJavaScript(cmdObj.js || 'null', true);
          writeFileSync(autoResFile, JSON.stringify({ ok: true, ts: Date.now(), out }, null, 2));
        } catch (err) {
          writeFileSync(autoResFile, JSON.stringify({ ok: false, ts: Date.now(), error: err.message }, null, 2));
        }
      }, 1500);
      startUpdater({
        enabled: false,
        log: logUi,
        win: () => controlWindow.win,
        queue: queueCtrl,
        prepareQuit,
      });
    })
    .catch((err) =>
      event('start-failed', {
        message: err?.stack || String(err),
      })
    );
}

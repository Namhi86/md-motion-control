import { app, ipcMain } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { hasUsableVeoAccount, setCredits } from '../src/accounts.js';
import { createBatcher } from '../src/change-batcher.js';
import { readMachine } from '../src/machine-memory.js';
import { checkAddPayload } from '../src/queue-input.js';
import { hasMuseSession } from '../src/cookie.js';
import { createMuse } from '../src/muse/client.js';
import { MUSE_CHECK_NOTE, updateCookie } from '../src/muse-accounts.js';
import {
  loadQueueSettings,
  saveQueueSettings,
} from '../src/queue-settings-store.js';
import { perWorkerGb } from '../src/thread-cap.js';
import {
  applyWindowPatch,
  windowSettingsView,
} from '../src/window-permission.js';
import { createScheduler } from '../src/scheduler.js';
import { createTaskStore } from '../src/task-store.js';
import { retryRefusedNote } from '../src/scheduler-platform-notes.js';
import { landed } from '../src/task-landed.js';
import { sweepPartFiles, workerFetcher } from '../src/video-file.js';
import { requestOf } from './task-request.js';
import { online } from './account-login.js';
import { createVerifier, electronPageDeps } from './account-verify.js';
import { logClipCodec } from './clip-codec.js';
import { createAccountActions } from './queue-account-actions.js';
import { effectiveBrowserMode } from './browser-ipc.js';
import { busyStepFromEnv, createDriver } from './driver.js';
import { setupLibrary } from './library.js';
import { findFfmpeg } from './stitch.js';
import { museUaFor } from './muse-login.js';
import { createUseReporter, userKeyOf } from '../src/skill-use-report.js';
import {
  createSkillBodyFetcher,
  sweepSkillTmp,
} from './skill-store-runtime.js';
import { refOffer as defaultRefOffer } from './veo-ref-offer.js';

// Quản lý hàng đợi tác vụ Tạo video & Kiểm tra đăng nhập tài khoản:
// - Khi bấm Đăng nhập / Kiểm tra tài khoản (verifyAccount): hiện trình duyệt (visible: () => true)
// - Khi chạy tạo video / phân tích / kết xuất (createDriver): ẩn toàn bộ trình duyệt (visible: () => false)
const MAX_IDS = 5000;
const MEMORY_CACHE_MS = 2000;

const idsOf = (raw) =>
  (Array.isArray(raw) ? raw : [raw])
    .filter((id) => typeof id === 'string' && id)
    .slice(0, MAX_IDS);

export function setupQueue({
  userData,
  send,
  accounts,
  proxies,
  log,
  resolveHandle = () => null,
  elementLibrary = () => [],
  canRun = () => true,
  canShowWindows = () => true,
  skillSession = () => null,
  refOffer = defaultRefOffer,
  onChanged = () => {},
}) {
  const settingsFile = path.join(userData, 'queue-settings.json');
  const loadedSettings = loadQueueSettings(settingsFile);
  let showWindowsPref = false;
  let scheduler;

  const batcher = createBatcher({
    send: (tasks) => {
      try {
        onChanged(tasks);
      } catch (err) {
        log('Lỗi khi báo thư viện về lệnh đổi: ' + err.message);
      }
      send('queue:changed', tasks);
    },
  });

  const taskStore = createTaskStore(path.join(userData, 'tasks.json'));
  let memCache = { at: 0, value: null };

  const readMachineCached = () => {
    if (!memCache.value || Date.now() - memCache.at > MEMORY_CACHE_MS) {
      memCache = {
        at: Date.now(),
        value: readMachine({
          platform: process.platform,
          info: process.getSystemMemoryInfo?.(),
          osFree: os.freemem(),
          osTotal: os.totalmem(),
        }),
      };
    }
    return memCache.value;
  };

  function persistSettings() {
    try {
      saveQueueSettings(settingsFile, {
        ...scheduler.settings(),
        showWindows: false,
      });
    } catch (err) {
      log('Không lưu được cài đặt hàng đợi: ' + err.message);
    }
  }

  const storeAdapter = {
    get: (id) => scheduler.list().find((t) => t.id === id) ?? null,
    upsert: (task) => scheduler.update(task.id, task),
  };

  const fetchVideo = (task, destPath) => {
    if (!task.accountId) {
      return {
        ok: false,
        reason: 'no_account',
        note: 'Lệnh này chưa chạy trên acc nào nên không lấy lại được.',
      };
    }
    return scheduler.borrow(
      task.accountId,
      async (worker) => {
        let curTask = task;
        if (task.mode === 'veo' && !curTask.result?.url) {
          return {
            ok: false,
            reason: 'no_video',
            note: 'Clip Veo này chưa có địa chỉ trong Flow: mở Google Flow bằng acc Gmail đó để tải tay.',
          };
        }
        if (!curTask.result?.vid && !curTask.result?.url) {
          const req = requestOf(task);
          const found =
            task.mode === 'muse'
              ? await worker.findVideo(curTask.result.convId, [task.prompt], {
                  messageId: curTask.result.messageId,
                  sessionId: curTask.result.sessionId,
                  kind: task.kind,
                  seconds: Number(task.duration),
                })
              : await worker.findVideo(
                  curTask.result.convId,
                  req.ok ? [req.text, req.prompt] : [task.prompt]
                );
          if (
            !found.vid &&
            !found.url &&
            found.reason === 'not_logged_in'
          ) {
            return {
              ok: false,
              reason: 'not_logged_in',
              note: found.note,
            };
          }
          if (!found.vid && !found.url) {
            const note =
              found.note ||
              (found.generating
                ? 'Dola vẫn đang tạo video này: thử lại sau ít phút.'
                : found.limit
                  ? 'Dola báo hết lượt cho lệnh này nên không có video.'
                  : 'Dola chưa có video cho lệnh này (chưa render xong, hoặc đã lỗi).');
            return {
              ok: false,
              reason: 'no_video',
              note,
            };
          }
          curTask = {
            ...curTask,
            result: {
              ...curTask.result,
              ...(found.vid ? { vid: found.vid } : { url: found.url }),
            },
          };
          scheduler.update(curTask.id, { result: curTask.result });
        }
        if (
          curTask.result?.convId &&
          curTask.mode !== 'muse' &&
          curTask.mode !== 'veo'
        ) {
          const loginRes = await worker.login();
          if (!loginRes?.ok) {
            log(
              `Lấy lại video: chưa đăng nhập được acc để đọc chat (${loginRes?.reason || 'lỗi'}).`
            );
          }
        }
        return workerFetcher(curTask, worker, { log })(destPath);
      },
      { shared: task.mode === 'muse' }
    );
  };

  const library = setupLibrary({
    userData,
    notify: (list) => list.forEach(batcher.push),
    store: storeAdapter,
    fetchVideo,
  });

  const hooks = {
    refetchVideo: (task) => library.retrieve(task.id),
    async afterCreate(task, worker, { signal } = {}) {
      const saved = await library.saveVideo(task, worker, { signal, log });
      if (!saved.ok) {
        throw new Error(saved.note || 'không lưu được video');
      }
      if (task.mode === 'pro' && !task.result?.vid && saved.file) {
        await logClipCodec(saved.file, {
          ffmpegPath: findFfmpeg({ isPackaged: app.isPackaged }),
          log: (msg) => log(`Lệnh ${task.id}: ${msg}`),
        });
      }
      return {
        url: saved.url,
        file: saved.file,
        bytes: saved.bytes,
        savedAt: Date.now(),
      };
    },
    async refreshCookie({ id }) {
      const res = await accounts.fetchCookie?.(id);
      if (res && !res.ok && res.note) throw new Error(res.note);
      return res?.ok ? res.cookie : null;
    },
    // Khi người dùng bấm Đăng nhập / Kiểm tra tài khoản: cho phép hiện trình duyệt đăng nhập (visible: () => true)
    verifyAccount: createVerifier({
      getAccount: (id) => accounts.get().find((a) => a.id === id),
      online,
      ...electronPageDeps({
        visible: () => true,
        log,
        userData,
      }),
      createMuse,
      uaFor: museUaFor,
      onMuseCookies: (id, cookie) =>
        accounts.set(updateCookie(accounts.get(), id, cookie)),
    }),
    rotateProxy: ({ id, busyIds }) => proxies.rotationFor(id, busyIds),
    assignProxy: ({ id }) => proxies.proxyFor(id),
    async onProxyFailed({ id, poolId }) {
      if (!online()) return null;
      proxies.markBad(poolId, 'dead', 'Đăng nhập qua proxy này không được');
      const rep = proxies.replacementFor(id);
      if (!rep) return null;
      accounts.set(
        accounts.get().map((a) =>
          a.id === id ? { ...a, proxy: rep.proxy, poolId: rep.poolId } : a
        )
      );
      return { ...rep.proxy, poolId: rep.poolId };
    },
    onSettings: persistSettings,
  };

  const authedCall = async (urlPath, opts) => {
    const sess = skillSession();
    return sess ? sess.authed(urlPath, opts) : { ok: false, reason: 'signed_out' };
  };

  const skillBody = createSkillBodyFetcher({ authed: authedCall });
  const useReporter = createUseReporter({
    authed: authedCall,
    userKey: () => userKeyOf(skillSession()?.state()),
    update: (id, patch) => scheduler.update(id, patch),
    list: () => scheduler.list(),
    log,
  });

  sweepSkillTmp();

  // Khi chạy tạo video / phân tích trong hàng đợi: luôn ẩn toàn bộ trình duyệt (visible: () => false)
  scheduler = createScheduler({
    driver: createDriver({
      log,
      visible: () => false,
      onMuseCookies: (id, cookie) =>
        accounts.set(updateCookie(accounts.get(), id, cookie)),
      onCredits: (id, credits, note) =>
        accounts.set(setCredits(accounts.get(), id, credits, Date.now(), note)),
      skillBody,
    }),
    store: taskStore,
    getAccounts: accounts.get,
    setAccounts: accounts.set,
    hooks,
    machine: readMachineCached,
    settings: loadedSettings.settings,
    log,
    canRun,
    onTask: (task) => {
      batcher.push(task);
      useReporter.onTask(task);
    },
    onRemove: batcher.remove,
    onStats: (st) => send('queue:stats', st),
    busyStepMs: busyStepFromEnv(),
    perWorkerGb: () => perWorkerGb(effectiveBrowserMode()),
  });

  for (const dir of new Set(
    scheduler
      .list()
      .map((t) => t.saveDir)
      .filter(Boolean)
  )) {
    sweepPartFiles(dir);
  }

  const safeHandle =
    (fn) =>
    async (_evt, ...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        log('Lỗi ở kênh hàng đợi: ' + err.message);
        return { ok: false, reason: 'failed', note: err.message };
      }
    };

  const getSettingsView = () => ({
    ...scheduler.settings(),
    ...windowSettingsView({
      stored: false,
      allowed: false,
    }),
    loginWindows: true,
  });

  const addTasks = async (payload) => {
    const checked = checkAddPayload(payload, {
      resolve: resolveHandle,
      library: elementLibrary(),
      refInspect: await refOffer.inspectIfReady(),
    });
    if (!checked.ok) return checked;
    if (
      checked.tasks.some((t) => t.mode === 'veo') &&
      !hasUsableVeoAccount(accounts.get())
    ) {
      return {
        ok: false,
        reason: 'bad_task',
        note: 'Veo cần ít nhất một acc Gmail của Veo (tab Veo ở Setup tài khoản).',
      };
    }
    if (
      checked.tasks.some((t) => t.mode === 'muse') &&
      !accounts
        .get()
        .some(
          (a) =>
            a.type === 'muse' &&
            a.enabled !== false &&
            a.status !== 'dead' &&
            hasMuseSession(a.cookie) &&
            a.note !== MUSE_CHECK_NOTE
        )
    ) {
      return {
        ok: false,
        reason: 'bad_task',
        note: 'Muse cần ít nhất một acc Muse đã đăng nhập xong (thêm bằng thẻ "Muse · email" hoặc "Muse · cookie" ở Setup tài khoản; acc đang chờ mã hoặc cookie hỏng thì chưa dùng được).',
      };
    }
    const userKey = userKeyOf(skillSession()?.state());
    if (checked.tasks.some((t) => t.skillId) && !userKey) {
      return {
        ok: false,
        reason: 'bad_task',
        note: 'Cần đăng nhập MD Motion Control để dùng skill từ Kho.',
      };
    }
    try {
      const saveDir = library.dir();
      return {
        ok: true,
        ids: scheduler
          .add(
            checked.tasks.map((t) => ({
              ...t,
              saveDir,
              ...(t.skillId ? { skillUser: userKey } : {}),
            }))
          )
          .map((t) => t.id),
      };
    } catch (err) {
      return { ok: false, reason: 'bad_task', note: err.message };
    }
  };

  ipcMain.handle('queue:add', safeHandle(addTasks));
  ipcMain.handle('queue:list', () => scheduler.list());
  ipcMain.handle('queue:pause', () => {
    scheduler.pause();
    return { ok: true };
  });
  ipcMain.handle('queue:resume', () => {
    scheduler.resume();
    return { ok: true };
  });
  ipcMain.handle(
    'queue:cancel',
    safeHandle((ids) => ({ ok: true, ids: scheduler.cancel(idsOf(ids)) }))
  );
  ipcMain.handle(
    'queue:retry',
    safeHandle((ids) => {
      const cleanIds = idsOf(ids);
      const byId = new Map(scheduler.list().map((t) => [t.id, t]));
      const alreadyAtDola = cleanIds.filter(
        (id) =>
          byId.has(id) &&
          landed(byId.get(id)) &&
          ['failed', 'interrupted', 'cancelled'].includes(byId.get(id).status)
      );
      const retried = scheduler.retry(cleanIds);
      if (!alreadyAtDola.length) return { ok: true, ids: retried };
      const note = retryRefusedNote(
        alreadyAtDola.map((id) => byId.get(id).mode)
      );
      return {
        ok: retried.length > 0,
        ids: retried,
        refused: alreadyAtDola,
        reason: 'already_at_dola',
        note,
      };
    })
  );
  ipcMain.handle(
    'queue:remove',
    safeHandle((ids) => ({ ok: true, ids: scheduler.remove(idsOf(ids)) }))
  );
  ipcMain.handle(
    'queue:clearFinished',
    safeHandle(() => ({ ok: true, ids: scheduler.clearFinished() }))
  );
  ipcMain.handle('queue:settings', () => getSettingsView());
  ipcMain.handle('queue:setSettings', (_evt, patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError('Cài đặt phải là một đối tượng');
    }
    const { showWindows, loginWindows, ...rest } = patch;
    const winPatch = applyWindowPatch(
      showWindowsPref,
      { showWindows: false, loginWindows },
      canShowWindows()
    );
    if (Object.keys(rest).length) scheduler.setSettings(rest);
    if (winPatch.changed) {
      showWindowsPref = false;
      persistSettings();
    }
    return getSettingsView();
  });
  ipcMain.handle('queue:stats', () => scheduler.stats());

  const accActions = createAccountActions({
    scheduler,
    accounts,
    log,
  });
  ipcMain.handle('queue:readCredits', safeHandle(accActions.readCredits));
  ipcMain.handle(
    'queue:resetAccount',
    safeHandle((id) =>
      typeof id === 'string'
        ? scheduler.resetAccount(id)
        : { ok: false, reason: 'bad_args', note: 'Không rõ acc cần đặt lại.' }
    )
  );
  ipcMain.handle('queue:checkAccount', safeHandle(accActions.check));

  let pausedBeforeUpdate = null;
  const RETRIEVE_RETRY_MS = 20000;
  const RETRIEVE_MAX_TRIES = 15;
  let stopping = false;
  const retrievedIds = new Set();

  async function autoRetrieveInterrupted() {
    const pending = scheduler
      .list()
      .filter(
        (t) =>
          t.status === 'interrupted' &&
          !t.result?.file &&
          (t.result?.vid || t.result?.convId) &&
          !retrievedIds.has(t.id)
      );
    for (const task of pending) {
      retrievedIds.add(task.id);
      for (let i = 0; i < RETRIEVE_MAX_TRIES && !stopping; i += 1) {
        const res = await library.retrieve(task.id);
        if (res.ok) {
          log(`Tự lấy lại video của lệnh ${task.id}: xong`);
          break;
        }
        if (!['busy', 'stopped', 'gate_locked'].includes(res.reason)) {
          log(
            `Tự lấy lại video của lệnh ${task.id} chưa được: ${res.note || res.reason}`
          );
          break;
        }
        await new Promise((r) => setTimeout(r, RETRIEVE_RETRY_MS));
      }
    }
  }

  return {
    start: () => {
      const started = scheduler.start();
      autoRetrieveInterrupted().catch((err) =>
        log('Tự lấy lại video lỗi: ' + err.message)
      );
      return started;
    },
    refresh: () => scheduler.refresh(),
    add: async (payload) => {
      try {
        return await addTasks(payload);
      } catch (err) {
        log('Lỗi ở kênh hàng đợi: ' + err.message);
        return { ok: false, reason: 'failed', note: err.message };
      }
    },
    cancel: (ids) => scheduler.cancel(idsOf(ids)),
    skillSync: (state) => useReporter.sync(state),
    isBusy: (id) => scheduler.isBusy(id),
    borrow: (id, fn) => scheduler.borrow(id, fn),
    settings: getSettingsView,
    taskOf: (id) => storeAdapter.get(id),
    tasks: () => scheduler.list(),
    stats: () => scheduler.stats(),
    pause: () => scheduler.pause(),
    holdForUpdate() {
      pausedBeforeUpdate ??= scheduler.settings().paused;
      scheduler.pause();
    },
    async stop() {
      stopping = true;
      useReporter.stop();
      await scheduler.stop();
      if (pausedBeforeUpdate === false) scheduler.resume();
      batcher.flush();
      if (!taskStore.flush()) {
        log('Không ghi được tệp lệnh (tasks.json) khi tắt app.');
      }
    },
    library,
  };
}

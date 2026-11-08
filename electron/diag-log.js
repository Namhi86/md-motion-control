/**
 * Bộ thu thập và quản lý nhật ký chẩn đoán (Diagnostic Log) cục bộ.
 * Đã vô hiệu hóa hoàn toàn việc gửi HTTP log về máy chủ từ xa — chỉ lưu cục bộ
 * trong bộ nhớ và tệp hàng đợi nội bộ, tuyệt đối không gọi mạng ra ngoài.
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { diagEvent, kindOfTask, makeEvent } from "../src/diag-event.js";
import { createDiagQueue, diagOptions } from "../src/diag-queue.js";
import { writePrivate } from "../src/write-private.js";

const SALT_FILE = "diag-salt";
const QUEUE_FILE = "diag-queue.json";
const FRESH_MS = 120_000;
const SEEN_MAX = 2000;

const ERROR_NAMES = new Set([
  "error",
  "typeerror",
  "rangeerror",
  "referenceerror",
  "syntaxerror",
  "evalerror",
  "urierror",
  "aggregateerror",
]);

const CODE_SHAPE = /^(?:E[A-Z0-9]{2,20}|ERR_[A-Z0-9_]{3,50})$/;
const REASON_SHAPE = /^[a-z][a-z0-9_]{1,39}$/;

const lowerToken = (val) =>
  String(val)
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/g, "")
    .slice(0, 40);

/**
 * Khởi tạo bộ ghi log chẩn đoán cục bộ (không gửi HTTP ra ngoài).
 * @param {object} options
 * @param {string} options.userData - Thư mục lưu dữ liệu người dùng.
 * @param {string} options.version - Phiên bản ứng dụng.
 * @param {string} [options.platform]
 * @param {string} [options.arch]
 * @param {boolean} [options.testMode]
 * @param {object} [options.env]
 * @param {NodeJS.Process} [options.proc]
 * @param {() => number} [options.now]
 * @param {object} [options.queueOptions]
 */
export function setupDiagLog({
  userData,
  version,
  platform = process.platform,
  arch = process.arch,
  testMode = false,
  env = {},
  proc = process,
  now = Date.now,
  queueOptions = {},
} = {}) {
  const options = diagOptions({ testMode, env });
  const startedAt = now();
  const refs = {
    auth: null,
    accounts: null,
    taskOf: null,
  };

  const osTag =
    `${platform}-${arch}`
      .replace(/[^a-z0-9._-]/gi, "")
      .toLowerCase()
      .slice(0, 40) || "unknown";

  let cachedSalt = "";
  let appStartLogged = false;
  let lastUnlockedState;
  const seenTasks = new Map();
  const memoryLog = [];

  /**
   * Đọc hoặc khởi tạo chuỗi salt 32 ký tự hex lưu trong thư mục userData.
   */
  function getSalt() {
    if (cachedSalt) return cachedSalt;
    const saltPath = path.join(userData, SALT_FILE);
    try {
      mkdirSync(userData, { recursive: true });
    } catch {}
    try {
      const existing = readFileSync(saltPath, "utf8").trim();
      if (/^[0-9a-f]{32}$/.test(existing)) {
        cachedSalt = existing;
        return cachedSalt;
      }
    } catch {}
    cachedSalt = randomBytes(16).toString("hex");
    try {
      writePrivate(saltPath, cachedSalt);
    } catch {}
    return cachedSalt;
  }

  /**
   * Tra cứu thông tin tài khoản hoặc loại tác vụ từ ID ngắn trong log.
   */
  function lookupEntity(shortId) {
    try {
      const matchedAccount = refs.accounts
        ?.get?.()
        .find((acc) => String(acc.id).toLowerCase() === shortId);
      if (matchedAccount) {
        return { account: String(matchedAccount.id) };
      }
      const matchedTask = refs.taskOf?.(shortId);
      if (matchedTask) {
        return {
          account: typeof matchedTask.accountId === "string" ? matchedTask.accountId : "",
          kind: kindOfTask(matchedTask),
        };
      }
    } catch {}
    return null;
  }

  const getContext = () => ({
    version,
    os: osTag,
    salt: getSalt(),
    now,
    lookup: lookupEntity,
  });

  /**
   * Hàm xử lý lô sự kiện hoàn toàn cục bộ, tuyệt đối không gửi HTTP về máy chủ từ xa.
   */
  const sendLocalOnly = async (lines) => {
    const list = Array.isArray(lines) ? lines : [];
    for (const item of list) {
      memoryLog.push(item);
      if (memoryLog.length > SEEN_MAX) {
        memoryLog.shift();
      }
    }
    return {
      ok: true,
      data: {
        accepted: list.length,
        dropped: 0,
      },
    };
  };

  const queue = createDiagQueue({
    send: sendLocalOnly,
    file: path.join(userData, QUEUE_FILE),
    now,
    flushMs: options.flushMs,
    backoffMs: options.backoffMs,
    ...queueOptions,
  });

  const safeRun = (fn) => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  };

  const canRecord = () => options.enabled && queue.isActive();

  const recordEvent = (spec) => {
    if (!canRecord()) return;
    safeRun(() => {
      const evt = makeEvent(spec, getContext());
      if (evt) queue.push(evt);
    });
  };

  const api = {
    push(rawMessage) {
      if (!canRecord()) return;
      safeRun(() => {
        const evt = diagEvent(rawMessage, getContext());
        if (evt) queue.push(evt);
      });
    },

    event: recordEvent,

    bind({ auth, accounts, taskOf } = {}, initialAuth) {
      Object.assign(refs, { auth, accounts, taskOf });
      if (initialAuth) {
        api.onAuth(initialAuth);
      }
    },

    onAuth(authState) {
      if (!options.enabled || !authState || typeof authState !== "object") return;
      safeRun(() => {
        if (authState.status === "signed-in") {
          if (!queue.isActive()) {
            queue.start();
            if (!appStartLogged) {
              appStartLogged = true;
              recordEvent({
                code: "app_start",
                level: "info",
                ts: startedAt,
              });
            }
          }
          if (typeof authState.unlocked === "boolean") {
            const shouldLogGate =
              lastUnlockedState !== undefined
                ? lastUnlockedState !== authState.unlocked
                : authState.unlocked === false;
            if (shouldLogGate) {
              recordEvent({
                code: authState.unlocked ? "gate_unlocked" : "gate_locked",
                level: authState.unlocked ? "info" : "warn",
              });
            }
            lastUnlockedState = authState.unlocked;
          }
        } else if (authState.status === "signed-out" || authState.status === "pending") {
          queue.clear();
          lastUnlockedState = undefined;
          seenTasks.clear();
        }
      });
    },

    onTasks(tasks) {
      if (!canRecord() || !Array.isArray(tasks)) return;
      safeRun(() => {
        for (const task of tasks) {
          if (!task || typeof task !== "object" || task.removed || typeof task.id !== "string") {
            continue;
          }
          const prevStatus = seenTasks.get(task.id);
          seenTasks.set(task.id, task.status);
          if (seenTasks.size > SEEN_MAX) {
            seenTasks.delete(seenTasks.keys().next().value);
          }
          const isFinished = task.status === "done" || task.status === "failed";
          if (
            !isFinished ||
            prevStatus === task.status ||
            !(Math.abs(now() - Number(task.finishedAt)) < FRESH_MS)
          ) {
            continue;
          }
          const elapsedMs = Number(task.finishedAt) - Number(task.startedAt);
          const extra = {};
          if (
            Number.isSafeInteger(task.attempts) &&
            task.attempts >= 0 &&
            task.attempts <= 999
          ) {
            extra.attempt = task.attempts;
          }
          if (
            Number.isSafeInteger(elapsedMs) &&
            elapsedMs >= 0 &&
            elapsedMs <= 999_999_999
          ) {
            extra.ms = elapsedMs;
          }
          const errReason = typeof task.error?.reason === "string" ? task.error.reason : "";
          recordEvent({
            code: task.status === "done" ? "task_done" : "task_failed",
            level: task.status === "done" ? "info" : "error",
            kind: kindOfTask(task),
            step:
              task.status === "failed"
                ? REASON_SHAPE.test(errReason)
                  ? errReason
                  : "other"
                : undefined,
            account:
              typeof task.accountId === "string" && task.accountId
                ? task.accountId
                : undefined,
            extra: Object.keys(extra).length ? extra : undefined,
          });
        }
      });
    },

    tapSend: (sendFn) => (channel, payload) => {
      if (channel === "queue:changed") {
        api.onTasks(payload);
      }
      return sendFn(channel, payload);
    },

    crash(err) {
      if (!canRecord()) return;
      safeRun(() => {
        const errName = lowerToken(err?.name ?? "");
        const errCode =
          typeof err?.code === "string" && CODE_SHAPE.test(err.code)
            ? lowerToken(err.code)
            : "";
        recordEvent({
          code: "uncaught_error",
          level: "error",
          step: errCode || (ERROR_NAMES.has(errName) ? errName : "error"),
        });
        queue.flushToDisk();
      });
    },

    quit() {
      if (!canRecord()) return;
      safeRun(() => {
        recordEvent({
          code: "app_quit",
          level: "info",
        });
        queue.stop();
      });
    },

    flush: () => queue.flush(),
    stats: () => queue.stats(),
    entries: () => [...memoryLog],
    queue,
  };

  if (options.enabled) {
    proc?.on?.("uncaughtExceptionMonitor", (err) => api.crash(err));
  }

  return api;
}

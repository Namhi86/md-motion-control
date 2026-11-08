/**
 * Tự động thử lại khi Google Flow báo lỗi tạm thời "We noticed some unusual activity"
 * (do reCAPTCHA v3 đánh giá phiên thấp điểm). Google sẽ tự động hoàn lại credit cho lượt bị từ chối này.
 */

import { isUnusualActivity, PAGE_RETRY_REST_MS, randomMs, waitMs } from "./flow-pacing.js";

export const MAX_UNUSUAL_RETRIES = 3;

export function shouldRetryUnusual({
  text,
  attempt = 0,
  maxRetries = MAX_UNUSUAL_RETRIES,
}) {
  if (!isUnusualActivity(text)) return false;
  if (!Number.isInteger(attempt) || attempt < 0 || attempt >= maxRetries) {
    return false;
  }
  return true;
}

const strip = ({ cardText, ...rest }) => rest;
const tell = (fn, ...args) => {
  try {
    fn?.(...args);
  } catch {}
};

export async function retryUnusual({
  run,
  creditsNow,
  left,
  signal,
  log = () => {},
  onCredits,
  rnd = Math.random,
  sleep = waitMs,
  maxRetries = MAX_UNUSUAL_RETRIES,
  waitMs: customWaitMs,
}) {
  const [minWait, maxWait] = Array.isArray(customWaitMs)
    ? customWaitMs
    : PAGE_RETRY_REST_MS;
  const cancelledRes = { ok: false, reason: "cancelled" };
  let currentCredits = left;
  let lastFail = null;

  for (let attempt = 0; ; attempt += 1) {
    const res = await run(currentCredits);
    if (res.ok || res.reason === "cancelled") {
      return res;
    }
    if (!res.cardText) {
      if (!lastFail || res.convId) return strip(res);
      log(
        `Thử lại sau "unusual activity" chưa gửi được lần nào (${res.reason}): giữ kết quả lỗi trước, lệnh dừng`
      );
      return lastFail;
    }

    const cleaned = strip(res);
    lastFail = cleaned;

    if (!isUnusualActivity(res.cardText)) {
      return cleaned;
    }

    const activeMaxRetries = Math.max(maxRetries, MAX_UNUSUAL_RETRIES);
    if (
      !shouldRetryUnusual({
        text: res.cardText,
        attempt,
        maxRetries: activeMaxRetries,
      })
    ) {
      log(
        `Flow báo "unusual activity": đã thử lại tối đa (${attempt}/${activeMaxRetries} lần), lệnh dừng`
      );
      return cleaned;
    }

    const pauseMs = randomMs(minWait, maxWait, rnd);
    log(
      `Flow báo "unusual activity": tự động nghỉ ${Math.round(pauseMs / 1000)} giây để làm mới token bảo mật rồi thử lại lần ${attempt + 1}/${activeMaxRetries}...`
    );
    await sleep(pauseMs, signal);
    if (signal?.aborted) return cancelledRes;

    const afterCredits = await creditsNow?.();
    if (signal?.aborted) return cancelledRes;
    if (Number.isFinite(afterCredits)) {
      tell(onCredits, afterCredits);
      currentCredits = afterCredits;
    }
  }
}

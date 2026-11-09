/**
 * Điều nhịp thao tác trên trang Google Flow (tối ưu tốc độ phản hồi nhanh,
 * không làm nghẽn hàng đợi giữa các bước thao tác DOM).
 */

export const PACE_MS = [180, 420];
export const PAGE_RETRY_REST_MS = [2000, 4500];

export const isUnusualActivity = (text) =>
  /unusual activity/i.test(String(text ?? ''));

export function randomMs(minMs, maxMs, rnd = Math.random) {
  const low = Math.max(0, Number(minMs) || 0);
  const high = Math.max(low, Number(maxMs) || 0);
  return Math.round(low + rnd() * (high - low));
}

export function waitMs(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted || !(ms > 0)) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

export function makePacer({
  paceMs,
  signal,
  rnd = Math.random,
  sleep = waitMs,
} = {}) {
  const [low, high] = Array.isArray(paceMs) ? paceMs : PACE_MS;
  return async () => {
    if (signal?.aborted) return true;
    await sleep(randomMs(low, high, rnd), signal);
    return Boolean(signal?.aborted);
  };
}

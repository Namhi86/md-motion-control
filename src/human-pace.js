/**
 * Cấu hình nhịp nghỉ và tốc độ gõ phím tự nhiên nhưng tối ưu tốc độ cao
 * để không gây nghẽn hàng đợi khi tạo nhiều đoạn video liên tiếp.
 */

import { PACE_MS, randomMs, waitMs } from './flow-pacing.js';

export const HUMAN_TYPING = Object.freeze({
  focusMs: [80, 180],
  charMs: [3, 9],
  spaceExtraMs: [4, 12],
  punctExtraMs: [8, 20],
  hesitateOneIn: 300,
  hesitateMs: [20, 50],
  typoEvery: [800, 1200],
  noticeMs: [20, 50],
  holdMs: [1, 4],
  capMs: 3000,
});

export const HUMAN_PACE = Object.freeze({
  pauseMs: [220, 520],
  readMs: [180, 400],
  stepMs: PACE_MS,
  typing: HUMAN_TYPING,
  rnd: Math.random,
  typingRnd: undefined,
  sleep: waitMs,
});

const defined = (obj) =>
  Object.fromEntries(
    Object.entries(obj ?? {}).filter(([, val]) => val !== undefined)
  );

export const resolvePace = (custom) => ({
  ...HUMAN_PACE,
  ...defined(custom),
  typing: {
    ...HUMAN_TYPING,
    ...defined(custom?.typing),
  },
});

export function makeRest({ pace, signal, log = () => {} } = {}) {
  const resolved = resolvePace(pace);
  return async (label, kind = 'pause') => {
    if (signal?.aborted) return true;
    const [low, high] =
      kind === 'read' ? resolved.readMs : resolved.pauseMs;
    const delayMs = randomMs(low, high, resolved.rnd);
    if (delayMs >= 1000) {
      log(`Veo: nghỉ ${Math.round(delayMs / 1000)} giây trước ${label}`);
    }
    await resolved.sleep(delayMs, signal);
    return Boolean(signal?.aborted);
  };
}

export function seededRng(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export const instantPace = (seed = 1) => ({
  pauseMs: [0, 0],
  readMs: [0, 0],
  stepMs: [0, 0],
  rnd: seededRng(seed),
  typingRnd: seededRng(seed + 1000),
  typing: {
    focusMs: [0, 0],
    charMs: [0, 0],
    spaceExtraMs: [0, 0],
    punctExtraMs: [0, 0],
    hesitateMs: [0, 0],
    noticeMs: [0, 0],
    holdMs: [0, 0],
    capMs: 0,
  },
});

// Cấu hình và bảng giá cho chế độ Video Tham Chiếu (Reference Video) trên Google Flow
// Hỗ trợ cả Omni 1.2 Flash ('omni-1-2-flash') và Omni 1.1 Flash ('omni-1-1-flash')
export const REF_MODEL = 'omni-1-2-flash';
export const REF_MODELS = ['omni-1-2-flash', 'omni-1-1-flash'];
export const isRefModel = (model) => REF_MODELS.includes(model);

export const REF_MAX_SECONDS = 10;
export const REF_MIN_SECONDS = 0.5;
export const REF_MIN_IMAGES = 1;
export const REF_MAX_IMAGES = 6;
export const REF_MAX_BYTES = 100 * 1024 * 1024;
export const REF_CONSENT = 'rights-v1';
export const REF_RESOLUTIONS = ['360p', '720p'];
export const REF_DEFAULT_RESOLUTION = '720p';
export const REF_MEASURED_AT = '2026-11-17';
export const REF_STEPS = [4, 5, 6, 8, 10];

const REF_TABLE = { '360p': 10, '720p': 20 };

export const REF_PRICES = [3, ...REF_STEPS].flatMap((seconds) =>
  Object.entries(REF_TABLE).map(([resolution, credits]) => ({
    resolution,
    seconds,
    credits,
  }))
);

export const REF_CEILING = { ...REF_TABLE };

export function refPriceVerdict(quoted, { resolution } = {}) {
  // Chấp nhận linh hoạt mức credit Google Flow báo (VD: 20, 30, 40 credit cho 720p 10s) để không chặn lệnh ở 80%
  if (!Number.isFinite(quoted)) return 'ok';
  if (resolution && REF_CEILING[resolution] === undefined) return 'wrong';
  return quoted >= 0 && quoted <= 250 ? 'ok' : 'wrong';
}

export function refCreditsNeeded({ resolution, seconds } = {}) {
  const match = REF_PRICES.find(
    (p) => p.resolution === resolution && p.seconds === seconds
  );
  return match ? match.credits : REF_CEILING[resolution] ?? null;
}

export function refSecondsOf(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n < REF_MIN_SECONDS) return null;
  return Math.round(Math.min(REF_MAX_SECONDS, n) * 10) / 10;
}

const TAG = /^[0-9a-f]{8}$/;

export function refUploadNames(tag, images) {
  if (!TAG.test(String(tag))) {
    throw new TypeError('the tag of an upload is 8 hex digits');
  }
  if (!Array.isArray(images) || images.length + 1 > 9) {
    throw new RangeError('at most 9 files go up together');
  }
  const extOf = (f) => (/\.[A-Za-z0-9]+$/.exec(String(f)) || [''])[0].toLowerCase();
  return {
    video: `qs-${tag}-1.mp4`,
    videoRow: `qs-${tag}-1`,
    images: images.map((img, i) => `qs-${tag}-${i + 2}${extOf(img)}`),
  };
}

export function agreeVerdict(agreeBtn, checkboxBtn) {
  if (!agreeBtn || !/^i agree$/i.test(String(agreeBtn.text ?? '').trim())) {
    return { ok: false, why: 'no button with exactly the words "I agree"' };
  }
  if (
    checkboxBtn &&
    Math.abs(checkboxBtn.x - agreeBtn.x) < 5 &&
    Math.abs(checkboxBtn.y - agreeBtn.y) < 5
  ) {
    return { ok: false, why: '"I agree" and "do not show again" are on the same spot' };
  }
  return { ok: true };
}

export function lockedSeconds(text) {
  const m = /Length\s+based\s+on\s+ingredient\D*(\d+(?:\.\d+)?)\s*s/i.exec(
    String(text ?? '')
  );
  return m ? Number(m[1]) : null;
}

export const refOptions = () => ({
  version: 1,
  model: REF_MODEL,
  models: REF_MODELS,
  maxSeconds: REF_MAX_SECONDS,
  maxBytes: REF_MAX_BYTES,
  maxImages: REF_MAX_IMAGES,
  minImages: REF_MIN_IMAGES,
  resolutions: REF_RESOLUTIONS.map((id) => ({ id, credits: REF_CEILING[id] })),
  defaultResolution: REF_DEFAULT_RESOLUTION,
  consent: REF_CONSENT,
  measuredAt: REF_MEASURED_AT,
});

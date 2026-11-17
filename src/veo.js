import { rewriteMentions } from './mention-rewrite.js';

// Bảng giá credit trên Google Flow cho dòng model Omni Flash (1.1 & 1.2)
const OMNI_PRICES = {
  '720p': { 4: 7, 6: 10, 8: 12, 10: 15 },
  '360p': { 4: 4, 6: 5, 8: 6, 10: 7 },
};

const withPrices = (spec, prices) => {
  const resolutions = Object.keys(prices);
  return {
    ...spec,
    credits: prices['720p'][8],
    durations: Object.keys(prices[resolutions[0]]).map(Number),
    resolutions,
    prices,
  };
};

// Danh sách các model tạo video trên Google Flow (Veo & Omni Flash)
export const VEO_MODELS = [
  withPrices(
    {
      id: 'omni-1-2-flash',
      label: 'Omni 1.2 Flash',
      menu: 'Omni 1.2 Flash',
      maxImages: 7,
      desc: 'Bản nâng cấp mới nhất trên Google Flow (chuyển động mượt hơn, 12 credit Flow mỗi clip 8s)',
    },
    OMNI_PRICES
  ),
  withPrices(
    {
      id: 'omni-1-1-flash',
      label: 'Omni 1.1 Flash',
      menu: 'Omni 1.1 Flash',
      maxImages: 7,
      desc: 'Model mới thay Veo 3.1 (12 credit Flow mỗi clip)',
    },
    OMNI_PRICES
  ),
  withPrices(
    {
      id: 'veo-3-1-lite',
      label: 'Veo 3.1 Lite',
      menu: 'Veo 3.1 - Lite',
      maxImages: 3,
      desc: 'Rẻ nhất (10 credit Flow mỗi clip), có tiếng, nhãn "Veo" ở góc',
    },
    { '720p': { 8: 10 } }
  ),
  withPrices(
    {
      id: 'veo-3-1-fast',
      label: 'Veo 3.1 Fast',
      menu: 'Veo 3.1 - Fast',
      maxImages: 3,
      desc: 'Nhanh hơn Lite (20 credit Flow mỗi clip)',
    },
    { '720p': { 8: 20 } }
  ),
  withPrices(
    {
      id: 'veo-3-1-quality',
      label: 'Veo 3.1 Quality',
      menu: 'Veo 3.1 - Quality',
      maxImages: 3,
      desc: 'Đẹp nhất nhưng 100 credit Flow mỗi clip: cả ngày chỉ được vài clip',
    },
    { '720p': { 8: 100 } }
  ),
];

export const DEFAULT_VEO_MODEL = VEO_MODELS[0].id;
export const VEO_RATIOS = ['9:16', '16:9'];
export const VEO_DURATIONS = [...new Set(VEO_MODELS.flatMap((m) => m.durations))].sort((a, b) => a - b);
export const VEO_DURATION = {
  min: VEO_DURATIONS[0],
  max: VEO_DURATIONS[VEO_DURATIONS.length - 1],
  def: 8,
};

export const isVeoModel = (id) => VEO_MODELS.some((m) => m.id === id);
export const isOmniModel = (id) => id === 'omni-1-2-flash' || id === 'omni-1-1-flash';
export const veoModelOf = (id) => VEO_MODELS.find((m) => m.id === id) || VEO_MODELS[0];
export const veoImageLimit = (id) => veoModelOf(id).maxImages;

export function veoImageLimitNote(modelId, count = 0) {
  const model = veoModelOf(modelId);
  const isOmni = isOmniModel(model.id);
  const extra = count ? `; lệnh này có ${count} ảnh` : '';
  return isOmni
    ? `${model.label} nhận tối đa ${veoImageLimit(modelId)} ảnh tham chiếu mỗi lệnh (Veo 3.1: ${veoImageLimit('veo-3-1-lite')})${extra}`
    : `Veo 3.1 nhận tối đa ${veoImageLimit(modelId)} ảnh tham chiếu mỗi lệnh (Omni 1.2 Flash: ${veoImageLimit('omni-1-2-flash')})${extra}`;
}

export const veoUploadNames = (files, tag) =>
  files.map(
    (f, idx) =>
      `qs-${tag}-${idx + 1}${(/\.[A-Za-z0-9]+$/.exec(String(f)) || [''])[0].toLowerCase()}`
  );

export const veoPromptOf = (task) =>
  rewriteMentions(String(task?.prompt ?? '').trim(), task?.elements);

export function veoPriceOf(model, { resolution, seconds } = {}) {
  return (
    model.prices[resolution ?? model.resolutions[0]]?.[seconds ?? VEO_DURATION.def] ?? null
  );
}

export function plainResolution(task) {
  if (!task || task.mode !== 'veo' || task.kind === 'image' || task.refVideo !== undefined) {
    return undefined;
  }
  const model = VEO_MODELS.find((m) => m.id === task.model);
  return model && model.resolutions.length > 1 && model.resolutions.includes(task.resolution)
    ? task.resolution
    : undefined;
}

export function veoSettings({ model, ratio, duration, resolution } = {}) {
  const m = veoModelOf(model);
  const want = Number(duration) || VEO_DURATION.def;
  const seconds = m.durations.reduce(
    (best, d) =>
      Math.abs(d - want) < Math.abs(best - want) ||
      (Math.abs(d - want) === Math.abs(best - want) && d > best)
        ? d
        : best,
    m.durations[0]
  );
  const res =
    m.resolutions.length > 1
      ? m.resolutions.includes(resolution)
        ? resolution
        : m.resolutions[0]
      : null;
  return {
    model: m,
    ratio: VEO_RATIOS.includes(ratio) ? ratio : VEO_RATIOS[0],
    seconds,
    resolution: res,
    credits: veoPriceOf(m, { resolution: res, seconds }),
  };
}

export function veoPriceVerdict(quoted, model, opts) {
  // Chấp nhận linh hoạt bảng giá credit mới của Google Flow (VD: 15, 20, 30 credit)
  if (!Number.isFinite(quoted)) return 'ok';
  return quoted >= 0 && quoted <= 250 ? 'ok' : 'wrong';
}

export const OUT_OF_CREDITS =
  /(not enough|insufficient|run out of|out of|(?:don'?t|do not|does not|doesn'?t) have enough|no more|no remaining)\s+(flow\s+)?credits|credits?\s+(are|is)\s+(used up|exhausted)/i;
const REFUSED = /third-party|content provider|policy|safety|sensitive|violat/i;

export const tileState = (text) =>
  /\bFailed\b/.test(text || '')
    ? 'failed'
    : /play_circle/.test(text || '')
      ? 'done'
      : 'working';

export function failureReason(text) {
  if (REFUSED.test(text || '')) return 'veo_content_refused';
  if (OUT_OF_CREDITS.test(text || '')) return 'veo_no_credits';
  return 'veo_failed';
}

export const clipUrl = (projectId, clipId) => `flow-clip://${projectId}/${clipId}`;

export function parseClipUrl(url) {
  const m = /^flow-clip:\/\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i.exec(String(url || ''));
  return m ? { projectId: m[1], clipId: m[2] } : null;
}

export function idsOfPage(url) {
  const m = /\/project\/([0-9a-f-]{36})\/edit\/([0-9a-f-]{36})/i.exec(String(url || ''));
  return m ? { projectId: m[1], clipId: m[2] } : null;
}

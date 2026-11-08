import { MODE_LABEL, fitTarget } from './analyze-form.js';
import { SEEDANCE_MODES } from './model-groups.js';
import { t } from './i18n.js';
import { nearestLength, offersLengths, veoModelIn } from './veo-durations.js';

// The rules behind the "Tạo video bằng" block of the "Phân tích video" tab (analyze-target-ui.js draws it), pure (no DOM, no Electron):
// tests/analyze-target.test.js tests them. The block is the "Tạo video" form's Model row and three pills, so the lists they offer (ratios, lengths,
// models) are read from window.dola.options() per mode exactly as app.js reads them for the form; `limits` is what analyze.info() reports.
const FALLBACK_RATIOS = ['9:16', '16:9'];
const FALLBACK_RANGE = { min: 5, max: 15 };
const finite = (r) => !!r && Number.isFinite(r.min) && Number.isFinite(r.max);

// The ratios the mode can make: Veo and Muse have their own list, every other mode the form's.
export function targetRatios(mode, opts) {
  const list = mode === 'veo' ? opts?.veo?.ratios : mode === 'muse' ? opts?.muse?.ratios : opts?.ratios;
  return Array.isArray(list) && list.length ? list : FALLBACK_RATIOS;
}

// { min, max } seconds the mode can make: what the core reports for the analysis (limits), else the range of the form.
export function targetRange(mode, limits, opts) {
  if (finite(limits?.[mode])) return { min: limits[mode].min, max: limits[mode].max };
  const form = mode === 'veo' ? opts?.veo?.duration : mode === 'muse' ? opts?.muse?.duration : opts?.duration;
  return finite(form) ? { min: form.min, max: form.max } : { ...FALLBACK_RANGE };
}

// The choices behind the Model row, copied from the form's prefs when the tab opens: the Seedance model, the Veo model, and the last of
// Nhanh / Nhanh + tiếng / Pro (where a Seedance model returns to from Veo or Muse). A blank falls back to what the core says.
export function targetModels(prefs = {}, opts = {}) {
  return {
    model: prefs.model || opts?.defaults?.model || '',
    veoModel: prefs.veoModel || opts?.veo?.defaults?.model || '',
    lastSeedance: SEEDANCE_MODES.includes(prefs.lastSeedance) ? prefs.lastSeedance : SEEDANCE_MODES.includes(prefs.mode) ? prefs.mode : '',
  };
}

// The settings after `patch` (a pickPatch of model-groups.js, a ratio or a length): what the new mode has is kept, the rest is brought to what it can do
// (a ratio it does not make -> its first one; a length outside its range -> the nearest end). Returns a new object; the caller assigns it back.
export function settleTarget(settings, patch, { limits, opts }) {
  const next = { ...settings, ...patch };
  const ratios = targetRatios(next.mode, opts);
  if (!ratios.includes(next.ratio)) next.ratio = ratios[0];
  next.duration = fitTarget(next, { [next.mode]: targetRange(next.mode, limits, opts) }).duration;
  if (next.mode === 'veo') {
    const model = veoModelIn(opts, next.veoModel);
    if (patch.mode === 'veo' && settings.mode !== 'veo' && offersLengths(model) && opts?.veo?.duration?.def) next.duration = opts.veo.duration.def; // into Veo from Seedance (10 s): the Veo default, not a pricier Omni 10 s by surprise
    next.duration = nearestLength(model, next.duration); // the length THAT Veo model makes (Omni 4/6/8/10, Veo 3.1 8); a core that does not say keeps the number
  }
  if (SEEDANCE_MODES.includes(next.mode)) next.lastSeedance = next.mode;
  return next;
}

// The model the Model row shows: Muse its one model, Veo the picked Veo model, every other mode the picked Seedance model (an unknown id -> the first, like the form).
export function currentModel(settings, opts) {
  const pick = (list, id) => (Array.isArray(list) ? list.find((m) => m.id === id) || list[0] : undefined);
  const model = settings.mode === 'muse' ? pick(opts?.muse?.models) : settings.mode === 'veo' ? pick(opts?.veo?.models, settings.veoModel) : pick(opts?.models, settings.model);
  return { id: model?.id || '', label: model?.label || '—' };
}

// '' or why a row of the Model popup cannot be picked now: Veo and Muse take no product image, so with products chosen those rows are off.
export const rowBlocked = (settings, item) => (settings.products.length && (item.platform === 'veo' || item.platform === 'muse')
  ? t('{mode} chưa nhận ảnh sản phẩm: bỏ chọn sản phẩm để dùng.', { mode: MODE_LABEL[item.platform] }) : '');

// The Seedance pill ("Nhanh / Nhanh + tiếng / Pro") belongs to the Seedance models only, as #mode-btn of the form.
export const showModePill = (settings) => SEEDANCE_MODES.includes(settings.mode);

// The line under the length bar; a mode that makes one fixed length has no bar to move, only this line.
export function durationNote(mode, range, dolaNote) {
  if (range.min === range.max) return t('Chế độ này chỉ làm clip {n} giây.', { n: range.min });
  return SEEDANCE_MODES.includes(mode) ? dolaNote : '';
}

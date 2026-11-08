import { tn } from './i18n.js';

// The lengths and resolutions of the Veo models and the price of each cell, as the core says them in window.dola.options().veo.models[]:
//   durations [4, 6, 8, 10]  resolutions ['720p', '360p'] (the first is the default)  prices { '720p': { 4: 7, ... }, '360p': { ... } }  (Flow credits of ONE clip, measured 2026-10-29)
// Omni 1.1 Flash has four lengths and two resolutions; Veo 3.1 Lite / Fast / Quality have 8 s at 720p and nothing to choose. Pure (no DOM, no Electron): tests/veo-durations.test.js.
// A core that does not say `durations` is an older core: every function here then answers "nothing to choose" and the form keeps the one length bar it always had.

const lengthsOf = (model) => (Array.isArray(model?.durations) && model.durations.length && model.durations.every(Number.isInteger) ? model.durations : null);

// Does this core tell the lengths of this Veo model?
export const offersLengths = (model) => lengthsOf(model) !== null;
export const resolutionsOf = (model) => (offersLengths(model) && Array.isArray(model.resolutions) ? model.resolutions.filter((r) => typeof r === 'string' && r) : []);
// Only a model with two or more resolutions has a choice to draw (and a `resolution` to send).
export const hasResolutionChoice = (model) => resolutionsOf(model).length > 1;
export const veoModelIn = (opts, id) => { const list = opts?.veo?.models; return Array.isArray(list) ? list.find((m) => m.id === id) || list[0] : undefined; };

// The length THE MODEL offers that is nearest to `want`; between two the longer (what the core makes: src/veo.js veoSettings). A model that does not say its lengths keeps the number.
export function nearestLength(model, want) {
  const lengths = lengthsOf(model);
  const n = Number(want);
  if (!lengths || !Number.isFinite(n)) return want;
  return lengths.reduce((best, d) => (Math.abs(d - n) < Math.abs(best - n) || (Math.abs(d - n) === Math.abs(best - n) && d > best) ? d : best), lengths[0]);
}

// The resolution a clip is made at: the wanted one when the model has it, else the model's first (720p); '' for a model with no choice (nothing is sent, nothing is shown).
export const resolutionFor = (model, wanted) => (hasResolutionChoice(model) ? (resolutionsOf(model).includes(wanted) ? wanted : resolutionsOf(model)[0]) : '');

// Flow credits of ONE clip of this cell; null when the core did not say. A part left out is the default one (the model's first resolution).
export function priceOf(model, { resolution, seconds } = {}) {
  const res = resolution || resolutionsOf(model)[0];
  const price = model?.prices?.[res]?.[seconds];
  return Number.isFinite(price) ? price : null;
}
export const priceText = (credits) => tn(credits, '≈{n} credit Flow', '≈{n} Flow credit', '≈{n} Flow credits');

// The form's prefs brought to what the model offers: the nearest length, and for a model with a choice a resolution it has. A model without a choice leaves the resolution as it was
// (going Omni -> Lite -> Omni keeps a person's 360p). -> { duration, veoResolution }
export function fitPrefs(model, prefs) {
  return {
    duration: offersLengths(model) ? nearestLength(model, prefs.duration) : prefs.duration,
    veoResolution: hasResolutionChoice(model) ? resolutionFor(model, prefs.veoResolution) : prefs.veoResolution,
  };
}

// What the task carries: '' unless the model has a choice of resolutions (an older core, Veo 3.1 and every other mode send none).
export const resolutionToSend = (model, prefs) => (hasResolutionChoice(model) ? resolutionFor(model, prefs.veoResolution) : '');

// The value of the length pill: "8s", or "8s · 360p" for a model with a choice of resolutions.
export function pillText(model, prefs) {
  const res = resolutionToSend(model, prefs);
  return res ? `${prefs.duration}s · ${res}` : `${prefs.duration}s`;
}

// The resolution a stored task was made at, for "Tạo lại" and "Dùng lại": '360p' | '720p' for a plain clip that carries one, else '' (an older core, Veo 3.1, a picture, a reference-video clip).
export const resolutionOfTask = (task) => (task?.mode === 'veo' && task.kind !== 'image' && !task.refVideo && (task.resolution === '360p' || task.resolution === '720p') ? task.resolution : '');

import { t } from './i18n.js';
import { isNanoTask, modeOffered } from './muse-form.js';
import { tabCount } from './setup-platforms.js';

// The models of the "Tạo ảnh" screen, pure (no DOM, no Electron): app.js calls them, tests/image-models.test.js tests them.
// The screen has two families: Muse Image (acc Muse; the core gets mode 'muse' + kind 'image') and, when the core offers it, Nano Banana (acc Gmail of
// Veo, made in Google Flow; the core gets mode 'veo' + kind 'image', src/nano-banana.js of the app core). window.dola.options() lists the second one as
//   nano: { models: [{ id, label, desc }], ratios: [...], defaults: { model, ratio }, maxImages }
// An older core has no `nano`: then the screen is exactly what it was (one Muse row, no ratio, no pictures).
const NANO_REFS_FALLBACK = 3; // the careful number the core uses when nothing better was measured (studio/src/lib/catalog.js says the same)
const MAX_REFS_ANY = 10; // the most the app ever takes for any mode

export const NANO_LABEL = t('Tạo ảnh (Nano Banana)');

const idOf = (m) => typeof m?.id === 'string' && m.id;
const museFirst = (opts) => opts?.image?.models?.[0]; // the screen has always used the first (and only) model of the core's `image` side

// The Nano Banana side as the core listed it, or empty. It rides on the picture screen (no screen = nowhere to show it); models or ratios that the core
// left empty make it useless, so it is not offered then. An older core says no `nano` at all.
export const nanoModels = (opts) => (modeOffered('image', opts) && Array.isArray(opts.nano?.models) ? opts.nano.models.filter(idOf) : []);
export const nanoRatios = (opts) => (nanoModels(opts).length && Array.isArray(opts.nano.ratios) ? opts.nano.ratios.filter((r) => typeof r === 'string' && r) : []);
export const nanoOffered = (opts) => nanoRatios(opts).length > 0;

// The ratio a Nano picture starts with: the core's default when it is one of its ratios, else its first.
export function nanoDefaultRatio(opts) {
  const ratios = nanoRatios(opts);
  return ratios.includes(opts?.nano?.defaults?.ratio) ? opts.nano.defaults.ratio : ratios[0];
}
// How many reference pictures a Nano picture takes: what the core says; a core that says nothing sensible gets the careful 3.
export function nanoRefMax(opts) {
  const n = opts?.nano?.maxImages;
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_REFS_ANY) : NANO_REFS_FALLBACK;
}

// The groups of the Model popup of the picture screen, in the shape of model-groups.js modelGroups (so model-popup.js groupedModelPop draws them):
// Muse first, then Nano Banana. One group = nothing to group: app.js then draws the single row it always drew.
const rows = (platform, models) => models.map((m) => ({ platform, id: m.id, label: m.label, desc: m.desc || '' }));
export function imageGroups(opts) {
  const muse = museFirst(opts);
  return [
    ...(muse ? [{ platform: 'muse', label: 'Muse', items: rows('muse', [muse]) }] : []),
    ...(nanoOffered(opts) ? [{ platform: 'nano', label: 'Nano Banana', items: rows('nano', nanoModels(opts)) }] : []),
  ];
}

// The model a saved/picked id stands for: a Nano model the core lists now, else Muse Image (an id the core no longer offers falls back to it).
// -> { family: 'muse' | 'nano', model }
export function imageSelection(opts, id) {
  const nano = nanoOffered(opts) ? nanoModels(opts).find((m) => m.id === id) : null;
  return nano ? { family: 'nano', model: nano } : { family: 'muse', model: museFirst(opts) };
}
// The id to keep in prefs for a saved/picked one (Muse Image's own id for anything that is not a listed Nano model).
export const imageModelId = (id, opts) => imageSelection(opts, id).model?.id ?? '';
// The row ticked in the popup, in the key form of model-groups.js itemKey.
export const imageSelectedKey = (id, opts) => { const s = imageSelection(opts, id); return `${s.family === 'nano' ? 'nano' : 'muse'}:${s.model?.id}`; };

// "Tạo lại" of a picture row: the model id the form takes. A Nano picture goes back to its Nano model (the core's default when that model is gone);
// anything else is a Muse picture. A core with no Nano gets Muse Image either way.
export function imageModelOfTask(task, opts) {
  const muse = imageModelId('', opts);
  if (!isNanoTask(task) || !nanoOffered(opts)) return muse;
  const models = nanoModels(opts);
  if (models.some((m) => m.id === task.model)) return task.model;
  return (models.find((m) => m.id === opts.nano.defaults?.model) ?? models[0]).id;
}

// The fields a Nano Banana task adds to the payload: exactly what the Bàn sáng tạo sends for its "Ảnh Nano Banana" node (studio/src/lib/run-graph-build.js):
// a Veo-mode task that asks for a picture, no length (0), the ratio the person picked, and at most `maxImages` reference pictures (the core refuses more).
export function nanoTaskFields({ model, ratio, files = [], maxImages }) {
  const cap = Number.isInteger(maxImages) && maxImages >= 1 ? maxImages : NANO_REFS_FALLBACK;
  return { mode: 'veo', kind: 'image', model, ratio, duration: 0, files: (Array.isArray(files) ? files : []).slice(0, cap) };
}

// Gmail accounts of Veo that can work now (the Veo tab of Setup: switched on, not resting): the ones a Nano Banana picture waits for.
export const veoReadyCount = (accounts) => tabCount('veo', Array.isArray(accounts) ? accounts : []).ready;

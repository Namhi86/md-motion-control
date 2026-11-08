import { t } from './i18n.js';
import { modeOffered } from './muse-form.js';

// The models and screens of the "Tạo video" / "Tạo ảnh" form, pure (no DOM, no Electron): app.js and model-popup.js call them,
// tests/model-groups.test.js tests them. The Model popup lists three groups: Seedance (Dola), Veo (Google Flow), Muse; a group the app core
// does not offer is not listed, and a core with only Seedance gets a single group (app.js then draws the popup it always had).
// The form keeps two memories in prefs: lastVideo (the last video mode, where "Tạo video" returns to from "Tạo ảnh") and lastSeedance
// (the last of Nhanh + tiếng / Pro, where a Seedance model returns to from Veo or Muse). Nhanh ('fast') is not a choice any more: see modeOffered.
export const SEEDANCE_MODES = ['voice', 'pro'];
const VIDEO_MODES = [...SEEDANCE_MODES, 'veo', 'muse'];

const GROUP_LABEL = { seedance: 'Seedance', veo: 'Google Flow (Veo)', muse: 'Muse' };
const CARD_TEXT = {
  seedance: ['Google Flow (Veo)', t('Tạo video AI có tiếng bằng Veo trên Google Flow')],
  veo: ['Google Flow (Veo)', t('Tạo video AI có tiếng bằng Veo trên Google Flow')],
  muse: ['Google Flow (Veo)', t('Tạo video AI có tiếng bằng Veo trên Google Flow')],
  image: ['Google Flow (Veo)', t('Tạo video AI có tiếng bằng Veo trên Google Flow')],
  nano: ['Google Flow (Veo)', t('Tạo video AI có tiếng bằng Veo trên Google Flow')],
};
const PROMPT_HINT_IMAGE = t('Nhiều lệnh: cách nhau bằng một dòng trống (mỗi lệnh = 1 ảnh)');

const rows = (platform, models) => (Array.isArray(models) ? models : []).map((m) => ({ platform, id: m.id, label: m.label, desc: m.desc || '' }));

// Chỉ hiển thị duy nhất nhóm model Google Flow (Veo)
export function modelGroups(opts) {
  const veoModels = opts?.veo?.models || [];
  return [{ platform: 'veo', label: GROUP_LABEL.veo, items: rows('veo', veoModels) }].filter((g) => g.items.length);
}

export const itemKey = (item) => `${item.platform}:${item.id}`;
// Luôn chọn model thuộc nhóm Google Flow (Veo)
export function selectedKey(prefs) {
  return `veo:${prefs.veoModel}`;
}

export const defaultMode = () => 'veo';
export const fallbackMode = () => 'veo';
export const rerunMode = () => 'veo';
export const startMode = () => 'veo';

export const seedanceModeFor = () => 'veo';
export const lastVideoMode = () => 'veo';
export const rememberModes = () => ({
  lastVideo: 'veo',
  lastSeedance: 'veo',
});
export const savedMemory = () => ({ lastVideo: 'veo', lastSeedance: 'veo' });

export function pickPatch(item) {
  return { mode: 'veo', veoModel: item.id };
}

// ── Header: Motion control | Tạo video | Setup tài khoản ──
export function modeForNav() {
  return 'veo';
}
export const navState = ({ inSetup }) => ({
  imageShown: false,
  create: !inSetup,
  image: false,
  setup: !!inSetup,
});
export const screenForMode = () => 'video';

// The banner of the form (shown only in a tall window) follows the model family; the line of several prompts is for the picture screen.
// family: 'nano' on the picture screen when a Nano Banana model is picked (any other value: the family the mode names).
export const cardText = (mode, family) => (mode === 'image' && family === 'nano' ? CARD_TEXT.nano : CARD_TEXT[mode] || CARD_TEXT.seedance);
export const promptHint = (mode) => (mode === 'image' ? PROMPT_HINT_IMAGE : '');

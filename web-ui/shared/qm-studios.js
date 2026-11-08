// Copied from dola-seedance-client/src/qm-studios.js (the source of truth): key, label and needsAudio of the 4 MD Motion Control studios a finished
// clip can be handed to. The window sends only the key; the core builds the address. tests/qm-studios.test.js compares this copy with the
// core's file (when it is found next to this repo), so a drift is caught.
//   needsAudio: the studio works on the sound of the clip, so only a clip Dola made with sound (mode voice / pro) fits.
//   desc: the line under the name on the card (only here, the core has no use for it).
export const STUDIOS = Object.freeze([
  { key: 'kagebunshin', label: 'KageBunshin', needsAudio: false, desc: 'Thay nhân vật, đồ vật, bối cảnh' },
  { key: 'upscale', label: 'Upscale video', needsAudio: false, desc: 'Nâng độ nét video' },
  { key: 'ad-reference', label: 'Video tham chiếu', needsAudio: false, desc: 'Quảng cáo theo video mẫu' },
  { key: 'auto-subtitle', label: 'Phụ đề tự động', needsAudio: true, desc: 'Tạo phụ đề cho video' },
]);

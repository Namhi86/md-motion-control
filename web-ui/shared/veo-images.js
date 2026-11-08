// Copied from dola-seedance-client/src/veo-images.js (smit-corp). Keep the two in step: change both, run both tests.
// The reference-image rules of the "Tạo video" form: how many images the mode / Veo model takes, trimming, the notices and the check of a command that
// uses more than the model takes. Pure: no DOM, no Electron. The window draws it (electron/renderer.js; the web keeps a copy,
// site/shared/veo-images.js, used by site/app.js and site/prompt-editor.js); tested by veo-images.test.js.
// Seedance (Dola) keeps its 10 images. A Veo model takes what the core says in window.dola.options().veo.models[].maxImages (measured: Veo 3.1 Lite /
// Fast / Quality 3, Omni 1.1 Flash 7). An older core says nothing: then Veo takes no image, as before, and the form never offers more than it did.

const MAX_ANY = 10; // the most the app ever takes for any mode (Dola's own limit)

// { name, max, veo } for the Veo model with this id (an unlisted id falls back to the first model, like the core does). max 0 = no image.
export function veoImageLimit(opts, modelId) {
  const models = Array.isArray(opts?.veo?.models) ? opts.veo.models : [];
  const model = models.find((m) => m?.id === modelId) || models[0];
  const n = model?.maxImages;
  return { name: typeof model?.label === 'string' && model.label ? model.label : 'Veo', max: Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_ANY) : 0, veo: true };
}

// The limit of the form in its mode: Veo follows the picked Veo model, every other mode keeps the 10 images of Dola.
export const refLimit = ({ mode, opts, veoModel }) => (mode === 'veo' ? veoImageLimit(opts, veoModel) : { name: 'Seedance', max: MAX_ANY, veo: false });

// The first `max` images stay (the earliest picked); `dropped` is how many did not fit.
export function trimImages(files, max) {
  const list = Array.isArray(files) ? files : [];
  return { files: list.slice(0, max), dropped: Math.max(0, list.length - max) };
}

// The images after the person picked `picked` while `current` were already there: added behind, the same image twice counts once.
export function mergeImages(current, picked) {
  const all = [...(Array.isArray(current) ? current : []), ...(Array.isArray(picked) ? picked : [])];
  return all.filter((f, i) => all.findIndex((g) => g?.handle === f?.handle) === i);
}

// The notice after images were dropped for the limit (never silent). With max 0 (an older core) it is the sentence the form always said for Veo.
export const tooManyImages = ({ name, max }) => (max > 0 ? `${name} nhận tối đa ${max} ảnh: các ảnh thừa đã bỏ.` : 'Veo chưa nhận ảnh tham chiếu: đã bỏ ảnh đã chọn.');

// The words of the reference box: `hint` is the small line in the empty box, `tip` the hover text ('' = none). The "not measured yet" line is in the
// tooltip only, never on the form.
export function refTexts({ name, max, veo }) {
  if (!veo) return { hint: `Tối đa ${max} ảnh · bỏ trống = tạo từ mô tả`, tip: '' };
  if (max < 1) return { hint: `${name} chưa nhận ảnh tham chiếu`, tip: `${name} chưa nhận ảnh tham chiếu: cần cập nhật app để dùng ảnh.` };
  return {
    hint: `Tối đa ${max} ảnh · bỏ trống = tạo từ mô tả`,
    tip: `${name} nhận tối đa ${max} ảnh tham chiếu; ảnh được đưa vào Flow theo thứ tự bạn chọn.\nChưa đo: Flow có dùng đúng ảnh hay không sẽ biết sau lần chạy thật đầu tiên.`,
  };
}

// The words of the element tray of the web (elements are mentioned with @name; only a mentioned one is sent, in the order first mentioned).
const ELEMENT_HINT = 'Nhân vật, bối cảnh, đạo cụ · gõ @ trong mô tả để nhắc';
export function elementTexts({ name, max, veo }) {
  if (!veo) return { hint: ELEMENT_HINT, tip: '' };
  if (max < 1) return { hint: `${name} chưa nhận ảnh tham chiếu`, tip: `${name} chưa nhận ảnh tham chiếu: cần cập nhật app để dùng ảnh.` };
  return {
    hint: `${ELEMENT_HINT} · tối đa ${max} ảnh mỗi lệnh`,
    tip: `${name} nhận tối đa ${max} ảnh tham chiếu mỗi lệnh; chỉ phần tử được nhắc bằng @ trong mô tả mới được gửi, theo thứ tự nhắc.\nChưa đo: Flow có dùng đúng ảnh hay không sẽ biết sau lần chạy thật đầu tiên.`,
  };
}

// The sentence about images in the description of the Veo mode / the Veo model note, from the data: the most images of each Veo model and the order.
// A core that lists none is an older one, where Veo takes no image.
export function veoModeNote(opts) {
  const models = (Array.isArray(opts?.veo?.models) ? opts.veo.models : []).filter((m) => Number.isInteger(m?.maxImages) && m.maxImages >= 1);
  return models.length ? `Ảnh tham chiếu tối đa: ${models.map((m) => `${m.label} ${Math.min(m.maxImages, MAX_ANY)}`).join(', ')}; ảnh được đưa vào Flow theo thứ tự bạn chọn.` : 'Chưa nhận ảnh tham chiếu (cần cập nhật app).';
}

// How many different images a command uses: the images picked with the button (handles) plus one per element its prompt mentions.
export const distinctImages = (picked, elements) => new Set(picked || []).size + new Set((elements || []).map((e) => e.id)).size;

// The sentence for a command (index 0-based) that uses more images than `limit` allows, '' when it fits. Seedance keeps its old words.
export function countProblem({ index, picked, elements, limit }) {
  const n = distinctImages(picked, elements);
  if (n <= limit.max) return '';
  const at = `Lệnh #${index + 1}`;
  if (!limit.veo) return `${at} nhắc ${n} ảnh — tối đa ${limit.max} mỗi lệnh.`;
  return limit.max < 1
    ? `${at} dùng ${n} ảnh nhưng ${limit.name} chưa nhận ảnh tham chiếu (cần cập nhật app).`
    : `${at} dùng ${n} ảnh — ${limit.name} nhận tối đa ${limit.max}.`;
}

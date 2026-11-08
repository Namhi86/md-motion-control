import { t, tn } from './i18n.js';
import { distinctImages } from './shared/veo-images.js';

// The sentences of shared/veo-images.js (a copy of the core's file, never edited here) rebuilt from translatable templates, because they carry the model
// name, the image limit and the count of images. The Vietnamese result is byte for byte the one of the shared file: tests/veo-images-text.test.js compares them.
const MAX_ANY = 10; // the most the app ever takes for any mode (the same number as the shared file)

// limit = { name, max, veo } (veo-images.js refLimit / veoImageLimit). The notice after images were dropped for the limit.
export const tooManyImagesText = ({ name, max }) => (max > 0 ? t('{name} nhận tối đa {images}: các ảnh thừa đã bỏ.', { name, images: tn(max, '{n} ảnh', '{n} image', '{n} images') }) : t('Veo chưa nhận ảnh tham chiếu: đã bỏ ảnh đã chọn.'));

// The words of the reference box: `hint` is the small line in the empty box, `tip` the hover text ('' = none).
export function refTextsText({ name, max, veo }) {
  const hint = tn(max, 'Tối đa {n} ảnh · bỏ trống = tạo từ mô tả', 'Up to {n} image · leave empty = create from a description', 'Up to {n} images · leave empty = create from a description');
  if (!veo) return { hint, tip: '' };
  if (max < 1) return { hint: t('{name} chưa nhận ảnh tham chiếu', { name }), tip: t('{name} chưa nhận ảnh tham chiếu: cần cập nhật app để dùng ảnh.', { name }) };
  return { hint, tip: t('{name} nhận tối đa {images}; ảnh được đưa vào Flow theo thứ tự bạn chọn.\nChưa đo: Flow có dùng đúng ảnh hay không sẽ biết sau lần chạy thật đầu tiên.', { name, images: tn(max, '{n} ảnh tham chiếu', '{n} reference image', '{n} reference images') }) };
}

// The sentence about images in the Veo model note, from the data: the most images of each Veo model and the order.
export function veoModeNoteText(opts) {
  const models = (Array.isArray(opts?.veo?.models) ? opts.veo.models : []).filter((m) => Number.isInteger(m?.maxImages) && m.maxImages >= 1);
  if (!models.length) return t('Chưa nhận ảnh tham chiếu (cần cập nhật app).');
  return t('Ảnh tham chiếu tối đa: {models}; ảnh được đưa vào Flow theo thứ tự bạn chọn.', { models: models.map((m) => `${m.label} ${Math.min(m.maxImages, MAX_ANY)}`).join(', ') });
}

// The sentence for a command (index 0-based) that uses more images than `limit` allows, '' when it fits.
export function countProblemText({ index, picked, elements, limit }) {
  const n = distinctImages(picked, elements);
  if (n <= limit.max) return '';
  const images = tn(n, '{n} ảnh', '{n} image', '{n} images');
  if (!limit.veo) return t('Lệnh #{index} nhắc {images} — tối đa {max} mỗi lệnh.', { index: index + 1, images, max: limit.max });
  return limit.max < 1
    ? t('Lệnh #{index} dùng {images} nhưng {name} chưa nhận ảnh tham chiếu (cần cập nhật app).', { index: index + 1, images, name: limit.name })
    : t('Lệnh #{index} dùng {images} — {name} nhận tối đa {max}.', { index: index + 1, images, name: limit.name, max: limit.max });
}

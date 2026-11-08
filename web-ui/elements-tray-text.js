import { t } from './i18n.js';

// The words of the element tray of the Tạo video form: the same sentences as elementTexts() of shared/veo-images.js (a copy of the core's file, never edited here),
// rebuilt from translatable templates because they carry the model name and the image limit. tests/elements-tray-text.test.js keeps the two identical in Vietnamese.
// limit = { name, max, veo } (veo-images.js) -> { hint: the small line in the empty box, tip: the hover text ('' = none) }
export function trayTexts({ name, max, veo }) {
  const hint = t('Nhân vật, bối cảnh, đạo cụ · gõ @ trong mô tả để nhắc');
  if (!veo) return { hint, tip: '' };
  if (max < 1) return { hint: t('{name} chưa nhận ảnh tham chiếu', { name }), tip: t('{name} chưa nhận ảnh tham chiếu: cần cập nhật app để dùng ảnh.', { name }) };
  return {
    hint: t('Nhân vật, bối cảnh, đạo cụ · gõ @ trong mô tả để nhắc · tối đa {max} ảnh mỗi lệnh', { max }),
    tip: t('{name} nhận tối đa {max} ảnh tham chiếu mỗi lệnh; chỉ phần tử được nhắc bằng @ trong mô tả mới được gửi, theo thứ tự nhắc.\nChưa đo: Flow có dùng đúng ảnh hay không sẽ biết sau lần chạy thật đầu tiên.', { name, max }),
  };
}

import { el } from './pop.js';
import { t } from './i18n.js';

// The "Khung video" panel while there is no plan yet: a dashed card that says what to do (idle) or a skeleton of the timeline while the video is being read (busy).
// The stage text of the core ("Đang cắt đoạn 3/9…") is on the status line above the zone, not here.
// -> { node, set(busy) }
export function createEmptyZone() {
  const node = el('div', 'cm-panel cm-panel--timeline');
  const head = el('div', 'cm-panel-head');
  head.append(el('span', 'cm-panel-title', t('Khung video')));
  const body = el('div', 'cm-panel-body');
  const card = el('div', 'cm-empty');
  const title = el('p', 'cm-empty-title', '');
  const hint = el('p', 'cm-empty-hint', '');
  const skeleton = el('div', 'cm-skel');
  for (let i = 0; i < 4; i += 1) skeleton.append(el('span', 'cm-skel-row', ''));
  card.append(el('span', 'an-drop-orb', '✂'), title, hint, skeleton);
  body.append(card);
  node.append(head, body);
  return {
    node,
    set(busy) {
      node.classList.toggle('cm-panel--busy', busy);
      title.textContent = busy ? t('Đang đọc video, cắt thành các đoạn và chép lời…') : t('Chọn video và ảnh nhân vật, rồi bấm Phân tích video');
      hint.textContent = busy ? t('Bước này không tốn credit. Video dài thì cần vài phút.') : t('Kéo thả video hoặc ảnh vào bất kỳ chỗ nào của màn hình này cũng được.');
      skeleton.hidden = !busy;
    },
  };
}
